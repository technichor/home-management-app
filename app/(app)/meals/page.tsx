import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, isDateString, weekStartOf } from "@/lib/dates";
import { getMealPlanSettings, visibleSlots, weekEntries } from "@/lib/mealPlan";
import { mealStats } from "@/lib/meals";
import LocalToday from "@/components/LocalToday";
import PlannerClient from "./PlannerClient";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ week?: string; today?: string }> }) {
  const householdId = await pageHouseholdId();
  const { week, today } = await searchParams;

  // The week shown depends on the user's own date, which only the browser knows, so wait for it
  // (LocalToday adds it to the URL straight away) rather than flash the wrong week.
  if (!isDateString(today)) return <LocalToday />;

  const settings = await getMealPlanSettings(householdId);
  const weekStart = weekStartOf(dateOr(week, today), settings.weekStartsOn);
  const [entries, meals, stats] = await Promise.all([
    weekEntries(householdId, weekStart),
    prisma.meal.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    mealStats(householdId, today),
  ]);

  const shown = visibleSlots(settings);
  return (
    <>
      <LocalToday />
      <PlannerClient
        weekStart={weekStart}
        today={today}
        settings={settings}
        entries={entries}
        hiddenCount={entries.filter((e) => !shown.includes(e.slot)).length}
        meals={meals}
        stats={Object.fromEntries(
          entries.filter((e) => e.mealId).map((e) => [e.mealId as string, stats.get(e.mealId as string) ?? { lastMade: null, timesMade: 0 }])
        )}
      />
    </>
  );
}
