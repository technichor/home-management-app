import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { calendarEntries } from "@/lib/calendarEntries";
import { getCalendarSettings } from "@/lib/calendarItem";
import { addDays, stringToDate } from "@/lib/dates";
import { pageClock } from "@/lib/today";
import { loadAttention } from "@/lib/homeAttention";
import { calendarHref, formatTime, timeLabel } from "@/lib/calendarView";
import { hhmm } from "@/lib/calendarLayout";
import { homeTodos } from "@/lib/todo";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import { loadShopping } from "@/lib/shopping";
import { memberOptionsOf } from "@/lib/householdMembers";
import { googleConfigured } from "@/lib/google";
import { freeLabel, greeting, longDate, todayTimeline, upcomingDays, DAYS_AHEAD } from "@/lib/homeDay";
import type { AgendaEntry } from "@/lib/agendaOrder";
import LocalToday from "@/components/LocalToday";
import HomeTodos from "./HomeTodos";
import HomeHeaderActions from "./HomeHeaderActions";
import HomeNewEvent from "./HomeNewEvent";

/** What an entry is called in a list: a birthday says how old, an event from Google says so. */
function entryName(e: AgendaEntry): string {
  if (e.source === "contact_date") return e.turns !== null ? `${e.title} · turns ${e.turns}` : e.title;
  if (e.source === "google") return `${e.title} · Google`;
  return e.title;
}

/** The line under an entry on today's timeline. */
function entryDetail(e: AgendaEntry): string {
  const until = (e.source === "item" || e.source === "google") && e.endTime ? `Until ${formatTime(e.endTime)}` : "";
  if (e.source === "google") return [until, `${e.ownerName}'s ${e.calendarName} · Google`].filter(Boolean).join(" · ");
  if (e.source === "meal") return "From the meal plan";
  return until;
}

/** Who an entry is for, on the right of its row. */
function entryWho(e: AgendaEntry): string {
  if (e.source === "item") return e.assigneeName ?? "";
  return "";
}

