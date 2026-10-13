import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { calendarItem: { findUnique: vi.fn(), update: vi.fn() }, calendarSettings: { findUnique: vi.fn() }, user: { findMany: vi.fn() } },
}));
vi.mock("@/lib/google", async (real) => ({ ...(await real<typeof import("@/lib/google")>()), calendarApi: vi.fn() }));
vi.mock("@/lib/googleEvents", () => ({ clearGoogleEventCache: vi.fn() }));

import { prisma } from "@/lib/db";
import { calendarApi, GoogleError } from "@/lib/google";
import { clearGoogleEventCache } from "@/lib/googleEvents";
import { googleEventBody, removeItemFromGoogle, syncItemToGoogle } from "@/lib/googlePush";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const item = (over: object = {}) =>
  ({
    id: "i1", householdId: "h1", title: "Dentist", notes: null, date: day("2026-10-08"), startTime: null, endTime: null, assigneeContactId: null,
    repeatUnit: null, repeatEvery: 1, repeatUntil: null, toGoogle: true, googleEventId: null, googleSyncError: null, ...over,
  }) as any;
const TZ = "America/Chicago";
const settings = { householdId: "h1", timeZone: TZ, googleCalendarId: "fam@group", googleCalendarUserId: "owner" };
const members = [
  { id: "owner", email: "owner@x.co", googleConnection: { googleEmail: "owner@gmail.com" } },
  { id: "u2", email: "ann@x.co", googleConnection: null },
  { id: "u3", email: "bo@x.co", googleConnection: { googleEmail: "bo@gmail.com" } },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(settings as any);
  vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
});

describe("googleEventBody", () => {
  it("makes an untimed event an all-day one, marked as Domata's", () => {
    expect(googleEventBody(item(), TZ, [{ email: "a@x" }])).toEqual({
      summary: "Dentist",
      description: "Made in Domata.",
      start: { date: "2026-10-08" },
      end: { date: "2026-10-09" },
      attendees: [{ email: "a@x" }],
      extendedProperties: { private: { domataItemId: "i1" } },
    });
  });

  it("gives a timed event its wall-clock times in the household's zone, half an hour without an end", () => {
    expect(googleEventBody(item({ startTime: "09:00", endTime: "10:15", notes: "Bring card" }), TZ, [])).toMatchObject({
      description: "Bring card\n\nMade in Domata.",
      start: { dateTime: "2026-10-08T09:00:00", timeZone: TZ },
      end: { dateTime: "2026-10-08T10:15:00", timeZone: TZ },
    });
    expect(googleEventBody(item({ startTime: "09:00" }), TZ, []).end).toEqual({ dateTime: "2026-10-08T09:30:00", timeZone: TZ });
    expect(googleEventBody(item({ startTime: "23:45" }), TZ, []).end).toEqual({ dateTime: "2026-10-08T23:59:00", timeZone: TZ });
  });

  it("repeats as Google's rule, until the last day if there is one", () => {
    expect(googleEventBody(item({ repeatUnit: "WEEK", repeatEvery: 2 }), TZ, []).recurrence).toEqual(["RRULE:FREQ=WEEKLY;INTERVAL=2"]);
    expect(googleEventBody(item({ repeatUnit: "MONTH", repeatUntil: day("2027-01-31") }), TZ, []).recurrence).toEqual(["RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20270131"]);
    expect(googleEventBody(item({ repeatUnit: "DAY", startTime: "08:00", repeatUntil: day("2026-12-01") }), TZ, []).recurrence).toEqual([
      "RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20261201T235959Z",
    ]);
    expect(googleEventBody(item({ repeatUnit: "YEAR" }), TZ, []).recurrence).toEqual(["RRULE:FREQ=YEARLY;INTERVAL=1"]);
    expect(googleEventBody(item(), TZ, [])).not.toHaveProperty("recurrence");
  });
});

