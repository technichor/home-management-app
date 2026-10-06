import { describe, it, expect } from "vitest";
import {
  CALENDAR_VIEWS,
  addDays,
  addMonthsKeepingDay,
  addMonths,
  datesInRange,
  daysBetween,
  inRange,
  monthEndOf,
  monthStartOf,
  parseView,
  resolveCalendarRange,
  stepAnchor,
  viewAnchor,
  viewRange,
  dateOr,
  dateToString,
  dayOfWeek,
  formatCalendarDate,
  formatDayHeading,
  formatWeekRange,
  isDateString,
  localDateString,
  stringToDate,
  utcDateString,
  weekDates,
  weekStartOf,
} from "@/lib/dates";

describe("isDateString", () => {
  it("accepts real calendar dates only", () => {
    expect(isDateString("2026-10-05")).toBe(true);
    expect(isDateString("2024-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-1-5")).toBe(false);
    expect(isDateString("not a date")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
    expect(isDateString(20261005)).toBe(false);
  });

  it("falls back for anything else", () => {
    expect(dateOr("2026-10-05", "2000-01-01")).toBe("2026-10-05");
    expect(dateOr("garbage", "2000-01-01")).toBe("2000-01-01");
    expect(dateOr(undefined, "2000-01-01")).toBe("2000-01-01");
  });
});

describe("today", () => {
  it("is the device's local calendar date, not the UTC one", () => {
    // 11pm on 4 Oct in the device's own zone: local says the 4th whatever zone the tests run in.
    const lateEvening = new Date(2026, 9, 4, 23, 30);
    expect(localDateString(lateEvening)).toBe("2026-10-04");
    // Early morning on the 5th, local.
    expect(localDateString(new Date(2026, 9, 5, 0, 15))).toBe("2026-10-05");
  });

  it("pads single digits, and uses the current time by default", () => {
    expect(localDateString(new Date(2026, 0, 2, 12))).toBe("2026-01-02");
    expect(localDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has a UTC fallback for the server", () => {
    expect(utcDateString(new Date("2026-10-05T23:59:00Z"))).toBe("2026-10-05");
    expect(utcDateString(new Date("2026-10-06T00:01:00Z"))).toBe("2026-10-06");
    expect(utcDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDays", () => {
  it("moves across months, years and leap days", () => {
    expect(addDays("2026-10-05", 1)).toBe("2026-10-06");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-05", -7)).toBe("2026-09-28");
    expect(addDays("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("is not thrown off by daylight-saving changes", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-07", 14)).toBe("2026-03-21");
  });
});

describe("weeks", () => {
  // 5 October 2026 is a Monday.
  it("knows the day of the week (0 = Sunday)", () => {
    expect(dayOfWeek("2026-10-05")).toBe(1);
    expect(dayOfWeek("2026-10-04")).toBe(0);
    expect(dayOfWeek("2026-10-10")).toBe(6);
  });

  it.each([
    ["2026-10-04", "SUNDAY", "2026-10-04"], // a Sunday is its own week's start
    ["2026-10-05", "SUNDAY", "2026-10-04"],
    ["2026-10-10", "SUNDAY", "2026-10-04"], // Saturday
    ["2026-10-11", "SUNDAY", "2026-10-11"], // next Sunday starts the next week
    ["2026-10-04", "MONDAY", "2026-09-28"], // Sunday belongs to the week that began the Monday before
    ["2026-10-05", "MONDAY", "2026-10-05"],
    ["2026-10-10", "MONDAY", "2026-10-05"],
    ["2026-10-11", "MONDAY", "2026-10-05"],
    ["2026-10-12", "MONDAY", "2026-10-12"],
  ] as const)("the week containing %s starts %s on %s", (date, startsOn, expected) => {
    expect(weekStartOf(date, startsOn)).toBe(expected);
  });

  it("works across a year boundary", () => {
    expect(weekStartOf("2027-01-01", "SUNDAY")).toBe("2026-12-27");
    expect(weekStartOf("2027-01-01", "MONDAY")).toBe("2026-12-28");
  });

  it("lists the seven days from the start", () => {
    expect(weekDates("2026-10-04")).toEqual([
      "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10",
    ]);
    expect(weekDates("2026-12-28")[6]).toBe("2027-01-03");
  });
});

describe("converting to and from stored dates", () => {
  it("round-trips a calendar date through UTC midnight", () => {
    const stored = stringToDate("2026-10-05");
    expect(stored.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(dateToString(stored)).toBe("2026-10-05");
  });

  it("formats the same on the server and in the browser", () => {
    expect(formatCalendarDate("2026-10-05")).toBe("Oct 5, 2026");
    expect(formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("week headings", () => {
  it("writes a week inside one month", () => {
    expect(formatWeekRange("2026-10-04")).toBe("Oct 4 – 10, 2026");
  });

  it("names both months when the week spans two", () => {
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
  });

  it("names both years when the week spans New Year", () => {
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  it("splits a day into weekday and month/day", () => {
    expect(formatDayHeading("2026-10-05")).toEqual({ weekday: "Mon", monthDay: "Oct 5" });
    expect(formatDayHeading("2026-10-04")).toEqual({ weekday: "Sun", monthDay: "Oct 4" });
  });
});

describe("calendar view helpers", () => {
  it("knows the three views and defaults to the week", () => {
    expect(CALENDAR_VIEWS).toEqual(["day", "week", "month"]);
    expect(parseView("day")).toBe("day");
    expect(parseView("month")).toBe("month");
    expect(parseView("week")).toBe("week");
    for (const bad of [undefined, "", "year", "WEEK", 3, null]) expect(parseView(bad)).toBe("week");
  });

  it("measures and walks ranges", () => {
    expect(daysBetween("2026-10-05", "2026-10-12")).toBe(7);
    expect(daysBetween("2026-10-12", "2026-10-05")).toBe(-7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across a daylight-saving change
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
    expect(datesInRange({ start: "2026-12-30", end: "2027-01-02" })).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesInRange({ start: "2026-10-05", end: "2026-10-05" })).toEqual(["2026-10-05"]);
    expect(inRange("2026-10-05", { start: "2026-10-05", end: "2026-10-11" })).toBe(true);
    expect(inRange("2026-10-11", { start: "2026-10-05", end: "2026-10-11" })).toBe(true);
    expect(inRange("2026-10-12", { start: "2026-10-05", end: "2026-10-11" })).toBe(false);
    expect(inRange("2026-10-04", { start: "2026-10-05", end: "2026-10-11" })).toBe(false);
  });

  it("finds the start and end of a month, including leap February", () => {
    expect(monthStartOf("2026-10-17")).toBe("2026-10-01");
    expect(monthEndOf("2026-10-17")).toBe("2026-10-31");
    expect(monthEndOf("2024-02-10")).toBe("2024-02-29");
    expect(monthEndOf("2026-02-10")).toBe("2026-02-28");
    expect(monthEndOf("2026-12-05")).toBe("2026-12-31");
    expect(monthEndOf("2026-04-30")).toBe("2026-04-30");
  });

  it("steps by whole months from any day, across year ends", () => {
    expect(addMonths("2026-10-17", 1)).toBe("2026-11-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01"); // never skips a short month
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-01");
    expect(addMonths("2026-10-17", 0)).toBe("2026-10-01");
    expect(addMonths("2026-10-17", 14)).toBe("2027-12-01");
  });
});

describe("what each view is anchored on", () => {
  it("is the day itself, the week's first day, or the month's first day", () => {
    expect(viewAnchor("day", "2026-10-07", "SUNDAY")).toBe("2026-10-07");
    expect(viewAnchor("week", "2026-10-07", "SUNDAY")).toBe("2026-10-04");
    expect(viewAnchor("week", "2026-10-07", "MONDAY")).toBe("2026-10-05");
    expect(viewAnchor("week", "2026-10-04", "MONDAY")).toBe("2026-09-28");
    expect(viewAnchor("month", "2026-10-31", "MONDAY")).toBe("2026-10-01");
  });
});

describe("the dates each view shows", () => {
  it("is one day, or seven", () => {
    expect(viewRange("day", "2026-10-07", "SUNDAY")).toEqual({ start: "2026-10-07", end: "2026-10-07" });
    expect(viewRange("week", "2026-10-04", "SUNDAY")).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(viewRange("week", "2026-12-28", "MONDAY")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  // October 2026: the 1st is a Thursday and the 31st a Saturday.
  it("is a month grid of whole weeks, with leading and trailing days (Sunday start)", () => {
    expect(viewRange("month", "2026-10-01", "SUNDAY")).toEqual({ start: "2026-09-27", end: "2026-10-31" });
  });

  it("starts the grid on Monday for a Monday-start household, and ends it on a Sunday", () => {
    const r = viewRange("month", "2026-10-01", "MONDAY");
    expect(r).toEqual({ start: "2026-09-28", end: "2026-11-01" });
    expect(datesInRange(r)).toHaveLength(35);
  });

  it("has no padding when the month starts and ends on week boundaries", () => {
    // Feb 2026 starts on a Sunday and ends on a Saturday: exactly four weeks.
    expect(viewRange("month", "2026-02-01", "SUNDAY")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(datesInRange(viewRange("month", "2026-02-01", "SUNDAY"))).toHaveLength(28);
  });

  it("can need six weeks", () => {
    // Aug 2026 starts on a Saturday and has 31 days: a Sunday-start grid is six weeks.
    expect(datesInRange(viewRange("month", "2026-08-01", "SUNDAY"))).toHaveLength(42);
  });

  it("crosses a year boundary", () => {
    expect(viewRange("month", "2026-12-01", "SUNDAY")).toEqual({ start: "2026-11-29", end: "2027-01-02" });
    expect(viewRange("month", "2027-01-01", "MONDAY")).toEqual({ start: "2026-12-28", end: "2027-01-31" });
  });

  it("is always whole weeks, for every month of several years and both week starts", () => {
    for (const wso of ["SUNDAY", "MONDAY"] as const) {
      for (let year = 2023; year <= 2028; year++) {
        for (let month = 1; month <= 12; month++) {
          const anchor = `${year}-${String(month).padStart(2, "0")}-01`;
          const range = viewRange("month", anchor, wso);
          const days = datesInRange(range);
          expect(days.length % 7).toBe(0);
          expect(days.length).toBeGreaterThanOrEqual(28);
          expect(days.length).toBeLessThanOrEqual(42);
          expect(range.start <= anchor && range.end >= monthEndOf(anchor)).toBe(true);
          expect(daysBetween(range.start, anchor)).toBeLessThan(7);
          expect(daysBetween(monthEndOf(anchor), range.end)).toBeLessThan(7);
        }
      }
    }
  });
});

describe("stepping between views", () => {
  it("moves a day, a week or a month, both ways", () => {
    expect(stepAnchor("day", "2026-10-07", 1)).toBe("2026-10-08");
    expect(stepAnchor("day", "2026-10-01", -1)).toBe("2026-09-30");
    expect(stepAnchor("week", "2026-10-04", 1)).toBe("2026-10-11");
    expect(stepAnchor("week", "2026-10-04", -1)).toBe("2026-09-27");
    expect(stepAnchor("month", "2026-10-01", 1)).toBe("2026-11-01");
    expect(stepAnchor("month", "2026-10-01", -1)).toBe("2026-09-01");
  });

  it("crosses month and year boundaries", () => {
    expect(stepAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(stepAnchor("day", "2027-01-01", -1)).toBe("2026-12-31");
    expect(stepAnchor("week", "2026-12-27", 1)).toBe("2027-01-03");
    expect(stepAnchor("month", "2026-12-01", 1)).toBe("2027-01-01");
    expect(stepAnchor("month", "2027-01-01", -1)).toBe("2026-12-01");
    expect(stepAnchor("month", "2024-03-01", -1)).toBe("2024-02-01");
  });
});

describe("resolveCalendarRange", () => {
  const resolve = (over: Partial<Parameters<typeof resolveCalendarRange>[0]> = {}) =>
    resolveCalendarRange({ today: "2026-10-07", weekStartsOn: "SUNDAY", ...over });

  it("defaults to the week containing the browser's today", () => {
    expect(resolve()).toEqual({
      view: "week",
      anchor: "2026-10-04",
      range: { start: "2026-10-04", end: "2026-10-10" },
      prev: "2026-09-27",
      next: "2026-10-11",
      containsToday: true,
    });
  });

  it("honors the week-start setting", () => {
    expect(resolve({ weekStartsOn: "MONDAY" })).toMatchObject({ anchor: "2026-10-05", range: { start: "2026-10-05", end: "2026-10-11" } });
    // Sunday 4 Oct belongs to the week that began Monday 28 Sep.
    expect(resolve({ today: "2026-10-04", weekStartsOn: "MONDAY" }).anchor).toBe("2026-09-28");
  });

  it("normalizes any date inside the range to the range's start", () => {
    expect(resolve({ view: "week", date: "2026-10-10" }).anchor).toBe("2026-10-04");
    expect(resolve({ view: "month", date: "2026-10-31" }).anchor).toBe("2026-10-01");
    expect(resolve({ view: "day", date: "2026-10-09" }).anchor).toBe("2026-10-09");
  });

  it("falls back to today for a missing or invalid date, and to the week for an unknown view", () => {
    expect(resolve({ date: "garbage" }).anchor).toBe("2026-10-04");
    expect(resolve({ date: "2026-02-30" }).anchor).toBe("2026-10-04");
    expect(resolve({ view: "year" }).view).toBe("week");
  });

  it("knows whether today is among the dates shown", () => {
    expect(resolve({ date: "2026-10-18" }).containsToday).toBe(false);
    expect(resolve({ view: "day", date: "2026-10-07" }).containsToday).toBe(true);
    expect(resolve({ view: "day", date: "2026-10-08" }).containsToday).toBe(false);
    // The month grid includes leading and trailing days, so it can contain today even from an adjacent month.
    expect(resolve({ view: "month", date: "2026-11-15", today: "2026-11-01" }).containsToday).toBe(true);
    expect(resolve({ view: "month", date: "2026-11-15", today: "2026-10-31" }).containsToday).toBe(false);
    // November 2026 starts on a Sunday: a Monday-start grid begins on 26 Oct, a Sunday-start one on 1 Nov.
    expect(resolve({ view: "month", date: "2026-11-15", today: "2026-10-31", weekStartsOn: "MONDAY" }).containsToday).toBe(true);
    expect(resolve({ view: "month", date: "2026-10-15", today: "2026-11-01", weekStartsOn: "MONDAY" }).containsToday).toBe(true);
  });

  it("gives the previous and next anchors for each view, unbounded in both directions", () => {
    expect(resolve({ view: "day" })).toMatchObject({ prev: "2026-10-06", next: "2026-10-08" });
    expect(resolve({ view: "month" })).toMatchObject({ prev: "2026-09-01", next: "2026-11-01" });
    expect(resolve({ view: "month", date: "1999-12-20" })).toMatchObject({ anchor: "1999-12-01", next: "2000-01-01" });
    expect(resolve({ view: "week", date: "2099-01-04" })).toMatchObject({ prev: "2098-12-28" });
  });

  it("walks forward and back through a year boundary without skipping or repeating", () => {
    let anchor = resolve({ view: "week", date: "2026-12-06" }).anchor;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(anchor);
      anchor = resolve({ view: "week", date: anchor }).next;
    }
    expect(seen).toEqual(["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27", "2027-01-03"]);
    for (let i = 0; i < 4; i++) anchor = resolve({ view: "week", date: anchor }).prev;
    expect(anchor).toBe("2026-12-13");
  });
});

describe("addMonthsKeepingDay", () => {
  it("keeps the day, clamping to the end of a shorter month, across years and backwards", () => {
    expect(addMonthsKeepingDay("2026-01-15", 3)).toBe("2026-04-15");
    expect(addMonthsKeepingDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsKeepingDay("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsKeepingDay("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsKeepingDay("2026-12-01", 12)).toBe("2027-12-01");
    expect(addMonthsKeepingDay("2026-03-31", -1)).toBe("2026-02-28");
  });
});
