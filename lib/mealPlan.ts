import type { MealSlot, WeekStartDay } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, dateToString, stringToDate } from "@/lib/dates";
import { mealPlanSettingsSchema } from "@/lib/validations";

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

/**
 * Change the household's planner settings: the week's first day, and which meals show. At least one meal must stay
 * visible. The calendar shares this (and `getMealPlanSettings`) for the week's first day, so changing it in either
 * place changes both.
 */
export async function updatePlanSettings(
  householdId: string,
  patch: Partial<PlanSettings>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = mealPlanSettingsSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid setting" };
  const next = { ...(await getMealPlanSettings(householdId)), ...parsed.data };
  if (visibleSlots(next).length === 0) return { ok: false, error: "Keep at least one meal visible" };
  await prisma.mealPlanSettings.update({ where: { householdId }, data: parsed.data });
  return { ok: true };
}

export type PlanEntry = {
  id: string;
  date: string;
  slot: MealSlot;
  mealId: string | null;
  /** The meal's name, or the one-off text. */
  label: string;
};

/** The household's entries dated within the range (inclusive), in the order they were added. */
export async function entriesInRange(householdId: string, start: string, end: string) {
  const rows = await prisma.mealPlanEntry.findMany({
    where: { householdId, date: { gte: stringToDate(start), lte: stringToDate(end) } },
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
    createdAt: r.createdAt.toISOString(),
  }));
}

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
