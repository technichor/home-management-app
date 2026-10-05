import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { mealPlanSettings: { upsert: vi.fn() }, mealPlanEntry: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { SLOTS, SLOT_LABELS, getMealPlanSettings, visibleSlots, weekEntries } from "@/lib/mealPlan";
import { mealPlanSettingsSchema, planEntrySchema, planPositionSchema } from "@/lib/validations";

beforeEach(() => vi.resetAllMocks());

const settings = (over: object = {}) => ({ weekStartsOn: "SUNDAY" as const, showBreakfast: false, showLunch: true, showDinner: true, ...over });

describe("slots", () => {
  it("are in day order with plain labels", () => {
    expect(SLOTS).toEqual(["BREAKFAST", "LUNCH", "DINNER"]);
    expect(SLOTS.map((s) => SLOT_LABELS[s])).toEqual(["Breakfast", "Lunch", "Dinner"]);
  });

  it("shows lunch and dinner by default, and any combination that is switched on, in order", () => {
    expect(visibleSlots(settings())).toEqual(["LUNCH", "DINNER"]);
    expect(visibleSlots(settings({ showBreakfast: true }))).toEqual(["BREAKFAST", "LUNCH", "DINNER"]);
    expect(visibleSlots(settings({ showLunch: false }))).toEqual(["DINNER"]);
    expect(visibleSlots(settings({ showBreakfast: true, showLunch: false, showDinner: false }))).toEqual(["BREAKFAST"]);
  });
});

describe("getMealPlanSettings", () => {
  it("creates the household's row with defaults on first read, and returns only the settings", async () => {
    vi.mocked(prisma.mealPlanSettings.upsert).mockResolvedValue({ householdId: "h1", updatedAt: new Date(), ...settings() } as any);
    expect(await getMealPlanSettings("h1")).toEqual(settings());
    expect(prisma.mealPlanSettings.upsert).toHaveBeenCalledWith({ where: { householdId: "h1" }, create: { householdId: "h1" }, update: {} });
  });
});

describe("weekEntries", () => {
  it("asks for this household's seven days only, in the order they were added", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      { id: "e1", date: new Date("2026-10-05T00:00:00Z"), slot: "DINNER", mealId: "m1", text: null, meal: { id: "m1", name: "Tacos", description: "Fry" } },
      { id: "e2", date: new Date("2026-10-06T00:00:00Z"), slot: "LUNCH", mealId: null, text: "Leftovers", meal: null },
    ] as any);
    const rows = await weekEntries("h1", "2026-10-04");
    const arg = vi.mocked(prisma.mealPlanEntry.findMany).mock.calls[0][0]!;
    expect(arg.where).toEqual({
      householdId: "h1",
      date: { gte: new Date("2026-10-04T00:00:00Z"), lte: new Date("2026-10-10T00:00:00Z") },
    });
    expect(arg.orderBy).toEqual({ createdAt: "asc" });
    expect(rows).toEqual([
      { id: "e1", date: "2026-10-05", slot: "DINNER", mealId: "m1", label: "Tacos", description: "Fry" },
      { id: "e2", date: "2026-10-06", slot: "LUNCH", mealId: null, label: "Leftovers", description: null },
    ]);
  });

  it("labels an entry with neither a meal nor text as empty rather than failing", async () => {
    vi.mocked(prisma.mealPlanEntry.findMany).mockResolvedValue([
      { id: "e1", date: new Date("2026-10-05T00:00:00Z"), slot: "DINNER", mealId: null, text: null, meal: null },
    ] as any);
    expect((await weekEntries("h1", "2026-10-04"))[0].label).toBe("");
  });
});

describe("planEntrySchema", () => {
  const ok = { date: "2026-10-05", slot: "DINNER" };

  it("takes a library meal, with no text", () => {
    expect(planEntrySchema.safeParse({ ...ok, mealId: "m1" }).data).toEqual({ ...ok, mealId: "m1", text: null });
    expect(planEntrySchema.safeParse({ ...ok, mealId: "m1", text: null }).data).toEqual({ ...ok, mealId: "m1", text: null });
  });

  it("takes a trimmed one-off text, with no meal", () => {
    expect(planEntrySchema.safeParse({ ...ok, text: "  Leftovers " }).data).toEqual({ ...ok, mealId: null, text: "Leftovers" });
  });

  it("needs exactly one of meal and text", () => {
    const message = "Choose a meal or type a one-off, not both";
    expect(planEntrySchema.safeParse(ok).error?.issues[0].message).toBe(message);
    expect(planEntrySchema.safeParse({ ...ok, text: "   " }).error?.issues[0].message).toBe(message);
    expect(planEntrySchema.safeParse({ ...ok, mealId: "m1", text: "x" }).error?.issues[0].message).toBe(message);
  });

  it("checks the date, the slot and the text length", () => {
    expect(planEntrySchema.safeParse({ date: "2026-02-30", slot: "DINNER", mealId: "m" }).error?.issues[0].message).toBe("Choose a valid date");
    expect(planEntrySchema.safeParse({ date: "2026-10-05", slot: "SNACK", mealId: "m" }).success).toBe(false);
    expect(planEntrySchema.safeParse({ ...ok, text: "a".repeat(120) }).success).toBe(true);
    expect(planEntrySchema.safeParse({ ...ok, text: "a".repeat(121) }).success).toBe(false);
  });

  it("validates a bare position", () => {
    expect(planPositionSchema.safeParse({ date: "2026-10-05", slot: "LUNCH" }).success).toBe(true);
    expect(planPositionSchema.safeParse({ date: "x", slot: "LUNCH" }).success).toBe(false);
  });
});

describe("mealPlanSettingsSchema", () => {
  it("accepts any subset of the settings", () => {
    expect(mealPlanSettingsSchema.safeParse({}).success).toBe(true);
    expect(mealPlanSettingsSchema.safeParse({ weekStartsOn: "MONDAY", showBreakfast: true }).data).toEqual({ weekStartsOn: "MONDAY", showBreakfast: true });
  });

  it("rejects unknown values", () => {
    expect(mealPlanSettingsSchema.safeParse({ weekStartsOn: "FRIDAY" }).success).toBe(false);
    expect(mealPlanSettingsSchema.safeParse({ showLunch: "yes" }).success).toBe(false);
  });
});