/** An entry opens where it lives: a Google event in Google, everything else on that day in the calendar. */
function EntryLink({ entry, className, children }: { entry: AgendaEntry; className: string; children: React.ReactNode }) {
  if (entry.source === "google" && entry.link) {
    return (
      <a href={entry.link} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={calendarHref({ view: "day", date: entry.date })} className={className}>
      {children}
    </Link>
  );
}

/**
 * HOME: today first (what's done, what's on now, what's next, and the free time between), then the next couple of
 * days; the to-do list on the right, then what else is on today and what needs attention (also behind the bell).
 */
export default async function HomePage() {
  const me = await pageMember();
  const clock = await pageClock();

  // "Today" and "now" are the user's own, so they need the browser's time zone (lib/today.ts); on a first visit,
  // LocalToday saves it and asks again.
  if (!clock) return <LocalToday today={null} />;
  const today = clock.date;

  const householdId = me.householdId;
  const calendarSettings = await getCalendarSettings(householdId);
  const range = { start: today, end: addDays(today, DAYS_AHEAD) };

  const [agenda, attention, todos, assignees, shopping, dinner] = await Promise.all([
    // What the calendar shows (Google events too, meals if the calendar shows them).
    calendarEntries(householdId, range, { timeZone: calendarSettings.timeZone, includeMeals: calendarSettings.showMeals }),
    loadAttention(me),
    // Maintenance services that have come due join the to-do list first.
    syncMaintenanceTodos(householdId, today).then(() => homeTodos(householdId, me.contactId ?? null, today)),
    memberOptionsOf(householdId),
    loadShopping(householdId),
    prisma.mealPlanEntry.findFirst({
      where: { householdId, date: stringToDate(today), slot: "DINNER" },
      select: { text: true, meal: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const { allDay, rows } = todayTimeline(
    agenda.entries.filter((e) => e.date === today),
    clock.minutes,
  );
  const ahead = upcomingDays(agenda.entries, today);
  const toBuy = shopping.items.filter((i) => !i.checked).length;
  const dinnerName = dinner?.meal?.name ?? dinner?.text ?? null;
  const googleCalendarName = googleConfigured() && calendarSettings.googleCalendarId ? (calendarSettings.googleCalendarName ?? "Google Calendar") : null;

  return (
    <div className="home">
      <LocalToday today={today} />
      <header className="home-header">
        <div>
          <div className="home-date">{longDate(today)}</div>
          <h1 className="home-greeting">
            {greeting(clock.minutes)}, {me.firstName}.
          </h1>
        </div>
        <HomeHeaderActions attention={attention} />
      </header>

      <div className="home-grid">
        <div className="home-main">
          <section aria-labelledby="home-today">
            <div className="home-section-head">
              <h2 id="home-today">Today</h2>
              <div className="home-section-actions">
                <Link href={calendarHref({ view: "day", date: today })}>Open calendar</Link>
                <HomeNewEvent today={today} assignees={assignees} googleCalendarName={googleCalendarName} />
              </div>
            </div>
            {allDay.length > 0 && (
              <ul className="home-chips" aria-label="All day">
                {allDay.map((e) => (
                  <li key={e.id}>
                    <EntryLink entry={e} className="home-chip">
                      {e.source === "google" && <span className="home-dot" style={{ background: e.color ?? undefined }} aria-hidden />}
                      {entryName(e)}
                    </EntryLink>
                  </li>
                ))}
              </ul>
            )}
            {rows.length === 0 ? (
              <p className="home-empty">{allDay.length > 0 ? "Nothing else at a set time today." : "Nothing on the calendar today."}</p>
            ) : (
              <ol className="home-timeline">
                {rows.map((row) =>
                  row.kind === "free" ? (
                    <li key={`free-${row.start}`} className="home-row" data-free data-now={row.fromNow || undefined}>
                      <span className="home-time">{row.fromNow ? "Now" : formatTime(hhmm(row.start))}</span>
                      <span>
                        <strong>Free · {freeLabel(row.end - row.start)}</strong>
                        <span className="home-detail">Until {formatTime(hhmm(row.end))}</span>
                      </span>
                      <span />
                    </li>
                  ) : (
                    <li key={row.entry.id} data-state={row.state}>
                      <EntryLink entry={row.entry} className="home-row">
                        <span className="home-time">{row.state === "now" ? "Now" : formatTime(hhmm(row.start))}</span>
                        <span>
                          <strong>{row.entry.title}</strong>
                          {entryDetail(row.entry) && <span className="home-detail">{entryDetail(row.entry)}</span>}
                        </span>
                        <span className="home-who">{entryWho(row.entry)}</span>
                      </EntryLink>
                    </li>
                  ),
                )}
              </ol>
            )}
          </section>

          <section aria-labelledby="home-ahead">
            <div className="home-section-head">
              <h2 id="home-ahead">Next {DAYS_AHEAD} days</h2>
            </div>
            <div className="home-ahead">
              {ahead.map((day) => (
                <div key={day.date} className="home-card">
                  <Link href={calendarHref({ view: "day", date: day.date })} className="home-card-title">
                    {day.weekday} <span>{day.monthDay}</span>
                  </Link>
                  {day.entries.length === 0 ? (
                    <p className="home-muted">Nothing planned.</p>
                  ) : (
                    <ul className="home-day-list">
                      {day.entries.map((e) => (
                        <li key={e.id}>
                          <span className="home-time">{e.source === "contact_date" || !e.startTime ? "All day" : timeLabel(e.startTime, null)}</span>
                          <EntryLink entry={e} className="home-day-entry">
                            {entryName(e)}
                          </EntryLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="home-side">
          <HomeTodos items={todos} today={today} />

          <section aria-labelledby="home-also" className="home-also">
            <h2 id="home-also" className="home-small-head">
              Also today
            </h2>
            <Link href="/meals/shopping" className="home-tile">
              <span>Shopping list</span>
              <span className="home-muted">{toBuy === 0 ? "Nothing to buy" : `${toBuy} ${toBuy === 1 ? "item" : "items"}`}</span>
            </Link>
            <Link href="/meals" className="home-tile">
              <span>Dinner tonight</span>
              <span className="home-muted">{dinnerName ?? "Not planned"}</span>
            </Link>
          </section>

          <section aria-labelledby="home-attention" className="home-also">
            <h2 id="home-attention" className="home-small-head">
              Needs attention{attention.length > 0 && ` · ${attention.length}`}
            </h2>
            {attention.length === 0 ? (
              <p className="home-muted">Nothing needs attention.</p>
            ) : (
              attention.map((a) => (
                <Link key={a.key} href={a.href} className="home-tile home-tile-stacked">
                  <span>{a.title}</span>
                  <span className="home-muted">{a.support}</span>
                </Link>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
