import { pageHouseholdId } from "@/lib/auth";
import { getAgenda } from "@/lib/agenda";
import { showsOverdueStrip } from "@/lib/agendaOrder";
import { getCalendarSettings } from "@/lib/calendarItem";
import { memberOptionsOf } from "@/lib/householdMembers";
import { datesInRange, isDateString, resolveCalendarRange } from "@/lib/dates";
import { getMealPlanSettings } from "@/lib/mealPlan";
import LocalToday from "@/components/LocalToday";
import CalendarClient from "./CalendarClient";

type Params = { view?: string; date?: string; today?: string; who?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const householdId = await pageHouseholdId();
  const { view, date, today, who } = await searchParams;

  // Today is the user's own date, which only the browser knows (LocalToday adds it to the URL straight away).
  if (!isDateString(today)) return <LocalToday />;

  const [mealSettings, calendarSettings, assignees] = await Promise.all([
    getMealPlanSettings(householdId),
    getCalendarSettings(householdId),
    memberOptionsOf(householdId),
  ]);
  const resolved = resolveCalendarRange({ view, date, today, weekStartsOn: mealSettings.weekStartsOn });
  // A member's view is only offered for a current member; anything else in the URL means everyone.
  const assigneeFilter = assignees.some((a) => a.id === who) ? (who as string) : null;
  const includeMeals = calendarSettings.showMeals && resolved.view !== "month";

  const agenda = await getAgenda(householdId, resolved.range.start, resolved.range.end, {
    today,
    assigneeContactId: assigneeFilter,
    includeMeals,
  });

  return (
    <>
      <LocalToday />
      <CalendarClient
        view={resolved.view}
        anchor={resolved.anchor}
        dates={datesInRange(resolved.range)}
        prev={resolved.prev}
        next={resolved.next}
        today={today}
        weekStartsOn={mealSettings.weekStartsOn}
        showMeals={calendarSettings.showMeals}
        assignees={assignees}
        assigneeFilter={assigneeFilter}
        entries={agenda.entries}
        overdue={showsOverdueStrip(resolved.view, resolved.containsToday) ? agenda.overdue : []}
      />
    </>
  );
}
