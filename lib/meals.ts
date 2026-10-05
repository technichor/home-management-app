import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateToString, stringToDate } from "@/lib/dates";

type Tx = Prisma.TransactionClient;

/** The case-insensitive identity of a meal's name within a household. */
export function mealKey(name: string): string {
  return name.trim().toLowerCase();
}

export type MealStats = { lastMade: string | null; timesMade: number };

/**
 * When each of the household's meals was last made and how many times: from plan entries dated on or before
 * `today` (the browser's date). Derived on every read, never stored.
 */
export async function mealStats(householdId: string, today: string): Promise<Map<string, MealStats>> {
  const rows = await prisma.mealPlanEntry.groupBy({
    by: ["mealId"],
    where: { householdId, mealId: { not: null }, date: { lte: stringToDate(today) } },
    _max: { date: true },
    _count: { _all: true },
  });
  const stats = new Map<string, MealStats>();
  for (const row of rows) {
    if (row.mealId) stats.set(row.mealId, { lastMade: row._max.date ? dateToString(row._max.date) : null, timesMade: row._count._all });
  }
  return stats;
}

/**
 * Delete a meal without losing plan history: every entry that points at it first gets the meal's name as its
 * own text (so it becomes a one-off entry), then the meal is deleted. Returns how many entries were converted.
 * (Relying on the foreign key's SET NULL alone would leave those entries blank.)
 */
export async function deleteMealKeepingEntries(tx: Tx, meal: { id: string; name: string }): Promise<number> {
  const converted = await tx.mealPlanEntry.updateMany({ where: { mealId: meal.id }, data: { text: meal.name } });
  await tx.meal.delete({ where: { id: meal.id } });
  return converted.count;
}
