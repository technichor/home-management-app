import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("@/lib/db", () => ({
  prisma: { googleConnection: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { open, seal } from "@/lib/secretBox";
import {
  accessTokenFor,
  calendarApi,
  connectGoogle,
  disconnectGoogle,
  GOOGLE_SCOPES,
  GoogleError,
  googleConfigured,
  googleRedirectUri,
  googleSignInUrl,
  listGoogleCalendars,
} from "@/lib/google";

const env = { ...process.env };
const fetchMock = vi.fn();
const answer = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: `S${status}`, json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body) }) as Response;
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const connection = (over: object = {}) => ({
  userId: "u1",
  googleEmail: "sam@gmail.com",
  refreshToken: seal("refresh"),
  accessToken: seal("access"),
  accessTokenExpiresAt: new Date(Date.now() + 3600_000),
  needsReconnect: false,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.APP_URL = "https://domata.test";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("needs the client id, its secret and the token key", () => {
    expect(googleConfigured()).toBe(true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(googleConfigured()).toBe(false);
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(googleConfigured()).toBe(false);
  });

  it("sends people to Google asking for lasting access to the calendar scopes, with the state", () => {
    const url = new URL(googleSignInUrl("st8"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client",
      redirect_uri: "https://domata.test/api/google/callback",
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: "st8",
    });
    expect(googleRedirectUri()).toBe("https://domata.test/api/google/callback");
  });
});

describe("connectGoogle", () => {
  it("trades the code for tokens and keeps them encrypted, with the account's email", async () => {
    fetchMock.mockResolvedValue(answer(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, id_token: idToken({ email: "Sam@Gmail.com" }) }));
    expect(await connectGoogle("u1", "code9")).toEqual({ email: "sam@gmail.com" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(init.body)).toEqual({
      client_id: "client", client_secret: "secret", grant_type: "authorization_code", code: "code9", redirect_uri: "https://domata.test/api/google/callback",
    });
    const call = vi.mocked(prisma.googleConnection.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ userId: "u1" });
    expect(call.create).toMatchObject({ userId: "u1", googleEmail: "sam@gmail.com", needsReconnect: false });
    expect(call.create.refreshToken).not.toContain("r1");
    expect(open(call.create.refreshToken as string)).toBe("r1");
    expect(open(call.update.accessToken as string)).toBe("a1");
  });

  it("refuses an answer without lasting access", async () => {
    fetchMock.mockResolvedValue(answer(200, { access_token: "a1", expires_in: 3600 }));
    await expect(connectGoogle("u1", "c")).rejects.toThrow("Google didn't grant ongoing access");
    expect(prisma.googleConnection.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["no ID token", undefined],
    ["an ID token without an email", idToken({ sub: "1" })],
  ])("refuses %s", async (_n, id_token) => {
    fetchMock.mockResolvedValue(answer(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, id_token }));
    await expect(connectGoogle("u1", "c")).rejects.toThrow("Google didn't say which account this is");
  });

  it("passes on Google's refusal, by its error code or else its status", async () => {
    fetchMock.mockResolvedValue(answer(400, { error: "invalid_request" }));
    await expect(connectGoogle("u1", "c")).rejects.toThrow("Google refused the sign-in (invalid_request)");
    fetchMock.mockResolvedValue(answer(500));
    await expect(connectGoogle("u1", "c")).rejects.toThrow("Google refused the sign-in (500)");
  });
});

describe("accessTokenFor", () => {
  it("needs a link that doesn't need renewing", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(null);
    await expect(accessTokenFor("u1")).rejects.toMatchObject({ message: "Google isn't connected", needsReconnect: true });
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection({ needsReconnect: true }) as any);
    await expect(accessTokenFor("u1")).rejects.toMatchObject({ message: "Connect Google again", needsReconnect: true });
  });

  it("uses the stored token while it is good", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    expect(await accessTokenFor("u1")).toBe("access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["about to expire", { accessTokenExpiresAt: new Date(Date.now() + 30_000) }],
    ["missing", { accessToken: null, accessTokenExpiresAt: null }],
  ])("renews a token that is %s, and keeps the new one encrypted", async (_n, over) => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection(over) as any);
    fetchMock.mockResolvedValue(answer(200, { access_token: "fresh", expires_in: 3600 }));
    expect(await accessTokenFor("u1")).toBe("fresh");
    expect(Object.fromEntries(fetchMock.mock.calls[0][1].body)).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh" });
    const data = vi.mocked(prisma.googleConnection.update).mock.calls[0][0].data;
    expect(open(data.accessToken as string)).toBe("fresh");
  });

  it("marks the link as needing renewal when Google refuses the refresh token", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection({ accessToken: null }) as any);
    fetchMock.mockResolvedValue(answer(400, { error: "invalid_grant" }));
    await expect(accessTokenFor("u1")).rejects.toMatchObject({ needsReconnect: true });
    expect(prisma.googleConnection.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { needsReconnect: true } });
  });

  it("leaves the link alone when Google merely fails", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection({ accessToken: null }) as any);
    fetchMock.mockResolvedValue(answer(503, {}));
    await expect(accessTokenFor("u1")).rejects.toMatchObject({ needsReconnect: false });
    expect(prisma.googleConnection.update).not.toHaveBeenCalled();
  });
});

