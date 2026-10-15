import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { DAY_ENDS, DAY_STARTS, freeLabel, greeting, longDate, MIN_FREE_MINUTES, todayTimeline, upcomingDays } from "@/lib/homeDay";
import type { AgendaEntry, AgendaItemEntry } from "@/lib/agendaOrder";

let n = 0;
const at = (startTime: string | null, endTime: string | null = null, date = "2026-10-15"): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: `i${n}`, date, title: `Item ${n}`, notes: null, startTime, endTime, assigneeContactId: null,
  assigneeName: null, createdAt: "", repeat: null, google: { wanted: true, sent: false, error: null }, editable: true,
});
const kinds = (rows: ReturnType<typeof todayTimeline>["rows"]) =>
  rows.map((r) => (r.kind === "free" ? `free ${r.start}-${r.end}${r.fromNow ? " now" : ""}` : `${r.state} ${r.start}-${r.end}`));
const H = (h: number, m = 0) => h * 60 + m;

describe("greeting", () => {
  it("is morning until noon, afternoon until 5 PM, then evening", () => {
    expect(greeting(0)).toBe("Good morning");
    expect(greeting(H(11, 59))).toBe("Good morning");
    expect(greeting(H(12))).toBe("Good afternoon");
    expect(greeting(H(16, 59))).toBe("Good afternoon");
    expect(greeting(H(17))).toBe("Good evening");
  });
});

describe("longDate", () => {
  it("names the weekday and month in full", () => {
    expect(longDate("2026-10-15")).toBe("Thursday, October 15");
    expect(longDate("2027-01-03")).toBe("Sunday, January 3");
  });
});

describe("todayTimeline", () => {
  it("puts what has no time along the top", () => {
    const untimed = at(null);
    const { allDay, rows } = todayTimeline([untimed, at("09:00")], H(8, 30));
    expect(allDay).toEqual([untimed]);
    expect(rows).toHaveLength(1);
  });

  it("orders timed entries and marks each past, now or later (half an hour long without an end)", () => {
    const { rows } = todayTimeline([at("10:00", "11:00"), at("08:00"), at("09:00", "10:00")], H(9, 15));
    expect(kinds(rows)).toEqual(["past 480-510", "now 540-600", "later 600-660"]);
  });

  it("points out free time of an hour or more still ahead, but not after the last entry", () => {
    const { rows } = todayTimeline([at("09:00", "10:00"), at("13:00", "14:00"), at("14:30"), at("20:00")], H(8, 30));
    expect(kinds(rows)).toEqual(["later 540-600", "free 600-780", "later 780-840", "later 870-900", "free 900-1200", "later 1200-1230"]);
  });

  it("counts free time from now, and not before the day starts", () => {
    expect(kinds(todayTimeline([at("12:00")], H(10, 30)).rows)).toEqual(["free 630-720 now", "later 720-750"]);
    // Rounded up to the next five minutes.
    expect(kinds(todayTimeline([at("12:00")], H(10, 27)).rows)).toEqual(["free 630-720 now", "later 720-750"]);
    expect(kinds(todayTimeline([at("09:00")], H(5)).rows)).toEqual([`free ${DAY_STARTS}-540`, "later 540-570"]);
    // Less than an hour isn't pointed out.
    expect(kinds(todayTimeline([at("09:00")], H(8, 30)).rows)).toEqual(["later 540-570"]);
    expect(MIN_FREE_MINUTES).toBe(60);
  });

  it("doesn't call late evening free, and counts overlapping entries as one busy stretch", () => {
    expect(kinds(todayTimeline([at("22:00")], H(19)).rows)).toEqual([`free 1140-${DAY_ENDS} now`, "later 1320-1350"]);
    expect(kinds(todayTimeline([at("09:00", "12:00"), at("10:00", "10:30"), at("12:30")], H(8, 30)).rows)).toEqual([
      "later 540-720",
      "later 600-630",
      "later 750-780",
    ]);
  });

  it("uses a Google event's own end", () => {
    const g = { source: "google", id: "g", googleId: "g", date: "2026-10-15", title: "G", startTime: "09:00", endTime: "11:00", link: null, calendarName: "W", color: null, ownerName: "C", ownerContactId: null, editable: false } as AgendaEntry;
    expect(kinds(todayTimeline([g], H(8, 30)).rows)).toEqual(["later 540-660"]);
  });
});

describe("upcomingDays", () => {
  it("is the two days after today, each with its own entries", () => {
    const tomorrow = at("07:00", null, "2026-10-16");
    const days = upcomingDays([at("09:00"), tomorrow, at(null, null, "2026-10-20")], "2026-10-15");
    expect(days).toEqual([
      { date: "2026-10-16", weekday: "Friday", monthDay: "Oct 16", entries: [tomorrow] },
      { date: "2026-10-17", weekday: "Saturday", monthDay: "Oct 17", entries: [] },
    ]);
  });
});

describe("freeLabel", () => {
  it("says how long, in hours", () => {
    expect(freeLabel(60)).toBe("1 hour");
    expect(freeLabel(120)).toBe("2 hours");
    expect(freeLabel(90)).toBe("1.5 hours");
    expect(freeLabel(70)).toBe("1 hour 10 min");
    expect(freeLabel(145)).toBe("2 hours 25 min");
  });
});
