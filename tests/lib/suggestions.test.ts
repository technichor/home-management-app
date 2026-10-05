import { describe, it, expect } from "vitest";
import {
  POOL_SIZE,
  RECENT_DAYS,
  SHOWN,
  dueForRepeat,
  eligibleMeals,
  familyStaples,
  pickSuggestions,
  seededRandom,
  type SuggestionMeal,
} from "@/lib/suggestions";

const meal = (id: string, lastMade: string | null, timesMade: number, name = id): SuggestionMeal => ({ id, name, lastMade, timesMade });
const none = new Set<string>();
const TODAY = "2026-10-20";

describe("eligibleMeals", () => {
  it("leaves out a meal planned this week", () => {
    const meals = [meal("a", "2026-01-01", 5), meal("b", "2026-01-01", 5)];
    expect(eligibleMeals(meals, TODAY, new Set(["a"])).map((m) => m.id)).toEqual(["b"]);
  });

  it("leaves out a meal made in the last 14 days, counting the 14th day, but not the 15th", () => {
    expect(RECENT_DAYS).toBe(14);
    const meals = [meal("today", "2026-10-20", 1), meal("d13", "2026-10-07", 1), meal("d14", "2026-10-06", 1), meal("d15", "2026-10-05", 1)];
    expect(eligibleMeals(meals, TODAY, none).map((m) => m.id)).toEqual(["d15"]);
  });

  it("keeps a meal that has never been made", () => {
    expect(eligibleMeals([meal("n", null, 0)], TODAY, none)).toHaveLength(1);
  });
});

describe("dueForRepeat", () => {
  it("puts never-made meals first (by name), then the oldest last-made first", () => {
    const ranked = dueForRepeat([
      meal("recent", "2026-09-01", 9, "Recent"),
      meal("never-b", null, 0, "Beta"),
      meal("oldest", "2025-01-01", 1, "Oldest"),
      meal("never-a", null, 0, "Alpha"),
      meal("mid", "2026-03-01", 2, "Mid"),
    ]);
    expect(ranked.map((m) => m.id)).toEqual(["never-a", "never-b", "oldest", "mid", "recent"]);
  });

  it("breaks a tie on the date by name, and does not change its input", () => {
    const input = [meal("z", "2026-01-01", 1, "Zed"), meal("a", "2026-01-01", 1, "Ann")];
    expect(dueForRepeat(input).map((m) => m.id)).toEqual(["a", "z"]);
    expect(input.map((m) => m.id)).toEqual(["z", "a"]);
  });
});

describe("familyStaples", () => {
  it("lists the most made first (ties by name) and leaves out meals never made", () => {
    const ranked = familyStaples([meal("few", "2026-01-01", 2, "Few"), meal("never", null, 0, "Never"), meal("many", "2026-01-01", 9, "Many"), meal("tie", "2026-01-01", 2, "Ant")]);
    expect(ranked.map((m) => m.id)).toEqual(["many", "tie", "few"]);
  });
});

describe("pickSuggestions", () => {
  const ranked = Array.from({ length: 20 }, (_, i) => meal(`m${i}`, null, 0));

  it("shows the best few, in order, until shuffled", () => {
    expect(SHOWN).toBe(4);
    expect(pickSuggestions(ranked, null).map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3"]);
    expect(pickSuggestions(ranked.slice(0, 2), null)).toHaveLength(2);
  });

  it("shuffles within the best pool only, and the same seed gives the same draw", () => {
    expect(POOL_SIZE).toBe(12);
    const a = pickSuggestions(ranked, 123);
    expect(a).toHaveLength(4);
    expect(a.every((m) => Number(m.id.slice(1)) < POOL_SIZE)).toBe(true);
    expect(pickSuggestions(ranked, 123)).toEqual(a);
    const different = [1, 2, 3, 4, 5].map((s) => pickSuggestions(ranked, s).map((m) => m.id).join());
    expect(new Set(different).size).toBeGreaterThan(1);
  });

  it("does not repeat a meal, and copes with a short list", () => {
    const ids = pickSuggestions(ranked, 9).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pickSuggestions(ranked.slice(0, 2), 9)).toHaveLength(2);
    expect(pickSuggestions([], 9)).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const before = ranked.map((m) => m.id);
    pickSuggestions(ranked, 5);
    expect(ranked.map((m) => m.id)).toEqual(before);
  });
});

describe("seededRandom", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    const xs = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(2)()).not.toBe(xs[0]);
  });
});
