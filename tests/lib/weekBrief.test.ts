import { describe, it, expect } from "vitest";
import { DRAWING, buildBrief, buildDrawing, joinList } from "@/lib/weekBrief";
import type { AgendaContactDateEntry, AgendaEntry, AgendaItemEntry, AgendaMealEntry } from "@/lib/agendaOrder";

// The week of Sun 4 Oct 2026 to Sat 10 Oct.
const START = "2026-10-04";
let n = 0;
const item = (date: string, over: Partial<AgendaItemEntry> = {}): AgendaItemEntry => ({
  source: "item", id: `i${++n}`, itemId: "item", date, title: "Item", notes: null, startTime: null, endTime: null, assigneeContactId: null,
  assigneeName: null, createdAt: `2026-10-01T00:00:${String(n % 60).padStart(2, "0")}Z`, repeat: null, editable: true, ...over,
});
const event = (date: string, title: string, over: Partial<AgendaItemEntry> = {}) => item(date, { title, ...over });
const birthday = (date: string, title: string, turns: number | null = null): AgendaContactDateEntry => ({
  source: "contact_date", id: `c${++n}`, date, title, type: "birthday", contactId: "c", turns, editable: false,
});
const dinner = (date: string, dish: string): AgendaMealEntry => ({ source: "meal", id: `m${++n}`, date, slot: "DINNER", title: `Dinner: ${dish}`, createdAt: "2026-10-01T00:00:00Z", editable: false });
const lunch = (date: string, dish: string): AgendaMealEntry => ({ ...dinner(date, dish), slot: "LUNCH", title: `Lunch: ${dish}` });

const brief = (entries: AgendaEntry[] = [], over: Partial<Parameters<typeof buildBrief>[0]> = {}) =>
  buildBrief({ firstName: "Casey", weekStart: START, today: "2026-10-07", entries, ...over });

describe("joinList", () => {
  it("reads naturally", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["Monday"])).toBe("Monday");
    expect(joinList(["Monday", "Tuesday"])).toBe("Monday and Tuesday");
    expect(joinList(["Mon", "Tue", "Fri"])).toBe("Mon, Tue and Fri");
  });
});

