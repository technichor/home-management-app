import Link from "next/link";
import { pageMember } from "@/lib/auth";
import { getAgenda } from "@/lib/agenda";
import { addDays, formatDayHeading, formatWeekRange, isDateString, weekStartOf } from "@/lib/dates";
import { loadAttention } from "@/lib/homeAttention";
import { buildTodayPanel, UPCOMING_DAYS } from "@/lib/homePanel";
import { getCalendarSettings } from "@/lib/calendarItem";
import { calendarHref, plannerHref, timeLabel } from "@/lib/calendarView";
import { getMealPlanSettings } from "@/lib/mealPlan";
import { homeTodos } from "@/lib/todo";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import type { AgendaEntry } from "@/lib/agendaOrder";
import { buildBrief } from "@/lib/weekBrief";
import LocalToday from "@/components/LocalToday";
import WeekDrawing from "@/components/WeekDrawing";
import HomeTodos from "./HomeTodos";

/** Where an entry leads: an event to its day on the calendar, a contact date to the contact, a meal to the planner. */
function hrefOf(e: AgendaEntry, today: string): string {
  if (e.source === "contact_date") return `/contacts/${e.contactId}`;
  if (e.source === "meal") return plannerHref(e.date, today);
  return calendarHref({ view: "day", date: e.date, today });
}

/** The short label in a row's left column: a time, or what kind of thing it is. */
function indexOf(e: AgendaEntry): string {
  if (e.source === "contact_date") return "Date";
  if (e.source === "meal") return "Meal";
  return e.startTime ? timeLabel(e.startTime, null) : "Event";
}

/** The sentence under an entry's title. */
function detailOf(e: AgendaEntry): string {
  if (e.source === "contact_date") return e.turns !== null ? `Turns ${e.turns}.` : "From your contacts.";
  if (e.source === "meal") return "Planned meal.";
  const parts = [e.assigneeName ?? "Whole household"];
  if (e.startTime) parts.unshift(timeLabel(e.startTime, e.endTime));
  return `${parts.join(" · ")}.`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const me = await pageMember();
  const { today } = await searchParams;

  // The week is the user's own, so it needs their browser's date; LocalToday puts it in the URL straight away.
  if (!isDateString(today)) return <LocalToday />;

  const householdId = me.householdId;
  const [mealSettings, calendarSettings] = await Promise.all([getMealPlanSettings(householdId), getCalendarSettings(householdId)]);
  const weekStart = weekStartOf(today, mealSettings.weekStartsOn);
  const weekEnd = addDays(weekStart, 6);

  // The week itself shows meals always (as the brief always has); the panel follows the calendar's meals setting.
  const [week, ahead, attention, todos] = await Promise.all([
    getAgenda(householdId, weekStart, weekEnd, { includeMeals: true }),
    getAgenda(householdId, today, addDays(today, UPCOMING_DAYS), { includeMeals: calendarSettings.showMeals }),
    loadAttention(me),
    // Maintenance services that have come due join the to-do list first.
    syncMaintenanceTodos(householdId, today).then(() => homeTodos(householdId, me.contactId ?? null, today)),
  ]);

  const brief = buildBrief({ firstName: me.firstName, weekStart, today, entries: week.entries });
  const panel = buildTodayPanel({ today, entries: ahead.entries });
  const calendarWeek = calendarHref({ view: "week", today });
  const plannerWeek = plannerHref(weekStart, today);
  const description = `${brief.headline} ${brief.days.map((d) => `${d.weekdayLong}: ${d.load === 0 ? "open" : d.load}`).join(", ")}.`;
  const nothing = panel.today.length === 0 && panel.upcoming.length === 0;

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

        <section aria-label="Today and coming up" className="home-today">
          <h2 className="brief-section">Today &amp; coming up</h2>
          {nothing && (
            <div className="brief-row brief-row-plain">
              <div>
                <div className="brief-title">Nothing today, and nothing in the next {UPCOMING_DAYS} days</div>
                <div className="brief-support">Events and birthdays you add to the calendar show up here.</div>
              </div>
            </div>
          )}
          {panel.today.length > 0 && <h3 className="brief-sub">Today</h3>}
          {panel.today.map((e) => (
            <Link key={e.id} href={hrefOf(e, today)} className="brief-row">
              <span className="brief-index">{indexOf(e)}</span>
              <div>
                <div className="brief-title">{e.title}</div>
                <div className="brief-support">{detailOf(e)}</div>
              </div>
            </Link>
          ))}
          {panel.upcoming.length > 0 && <h3 className="brief-sub">Next {UPCOMING_DAYS} days</h3>}
          {panel.upcoming.map((e) => (
            <Link key={e.id} href={hrefOf(e, today)} className="brief-row">
              <span className="brief-index">
                {formatDayHeading(e.date).weekday} {Number(e.date.slice(8))}
              </span>
              <div>
                <div className="brief-title">{e.title}</div>
                <div className="brief-support">{detailOf(e)}</div>
              </div>
            </Link>
          ))}
          {panel.upcomingMore > 0 && (
            <Link href={calendarWeek} className="brief-more">
              +{panel.upcomingMore} more
            </Link>
          )}
          <p className="brief-link">
            <Link href={calendarWeek}>View calendar</Link>
          </p>
        </section>

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
        </section>
      </div>
    </>
  );
}
