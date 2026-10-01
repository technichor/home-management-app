import { describe, it, expect } from "vitest";
import { expectedScore, updateRatings, pickPair } from "@/lib/elo";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
  });
  it("is about 0.76 for a 200 point advantage", () => {
    expect(expectedScore(1700, 1500)).toBeCloseTo(0.76, 2);
  });
});

describe("updateRatings (K = 32)", () => {
  it("moves equal-rated items by 16 when one wins", () => {
    const r = updateRatings(1500, 1500, "A");
    expect(r.a).toBeCloseTo(1516);
    expect(r.b).toBeCloseTo(1484);
  });
  it("is symmetric when B wins", () => {
    const r = updateRatings(1500, 1500, "B");
    expect(r.a).toBeCloseTo(1484);
    expect(r.b).toBeCloseTo(1516);
  });
  it("leaves equal-rated items unchanged on 'about equal'", () => {
    const r = updateRatings(1500, 1500, "EQUAL");
    expect(r.a).toBeCloseTo(1500);
    expect(r.b).toBeCloseTo(1500);
  });
  it("pulls a higher-rated item down on 'about equal'", () => {
    const r = updateRatings(1700, 1500, "EQUAL");
    expect(r.a).toBeLessThan(1700);
    expect(r.b).toBeGreaterThan(1500);
  });
  it("conserves total rating", () => {
    const r = updateRatings(1620, 1480, "B");
    expect(r.a + r.b).toBeCloseTo(3100);
  });
});

describe("pickPair", () => {
  const item = (id: string, rating = 1500, comparisonCount = 0) => ({ id, rating, comparisonCount });

  it("returns null with fewer than two items", () => {
    expect(pickPair([item("a")])).toBeNull();
  });
  it("starts from a least-compared item", () => {
    const [a] = pickPair([item("a", 1500, 3), item("b", 1500, 0), item("c", 1500, 3)], null, () => 0)!;
    expect(a.id).toBe("b");
  });
  it("pairs with the closest-rated partner", () => {
    const [a, b] = pickPair([item("a", 1500), item("b", 1900, 1), item("c", 1520, 1)], null, () => 0)!;
    expect(a.id).toBe("a");
    expect(b.id).toBe("c");
  });
  it("does not repeat the last pair when another exists", () => {
    const pair = pickPair([item("a"), item("b"), item("c")], ["a", "b"], () => 0)!;
    expect(new Set(pair.map((p) => p.id))).not.toEqual(new Set(["a", "b"]));
  });
  it("allows the repeat when only two items exist", () => {
    const pair = pickPair([item("a"), item("b")], ["a", "b"])!;
    expect(pair).toHaveLength(2);
  });
});
