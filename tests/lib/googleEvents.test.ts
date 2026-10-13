import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { googleSharedCalendar: { findMany: vi.fn() }, calendarItem: { findMany: vi.fn() } },
}));
vi.mock("@/lib/google", async (real) => ({ ...(await real<typeof import("@/lib/google")>()), calendarApi: vi.fn() }));

import { prisma } from "@/lib/db";
import { calendarApi, GoogleError } from "@/lib/google";
import { clearGoogleEventCache, entriesOf, GOOGLE_CACHE_MS, googleAgenda, wallClock } from "@/lib/googleEvents";

const TZ = "America/Chicago";
const range = { start: "2026-10-04", end: "2026-10-10" };
const source = { calendarName: "Work", color: "#f00", ownerName: "Sam", ownerContactId: "m1" };

describe("wallClock", () => {
  it("gives a moment's date and time in the zone", () => {
    expect(wallClock("2026-10-07T14:30:00Z", TZ)).toEqual({ date: "2026-10-07", time: "09:30" });
    expect(wallClock("2026-10-08T03:00:00Z", TZ)).toEqual({ date: "2026-10-07", time: "22:00" });
    expect(wallClock("2026-10-07T05:00:00Z", TZ)).toEqual({ date: "2026-10-07", time: "00:00" });
  });
});

describe("entriesOf", () => {
  const base = { id: "e1", summary: "Standup", htmlLink: "https://g/e1" };

  it("puts a timed event on its day, read-only, with its source", () => {
    expect(entriesOf({ ...base, iCalUID: "uid1", start: { dateTime: "2026-10-07T09:00:00-05:00" }, end: { dateTime: "2026-10-07T09:30:00-05:00" } }, source, range, TZ)).toEqual([
      { source: "google", id: "g:uid1:2026-10-07", googleId: "uid1", date: "2026-10-07", title: "Standup", startTime: "09:00", endTime: "09:30", link: "https://g/e1", ...source, editable: false },
    ]);
  });

  it("ends an event running past midnight at the end of its first day, and drops a nonsense or missing end", () => {
    const over = entriesOf({ ...base, start: { dateTime: "2026-10-07T22:00:00-05:00" }, end: { dateTime: "2026-10-08T01:00:00-05:00" } }, source, range, TZ);
    expect(over[0]).toMatchObject({ id: "g:e1:2026-10-07", startTime: "22:00", endTime: "23:59" });
    const backwards = entriesOf({ ...base, start: { dateTime: "2026-10-07T10:00:00-05:00" }, end: { dateTime: "2026-10-07T09:00:00-05:00" } }, source, range, TZ);
    expect(backwards[0].endTime).toBeNull();
    expect(entriesOf({ ...base, start: { dateTime: "2026-10-07T10:00:00-05:00" } }, source, range, TZ)[0].endTime).toBeNull();
  });

  it("leaves out a timed event outside the range in the household's zone", () => {
    expect(entriesOf({ ...base, start: { dateTime: "2026-10-04T03:00:00Z" } }, source, range, TZ)).toEqual([]); // Oct 3 in Chicago
    expect(entriesOf({ ...base, start: { dateTime: "2026-10-11T15:00:00Z" } }, source, range, TZ)).toEqual([]);
  });

  it("puts an all-day event on each of its days in the range (Google's end is the day after)", () => {
    const trip = entriesOf({ ...base, summary: "  ", start: { date: "2026-10-02" }, end: { date: "2026-10-06" } }, source, range, TZ);
    expect(trip.map((e) => [e.date, e.startTime, e.title])).toEqual([
      ["2026-10-04", null, "(No title)"],
      ["2026-10-05", null, "(No title)"],
    ]);
    expect(entriesOf({ ...base, start: { date: "2026-10-10" } }, source, range, TZ).map((e) => e.date)).toEqual(["2026-10-10"]);
    expect(entriesOf({ ...base, start: { date: "2026-10-12" }, end: { date: "2026-10-13" } }, source, range, TZ)).toEqual([]);
  });

  it("leaves out cancelled events and ones without a start, and copes without a title or link", () => {
    expect(entriesOf({ ...base, status: "cancelled", start: { date: "2026-10-07" } }, source, range, TZ)).toEqual([]);
    expect(entriesOf({ id: "e2" }, source, range, TZ)).toEqual([]);
    expect(entriesOf({ id: "e3", start: { date: "2026-10-07" } }, source, range, TZ)[0]).toMatchObject({ title: "(No title)", link: null });
  });
});

