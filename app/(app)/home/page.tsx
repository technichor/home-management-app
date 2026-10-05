import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { addDays, formatCalendarDate, formatWeekRange, isDateString, stringToDate, weekStartOf } from "@/lib/dates";
import { loadAttention } from "@/lib/homeAttention";
import { inDays, upcomingDates } from "@/lib/home";
import { getMealPlanSettings, visibleSlots, weekEntries } from "@/lib/mealPlan";
import { contactsOf } from "@/lib/scope";
import { buildBrief } from "@/lib/weekBrief";
import LocalToday from "@/components/LocalToday";
import WeekDrawing from "@/components/WeekDrawing";

/** How far ahead of today the "Coming up" list reaches. */
const COMING_UP_DAYS = 30;
const COMING_UP_SHOWN = 5;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const me = await pageMember();
  const { today } = await searchParams;

  // The week is the user's own, so it needs their browser's date; LocalToday puts it in the URL straight away.
  if (!isDateString(today)) return <LocalToday />;

  const householdId = me.householdId;
  const settings = await getMealPlanSettings(householdId);
  const weekStart = weekStartOf(today, settings.weekStartsOn);
  const slots = visibleSlots(settings);

  const [entries, contacts, attention] = await Promise.all([
    weekEntries(householdId, weekStart),
    prisma.contact.findMany({
      where: {
        ...contactsOf(householdId),
        deletedAt: null,
        OR: [{ importantDate1: { not: null } }, { importantDate2: { not: null } }],
      },
      select: {
        id: true, firstName: true, lastName: true,
        importantDate1: true, importantDate1Label: true, importantDate2: true, importantDate2Label: true,
      },
    }),
    loadAttention(me),
  ]);

  // Dates inside the week (judged from the week's first day), and the ones after it.
  const weekEnd = addDays(weekStart, 6);
  const inWeek = upcomingDates(contacts, stringToDate(weekStart), 6).map((d) => ({ date: d.next, name: d.name, label: d.label }));
  const after = upcomingDates(contacts, stringToDate(today), COMING_UP_DAYS)
    .filter((d) => d.next > weekEnd)
    .slice(0, COMING_UP_SHOWN);

  const brief = buildBrief({
    firstName: me.firstName,
    weekStart,
    today,
    slots,
    entries: entries.filter((e) => slots.includes(e.slot)).map((e) => ({ date: e.date, slot: e.slot, label: e.label })),
    dates: inWeek,
  });

  const plannerHref = `/meals?week=${weekStart}&today=${today}`;
  const description = `${brief.headline} ${brief.days.map((d) => `${d.weekdayLong}: ${d.load === 0 ? "open" : d.load}`).join(", ")}.`;

  return (
    <>
      <LocalToday />
      <div className="brief-top">
        <div className="brief-inner">
          <div className="brief-date">Week of {formatWeekRange(weekStart)}</div>
          <h1 className="brief-headline">{brief.headline}</h1>
          <WeekDrawing drawing={brief.drawing} description={description} />
          <div className="brief-groups">
            {brief.groups.map((g) => (
              <div key={g.range} className="brief-group">
                <strong>{g.range}</strong>
                <p>{g.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="brief-inner brief-lists">
        <section>
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

        <section>
          <h2 className="brief-section">Day by day</h2>
          {brief.days.map((d) => (
            <Link key={d.date} href={plannerHref} className="brief-row" data-today={d.isToday || undefined} data-open={d.load === 0 || undefined}>
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

        {after.length > 0 && (
          <section>
            <h2 className="brief-section">Coming up</h2>
            {after.map((d) => (
              <Link key={`${d.contactId}-${d.label}-${d.next}`} href={`/contacts/${d.contactId}`} className="brief-row">
                <span className="brief-index">{formatCalendarDate(d.next).replace(/, \d{4}$/, "")}</span>
                <div>
                  <div className="brief-title">
                    {d.name}&apos;s {d.label.toLowerCase()}
                  </div>
                  <div className="brief-support">{inDays(d.daysUntil)}.</div>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
