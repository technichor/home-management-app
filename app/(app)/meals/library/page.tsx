import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { pageTodayOrUtc } from "@/lib/today";
import { mealStats } from "@/lib/meals";
import LocalToday from "@/components/LocalToday";
import LibraryClient from "./LibraryClient";

export default async function MealLibraryPage() {
  const householdId = await pageHouseholdId();
  const today = await pageTodayOrUtc();

  const [meals, stats] = await Promise.all([
    prisma.meal.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    mealStats(householdId, today),
  ]);

  return (
    <>
      <LocalToday today={today} />
      <LibraryClient
        meals={meals.map((m) => ({
          id: m.id,
          name: m.name,
          lastMade: stats.get(m.id)?.lastMade ?? null,
          timesMade: stats.get(m.id)?.timesMade ?? 0,
        }))}
      />
    </>
  );
}
