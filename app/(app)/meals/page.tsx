import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { dateOr, weekStartOf } from "@/lib/dates";
import { pageToday } from "@/lib/today";
import { getMealPlanSettings, visibleSlots, weekEntries } from "@/lib/mealPlan";
import { mealStats } from "@/lib/meals";
import { loadShopping } from "@/lib/shopping";
import LocalToday from "@/components/LocalToday";
import PlannerClient from "./PlannerClient";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const householdId = await pageHouseholdId();
  const { week } = await searchParams;
  const today = await pageToday();

  // The week shown depends on the user's own date (lib/today.ts), so on a first visit wait for LocalToday to save
  // the browser's time zone rather than flash the wrong week.
  if (!today) return <LocalToday today={null} />;

  const settings = await getMealPlanSettings(householdId);
  const weekStart = weekStartOf(dateOr(week, today), settings.weekStartsOn);
  const [entries, meals, stats, shopping] = await Promise.all([
    weekEntries(householdId, weekStart),
    prisma.meal.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    mealStats(householdId, today),
    loadShopping(householdId),
  ]);

  const shown = visibleSlots(settings);
  return (
    <>
      <LocalToday today={today} />
      <PlannerClient
        weekStart={weekStart}
        today={today}
        settings={settings}
        entries={entries}
        hiddenCount={entries.filter((e) => !shown.includes(e.slot)).length}
        meals={meals.map((m) => ({ id: m.id, name: m.name, lastMade: stats.get(m.id)?.lastMade ?? null, timesMade: stats.get(m.id)?.timesMade ?? 0 }))}
        shoppingItems={shopping.items}
      />
    </>
  );
}
