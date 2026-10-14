import { pageHouseholdId } from "@/lib/auth";
import { getAgenda } from "@/lib/agenda";
import { getCalendarSettings } from "@/lib/calendarItem";
import { memberOptionsOf } from "@/lib/householdMembers";
import { datesInRange, resolveCalendarRange } from "@/lib/dates";
import { pageToday } from "@/lib/today";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { orderAgenda } from "@/lib/agendaOrder";
import { googleConfigured } from "@/lib/google";
import { googleAgenda, type GoogleAgenda } from "@/lib/googleEvents";
import LocalToday from "@/components/LocalToday";
import CalendarClient from "./CalendarClient";

type Params = { view?: string; date?: string; who?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const householdId = await pageHouseholdId();
  const { view, date, who } = await searchParams;
  const today = await pageToday();

  // Today is the user's own date (lib/today.ts); on a first visit, wait for LocalToday to save the browser's time zone.
  if (!today) return <LocalToday today={null} />;

  const [mealSettings, calendarSettings, assignees] = await Promise.all([
    getMealPlanSettings(householdId),
    getCalendarSettings(householdId),
    memberOptionsOf(householdId),
  ]);
  const resolved = resolveCalendarRange({ view, date, today, weekStartsOn: mealSettings.weekStartsOn });
  // A member's view is only offered for a current member; anything else in the URL means everyone.
  const assigneeFilter = assignees.some((a) => a.id === who) ? (who as string) : null;
  const includeMeals = calendarSettings.showMeals && resolved.view !== "month";

  const withGoogle = googleConfigured();
  const [agenda, google] = await Promise.all([
    getAgenda(householdId, resolved.range.start, resolved.range.end, { assigneeContactId: assigneeFilter, includeMeals }),
    // Members' shared Google calendars, read live (cached briefly); none until Google is set up.
    withGoogle ? googleAgenda(householdId, resolved.range, calendarSettings.timeZone) : Promise.resolve<GoogleAgenda>({ entries: [], problems: [] }),
  ]);
  // A member's view shows their own Google calendars only.
  const googleEntries = assigneeFilter ? google.entries.filter((e) => e.ownerContactId === assigneeFilter) : google.entries;

  return (
    <>
      <LocalToday today={today} />
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
        entries={googleEntries.length > 0 ? orderAgenda([...agenda.entries, ...googleEntries]) : agenda.entries}
        googleProblems={google.problems}
        googleCalendarName={withGoogle && calendarSettings.googleCalendarId ? (calendarSettings.googleCalendarName ?? "Google Calendar") : null}
      />
    </>
  );
}
