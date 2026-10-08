import Link from "next/link";
import { pageMember } from "@/lib/auth";
import { getAgenda } from "@/lib/agenda";
import { addDays, formatWeekRange, isDateString, weekStartOf } from "@/lib/dates";
import { loadAttention } from "@/lib/homeAttention";
import { calendarHref, plannerHref } from "@/lib/calendarView";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { homeTodos } from "@/lib/todo";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import { buildBrief } from "@/lib/weekBrief";
import LocalToday from "@/components/LocalToday";
import WeekDrawing from "@/components/WeekDrawing";
import HomeTodos from "./HomeTodos";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const me = await pageMember();
  const { today } = await searchParams;

  // The week is the user's own, so it needs their browser's date; LocalToday puts it in the URL straight away.
  if (!isDateString(today)) return <LocalToday />;

  const householdId = me.householdId;
  const mealSettings = await getMealPlanSettings(householdId);
  const weekStart = weekStartOf(today, mealSettings.weekStartsOn);
  const weekEnd = addDays(weekStart, 6);

  // The week shows meals as well as events and contact dates.
  const [week, attention, todos] = await Promise.all([
    getAgenda(householdId, weekStart, weekEnd, { includeMeals: true }),
    loadAttention(me),
    // Maintenance services that have come due join the to-do list first.
    syncMaintenanceTodos(householdId, today).then(() => homeTodos(householdId, me.contactId ?? null, today)),
  ]);

  const brief = buildBrief({ firstName: me.firstName, weekStart, today, entries: week.entries });
  const calendarWeek = calendarHref({ view: "week", today });
  const plannerWeek = plannerHref(weekStart, today);
  const description = `${brief.headline} ${brief.days.map((d) => `${d.weekdayLong}: ${d.load === 0 ? "open" : d.load}`).join(", ")}.`;

  return (
    <>
      <LocalToday />
      <div className="brief-top">
        <div className="brief-inner">
          <div className="brief-date">Week of {formatWeekRange(weekStart)}</div>
          <h1 className="brief-headline">{brief.headline}</h1>
          <WeekDrawing drawing={brief.drawing} description={description} />
          <div className="brief-strip">
            {brief.days.map((d) => (
              <div key={d.date} className="brief-day" data-today={d.isToday || undefined} data-open={d.empty || undefined}>
                <strong className="brief-day-name">
                  <span className="brief-day-full">{d.weekday}</span>
                  <span className="brief-day-initial" aria-hidden="true">
                    {d.weekday[0]}
                  </span>
                </strong>
                <span className="brief-day-title">{d.title}</span>
                {d.more && <span className="brief-day-more">{d.more}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="brief-inner brief-lists">
        <section className="home-attention">
          <h2 className="brief-section">Needs attention</h2>
          {attention.length === 0 ? (
            <div className="brief-row brief-row-plain">
              <div>
                <div className="brief-title">Nothing needs attention</div>
                <div className="brief-support">No unread messages, join requests or open sync invites.</div>
              </div>
            </div>
          ) : (
            attention.map((a, i) => (
              <Link key={a.key} href={a.href} className="brief-row brief-row-num">
                <span className="brief-index">{i + 1}</span>
                <div>
                  <div className="brief-title">{a.title}</div>
                  <div className="brief-support">{a.support}</div>
                </div>
              </Link>
            ))
          )}
        </section>

        <HomeTodos items={todos} today={today} />

        <section className="home-days">
          <h2 className="brief-section">Day by day</h2>
          {brief.days.map((d) => (
            <Link key={d.date} href={plannerWeek} className="brief-row" data-today={d.isToday || undefined} data-open={d.empty || undefined}>
              <span className="brief-index">
                {d.weekday}
                {d.isToday && <span className="sr-only"> (today)</span>}
              </span>
              <div>
                <div className="brief-title">{d.title}</div>
                <div className="brief-support">{d.support}</div>
              </div>
            </Link>
          ))}
          <p className="brief-link">
            <Link href={calendarWeek}>View calendar</Link>
          </p>
        </section>
      </div>
    </>
  );
}