describe("calendarApi", () => {
  beforeEach(() => vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any));

  it("calls as the user and returns the answer", async () => {
    fetchMock.mockResolvedValue(answer(200, { id: "e1" }));
    expect(await calendarApi("u1", "/calendars/x/events")).toEqual({ id: "e1" });
    expect(fetchMock).toHaveBeenCalledWith("https://www.googleapis.com/calendar/v3/calendars/x/events", { method: "GET", headers: { Authorization: "Bearer access" } });
  });

  it("sends a body as JSON, and returns null for an empty answer", async () => {
    fetchMock.mockResolvedValue(answer(204));
    expect(await calendarApi("u1", "/x", { method: "POST", body: { a: 1 } })).toBeNull();
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "POST", headers: { Authorization: "Bearer access", "Content-Type": "application/json" }, body: '{"a":1}' });
  });

  it("throws Google's message with the status; a 401 means the link needs renewing", async () => {
    fetchMock.mockResolvedValue(answer(403, { error: { message: "Forbidden" } }));
    await expect(calendarApi("u1", "/x")).rejects.toMatchObject({ message: "Google Calendar: Forbidden (403)", needsReconnect: false });
    fetchMock.mockResolvedValue(answer(401));
    const error = await calendarApi("u1", "/x").catch((e) => e);
    expect(error).toBeInstanceOf(GoogleError);
    expect(error).toMatchObject({ message: "Google Calendar: S401 (401)", needsReconnect: true });
  });
});

describe("listGoogleCalendars", () => {
  beforeEach(() => vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any));

  it("lists the user's calendars, primary first then by name, with whether events can be added", async () => {
    fetchMock.mockResolvedValue(answer(200, {
      items: [
        { id: "b", summary: "Work", accessRole: "reader" },
        { id: "c", summary: "Zoo", summaryOverride: "Activities", backgroundColor: "#0f0", accessRole: "writer" },
        { id: "me", summary: "sam@gmail.com", accessRole: "owner", primary: true },
      ],
    }));
    expect(await listGoogleCalendars("u1")).toEqual([
      { id: "me", name: "sam@gmail.com", color: null, canWrite: true, primary: true },
      { id: "c", name: "Activities", color: "#0f0", canWrite: true, primary: false },
      { id: "b", name: "Work", color: null, canWrite: false, primary: false },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
  });

  it("copes with no calendars", async () => {
    fetchMock.mockResolvedValue(answer(200, {}));
    expect(await listGoogleCalendars("u1")).toEqual([]);
  });
});

describe("disconnectGoogle", () => {
  it("asks Google to revoke access, then forgets the tokens", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    fetchMock.mockResolvedValue(answer(200, {}));
    await disconnectGoogle("u1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(Object.fromEntries(fetchMock.mock.calls[0][1].body)).toEqual({ token: "refresh" });
    expect(prisma.googleConnection.delete).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("forgets the tokens even when Google can't be reached", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    fetchMock.mockRejectedValue(new Error("offline"));
    await disconnectGoogle("u1");
    expect(prisma.googleConnection.delete).toHaveBeenCalled();
  });

  it("does nothing when not linked", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(null);
    await disconnectGoogle("u1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.googleConnection.delete).not.toHaveBeenCalled();
  });
});
