import type { MealSlot, WeekStartDay } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, dateToString, stringToDate } from "@/lib/dates";

export const SLOTS: readonly MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER"];

export const SLOT_LABELS: Record<MealSlot, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner" };

export type PlanSettings = {
  weekStartsOn: WeekStartDay;
  showBreakfast: boolean;
  showLunch: boolean;
  showDinner: boolean;
};

/** The slots to show, in day order. */
export function visibleSlots(settings: PlanSettings): MealSlot[] {
  return SLOTS.filter((slot) => (slot === "BREAKFAST" ? settings.showBreakfast : slot === "LUNCH" ? settings.showLunch : settings.showDinner));
}

const pick = (s: PlanSettings): PlanSettings => ({
  weekStartsOn: s.weekStartsOn,
  showBreakfast: s.showBreakfast,
  showLunch: s.showLunch,
  showDinner: s.showDinner,
});

/** The household's planner settings, created with the defaults (Sunday, lunch and dinner) on first read. */
export async function getMealPlanSettings(householdId: string): Promise<PlanSettings> {
  const row = await prisma.mealPlanSettings.upsert({ where: { householdId }, create: { householdId }, update: {} });
  return pick(row);
}

export type PlanEntry = {
  id: string;
  date: string;
  slot: MealSlot;
  mealId: string | null;
  /** The meal's name, or the one-off text. */
  label: string;
};

/** The household's entries for the seven days starting on `weekStart`, in the order they were added. */
export async function weekEntries(householdId: string, weekStart: string) {
  const rows = await prisma.mealPlanEntry.findMany({
    where: { householdId, date: { gte: stringToDate(weekStart), lte: stringToDate(addDays(weekStart, 6)) } },
    include: { meal: { select: { id: true, name: true, description: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    date: dateToString(r.date),
    slot: r.slot,
    mealId: r.mealId,
    label: r.meal?.name ?? r.text ?? "",
    description: r.meal?.description ?? null,
  }));
}
