import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    meal: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    mealPlanEntry: { updateMany: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createMealAction, deleteMealAction, updateMealAction } from "@/app/(app)/meals/actions";

const mine = { id: "m1", householdId: "h1", name: "Tacos", nameKey: "tacos", description: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.meal.findFirst).mockResolvedValue(mine as any);
  vi.mocked(prisma.meal.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.meal.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.meal.update).mockResolvedValue({} as any);
  vi.mocked(prisma.meal.delete).mockResolvedValue({} as any);
  vi.mocked(prisma.mealPlanEntry.updateMany).mockResolvedValue({ count: 0 } as any);
});

describe("authentication", () => {
  it.each([
    ["createMealAction", () => createMealAction("Tacos", null)],
    ["updateMealAction", () => updateMealAction("m1", "Tacos", null)],
    ["deleteMealAction", () => deleteMealAction("m1")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.meal.findFirst).not.toHaveBeenCalled();
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });
});

describe("createMealAction", () => {
  it("creates the meal in the session's household with its lowercase key", async () => {
    expect(await createMealAction("  Chicken Tikka ", "Marinate overnight")).toEqual({ ok: true, id: "new1" });
    expect(prisma.meal.create).toHaveBeenCalledWith({
      data: { householdId: "h1", name: "Chicken Tikka", nameKey: "chicken tikka", description: "Marinate overnight" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meals/library");
  });

  it("looks for a duplicate only within the household, ignoring case", async () => {
    await createMealAction("TACOS", null);
    expect(prisma.meal.findUnique).toHaveBeenCalledWith({ where: { householdId_nameKey: { householdId: "h1", nameKey: "tacos" } } });
  });

  it("refuses a name already in the library, in any case", async () => {
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({ id: "m1", name: "Tacos" } as any);
    expect(await createMealAction("tacos ", null)).toEqual({ ok: false, error: '"Tacos" is already in your library' });
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it("copes with two people adding the same name at once", async () => {
    vi.mocked(prisma.meal.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await createMealAction("Tacos", null)).toEqual({ ok: false, error: '"Tacos" is already in your library' });
  });

  it("lets other database errors through", async () => {
    vi.mocked(prisma.meal.create).mockRejectedValueOnce(new Error("db down"));
    await expect(createMealAction("Tacos", null)).rejects.toThrow("db down");
  });

  it("rejects a blank name and an over-long description", async () => {
    expect(await createMealAction("  ", null)).toEqual({ ok: false, error: "Give the meal a name" });
    expect(await createMealAction("Tacos", "a".repeat(20001))).toMatchObject({ ok: false });
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });
});

describe("updateMealAction", () => {
  it("only loads a meal of the session's household", async () => {
    await updateMealAction("m1", "Tacos", null);
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
  });

  it("treats another household's meal as not found, changing nothing", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue(null);
    expect(await updateMealAction("theirs", "Tacos", null)).toEqual({ ok: false, error: "Meal not found" });
    expect(prisma.meal.update).not.toHaveBeenCalled();
  });

  it("renames and rewrites the key, and may keep its own name (even in a different case)", async () => {
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({ id: "m1", name: "Tacos" } as any);
    expect(await updateMealAction("m1", "TACOS", "new text")).toEqual({ ok: true });
    expect(prisma.meal.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { name: "TACOS", nameKey: "tacos", description: "new text" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meals/library/m1");
  });

  it("refuses another meal's name", async () => {
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({ id: "other", name: "Pizza" } as any);
    expect(await updateMealAction("m1", "pizza", null)).toEqual({ ok: false, error: '"Pizza" is already in your library' });
    expect(prisma.meal.update).not.toHaveBeenCalled();
  });

  it("copes with a name taken at the same moment, and with validation errors", async () => {
    vi.mocked(prisma.meal.update).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await updateMealAction("m1", "Pizza", null)).toEqual({ ok: false, error: '"Pizza" is already in your library' });
    vi.mocked(prisma.meal.update).mockRejectedValueOnce(new Error("db down"));
    await expect(updateMealAction("m1", "Pizza", null)).rejects.toThrow("db down");
    expect(await updateMealAction("m1", " ", null)).toEqual({ ok: false, error: "Give the meal a name" });
  });
});

describe("deleteMealAction", () => {
  it("only loads a meal of the session's household, and treats another's as not found", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue(null);
    expect(await deleteMealAction("theirs")).toEqual({ ok: false, error: "Meal not found" });
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: "theirs", householdId: "h1" } });
    expect(prisma.meal.delete).not.toHaveBeenCalled();
    expect(prisma.mealPlanEntry.updateMany).not.toHaveBeenCalled();
  });

  it("converts its entries to one-offs carrying its name, then deletes it, and reports the count", async () => {
    const order: string[] = [];
    vi.mocked(prisma.mealPlanEntry.updateMany).mockImplementation((async () => (order.push("convert"), { count: 2 })) as any);
    vi.mocked(prisma.meal.delete).mockImplementation((async () => (order.push("delete"), {})) as any);
    expect(await deleteMealAction("m1")).toEqual({ ok: true, converted: 2 });
    expect(order).toEqual(["convert", "delete"]);
    expect(prisma.mealPlanEntry.updateMany).toHaveBeenCalledWith({ where: { mealId: "m1" }, data: { text: "Tacos" } });
    expect(revalidatePath).toHaveBeenCalledWith("/meals");
  });
});
