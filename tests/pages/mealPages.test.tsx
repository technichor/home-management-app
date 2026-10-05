// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }) }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    meal: { findMany: vi.fn(), findFirst: vi.fn() },
    mealPlanEntry: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    mealPlanSettings: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/shopping", () => ({ loadShopping: vi.fn() }));
vi.mock("@/app/(app)/meals/shopping/ShoppingList", () => ({ default: (p: any) => ((seen.shopping = p), <div>shopping list</div>) }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/meals/PlannerClient", () => ({ default: (p: any) => ((seen.planner = p), <div>planner client</div>) }));
vi.mock("@/app/(app)/meals/library/LibraryClient", () => ({ default: (p: any) => ((seen.library = p), <div>library client</div>) }));
vi.mock("@/app/(app)/meals/library/MealForm", () => ({ default: (p: any) => ((seen.form = p), <div>meal form</div>) }));
vi.mock("@/app/(app)/meals/library/[id]/MealDetailClient", () => ({ default: (p: any) => ((seen.detail = p), <div>detail client</div>) }));

import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import { loadShopping } from "@/lib/shopping";
import ShoppingPage from "@/app/(app)/meals/shopping/page";
import PlannerPage from "@/app/(app)/meals/page";
import MealLibraryPage from "@/app/(app)/meals/library/page";
import NewMealPage from "@/app/(app)/meals/library/new/page";
import MealDetailPage from "@/app/(app)/meals/library/[id]/page";
import EditMealPage from "@/app/(app)/meals/library/[id]/edit/page";

const idParams = Promise.resolve({ id: "m1" });
const noSearch = Promise.resolve({});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.meal.findMany).mockResolvedValue([]);
  vi.mocked(prisma.mealPlanEntry.groupBy).mockResolvedValue([] as any);
  vi.mocked(prisma.mealPlanEntry.count).mockResolvedValue(0);
  vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([]);
  vi.mocked(loadShopping).mockResolvedValue({ listId: "g1", items: [] });
  vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true } as any);
});

describe("MealLibraryPage", () => {
  it("lists only this household's meals with their derived stats, and asks the browser for today", async () => {
    vi.mocked(prisma.meal.findMany).mockResolvedValue([{ id: "m1", name: "Tacos" }, { id: "m2", name: "Soup" }] as any);
    vi.mocked(prisma.mealPlanEntry.groupBy).mockResolvedValue([
      { mealId: "m1", _max: { date: new Date("2026-10-03T00:00:00Z") }, _count: { _all: 2 } },
    ] as any);
    const { getByTestId } = render(await MealLibraryPage({ searchParams: Promise.resolve({ today: "2026-10-04" }) }));
    expect(getByTestId("local-today")).toBeInTheDocument();
    expect(vi.mocked(prisma.meal.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.library.meals).toEqual([
      { id: "m1", name: "Tacos", lastMade: "2026-10-03", timesMade: 2 },
      { id: "m2", name: "Soup", lastMade: null, timesMade: 0 },
    ]);
    // "today" is the browser's date, so the stats stop there.
    expect(vi.mocked(prisma.mealPlanEntry.groupBy).mock.calls[0][0]!.where).toMatchObject({
      householdId: "h1",
      date: { lte: new Date("2026-10-04T00:00:00Z") },
    });
  });

  it("falls back to the server's date when the URL has none, or a bad one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    await MealLibraryPage({ searchParams: noSearch });
    await MealLibraryPage({ searchParams: Promise.resolve({ today: "nonsense" }) });
    vi.useRealTimers();
    for (const call of vi.mocked(prisma.mealPlanEntry.groupBy).mock.calls) {
      expect((call[0]!.where as any).date.lte).toEqual(new Date("2026-10-06T00:00:00Z"));
    }
  });
});

describe("NewMealPage", () => {
  it("renders an empty form for a signed-in household", async () => {
    render(await NewMealPage());
    expect(seen.form).toEqual({});
  });
});

describe("MealDetailPage", () => {
  it("loads the meal through the household, with its stats and how many entries use it", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue({ id: "m1", name: "Tacos", description: "Fry" } as any);
    vi.mocked(prisma.mealPlanEntry.count).mockResolvedValue(3);
    vi.mocked(prisma.mealPlanEntry.groupBy).mockResolvedValue([
      { mealId: "m1", _max: { date: new Date("2026-09-30T00:00:00Z") }, _count: { _all: 5 } },
    ] as any);
    render(await MealDetailPage({ params: idParams, searchParams: Promise.resolve({ today: "2026-10-04" }) }));
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
    expect(prisma.mealPlanEntry.count).toHaveBeenCalledWith({ where: { householdId: "h1", mealId: "m1" } });
    expect(seen.detail).toEqual({
      meal: { id: "m1", name: "Tacos", description: "Fry" },
      lastMade: "2026-09-30",
      timesMade: 5,
      entryCount: 3,
    });
  });

  it("shows a never-made meal with zero counts", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue({ id: "m1", name: "Tacos", description: null } as any);
    render(await MealDetailPage({ params: idParams, searchParams: noSearch }));
    expect(seen.detail).toMatchObject({ lastMade: null, timesMade: 0, entryCount: 0 });
  });

  it("404s for a meal that is missing or another household's", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue(null);
    await expect(MealDetailPage({ params: idParams, searchParams: noSearch })).rejects.toThrow("NOT_FOUND");
  });
});

