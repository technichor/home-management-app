import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, utcDateString } from "@/lib/dates";
import { mealStats } from "@/lib/meals";
import LocalToday from "@/components/LocalToday";
import MealDetailClient from "./MealDetailClient";

export default async function MealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ today?: string }>;
}) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const today = dateOr((await searchParams).today, utcDateString());

  const meal = await prisma.meal.findFirst({ where: { id, householdId } });
  if (!meal) notFound();

  const [stats, entryCount] = await Promise.all([
    mealStats(householdId, today),
    prisma.mealPlanEntry.count({ where: { householdId, mealId: id } }),
  ]);

  return (
    <>
      <LocalToday />
      <MealDetailClient
        meal={{ id: meal.id, name: meal.name, description: meal.description }}
        lastMade={stats.get(id)?.lastMade ?? null}
        timesMade={stats.get(id)?.timesMade ?? 0}
        entryCount={entryCount}
      />
    </>
  );
}
