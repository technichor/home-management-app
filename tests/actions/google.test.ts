import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireMember: vi.fn(), requireOwner: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    googleSharedCalendar: { deleteMany: vi.fn(() => "delete"), createMany: vi.fn(() => "create") },
    calendarSettings: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/google", async (real) => ({
  ...(await real<typeof import("@/lib/google")>()),
  googleConfigured: vi.fn(),
  listGoogleCalendars: vi.fn(),
  calendarApi: vi.fn(),
  disconnectGoogle: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember, requireOwner } from "@/lib/auth";
import { calendarApi, disconnectGoogle, GoogleError, googleConfigured, listGoogleCalendars } from "@/lib/google";
import { disconnectGoogleAction, setSharedCalendarsAction } from "@/app/(app)/account/googleActions";
import { setHouseholdGoogleCalendarAction, setHouseholdTimeZoneAction, stopHouseholdGoogleCalendarAction } from "@/app/(app)/household/googleActions";

const me = { id: "u1", householdId: "h1", household: { id: "h1", displayName: "The Smiths", deletedAt: null }, role: "OWNER" };
const cal = (id: string, canWrite = true) => ({ id, name: `Name ${id}`, color: canWrite ? "#0f0" : null, canWrite, primary: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireMember).mockResolvedValue(me as any);
  vi.mocked(requireOwner).mockResolvedValue(me as any);
  vi.mocked(googleConfigured).mockReturnValue(true);
  vi.mocked(listGoogleCalendars).mockResolvedValue([cal("me"), cal("work", false)]);
  vi.mocked(prisma.calendarSettings.upsert).mockResolvedValue({ householdId: "h1", timeZone: "Europe/Paris" } as any);
});

