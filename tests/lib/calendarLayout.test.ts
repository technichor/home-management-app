import { describe, it, expect } from "vitest";
import {
  allDayEntries,
  DEFAULT_BLOCK_MINUTES,
  DURATIONS,
  durationLabel,
  durationOf,
  endAfter,
  hhmm,
  hourLabel,
  layoutDay,
  minuteAt,
  minutesOf,
  openingMinute,
  startOf,
  HOUR_PX,
} from "@/lib/calendarLayout";
import type { AgendaContactDateEntry, AgendaEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

const D = "2026-10-07";
let n = 0;
const item = (startTime: string | null, endTime: string | null = null, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: `i${n}`, date: D, title: `Item ${n}`, notes: null, startTime, endTime,
  assigneeContactId: null, assigneeName: null, createdAt: "", repeat: null, google: { wanted: true, sent: false, error: null }, editable: true, ...over,
});
const meal = (startTime: string | null): AgendaMealEntry => ({ source: "meal", id: `m${++n}`, date: D, slot: "DINNER", title: "Dinner: Tacos", startTime, createdAt: "", editable: false });
const birthday = (): AgendaContactDateEntry => ({ source: "contact_date", id: `c${++n}`, date: D, title: "Jo's birthday", type: "birthday", contactId: "c", turns: null, editable: false });
const spans = (entries: AgendaEntry[]) => layoutDay(entries).map((b) => [b.entry.title, b.start, b.end, b.column, b.columns]);

describe("times", () => {
  it("converts between HH:MM and minutes after midnight", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("00:00")).toBe(0);
    expect(hhmm(570)).toBe("09:30");
    expect(hhmm(5)).toBe("00:05");
  });

  it("labels the hours down the left, leaving midnight blank", () => {
    expect([0, 1, 11, 12, 13, 23].map(hourLabel)).toEqual(["", "1 AM", "11 AM", "12 PM", "1 PM", "11 PM"]);
  });
});

describe("what is timed", () => {
  it("is an event with a start time or a meal with a usual time; never a contact date", () => {
    expect(startOf(item("09:00"))).toBe("09:00");
    expect(startOf(item(null))).toBeNull();
    expect(startOf(meal("17:30"))).toBe("17:30");
    expect(startOf(meal(null))).toBeNull();
    expect(startOf(birthday())).toBeNull();
  });

  it("puts reminders, contact dates and untimed meals in the row along the top", () => {
    const reminder = item(null);
    const dinner = meal(null);
    const date = birthday();
    expect(allDayEntries([item("09:00"), reminder, dinner, date, meal("12:00")])).toEqual([reminder, dinner, date]);
  });
});

describe("layoutDay", () => {
  it("draws an event from its start to its end, and one with no end (or a meal) for 30 minutes", () => {
    expect(spans([item("09:00", "10:15", { title: "A" }), item("13:00", null, { title: "B" }), meal("17:30")])).toEqual([
      ["A", 540, 615, 0, 1],
      ["B", 780, 780 + DEFAULT_BLOCK_MINUTES, 0, 1],
      ["Dinner: Tacos", 1050, 1080, 0, 1],
    ]);
  });

  it("never runs a block past midnight", () => {
    expect(spans([item("23:50", null, { title: "Late" })])).toEqual([["Late", 1430, 1440, 0, 1]]);
  });

  it("leaves out what has no time", () => {
    expect(layoutDay([item(null), birthday(), meal(null)])).toEqual([]);
  });

  it("puts overlapping events side by side, sharing the width", () => {
    expect(spans([item("09:00", "10:00", { title: "A" }), item("09:30", "10:30", { title: "B" })])).toEqual([
      ["A", 540, 600, 0, 2],
      ["B", 570, 630, 1, 2],
    ]);
  });

  it("lets a later event reuse a column once it is free, within the same overlapping group", () => {
    // A 9-12 overlaps B 9-10 and C 10:30-11; C can take B's column again.
    expect(spans([item("09:00", "12:00", { title: "A" }), item("09:00", "10:00", { title: "B" }), item("10:30", "11:00", { title: "C" })])).toEqual([
      ["A", 540, 720, 0, 2],
      ["B", 540, 600, 1, 2],
      ["C", 630, 660, 1, 2],
    ]);
  });

  it("starts a new group after a gap, and back-to-back events don't count as overlapping", () => {
    expect(spans([item("09:00", "10:00", { title: "A" }), item("10:00", "11:00", { title: "B" }), item("09:15", "09:45", { title: "C" })])).toEqual([
      ["A", 540, 600, 0, 2],
      ["C", 555, 585, 1, 2],
      ["B", 600, 660, 0, 1],
    ]);
  });

  it("puts the longer of two that start together first", () => {
    expect(spans([item("09:00", "09:30", { title: "Short" }), item("09:00", "11:00", { title: "Long" })]).map((s) => s[0])).toEqual(["Long", "Short"]);
  });
});

describe("openingMinute", () => {
  it("opens at 7 AM, or half an hour before an earlier entry", () => {
    expect(openingMinute([])).toBe(7 * 60);
    expect(openingMinute([item("13:00"), birthday()])).toBe(7 * 60);
    expect(openingMinute([item("06:00"), meal("06:45")])).toBe(5 * 60 + 30);
    expect(openingMinute([item("00:10")])).toBe(0);
  });
});

describe("minuteAt", () => {
  it("is the half hour clicked, within the day", () => {
    expect(minuteAt(9.75 * HOUR_PX)).toBe(9 * 60 + 30);
    expect(minuteAt(9 * HOUR_PX)).toBe(9 * 60);
    expect(minuteAt(-10)).toBe(0);
    expect(minuteAt(25 * HOUR_PX)).toBe(23 * 60 + 30);
  });
});

describe("event lengths", () => {
  it("ends an event a number of minutes after its start, never past 23:59", () => {
    expect(endAfter("09:00", 30)).toBe("09:30");
    expect(endAfter("09:45", 90)).toBe("11:15");
    expect(endAfter("23:00", 120)).toBe("23:59");
  });

  it("measures an event, or not, when the end isn't after the start or a time is missing", () => {
    expect(durationOf("09:00", "10:30")).toBe(90);
    expect(durationOf("09:00", "09:00")).toBeNull();
    expect(durationOf("10:00", "09:00")).toBeNull();
    expect(durationOf("", "09:00")).toBeNull();
    expect(durationOf("09:00", "")).toBeNull();
  });

  it("names lengths as people say them", () => {
    expect(DURATIONS.map(durationLabel)).toEqual(["15 min", "30 min", "45 min", "1 hr", "1.5 hr", "2 hr", "3 hr", "4 hr"]);
    expect(durationLabel(70)).toBe("1 hr 10 min");
    expect(durationLabel(29)).toBe("29 min");
  });
});
