import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { mealPlanEntry: { groupBy: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { deleteMealKeepingEntries, mealKey, mealStats } from "@/lib/meals";
import { mealSchema, MAX_MEAL_DESCRIPTION } from "@/lib/validations";

beforeEach(() => vi.resetAllMocks());

describe("mealKey", () => {
  it("lowercases and trims, so names match ignoring case", () => {
    expect(mealKey("  Chicken Tikka  ")).toBe("chicken tikka");
    expect(mealKey("CHICKEN TIKKA")).toBe(mealKey("chicken tikka"));
  });
});

describe("mealStats", () => {
  it("derives last made and times made from entries on or before today, for this household", async () => {
    vi.mocked(prisma.mealPlanEntry.groupBy).mockResolvedValue([
      { mealId: "m1", _max: { date: new Date("2026-10-03T00:00:00Z") }, _count: { _all: 4 } },
      { mealId: "m2", _max: { date: null }, _count: { _all: 0 } },
      { mealId: null, _max: { date: new Date("2026-10-01T00:00:00Z") }, _count: { _all: 9 } },
    ] as any);
    const stats = await mealStats("h1", "2026-10-05");
    expect(stats.get("m1")).toEqual({ lastMade: "2026-10-03", timesMade: 4 });
    expect(stats.get("m2")).toEqual({ lastMade: null, timesMade: 0 });
    expect(stats.size).toBe(2);
    expect(vi.mocked(prisma.mealPlanEntry.groupBy).mock.calls[0][0]).toMatchObject({
      by: ["mealId"],
      where: { householdId: "h1", mealId: { not: null }, date: { lte: new Date("2026-10-05T00:00:00Z") } },
    });
  });
});

describe("deleteMealKeepingEntries", () => {
  it("copies the name onto every entry first, then deletes the meal, and says how many entries", async () => {
    const order: string[] = [];
    const tx: any = {
      mealPlanEntry: { updateMany: vi.fn(async () => (order.push("convert"), { count: 3 })) },
      meal: { delete: vi.fn(async () => (order.push("delete"), {})) },
    };
    expect(await deleteMealKeepingEntries(tx, { id: "m1", name: "Tacos" })).toBe(3);
    expect(order).toEqual(["convert", "delete"]);
    expect(tx.mealPlanEntry.updateMany).toHaveBeenCalledWith({ where: { mealId: "m1" }, data: { text: "Tacos" } });
    expect(tx.meal.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});

describe("mealSchema", () => {
  it("trims the name and requires one", () => {
    expect(mealSchema.safeParse({ name: "  Tacos ", description: null }).data).toEqual({ name: "Tacos", description: null });
    expect(mealSchema.safeParse({ name: "  ", description: null }).error?.issues[0].message).toBe("Give the meal a name");
  });

  it("limits the name's length", () => {
    expect(mealSchema.safeParse({ name: "a".repeat(120) }).success).toBe(true);
    expect(mealSchema.safeParse({ name: "a".repeat(121) }).error?.issues[0].message).toContain("120");
  });

  it("keeps a description exactly as pasted, and turns a blank or missing one into null", () => {
    const recipe = "1. Chop\n   2 onions\n\n2. Fry\n";
    expect(mealSchema.safeParse({ name: "x", description: recipe }).data?.description).toBe(recipe);
    expect(mealSchema.safeParse({ name: "x", description: " \n " }).data?.description).toBeNull();
    expect(mealSchema.safeParse({ name: "x", description: "" }).data?.description).toBeNull();
    expect(mealSchema.safeParse({ name: "x" }).data?.description).toBeNull();
  });

  it("limits the description to 20,000 characters", () => {
    expect(MAX_MEAL_DESCRIPTION).toBe(20000);
    expect(mealSchema.safeParse({ name: "x", description: "a".repeat(20000) }).success).toBe(true);
    expect(mealSchema.safeParse({ name: "x", description: "a".repeat(20001) }).error?.issues[0].message).toContain("20,000");
  });
});
