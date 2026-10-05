import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { DRAWING, buildBrief, buildDrawing, joinList, type BriefEntry } from "@/lib/weekBrief";

// The week of Sun 4 Oct 2026 to Sat 10 Oct.
const START = "2026-10-04";
const SLOTS = ["LUNCH", "DINNER"] as const;
const dinner = (date: string, label: string): BriefEntry => ({ date, slot: "DINNER", label });
const lunch = (date: string, label: string): BriefEntry => ({ date, slot: "LUNCH", label });

const brief = (over: Partial<Parameters<typeof buildBrief>[0]> = {}) =>
  buildBrief({ firstName: "Casey", weekStart: START, today: "2026-10-07", slots: [...SLOTS], entries: [], dates: [], ...over });

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
    expect(brief({ weekStart: "2026-10-05" }).days.map((d) => d.weekday)[0]).toBe("Mon");
  });

  it("says Open with nothing planned for an empty day", () => {
    const [sun] = brief().days;
    expect(sun).toMatchObject({ title: "Open", support: "Nothing planned.", load: 0 });
  });

  it("titles a day by its dinner and lists each meal of the day in order", () => {
    const { days } = brief({ entries: [dinner("2026-10-05", "Tacos"), lunch("2026-10-05", "Soup"), dinner("2026-10-05", "Rice")] });
    expect(days[1]).toMatchObject({ title: "Tacos", load: 3, support: "Lunch: Soup. Dinner: Tacos, Rice." });
  });

  it("titles a day with no dinner by its first meal", () => {
    const { days } = brief({ entries: [lunch("2026-10-06", "Sandwiches")] });
    expect(days[2]).toMatchObject({ title: "Sandwiches", support: "Lunch: Sandwiches." });
  });

  it("includes a contact's important date, and titles a day by it when there are no meals", () => {
    const { days } = brief({ dates: [{ date: "2026-10-08", name: "Jo Jones", label: "Birthday" }] });
    expect(days[4]).toMatchObject({ title: "Jo Jones's birthday", support: "Jo Jones's birthday.", load: 1 });
  });

  it("adds a date after a day's meals", () => {
    const { days } = brief({ entries: [dinner("2026-10-08", "Pasta")], dates: [{ date: "2026-10-08", name: "Jo", label: "Anniversary" }] });
    expect(days[4]).toMatchObject({ title: "Pasta", load: 2, support: "Dinner: Pasta. Jo's anniversary." });
  });

  it("only mentions meals of the slots in view", () => {
    const { days } = brief({ slots: ["DINNER"], entries: [lunch("2026-10-05", "Soup"), dinner("2026-10-05", "Tacos")] });
    expect(days[1].support).toBe("Dinner: Tacos.");
  });
});

describe("the headline", () => {
  it("says so when nothing is planned", () => {
    expect(brief().headline).toBe("Nothing is planned this week yet, Casey.");
  });

  it("names the busiest day or days", () => {
    const one = brief({ entries: [dinner("2026-10-05", "A"), dinner("2026-10-05", "B"), dinner("2026-10-06", "C")] });
    expect(one.headline).toBe("A light week, Casey, with the most planned on Monday.");
    const two = brief({ entries: [dinner("2026-10-05", "A"), dinner("2026-10-06", "B")] });
    expect(two.headline).toBe("A light week, Casey, with the most planned on Monday and Tuesday.");
  });

  it("calls the week light, steady or full by how much is on", () => {
    const some = (n: number) => Array.from({ length: n }, (_, i) => dinner(`2026-10-0${5 + (i % 5)}`, `M${i}`));
    expect(brief({ entries: some(4) }).headline.startsWith("A light week")).toBe(true);
    expect(brief({ entries: some(5) }).headline.startsWith("A steady week")).toBe(true);
    expect(brief({ entries: some(13) }).headline.startsWith("A steady week")).toBe(true);
    expect(brief({ entries: some(14) }).headline.startsWith("A full week")).toBe(true);
  });

  it("calls an even week even", () => {
    const entries = ["04", "05", "06", "07", "08", "09", "10"].map((d) => dinner(`2026-10-${d}`, "Same"));
    expect(brief({ entries }).headline).toBe("A steady week, Casey, planned evenly across the days.");
  });

  it("doesn't list more than three busiest days", () => {
    const entries = ["04", "05", "06", "07"].flatMap((d) => [dinner(`2026-10-${d}`, "X")]).concat(dinner("2026-10-08", "Y"), dinner("2026-10-08", "Z"), dinner("2026-10-08", "W"));
    // Thursday has 3; make four days tie on the maximum instead.
    const tie = ["04", "05", "06", "07"].map((d) => dinner(`2026-10-${d}`, "X")).concat(dinner("2026-10-09", "Y"));
    expect(brief({ entries: tie }).headline).toBe("A steady week, Casey, with plans spread across the week.");
    expect(brief({ entries }).headline).toContain("most planned on Thursday");
  });
});