describe("EditMealPage", () => {
  it("fills the form from the household's meal", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue({ id: "m1", name: "Tacos", description: "Fry", nameKey: "tacos" } as any);
    render(await EditMealPage({ params: idParams }));
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
    expect(seen.form).toEqual({ meal: { id: "m1", name: "Tacos", description: "Fry" } });
  });

  it("404s for a meal that isn't theirs", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue(null);
    await expect(EditMealPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});

describe("PlannerPage", () => {
  const run = async (sp: object) => render(await PlannerPage({ searchParams: Promise.resolve(sp) }));
  const entry = (over: object = {}) => ({
    id: "e1", date: new Date("2026-10-06T00:00:00Z"), slot: "DINNER", mealId: "m1", text: null,
    meal: { id: "m1", name: "Tacos", description: "Fry" }, ...over,
  });

  it("waits for the browser's date before showing a week (so it never flashes the wrong one)", async () => {
    const { getByTestId } = await run({});
    expect(getByTestId("local-today")).toBeInTheDocument();
    expect(seen.planner).toBeUndefined();
    expect(prisma.mealPlanEntry.findMany).not.toHaveBeenCalled();
    await run({ today: "not-a-date", week: "2026-10-04" });
    expect(seen.planner).toBeUndefined();
  });

  it("passes the household's shopping list to the planner's slide-over", async () => {
    const items = [{ id: "i1", text: "Milk", quantity: null, notes: null, checked: false, category: "DAIRY_EGGS" }];
    vi.mocked(loadShopping).mockResolvedValue({ listId: "g1", items } as any);
    await run({ today: "2026-10-07" });
    expect(loadShopping).toHaveBeenCalledWith("h1");
    expect(seen.planner.shoppingItems).toEqual(items);
  });

  it("shows the week containing the browser's today, for a Sunday-start household", async () => {
    await run({ today: "2026-10-07" }); // a Wednesday
    expect(seen.planner).toMatchObject({ weekStart: "2026-10-04", today: "2026-10-07" });
    expect(seen.planner.settings).toEqual({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true });
  });

  it("starts the week on Monday when the household has chosen that, including for a Sunday", async () => {
    vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "MONDAY", showBreakfast: false, showLunch: true, showDinner: true } as any);
    await run({ today: "2026-10-07" });
    expect(seen.planner.weekStart).toBe("2026-10-05");
    await run({ today: "2026-10-04" });
    expect(seen.planner.weekStart).toBe("2026-09-28");
  });

  it("shows the week asked for in the URL, snapped to the household's start day, whatever 'today' is", async () => {
    await run({ today: "2026-10-07", week: "2026-12-30" });
    expect(seen.planner.weekStart).toBe("2026-12-27");
    await run({ today: "2026-10-07", week: "garbage" });
    expect(seen.planner.weekStart).toBe("2026-10-04");
  });

  it("loads only this household's entries for that week, and its library", async () => {
    vi.mocked(prisma.meal.findMany).mockResolvedValue([{ id: "m1", name: "Tacos" }] as any);
    await run({ today: "2026-10-07" });
    expect(vi.mocked(prisma.mealPlanEntry.findMany).mock.calls[0][0]!.where).toEqual({
      householdId: "h1",
      date: { gte: new Date("2026-10-04T00:00:00Z"), lte: new Date("2026-10-10T00:00:00Z") },
    });
    expect(vi.mocked(prisma.meal.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.planner.meals).toEqual([{ id: "m1", name: "Tacos", lastMade: null, timesMade: 0 }]);
  });

  it("passes entries, every library meal with its derived stats, and counts entries in hidden slots", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      entry(),
      entry({ id: "e2", slot: "BREAKFAST", mealId: null, text: "Toast", meal: null }),
      entry({ id: "e3", slot: "BREAKFAST", mealId: "m2", meal: { id: "m2", name: "Eggs", description: null } }),
    ] as any);
    vi.mocked(prisma.meal.findMany).mockResolvedValue([
      { id: "m1", name: "Tacos" },
      { id: "m2", name: "Eggs" },
      { id: "m3", name: "Soup" },
    ] as any);
    vi.mocked(prisma.mealPlanEntry.groupBy).mockResolvedValue([
      { mealId: "m1", _max: { date: new Date("2026-09-30T00:00:00Z") }, _count: { _all: 3 } },
    ] as any);
    await run({ today: "2026-10-07" });
    expect(seen.planner.entries.map((e: any) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(seen.planner.meals).toEqual([
      { id: "m1", name: "Tacos", lastMade: "2026-09-30", timesMade: 3 },
      { id: "m2", name: "Eggs", lastMade: null, timesMade: 0 },
      { id: "m3", name: "Soup", lastMade: null, timesMade: 0 },
    ]);
    // Breakfast is hidden by default: two entries sit in it.
    expect(seen.planner.hiddenCount).toBe(2);
  });
});

describe("ShoppingPage", () => {
  it("shows the household's own shopping list as the full-page view", async () => {
    const items = [{ id: "i1", text: "Milk", quantity: null, notes: null, checked: false, category: "DAIRY_EGGS" }];
    vi.mocked(loadShopping).mockResolvedValue({ listId: "g1", items } as any);
    render(await ShoppingPage());
    expect(loadShopping).toHaveBeenCalledWith("h1");
    expect(seen.shopping).toEqual({ items, variant: "page" });
  });
});
