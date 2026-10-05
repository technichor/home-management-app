import { describe, it, expect } from "vitest";
import {
  CALENDAR_LIST_QUERY,
  CALENDAR_POLL_MS,
  MAX_CHIPS,
  calendarHref,
  defaultQuickAddDate,
  formatTime,
  groupByDate,
  plannerHref,
  rangeTitle,
  timeLabel,
  weeksOf,
} from "@/lib/calendarView";
import type { AgendaEntry } from "@/lib/agendaOrder";

describe("constants", () => {
  it("polls every 30 seconds, and shows at most three entries in a month cell", () => {
    expect(CALENDAR_POLL_MS).toBe(30_000);
    expect(MAX_CHIPS).toBe(3);
    expect(CALENDAR_LIST_QUERY).toBe("(max-width: 1100px)");
  });
});

describe("calendarHref", () => {
  it("carries the view, date, member and the browser's today", () => {
    expect(calendarHref({ view: "week", date: "2026-10-04", who: "c1", today: "2026-10-07" })).toBe("/calendar?view=week&date=2026-10-04&who=c1&today=2026-10-07");
  });

  it("leaves out a date or member that isn't set", () => {
    expect(calendarHref({ view: "month", today: "2026-10-07" })).toBe("/calendar?view=month&today=2026-10-07");
    expect(calendarHref({ view: "day", date: "2026-10-07", who: null, today: "2026-10-07" })).toBe("/calendar?view=day&date=2026-10-07&today=2026-10-07");
  });
});

describe("rangeTitle", () => {
  it("names a day, a week and a month", () => {
    expect(rangeTitle("day", "2026-10-07")).toBe("Wednesday, Oct 7, 2026");
    expect(rangeTitle("week", "2026-10-04")).toBe("Oct 4 – 10, 2026");
    expect(rangeTitle("week", "2026-09-27")).toBe("Sep 27 – Oct 3, 2026");
    expect(rangeTitle("month", "2026-10-01")).toBe("October 2026");
    expect(rangeTitle("month", "2027-01-01")).toBe("January 2027");
  });
});

describe("times", () => {
  it("writes 12-hour times", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("09:30")).toBe("9:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("12:45")).toBe("12:45 PM");
    expect(formatTime("13:07")).toBe("1:07 PM");
    expect(formatTime("23:59")).toBe("11:59 PM");
  });

  it("writes a start, a start and end, or nothing", () => {
    expect(timeLabel("09:30", null)).toBe("9:30 AM");
    expect(timeLabel("09:30", "10:15")).toBe("9:30 AM – 10:15 AM");
    expect(timeLabel(null, null)).toBe("");
    expect(timeLabel(null, "10:15")).toBe("");
  });
});

describe("groupByDate and weeksOf", () => {
  const entry = (id: string, date: string) => ({ source: "meal", id, date, slot: "DINNER", title: id, createdAt: "", editable: false }) as AgendaEntry;

  it("groups entries by date, keeping their order", () => {
    const map = groupByDate([entry("a", "2026-10-05"), entry("b", "2026-10-06"), entry("c", "2026-10-05")]);
    expect([...map.keys()]).toEqual(["2026-10-05", "2026-10-06"]);
    expect(map.get("2026-10-05")!.map((e) => e.id)).toEqual(["a", "c"]);
    expect(groupByDate([]).size).toBe(0);
  });

  it("cuts a month's dates into weeks of seven", () => {
    const dates = Array.from({ length: 35 }, (_, i) => `d${i}`);
    const weeks = weeksOf(dates);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[1][0]).toBe("d7");
    expect(weeksOf([])).toEqual([]);
  });
});

describe("defaultQuickAddDate and plannerHref", () => {
  const range = { start: "2026-10-04", end: "2026-10-10" };

  it("is the viewed day on the day view", () => {
    expect(defaultQuickAddDate("day", "2026-10-09", { start: "2026-10-09", end: "2026-10-09" }, "2026-10-07")).toBe("2026-10-09");
  });

  it("is today when it is in view, else the start of what's viewed", () => {
    expect(defaultQuickAddDate("week", "2026-10-04", range, "2026-10-07")).toBe("2026-10-07");
    expect(defaultQuickAddDate("week", "2026-10-04", range, "2026-10-04")).toBe("2026-10-04");
    expect(defaultQuickAddDate("week", "2026-10-04", range, "2026-10-10")).toBe("2026-10-10");
    expect(defaultQuickAddDate("week", "2026-10-04", range, "2026-11-01")).toBe("2026-10-04");
    expect(defaultQuickAddDate("month", "2026-10-01", { start: "2026-09-27", end: "2026-10-31" }, "2026-09-28")).toBe("2026-09-28");
    expect(defaultQuickAddDate("week", "2026-10-04", range, "2026-10-03")).toBe("2026-10-04");
  });

  it("links a meal to its planner week, with the browser's today", () => {
    expect(plannerHref("2026-10-08", "2026-10-07")).toBe("/meals?week=2026-10-08&today=2026-10-07");
  });
});