describe("googleAgenda", () => {
  const shared = (over: object = {}) => ({
    userId: "u1",
    calendarId: "work@x",
    name: "Work",
    color: "#f00",
    connection: { user: { firstName: "Samuel", contactId: "m1", contact: { firstName: "Samuel", nickname: "Sam" } } },
    ...over,
  });
  const event = (id: string, over: object = {}) => ({ id, summary: id, start: { date: "2026-10-07" }, ...over });

  beforeEach(() => {
    vi.resetAllMocks();
    clearGoogleEventCache();
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValue([]);
  });

  it("reads nothing when no member shares a calendar", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([]);
    expect(await googleAgenda("h1", range, TZ)).toEqual({ entries: [], problems: [] });
    expect(calendarApi).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.googleSharedCalendar.findMany).mock.calls[0][0]?.where).toEqual({ connection: { needsReconnect: false, user: { householdId: "h1" } } });
  });

  it("reads each shared calendar as its member over the range, a day either side, as single events", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared()] as any);
    vi.mocked(calendarApi).mockResolvedValue({ items: [event("a")] });
    const { entries } = await googleAgenda("h1", range, TZ);
    expect(entries).toMatchObject([{ id: "g:a:2026-10-07", ownerName: "Sam", ownerContactId: "m1", calendarName: "Work" }]);
    const [user, path] = vi.mocked(calendarApi).mock.calls[0];
    expect(user).toBe("u1");
    const url = new URL(`https://x${path}`);
    expect(url.pathname).toBe("/calendars/work%40x/events");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      timeMin: "2026-10-03T00:00:00Z", timeMax: "2026-10-12T00:00:00Z", timeZone: TZ, singleEvents: "true", orderBy: "startTime", maxResults: "250",
    });
  });

  it("names the owner by first name without a contact, and copes with no events", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared({ connection: { user: { firstName: "Pat", contactId: null, contact: null } } })] as any);
    vi.mocked(calendarApi).mockResolvedValue({ items: [event("a")] });
    expect((await googleAgenda("h1", range, TZ)).entries[0].ownerName).toBe("Pat");
    clearGoogleEventCache();
    vi.mocked(calendarApi).mockResolvedValue({});
    expect((await googleAgenda("h1", range, TZ)).entries).toEqual([]);
  });

  it("leaves out events Domata made, by id or by the mark it puts on them", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared()] as any);
    vi.mocked(prisma.calendarItem.findMany).mockResolvedValue([{ googleEventId: "ours" }] as any);
    vi.mocked(calendarApi).mockResolvedValue({ items: [event("ours"), event("copy", { extendedProperties: { private: { domataItemId: "i1" } } }), event("theirs")] });
    expect((await googleAgenda("h1", range, TZ)).entries.map((e) => e.googleId)).toEqual(["theirs"]);
  });

  it("shows an event in two members' calendars once", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared(), shared({ userId: "u2", calendarId: "fam" })] as any);
    vi.mocked(calendarApi).mockResolvedValue({ items: [event("x", { iCalUID: "same" })] });
    expect((await googleAgenda("h1", range, TZ)).entries).toHaveLength(1);
  });

  it("names a calendar Google wouldn't give, and still shows the rest", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared(), shared({ userId: "u2", calendarId: "fam", name: "Family" })] as any);
    vi.mocked(calendarApi).mockImplementation(async (user) => {
      if (user === "u1") throw new GoogleError("nope");
      return { items: [event("b")] };
    });
    const result = await googleAgenda("h1", range, TZ);
    expect(result.problems).toEqual(["Sam's Work"]);
    expect(result.entries.map((e) => e.googleId)).toEqual(["b"]);
  });

  it("lets other errors surface", async () => {
    vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared()] as any);
    vi.mocked(calendarApi).mockRejectedValue(new Error("bug"));
    await expect(googleAgenda("h1", range, TZ)).rejects.toThrow("bug");
  });

  it("reuses Google's answer for a minute, then asks again", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(prisma.googleSharedCalendar.findMany).mockResolvedValue([shared()] as any);
      vi.mocked(calendarApi).mockResolvedValue({ items: [event("a")] });
      await googleAgenda("h1", range, TZ);
      await googleAgenda("h1", range, TZ);
      expect(calendarApi).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(GOOGLE_CACHE_MS);
      await googleAgenda("h1", range, TZ);
      expect(calendarApi).toHaveBeenCalledTimes(2);
      clearGoogleEventCache();
      await googleAgenda("h1", range, TZ);
      expect(calendarApi).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