describe("the days", () => {
  it("covers the seven days from the week's first day, marking today", () => {
    const { days } = brief();
    expect(days.map((d) => d.weekday)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(days.map((d) => d.weekdayLong)[3]).toBe("Wednesday");
    expect(days.map((d) => d.dayOfMonth)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(days.filter((d) => d.isToday).map((d) => d.weekday)).toEqual(["Wed"]);
  });

  it("starts on Monday when the week does", () => {
    expect(brief([], { weekStart: "2026-10-05" }).days.map((d) => d.weekday)[0]).toBe("Mon");
  });

  it("says Open with nothing planned for an empty day", () => {
    expect(brief().days[0]).toMatchObject({ title: "Open", support: "Nothing planned.", load: 0, empty: true, more: "" });
  });

  it("names a meal-only day by its dish, with each meal listed", () => {
    const { days } = brief([lunch("2026-10-05", "Soup"), dinner("2026-10-05", "Tacos"), dinner("2026-10-05", "Rice")]);
    expect(days[1]).toMatchObject({ title: "Tacos", load: 3, more: "+2 more", support: "Lunch: Soup. Dinner: Tacos. Dinner: Rice." });
  });

  it("names a day with only a lunch by that dish", () => {
    expect(brief([lunch("2026-10-06", "Sandwiches")]).days[2].title).toBe("Sandwiches");
  });

  it("prefers an event or a date to a meal as the day's main item", () => {
    const { days } = brief([event("2026-10-08", "Dentist", { startTime: "09:30", endTime: "10:15" }), dinner("2026-10-08", "Pasta")]);
    expect(days[4]).toMatchObject({ title: "Dentist", support: "9:30 AM \u2013 10:15 AM Dentist. Dinner: Pasta.", load: 2 });
    const withBirthday = brief([birthday("2026-10-08", "Jo's birthday", 41), dinner("2026-10-08", "Pasta")]).days[4];
    expect(withBirthday).toMatchObject({ title: "Jo's birthday", support: "Jo's birthday (turns 41). Dinner: Pasta." });
  });

  it("lists a reminder with no time plainly", () => {
    expect(brief([event("2026-10-06", "Picture day")]).days[2]).toMatchObject({ title: "Picture day", support: "Picture day." });
  });


  it("falls back to a meal when that is all there is, preferring dinner, then the first", () => {
    expect(brief([lunch("2026-10-06", "Soup"), dinner("2026-10-06", "Tacos")]).days[2].title).toBe("Tacos");
    expect(brief([lunch("2026-10-06", "Soup"), { ...lunch("2026-10-06", "Eggs"), slot: "BREAKFAST", title: "Breakfast: Eggs" }]).days[2].title).toBe("Soup");
  });

  it("ignores entries from other days", () => {
    expect(brief([event("2026-10-20", "Elsewhere")]).days.every((d) => d.empty)).toBe(true);
  });
});

describe("the headline", () => {
  it("says so when nothing is planned", () => {
    expect(brief().headline).toBe("Nothing is planned this week yet, Casey.");
  });


  it("names the busiest day or days", () => {
    const one = brief([dinner("2026-10-05", "A"), dinner("2026-10-05", "B"), dinner("2026-10-06", "C")]);
    expect(one.headline).toBe("A light week, Casey, with the most planned on Monday.");
    const two = brief([dinner("2026-10-05", "A"), event("2026-10-06", "B")]);
    expect(two.headline).toBe("A light week, Casey, with the most planned on Monday and Tuesday.");
  });

  it("counts events and birthdays as well as meals", () => {
    const entries = [event("2026-10-08", "A"), event("2026-10-08", "B"), birthday("2026-10-08", "Jo's birthday"), dinner("2026-10-09", "C")];
    expect(brief(entries).headline).toBe("A light week, Casey, with the most planned on Thursday.");
  });

  it("calls the week light, steady or full by how much is on", () => {
    const some = (count: number) => Array.from({ length: count }, (_, i) => dinner(`2026-10-0${5 + (i % 5)}`, `M${i}`));
    expect(brief(some(4)).headline.startsWith("A light week")).toBe(true);
    expect(brief(some(5)).headline.startsWith("A steady week")).toBe(true);
    expect(brief(some(13)).headline.startsWith("A steady week")).toBe(true);
    expect(brief(some(14)).headline.startsWith("A full week")).toBe(true);
  });

  it("calls an even week even", () => {
    const entries = ["04", "05", "06", "07", "08", "09", "10"].map((d) => dinner(`2026-10-${d}`, "Same"));
    expect(brief(entries).headline).toBe("A steady week, Casey, planned evenly across the days.");
  });

  it("doesn't list more than three busiest days", () => {
    const tie = ["04", "05", "06", "07"].map((d) => dinner(`2026-10-${d}`, "X")).concat(dinner("2026-10-09", "Y"));
    expect(brief(tie).headline).toBe("A steady week, Casey, with plans spread across the week.");
    const thursday = ["04", "05", "06", "07"].map((d) => dinner(`2026-10-${d}`, "X")).concat(dinner("2026-10-08", "Y"), dinner("2026-10-08", "Z"), dinner("2026-10-08", "W"));
    expect(brief(thursday).headline).toContain("most planned on Thursday");
  });
});

describe("the strip under the drawing", () => {
  it("says what is more on a day than its title", () => {
    const { days } = brief([dinner("2026-10-05", "Tacos"), lunch("2026-10-05", "Soup"), birthday("2026-10-05", "Jo's birthday"), event("2026-10-06", "Picture day")]);
    expect(days[1].more).toBe("+2 more"); // 3 things
    expect(days[2].more).toBe(""); // just its title
    expect(days[0].more).toBe(""); // an open day
  });
});

describe("the drawing", () => {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  it("is a flat line for a week with nothing in it, with no dots", () => {
    const d = buildDrawing([0, 0, 0, 0, 0, 0, 0], labels, -1);
    expect(d.points.every((p) => p.y === DRAWING.baseline && p.r === 0)).toBe(true);
    expect(d.points.map((p) => p.label)).toEqual(labels);
  });

  it("puts each day at a height proportional to its load, the busiest at the top", () => {
    const d = buildDrawing([0, 4, 2, 0, 1, 0, 0], labels, 1);
    const top = DRAWING.baseline - DRAWING.amplitude;
    expect(d.points[1].y).toBe(top);
    expect(d.points[2].y).toBe(DRAWING.baseline - DRAWING.amplitude / 2);
    expect(d.points[3].y).toBe(DRAWING.baseline);
  });

  it("sizes a dot by weight, with none on an empty day, and marks today", () => {
    const d = buildDrawing([0, 4, 2, 0, 0, 0, 0], labels, 2);
    expect(d.points[0].r).toBe(0);
    expect(d.points[1].r).toBeGreaterThan(d.points[2].r);
    expect(d.points[2].r).toBeGreaterThan(0);
    expect(d.points.filter((p) => p.isToday).map((p) => p.label)).toEqual(["Tue"]);
  });

  it("spreads the days evenly and draws one unbroken curve from edge to edge", () => {
    const d = buildDrawing([1, 1, 1, 1, 1, 1, 1], labels, -1);
    const step = DRAWING.width / 7;
    expect(d.points[0].x).toBe(Math.round(step * 0.5 * 10) / 10);
    expect(d.path.startsWith(`M 0 ${DRAWING.baseline}`)).toBe(true);
    expect(d.path.endsWith(`${DRAWING.width} ${DRAWING.baseline}`)).toBe(true);
    expect(d.path.match(/C /g)).toHaveLength(8); // 7 days + the two ends = 8 joins
    expect(d.path).not.toMatch(/NaN/);
  });

  it("has no day names of its own (the page names the days under it)", () => {
    expect(DRAWING.height).toBe(140);
    expect(DRAWING.baseline).toBeLessThan(DRAWING.height);
  });

  it("is built into the brief from the days' loads", () => {
    const b = brief([dinner("2026-10-05", "A")]);
    expect(b.drawing.points.map((p) => p.load)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(b.total).toBe(1);
    expect(b.drawing.points.filter((p) => p.isToday).map((p) => p.label)).toEqual(["Wed"]);
  });

  it("has no day marked as today when today is outside the week", () => {
    expect(brief([], { today: "2026-12-25" }).drawing.points.some((p) => p.isToday)).toBe(false);
  });
});