describe("the three stretches", () => {
  it("splits the week into the first two days, the middle three and the last two", () => {
    expect(brief().groups.map((g) => g.range)).toEqual(["Sun – Mon", "Tue – Thu", "Fri – Sat"]);
    expect(brief({ weekStart: "2026-10-05" }).groups.map((g) => g.range)).toEqual(["Mon – Tue", "Wed – Fri", "Sat – Sun"]);
  });

  it("says nothing planned for a stretch with nothing", () => {
    expect(brief().groups.map((g) => g.text)).toEqual(["Nothing planned.", "Nothing planned.", "Nothing planned."]);
  });

  it("counts the meals and names the days with no dinner", () => {
    const { groups } = brief({ entries: [dinner("2026-10-05", "A"), lunch("2026-10-05", "B"), dinner("2026-10-07", "C")] });
    expect(groups[0].text).toBe("2 meals planned. Dinner is open on Sun.");
    expect(groups[1].text).toBe("1 meal planned. Dinner is open on Tue and Thu.");
    expect(groups[2].text).toBe("Nothing planned.");
  });

  it("doesn't mention dinners when dinner isn't shown, or when every day has one", () => {
    const hidden = brief({ slots: ["LUNCH"], entries: [lunch("2026-10-05", "B")] });
    expect(hidden.groups[0].text).toBe("1 meal planned.");
    const full = brief({ entries: [dinner("2026-10-04", "A"), dinner("2026-10-05", "B")] });
    expect(full.groups[0].text).toBe("2 meals planned.");
  });

  it("mentions important dates, and counts any beyond two", () => {
    const dates = [
      { date: "2026-10-08", name: "Jo", label: "Birthday" },
      { date: "2026-10-08", name: "Sam", label: "Anniversary" },
      { date: "2026-10-09", name: "Lee", label: "Birthday" },
      { date: "2026-10-09", name: "Kim", label: "Birthday" },
    ];
    const { groups } = brief({ dates: dates.slice(0, 1) });
    expect(groups[1].text).toBe("Jo's birthday is on Thu.");
    const many = brief({ dates: [dates[0], dates[1], { date: "2026-10-06", name: "Al", label: "Name day" }] });
    expect(many.groups[1].text).toBe("Jo's birthday is on Thu. Sam's anniversary is on Thu. 1 more date follows.");
  });

  it("pluralises the leftover dates", () => {
    const dates = [4, 5, 6, 7].map((d, i) => ({ date: `2026-10-0${d}`, name: `P${i}`, label: "Birthday" })).filter((d) => ["2026-10-06", "2026-10-07"].includes(d.date));
    const extra = [...dates, { date: "2026-10-08", name: "Q", label: "Birthday" }, { date: "2026-10-08", name: "R", label: "Birthday" }];
    expect(brief({ dates: extra }).groups[1].text).toContain("2 more dates follow.");
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

  it("is built into the brief from the days' loads", () => {
    const b = brief({ entries: [dinner("2026-10-05", "A")] });
    expect(b.drawing.points.map((p) => p.load)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(b.total).toBe(1);
    expect(b.drawing.points.filter((p) => p.isToday).map((p) => p.label)).toEqual(["Wed"]);
  });

  it("has no day marked as today when today is outside the week", () => {
    expect(brief({ today: "2026-12-25" }).drawing.points.some((p) => p.isToday)).toBe(false);
  });
});
