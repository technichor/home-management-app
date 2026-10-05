import { describe, it, expect } from "vitest";
import {
  addDays,
  dateOr,
  dateToString,
  dayOfWeek,
  formatCalendarDate,
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
