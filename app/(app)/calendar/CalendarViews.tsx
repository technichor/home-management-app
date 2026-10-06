"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PlusOutlined } from "@ant-design/icons";
import { formatCalendarDate, formatDayHeading, type CalendarView } from "@/lib/dates";
import { CALENDAR_LIST_QUERY, MAX_CHIPS, groupByDate, plannerHref, timeLabel, weeksOf } from "@/lib/calendarView";
import type { AgendaEntry, AgendaItemEntry } from "@/lib/agendaOrder";

/** What every view needs to draw an entry and react to it. */
export type EntryContext = {
  today: string;
  onOpen: (item: AgendaItemEntry) => void;
  onAdd: (date: string) => void;
  hrefFor: (view: CalendarView, date: string) => string;
};

const WEEKDAYS_FROM_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EntryLine({ entry, ctx, compact = false }: { entry: AgendaEntry; ctx: EntryContext; compact?: boolean }) {
  if (entry.source === "contact_date") {
    return (
      <Link href={`/contacts/${entry.contactId}`} className={`cal-entry cal-entry-contact${compact ? " cal-chip" : ""}`}>
        <span className="cal-entry-title">{entry.title}</span>
        {entry.turns !== null && <span className="cal-muted"> turns {entry.turns}</span>}
      </Link>
    );
  }
  if (entry.source === "meal") {
    return (
      <Link href={plannerHref(entry.date, ctx.today)} className={`cal-entry cal-entry-meal${compact ? " cal-chip" : ""}`}>
        <span className="cal-entry-title">{entry.title}</span>
      </Link>
    );
  }

  const when = timeLabel(entry.startTime, entry.endTime);

  return (
    <button type="button" className={`cal-entry cal-entry-button${compact ? " cal-chip" : ""}`} onClick={() => ctx.onOpen(entry)}>
      {when && <span className="cal-time">{when}</span>}
      <span className="cal-entry-title">{entry.title}</span>
      {entry.assigneeName && <span className="cal-muted"> {entry.assigneeName}</span>}
    </button>
  );
}

function AddButton({ date, ctx }: { date: string; ctx: EntryContext }) {
  const { weekday, monthDay } = formatDayHeading(date);
  return (
    <button type="button" className="cal-add" aria-label={`Add to ${weekday} ${monthDay}`} onClick={() => ctx.onAdd(date)}>
      <PlusOutlined aria-hidden />
    </button>
  );
}

export function WeekView({ dates, entries, ctx }: { dates: string[]; entries: AgendaEntry[]; ctx: EntryContext }) {
  const byDate = groupByDate(entries);
  const todayRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the week is a list; on the current week, bring today to the top of it.
  useEffect(() => {
    if (dates.includes(ctx.today) && window.matchMedia(CALENDAR_LIST_QUERY).matches) todayRef.current?.scrollIntoView({ block: "start" });
  }, [dates, ctx.today]);

  return (
    <div className="cal-week">
      {dates.map((date) => {
        const { weekday, monthDay } = formatDayHeading(date);
        const isToday = date === ctx.today;
        return (
          <div key={date} className="cal-day" data-today={isToday || undefined} ref={isToday ? todayRef : undefined}>
            <div className="cal-day-head">
              <Link href={ctx.hrefFor("day", date)} className="cal-day-link">
                <strong>{weekday}</strong> {monthDay}
                {isToday && <span className="cal-today"> · Today</span>}
              </Link>
              <AddButton date={date} ctx={ctx} />
            </div>
            <div className="cal-day-body">
              {(byDate.get(date) ?? []).map((e) => (
                <EntryLine key={e.id} entry={e} ctx={ctx} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SECTIONS: { title: string; match: (e: AgendaEntry) => boolean }[] = [
  { title: "Birthdays and dates", match: (e) => e.source === "contact_date" },
  { title: "Events and reminders", match: (e) => e.source === "item" },
  { title: "Meals", match: (e) => e.source === "meal" },
];

export function DayView({ date, entries, ctx }: { date: string; entries: AgendaEntry[]; ctx: EntryContext }) {
  const here = entries.filter((e) => e.date === date);
  return (
    <div className="cal-dayview">
      <div className="cal-dayview-head">
        <AddButton date={date} ctx={ctx} />
      </div>
      {here.length === 0 && <p className="cal-muted">Nothing on the calendar for {formatCalendarDate(date)}.</p>}
      {SECTIONS.map((section) => {
        const rows = here.filter(section.match);
        if (rows.length === 0) return null;
        return (
          <section key={section.title} className="cal-section">
            <h3 className="cal-section-title">{section.title}</h3>
            {rows.map((e) => (
              <EntryLine key={e.id} entry={e} ctx={ctx} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function MonthView({ dates, anchor, entries, ctx }: { dates: string[]; anchor: string; entries: AgendaEntry[]; ctx: EntryContext }) {
  const byDate = groupByDate(entries);
  const weeks = weeksOf(dates);
  const monthPrefix = anchor.slice(0, 7);
  return (
    <div className="cal-month" role="grid">
      <div className="cal-month-head" role="row">
        {weeks[0].map((d) => (
          <div key={d} role="columnheader">
            {WEEKDAYS_FROM_SUNDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="cal-month-week" role="row">
          {week.map((date) => {
            const items = byDate.get(date) ?? [];
            const shown = items.slice(0, MAX_CHIPS);
            const more = items.length - shown.length;
            return (
              <div key={date} className="cal-cell" role="gridcell" data-today={date === ctx.today || undefined} data-outside={!date.startsWith(monthPrefix) || undefined}>
                <div className="cal-cell-head">
                  <Link href={ctx.hrefFor("day", date)} className="cal-cell-number" aria-label={`Open ${formatCalendarDate(date)}`}>
                    {Number(date.slice(8))}
                  </Link>
                  <AddButton date={date} ctx={ctx} />
                </div>
                <div className="cal-chips">
                  {shown.map((e) => (
                    <EntryLine key={e.id} entry={e} ctx={ctx} compact />
                  ))}
                  {more > 0 && (
                    <Link href={ctx.hrefFor("day", date)} className="cal-more">
                      +{more} more
                    </Link>
                  )}
                </div>
                {items.length > 0 && (
                  <Link href={ctx.hrefFor("day", date)} className="cal-dots" aria-label={`${items.length} on ${formatCalendarDate(date)}`}>
                    {items.length}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