describe("syncItemToGoogle", () => {
  const path = (eventId?: string) => `/calendars/fam%40group/events${eventId ? `/${eventId}` : ""}?sendUpdates=all`;

  it("does nothing for a missing item, or when the household has no Google calendar", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(null);
    await syncItemToGoogle("i1");
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item());
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue({ ...settings, googleCalendarId: null } as any);
    await syncItemToGoogle("i1");
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(null);
    await syncItemToGoogle("i1");
    expect(calendarApi).not.toHaveBeenCalled();
    expect(prisma.calendarItem.update).not.toHaveBeenCalled();
  });

  it("creates the event as the calendar's owner, inviting every other member for a household event", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item());
    vi.mocked(calendarApi).mockResolvedValue({ id: "ev1" });
    await syncItemToGoogle("i1");
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { householdId: "h1" } }));
    const [user, p, init] = vi.mocked(calendarApi).mock.calls[0];
    expect([user, p, init?.method]).toEqual(["owner", path(), "POST"]);
    expect((init?.body as any).attendees).toEqual([{ email: "ann@x.co" }, { email: "bo@gmail.com" }]);
    expect(prisma.calendarItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { googleEventId: "ev1", googleSyncError: null } });
    expect(clearGoogleEventCache).toHaveBeenCalled();
  });

  it("invites only the member it's for", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ assigneeContactId: "c3" }));
    vi.mocked(prisma.user.findMany).mockResolvedValue([members[2]] as any);
    vi.mocked(calendarApi).mockResolvedValue({ id: "ev1" });
    await syncItemToGoogle("i1");
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { householdId: "h1", contactId: "c3" } }));
    expect((vi.mocked(calendarApi).mock.calls[0][2]?.body as any).attendees).toEqual([{ email: "bo@gmail.com" }]);
  });

  it("replaces the event it made before", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ googleEventId: "ev1" }));
    vi.mocked(calendarApi).mockResolvedValue({ id: "ev1" });
    await syncItemToGoogle("i1");
    expect(vi.mocked(calendarApi).mock.calls.map((c) => [c[1], c[2]?.method])).toEqual([[path("ev1"), "PUT"]]);
  });

  it("makes the event again when it is gone from Google", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ googleEventId: "ev1" }));
    vi.mocked(calendarApi).mockRejectedValueOnce(new GoogleError("Google Calendar: Not Found (404)")).mockResolvedValueOnce({ id: "ev2" });
    await syncItemToGoogle("i1");
    expect(vi.mocked(calendarApi).mock.calls.map((c) => c[2]?.method)).toEqual(["PUT", "POST"]);
    expect(prisma.calendarItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { googleEventId: "ev2", googleSyncError: null } });
  });

  it("keeps Google's error on the item (shortened) instead of failing the save", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ googleEventId: "ev1" }));
    vi.mocked(calendarApi).mockRejectedValue(new GoogleError(`Google Calendar: ${"x".repeat(400)} (403)`));
    await syncItemToGoogle("i1");
    const data = vi.mocked(prisma.calendarItem.update).mock.calls[0][0].data as any;
    expect(data.googleSyncError).toHaveLength(300);
    expect(clearGoogleEventCache).toHaveBeenCalled();
  });

  it("lets other errors surface", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item());
    vi.mocked(calendarApi).mockRejectedValue(new Error("bug"));
    await expect(syncItemToGoogle("i1")).rejects.toThrow("bug");
  });

  it("removes the event from Google when unticked, already gone or not", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ toGoogle: false, googleEventId: "ev1", googleSyncError: "old" }));
    vi.mocked(calendarApi).mockResolvedValue(null);
    await syncItemToGoogle("i1");
    expect(calendarApi).toHaveBeenCalledWith("owner", path("ev1"), { method: "DELETE" });
    expect(prisma.calendarItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { googleEventId: null, googleSyncError: null } });

    vi.mocked(calendarApi).mockRejectedValue(new GoogleError("Google Calendar: Gone (410)"));
    await syncItemToGoogle("i1");
    expect(prisma.calendarItem.update).toHaveBeenLastCalledWith({ where: { id: "i1" }, data: { googleEventId: null, googleSyncError: null } });
  });

  it("calls nothing for an unticked item never sent, and keeps the error when removing fails", async () => {
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ toGoogle: false }));
    await syncItemToGoogle("i1");
    expect(calendarApi).not.toHaveBeenCalled();
    vi.mocked(prisma.calendarItem.findUnique).mockResolvedValue(item({ toGoogle: false, googleEventId: "ev1" }));
    vi.mocked(calendarApi).mockRejectedValue(new GoogleError("Google Calendar: Forbidden (403)"));
    await syncItemToGoogle("i1");
    expect(prisma.calendarItem.update).toHaveBeenLastCalledWith({ where: { id: "i1" }, data: { googleSyncError: "Google Calendar: Forbidden (403)" } });
  });
});

describe("removeItemFromGoogle", () => {
  it("does nothing for an item never sent, or without a Google calendar", async () => {
    await removeItemFromGoogle({ householdId: "h1", googleEventId: null });
    vi.mocked(prisma.calendarSettings.findUnique).mockResolvedValue(null);
    await removeItemFromGoogle({ householdId: "h1", googleEventId: "ev1" });
    expect(calendarApi).not.toHaveBeenCalled();
  });

  it("deletes the event, and doesn't mind Google failing", async () => {
    vi.mocked(calendarApi).mockResolvedValue(null);
    await removeItemFromGoogle({ householdId: "h1", googleEventId: "ev1" });
    expect(calendarApi).toHaveBeenCalledWith("owner", "/calendars/fam%40group/events/ev1?sendUpdates=all", { method: "DELETE" });
    expect(clearGoogleEventCache).toHaveBeenCalled();
    vi.mocked(calendarApi).mockRejectedValue(new GoogleError("Google Calendar: Forbidden (403)"));
    await expect(removeItemFromGoogle({ householdId: "h1", googleEventId: "ev1" })).resolves.toBeUndefined();
  });

  it("lets other errors surface", async () => {
    vi.mocked(calendarApi).mockRejectedValue(new Error("bug"));
    await expect(removeItemFromGoogle({ householdId: "h1", googleEventId: "ev1" })).rejects.toThrow("bug");
  });
});
