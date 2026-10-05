import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    meal: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    mealPlanEntry: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    mealPlanSettings: { upsert: vi.fn(), update: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  addOneOffEntryAction,
  addPlanEntryAction,
  createMealAction,
  createMealAndAddAction,
  deleteMealAction,
  moveEntryAction,
  removeEntryAction,
  updateMealAction,
  updateMealPlanSettingsAction,
} from "@/app/(app)/meals/actions";

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
  vi.mocked(prisma.mealPlanEntry.create).mockResolvedValue({ id: "e1" } as any);
  vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue({ id: "e1", householdId: "h1" } as any);
  vi.mocked(prisma.mealPlanEntry.update).mockResolvedValue({} as any);
  vi.mocked(prisma.mealPlanEntry.delete).mockResolvedValue({} as any);
  vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: true, showDinner: true } as any);
  vi.mocked(prisma.mealPlanSettings.update).mockResolvedValue({} as any);
});

describe("authentication", () => {
  it.each([
    ["createMealAction", () => createMealAction("Tacos", null)],
    ["updateMealAction", () => updateMealAction("m1", "Tacos", null)],
    ["deleteMealAction", () => deleteMealAction("m1")],
    ["addPlanEntryAction", () => addPlanEntryAction("2026-10-05", "DINNER", "m1")],
    ["addOneOffEntryAction", () => addOneOffEntryAction("2026-10-05", "DINNER", "Leftovers")],
    ["createMealAndAddAction", () => createMealAndAddAction("2026-10-05", "DINNER", "Tacos")],
    ["moveEntryAction", () => moveEntryAction("e1", "2026-10-06", "LUNCH")],
    ["removeEntryAction", () => removeEntryAction("e1")],
    ["updateMealPlanSettingsAction", () => updateMealPlanSettingsAction({ showBreakfast: true })],
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

const day = new Date("2026-10-05T00:00:00Z");

describe("addPlanEntryAction", () => {
  it("puts a household meal on the date and slot, with no text", async () => {
    expect(await addPlanEntryAction("2026-10-05", "DINNER", "m1")).toEqual({ ok: true, entryId: "e1" });
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
    expect(prisma.mealPlanEntry.create).toHaveBeenCalledWith({
      data: { householdId: "h1", date: day, slot: "DINNER", mealId: "m1", text: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meals");
  });

  it("refuses another household's meal id, writing nothing", async () => {
    vi.mocked(prisma.meal.findFirst).mockResolvedValue(null);
    expect(await addPlanEntryAction("2026-10-05", "DINNER", "theirs")).toEqual({ ok: false, error: "Meal not found" });
    expect(prisma.mealPlanEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a bad date, a bad slot, and a missing meal id", async () => {
    expect(await addPlanEntryAction("2026-02-30", "DINNER", "m1")).toEqual({ ok: false, error: "Choose a valid date" });
    expect(await addPlanEntryAction("2026-10-05", "SNACK" as any, "m1")).toMatchObject({ ok: false });
    expect(await addPlanEntryAction("2026-10-05", "DINNER", "")).toMatchObject({ ok: false });
    expect(prisma.mealPlanEntry.create).not.toHaveBeenCalled();
  });

  it("allows several entries in one slot (it just adds another)", async () => {
    await addPlanEntryAction("2026-10-05", "DINNER", "m1");
    await addPlanEntryAction("2026-10-05", "DINNER", "m1");
    expect(prisma.mealPlanEntry.create).toHaveBeenCalledTimes(2);
  });
});

describe("addOneOffEntryAction", () => {
  it("stores trimmed text with no meal", async () => {
    expect(await addOneOffEntryAction("2026-10-05", "LUNCH", "  Leftovers ")).toEqual({ ok: true, entryId: "e1" });
    expect(prisma.mealPlanEntry.create).toHaveBeenCalledWith({
      data: { householdId: "h1", date: day, slot: "LUNCH", mealId: null, text: "Leftovers" },
    });
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it("rejects blank or over-long text", async () => {
    expect(await addOneOffEntryAction("2026-10-05", "LUNCH", "   ")).toEqual({ ok: false, error: "Choose a meal or type a one-off, not both" });
    expect(await addOneOffEntryAction("2026-10-05", "LUNCH", "a".repeat(121))).toMatchObject({ ok: false });
    expect(prisma.mealPlanEntry.create).not.toHaveBeenCalled();
  });
});

describe("createMealAndAddAction", () => {
  it("creates the meal and the entry in one transaction", async () => {
    expect(await createMealAndAddAction("2026-10-05", "DINNER", "  Chicken Tikka ")).toEqual({ ok: true, entryId: "e1", mealId: "new1", created: true });
    expect(prisma.meal.create).toHaveBeenCalledWith({
      data: { householdId: "h1", name: "Chicken Tikka", nameKey: "chicken tikka", description: null },
    });
    expect(prisma.mealPlanEntry.create).toHaveBeenCalledWith({
      data: { householdId: "h1", date: day, slot: "DINNER", mealId: "new1", text: null },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meals/library");
  });

  it("selects an existing meal with that name (any case) instead of making a duplicate", async () => {
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({ id: "m1", name: "Tacos" } as any);
    expect(await createMealAndAddAction("2026-10-05", "DINNER", "TACOS")).toEqual({ ok: true, entryId: "e1", mealId: "m1", created: false });
    expect(prisma.meal.findUnique).toHaveBeenCalledWith({ where: { householdId_nameKey: { householdId: "h1", nameKey: "tacos" } } });
    expect(prisma.meal.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.mealPlanEntry.create).mock.calls[0][0]!.data).toMatchObject({ mealId: "m1" });
  });

  it("recovers when someone else created the same name a moment earlier", async () => {
    vi.mocked(prisma.meal.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "m9", name: "Tacos" } as any);
    vi.mocked(prisma.meal.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await createMealAndAddAction("2026-10-05", "DINNER", "Tacos")).toEqual({ ok: true, entryId: "e1", mealId: "m9", created: false });
  });

  it("lets other database errors through", async () => {
    vi.mocked(prisma.meal.create).mockRejectedValueOnce(new Error("db down"));
    await expect(createMealAndAddAction("2026-10-05", "DINNER", "Tacos")).rejects.toThrow("db down");
  });

  it("rejects a blank name, a bad date and a bad slot before writing anything", async () => {
    expect(await createMealAndAddAction("2026-10-05", "DINNER", " ")).toEqual({ ok: false, error: "Give the meal a name" });
    expect(await createMealAndAddAction("nope", "DINNER", "Tacos")).toEqual({ ok: false, error: "Choose a valid date" });
    expect(await createMealAndAddAction("2026-10-05", "SNACK" as any, "Tacos")).toMatchObject({ ok: false });
    expect(prisma.meal.create).not.toHaveBeenCalled();
    expect(prisma.mealPlanEntry.create).not.toHaveBeenCalled();
  });
});

describe("moveEntryAction", () => {
  it("only loads an entry of the session's household, and moves it", async () => {
    expect(await moveEntryAction("e1", "2026-10-06", "LUNCH")).toEqual({ ok: true });
    expect(prisma.mealPlanEntry.findFirst).toHaveBeenCalledWith({ where: { id: "e1", householdId: "h1" } });
    expect(prisma.mealPlanEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { date: new Date("2026-10-06T00:00:00Z"), slot: "LUNCH" },
    });
  });

  it("treats another household's entry as gone, changing nothing", async () => {
    vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue(null);
    expect(await moveEntryAction("theirs", "2026-10-06", "LUNCH")).toEqual({ ok: false, error: "That entry isn't on your plan any more" });
    expect(prisma.mealPlanEntry.update).not.toHaveBeenCalled();
  });

  it("rejects a bad date or slot", async () => {
    expect(await moveEntryAction("e1", "x", "LUNCH")).toEqual({ ok: false, error: "Choose a valid date" });
    expect(await moveEntryAction("e1", "2026-10-06", "SNACK" as any)).toMatchObject({ ok: false });
    expect(prisma.mealPlanEntry.update).not.toHaveBeenCalled();
  });
});

describe("removeEntryAction", () => {
  it("hard-deletes an entry of the household, leaving the meal", async () => {
    expect(await removeEntryAction("e1")).toEqual({ ok: true });
    expect(prisma.mealPlanEntry.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(prisma.meal.delete).not.toHaveBeenCalled();
  });

  it("treats another household's entry as gone", async () => {
    vi.mocked(prisma.mealPlanEntry.findFirst).mockResolvedValue(null);
    expect(await removeEntryAction("theirs")).toEqual({ ok: false, error: "That entry isn't on your plan any more" });
    expect(prisma.mealPlanEntry.delete).not.toHaveBeenCalled();
  });
});

describe("updateMealPlanSettingsAction", () => {
  it("changes the household's settings (reading them first creates the row)", async () => {
    expect(await updateMealPlanSettingsAction({ showBreakfast: true, weekStartsOn: "MONDAY" })).toEqual({ ok: true });
    expect(prisma.mealPlanSettings.upsert).toHaveBeenCalledWith({ where: { householdId: "h1" }, create: { householdId: "h1" }, update: {} });
    expect(prisma.mealPlanSettings.update).toHaveBeenCalledWith({
      where: { householdId: "h1" },
      data: { showBreakfast: true, weekStartsOn: "MONDAY" },
    });
  });

  it("refuses to hide every slot, whether in one change or by turning off the last one visible", async () => {
    const message = "Keep at least one meal visible";
    expect(await updateMealPlanSettingsAction({ showLunch: false, showDinner: false })).toEqual({ ok: false, error: message });
    vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ weekStartsOn: "SUNDAY", showBreakfast: false, showLunch: false, showDinner: true } as any);
    expect(await updateMealPlanSettingsAction({ showDinner: false })).toEqual({ ok: false, error: message });
    expect(prisma.mealPlanSettings.update).not.toHaveBeenCalled();
  });

  it("allows turning one off while another stays on, and rejects junk values", async () => {
    expect(await updateMealPlanSettingsAction({ showLunch: false })).toEqual({ ok: true });
    expect(await updateMealPlanSettingsAction({ weekStartsOn: "FRIDAY" as any })).toEqual({ ok: false, error: "Invalid setting" });
  });
});
