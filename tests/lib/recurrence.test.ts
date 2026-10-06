import { describe, expect, it } from "vitest";
import { describeRepeat, nextOccurrenceAfter, occurrenceAt, occurrencesInRange, type RepeatRule } from "@/lib/recurrence";

const rule = (over: Partial<RepeatRule> = {}): RepeatRule => ({ anchor: "2026-01-31", unit: "MONTH", every: 1, until: null, ...over });

describe("occurrenceAt", () => {
  it("counts days and weeks from the anchor", () => {
    expect(occurrenceAt(rule({ unit: "DAY", every: 3 }), 2)).toBe("2026-02-06");
    expect(occurrenceAt(rule({ unit: "WEEK", every: 2 }), 1)).toBe("2026-02-14");
  });
  it("keeps the anchor's day of the month, clamping short months without drifting", () => {
    expect(occurrenceAt(rule(), 1)).toBe("2026-02-28");
    expect(occurrenceAt(rule(), 2)).toBe("2026-03-31");
    expect(occurrenceAt(rule({ every: 3 }), 1)).toBe("2026-04-30");
    expect(occurrenceAt(rule({ every: 12 }), 2)).toBe("2028-01-31");
  });
  it("treats a year as twelve months, so Feb 29 falls on Feb 28 in other years", () => {
    const leap = rule({ anchor: "2028-02-29", unit: "YEAR" });
    expect(occurrenceAt(leap, 1)).toBe("2029-02-28");
    expect(occurrenceAt(leap, 4)).toBe("2032-02-29");
    expect(occurrenceAt(rule({ unit: "YEAR", every: 2 }), 1)).toBe("2028-01-31");
  });
  it("rolls over the end of a year", () => {
    expect(occurrenceAt(rule({ anchor: "2026-11-15" }), 2)).toBe("2027-01-15");
  });
});

describe("occurrencesInRange", () => {
  it("lists the occurrences inside the range, inclusive", () => {
    expect(occurrencesInRange(rule({ anchor: "2026-10-01", unit: "WEEK" }), { start: "2026-10-08", end: "2026-10-22" })).toEqual(["2026-10-08", "2026-10-15", "2026-10-22"]);
  });
  it("starts at the anchor, never before it", () => {
    expect(occurrencesInRange(rule({ anchor: "2026-10-05", unit: "DAY" }), { start: "2026-10-01", end: "2026-10-07" })).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
  it("finds a series that began long ago, for each unit", () => {
    expect(occurrencesInRange(rule({ anchor: "2020-03-15", unit: "YEAR" }), { start: "2026-03-01", end: "2026-03-31" })).toEqual(["2026-03-15"]);
    expect(occurrencesInRange(rule({ anchor: "2020-01-31", unit: "MONTH", every: 5 }), { start: "2026-01-01", end: "2026-12-31" })).toEqual(["2026-04-30", "2026-09-30"]);
    expect(occurrencesInRange(rule({ anchor: "2020-01-01", unit: "DAY", every: 100 }), { start: "2026-10-01", end: "2026-10-31" })).toHaveLength(0);
  });
  it("stops at the end date", () => {
    expect(occurrencesInRange(rule({ anchor: "2026-10-01", unit: "DAY", until: "2026-10-03" }), { start: "2026-10-01", end: "2026-10-31" })).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(occurrencesInRange(rule({ anchor: "2026-10-01", unit: "DAY", until: "2026-10-03" }), { start: "2026-11-01", end: "2026-11-30" })).toEqual([]);
  });
  it("gives up after a bounded number of steps", () => {
    expect(occurrencesInRange(rule({ anchor: "2026-01-01", unit: "DAY" }), { start: "2026-01-01", end: "2040-01-01" })).toHaveLength(1000);
  });
});

describe("nextOccurrenceAfter", () => {
  it("is the first occurrence strictly after the date", () => {
    expect(nextOccurrenceAfter(rule({ anchor: "2026-10-01", unit: "WEEK" }), "2026-10-08")).toBe("2026-10-15");
    expect(nextOccurrenceAfter(rule({ anchor: "2026-10-01", unit: "WEEK" }), "2026-10-09")).toBe("2026-10-15");
    expect(nextOccurrenceAfter(rule({ anchor: "2026-10-01", unit: "WEEK" }), "2026-09-01")).toBe("2026-10-01");
  });
  it("keeps the day of month for a series that has been moved forward", () => {
    expect(nextOccurrenceAfter(rule(), "2026-02-28")).toBe("2026-03-31");
  });
  it("is null once the series has ended", () => {
    expect(nextOccurrenceAfter(rule({ anchor: "2026-10-01", unit: "DAY", until: "2026-10-03" }), "2026-10-03")).toBeNull();
  });
});

describe("describeRepeat", () => {
  it("reads naturally", () => {
    expect(describeRepeat("WEEK", 1, null)).toBe("Every week");
    expect(describeRepeat("MONTH", 3, null)).toBe("Every 3 months");
    expect(describeRepeat("YEAR", 1, "2030-06-01")).toBe("Every year, until Jun 1, 2030");
  });
});
