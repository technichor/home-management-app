import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { googleConnection: { findUnique: vi.fn() }, calendarSettings: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/google", async (real) => ({
  ...(await real<typeof import("@/lib/google")>()),
  googleConfigured: vi.fn(),
  listGoogleCalendars: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { GoogleError, googleConfigured, listGoogleCalendars } from "@/lib/google";
import { googleAccountView, householdGoogleView, isTimeZone, TIME_ZONES } from "@/lib/googleCalendar";

const cal = (id: string, canWrite = true) => ({ id, name: id, color: null, canWrite, primary: false });
const connection = (over: object = {}) => ({ userId: "u1", googleEmail: "sam@gmail.com", needsReconnect: false, sharedCalendars: [{ calendarId: "work" }], ...over });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(googleConfigured).mockReturnValue(true);
});

describe("googleAccountView", () => {
  it("has nothing to show until Google is set up", async () => {
    vi.mocked(googleConfigured).mockReturnValue(false);
    expect(await googleAccountView("u1")).toEqual({ configured: false, connection: null, calendars: null, shared: [] });
    expect(prisma.googleConnection.findUnique).not.toHaveBeenCalled();
  });

  it("offers to link when the member hasn't", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(null);
    expect(await googleAccountView("u1")).toEqual({ configured: true, connection: null, calendars: null, shared: [] });
  });

  it("shows the linked account, its calendars, and which are shared", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    vi.mocked(listGoogleCalendars).mockResolvedValue([cal("me"), cal("work")]);
    expect(await googleAccountView("u1")).toEqual({
      configured: true,
      connection: { email: "sam@gmail.com", needsReconnect: false },
      calendars: [cal("me"), cal("work")],
      shared: ["work"],
    });
  });

  it("says the link needs renewing when reading the calendars marked it so", async () => {
    vi.mocked(prisma.googleConnection.findUnique)
      .mockResolvedValueOnce(connection() as any)
      .mockResolvedValueOnce(connection({ needsReconnect: true }) as any);
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("x", true));
    expect(await googleAccountView("u1")).toMatchObject({ connection: { needsReconnect: true }, calendars: null });
  });

  it("doesn't call a passing failure a broken link, and treats a vanished link as one", async () => {
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("x"));
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValueOnce(connection() as any).mockResolvedValueOnce(connection() as any);
    expect(await googleAccountView("u1")).toMatchObject({ connection: { needsReconnect: false }, calendars: null });
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValueOnce(connection() as any).mockResolvedValueOnce(null);
    expect(await googleAccountView("u1")).toMatchObject({ connection: { needsReconnect: true } });
  });

  it("lets other errors surface", async () => {
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    vi.mocked(listGoogleCalendars).mockRejectedValue(new Error("bug"));
    await expect(googleAccountView("u1")).rejects.toThrow("bug");
  });
});

describe("householdGoogleView", () => {
  const settings = (over: object = {}) => ({ householdId: "h1", timeZone: "Europe/Paris", googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null, ...over });

  it("shows only the time zone until Google is set up (Chicago before any settings exist)", async () => {
    vi.mocked(googleConfigured).mockReturnValue(false);
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(null);
    expect(await householdGoogleView("h1", "u1")).toEqual({ configured: false, timeZone: "America/Chicago", calendar: null, myWritable: null });
  });

  it("has no calendar yet, and offers the viewer's own writable calendars", async () => {
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(settings() as any);
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    vi.mocked(listGoogleCalendars).mockResolvedValue([cal("me"), cal("holidays", false)]);
    expect(await householdGoogleView("h1", "u1")).toEqual({ configured: true, timeZone: "Europe/Paris", calendar: null, myWritable: [cal("me")] });
  });

  it("shows the household's calendar and whose it is", async () => {
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(settings({ googleCalendarId: "fam", googleCalendarName: "Family", googleCalendarUserId: "u2" }) as any);
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValueOnce(connection({ googleEmail: "ann@gmail.com" }) as any).mockResolvedValueOnce(null);
    expect(await householdGoogleView("h1", "u1")).toEqual({
      configured: true,
      timeZone: "Europe/Paris",
      calendar: { name: "Family", ownerEmail: "ann@gmail.com", mine: false, needsReconnect: false },
      myWritable: null,
    });
  });

  it("flags a calendar whose owner's link is broken or gone, and names it by id without a name", async () => {
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(settings({ googleCalendarId: "fam@group", googleCalendarUserId: "u1" }) as any);
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(null);
    expect((await householdGoogleView("h1", "u1")).calendar).toEqual({ name: "fam@group", ownerEmail: null, mine: true, needsReconnect: true });
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValueOnce(connection({ needsReconnect: true }) as any).mockResolvedValueOnce(null);
    expect((await householdGoogleView("h1", "u1")).calendar?.needsReconnect).toBe(true);
  });

  it("offers no calendars when the viewer's can't be read, but lets other errors surface", async () => {
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(settings() as any);
    vi.mocked(prisma.googleConnection.findUnique).mockResolvedValue(connection() as any);
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("x"));
    expect((await householdGoogleView("h1", "u1")).myWritable).toBeNull();
    vi.mocked(listGoogleCalendars).mockRejectedValue(new Error("bug"));
    await expect(householdGoogleView("h1", "u1")).rejects.toThrow("bug");
  });
});

describe("time zones", () => {
  it("knows the IANA zones, and nothing else", () => {
    expect(TIME_ZONES).toContain("America/Chicago");
    expect(isTimeZone("Europe/Paris")).toBe(true);
    expect(isTimeZone("Mars/Base")).toBe(false);
    expect(isTimeZone(5)).toBe(false);
  });
});