describe("authorization", () => {
  it.each([
    ["share calendars", () => setSharedCalendarsAction([]), requireMember],
    ["unlink", () => disconnectGoogleAction(), requireMember],
    ["choose the household calendar", () => setHouseholdGoogleCalendarAction("me"), requireOwner],
    ["stop using Google", () => stopHouseholdGoogleCalendarAction(), requireOwner],
    ["set the time zone", () => setHouseholdTimeZoneAction("UTC"), requireOwner],
  ])("%s refuses a caller who may not, touching nothing", async (_n, call, guard) => {
    vi.mocked(guard).mockRejectedValue(new Error("Not allowed"));
    await expect(call()).rejects.toThrow("Not allowed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.calendarSettings.update).not.toHaveBeenCalled();
    expect(prisma.calendarSettings.updateMany).not.toHaveBeenCalled();
    expect(disconnectGoogle).not.toHaveBeenCalled();
  });
});

describe("setSharedCalendarsAction", () => {
  it("replaces the member's shared calendars with the chosen ones, as Google names them", async () => {
    expect(await setSharedCalendarsAction(["work", "me"])).toEqual({ ok: true });
    expect(prisma.googleSharedCalendar.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(prisma.googleSharedCalendar.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", calendarId: "me", name: "Name me", color: "#0f0" },
        { userId: "u1", calendarId: "work", name: "Name work", color: null },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(["delete", "create"]);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("can share none", async () => {
    expect(await setSharedCalendarsAction([])).toEqual({ ok: true });
    expect(prisma.googleSharedCalendar.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it.each([
    ["a calendar that isn't theirs", ["someone-elses"]],
    ["a non-list", "me" as any],
    ["a non-string", [5] as any],
  ])("refuses %s", async (_n, ids) => {
    expect(await setSharedCalendarsAction(ids)).toEqual({ ok: false, error: "Choose calendars from the list" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("explains when Google can't be read, and lets other errors surface", async () => {
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("x", true));
    expect(await setSharedCalendarsAction(["me"])).toEqual({ ok: false, error: "Connect Google again first" });
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("Google Calendar: Busy (503)"));
    expect(await setSharedCalendarsAction(["me"])).toEqual({ ok: false, error: "Google Calendar: Busy (503)" });
    vi.mocked(listGoogleCalendars).mockRejectedValue(new Error("bug"));
    await expect(setSharedCalendarsAction(["me"])).rejects.toThrow("bug");
  });
});

describe("disconnectGoogleAction", () => {
  it("unlinks the member and stops using a household calendar in their account", async () => {
    expect(await disconnectGoogleAction()).toEqual({ ok: true });
    expect(disconnectGoogle).toHaveBeenCalledWith("u1");
    expect(prisma.calendarSettings.updateMany).toHaveBeenCalledWith({
      where: { googleCalendarUserId: "u1" },
      data: { googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null },
    });
  });
});

describe("setHouseholdGoogleCalendarAction", () => {
  it("uses one of the owner's calendars they can add events to", async () => {
    expect(await setHouseholdGoogleCalendarAction("me")).toEqual({ ok: true });
    expect(prisma.calendarSettings.update).toHaveBeenCalledWith({
      where: { householdId: "h1" },
      data: { googleCalendarId: "me", googleCalendarName: "Name me", googleCalendarUserId: "u1" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/household");
  });

  it("creates a new calendar named after the household, in its time zone", async () => {
    vi.mocked(calendarApi).mockResolvedValue({ id: "new@group" });
    expect(await setHouseholdGoogleCalendarAction("new")).toEqual({ ok: true });
    expect(calendarApi).toHaveBeenCalledWith("u1", "/calendars", { method: "POST", body: { summary: "Domata · The Smiths", timeZone: "Europe/Paris" } });
    expect(prisma.calendarSettings.update).toHaveBeenCalledWith({
      where: { householdId: "h1" },
      data: { googleCalendarId: "new@group", googleCalendarName: "Domata · The Smiths", googleCalendarUserId: "u1" },
    });
  });

  it.each([
    ["a calendar they can only read", "work", "Choose one of your Google calendars that you can add events to"],
    ["someone else's", "elsewhere", "Choose one of your Google calendars that you can add events to"],
    ["nothing", "", "Choose a calendar"],
    ["a non-string", 5 as any, "Choose a calendar"],
  ])("refuses %s", async (_n, choice, error) => {
    expect(await setHouseholdGoogleCalendarAction(choice)).toEqual({ ok: false, error });
    expect(prisma.calendarSettings.update).not.toHaveBeenCalled();
  });

  it("refuses until Google is set up", async () => {
    vi.mocked(googleConfigured).mockReturnValue(false);
    expect(await setHouseholdGoogleCalendarAction("me")).toEqual({ ok: false, error: "Google isn't set up for Domata yet" });
  });

  it("explains Google's refusals, and lets other errors surface", async () => {
    vi.mocked(calendarApi).mockRejectedValue(new GoogleError("x", true));
    expect(await setHouseholdGoogleCalendarAction("new")).toEqual({ ok: false, error: "Connect Google again first (on your Account page)" });
    vi.mocked(listGoogleCalendars).mockRejectedValue(new GoogleError("Google Calendar: Busy (503)"));
    expect(await setHouseholdGoogleCalendarAction("me")).toEqual({ ok: false, error: "Google Calendar: Busy (503)" });
    vi.mocked(listGoogleCalendars).mockRejectedValue(new Error("bug"));
    await expect(setHouseholdGoogleCalendarAction("me")).rejects.toThrow("bug");
  });
});

describe("stopHouseholdGoogleCalendarAction", () => {
  it("forgets the household's Google calendar", async () => {
    expect(await stopHouseholdGoogleCalendarAction()).toEqual({ ok: true });
    expect(prisma.calendarSettings.updateMany).toHaveBeenCalledWith({
      where: { householdId: "h1" },
      data: { googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null },
    });
  });
});

describe("setHouseholdTimeZoneAction", () => {
  it("saves a known time zone, creating the settings first if needed", async () => {
    expect(await setHouseholdTimeZoneAction("Asia/Tokyo")).toEqual({ ok: true });
    expect(prisma.calendarSettings.upsert).toHaveBeenCalled();
    expect(prisma.calendarSettings.update).toHaveBeenCalledWith({ where: { householdId: "h1" }, data: { timeZone: "Asia/Tokyo" } });
  });

  it("refuses anything else", async () => {
    expect(await setHouseholdTimeZoneAction("Mars/Base")).toEqual({ ok: false, error: "Choose a time zone from the list" });
    expect(prisma.calendarSettings.update).not.toHaveBeenCalled();
  });
});
