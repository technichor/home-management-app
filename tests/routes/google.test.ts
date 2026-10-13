import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/google", async (real) => ({
  ...(await real<typeof import("@/lib/google")>()),
  googleConfigured: vi.fn(),
  googleSignInUrl: vi.fn((state: string) => `https://google.test/auth?state=${state}`),
  connectGoogle: vi.fn(),
}));

import { getIronSession } from "iron-session";
import { connectGoogle, GoogleError, googleConfigured } from "@/lib/google";
import { GET as connect } from "@/app/api/google/connect/route";
import { GET as callback } from "@/app/api/google/callback/route";

let session: Record<string, any>;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://domata.test";
  session = { householdId: "h1", save: vi.fn() };
  vi.mocked(getIronSession).mockResolvedValue(session as any);
  vi.mocked(googleConfigured).mockReturnValue(true);
});

const location = (r: Response) => r.headers.get("location");

describe("starting to link Google", () => {
  it("sends a signed-out visitor to sign in", async () => {
    session.householdId = undefined;
    expect(location(await connect())).toBe("https://domata.test/login?next=/account");
  });

  it("says so when Google isn't set up", async () => {
    vi.mocked(googleConfigured).mockReturnValue(false);
    expect(location(await connect())).toBe("https://domata.test/account?google=unavailable");
  });

  it("remembers a fresh one-time value in the session and sends it to Google", async () => {
    const response = await connect();
    expect(session.googleState).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(session.save).toHaveBeenCalled();
    expect(location(response)).toBe(`https://google.test/auth?state=${session.googleState}`);
    const first = session.googleState;
    await connect();
    expect(session.googleState).not.toBe(first);
  });
});

describe("coming back from Google", () => {
  const back = (query: string) => callback(new NextRequest(`https://domata.test/api/google/callback?${query}`));
  beforeEach(() => {
    session.googleState = "expected-state";
  });

  it("sends a signed-out visitor to sign in", async () => {
    session.householdId = undefined;
    expect(location(await back("state=expected-state&code=c"))).toBe("https://domata.test/login?next=/account");
  });

  it("links the account when the one-time value matches, and uses it up", async () => {
    vi.mocked(connectGoogle).mockResolvedValue({ email: "sam@gmail.com" });
    expect(location(await back("state=expected-state&code=c9"))).toBe("https://domata.test/account?google=connected");
    expect(connectGoogle).toHaveBeenCalledWith("u1", "c9");
    expect(session.googleState).toBeUndefined();
    expect(session.save).toHaveBeenCalled();
  });

  it.each([
    ["a different value", "state=other-state-xx&code=c"],
    ["a value of another length", "state=short&code=c"],
    ["no value", "code=c"],
    ["no code", "state=expected-state"],
  ])("fails with %s, linking nothing", async (_n, query) => {
    expect(location(await back(query))).toBe("https://domata.test/account?google=failed");
    expect(connectGoogle).not.toHaveBeenCalled();
    expect(session.googleState).toBeUndefined();
  });

  it("fails when the session holds no value (an old or forged link)", async () => {
    delete session.googleState;
    expect(location(await back("state=expected-state&code=c"))).toBe("https://domata.test/account?google=failed");
  });

  it("says the member cancelled when Google says so", async () => {
    expect(location(await back("state=expected-state&error=access_denied"))).toBe("https://domata.test/account?google=cancelled");
    expect(connectGoogle).not.toHaveBeenCalled();
  });

  it("fails when Google refuses the code, but lets anything else surface", async () => {
    vi.mocked(connectGoogle).mockRejectedValue(new GoogleError("nope"));
    expect(location(await back("state=expected-state&code=c"))).toBe("https://domata.test/account?google=failed");
    session.googleState = "expected-state";
    vi.mocked(connectGoogle).mockRejectedValue(new Error("db down"));
    await expect(back("state=expected-state&code=c")).rejects.toThrow("db down");
  });
});
