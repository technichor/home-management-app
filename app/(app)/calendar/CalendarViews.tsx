"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlusOutlined } from "@ant-design/icons";
import { formatCalendarDate, formatDayHeading, type CalendarView } from "@/lib/dates";
import { CALENDAR_LIST_QUERY, MAX_CHIPS, groupByDate, plannerHref, timeLabel, weeksOf } from "@/lib/calendarView";
import type { AgendaEntry, AgendaGoogleEntry, AgendaItemEntry } from "@/lib/agendaOrder";
import { allDayEntries, DAY_MINUTES, hhmm, hourLabel, HOUR_PX, layoutDay, minuteAt, openingMinute, type Block } from "@/lib/calendarLayout";

/** What every view needs to draw an entry and react to it. */
export type EntryContext = {
  today: string;
  onOpen: (item: AgendaItemEntry) => void;
  onAdd: (date: string) => void;
  /** A click on an open spot of the hour grid: a new event on that day at that time. */
  onAddAt: (date: string, startTime: string) => void;
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
  if (entry.source === "google") return <GoogleEntryLine entry={entry} compact={compact} />;

  const when = timeLabel(entry.startTime, entry.endTime);

  return (
    <button type="button" className={`cal-entry cal-entry-button${compact ? " cal-chip" : ""}`} onClick={() => ctx.onOpen(entry)}>
      {when && <span className="cal-time">{when}</span>}
      <span className="cal-entry-title">{entry.title}</span>
      {entry.assigneeName && <span className="cal-muted"> {entry.assigneeName}</span>}
    </button>
  );
}

/** Where an event from Google came from, for its tooltip: "Sam's Work (Google Calendar)". */
const googleOrigin = (entry: AgendaGoogleEntry) => `${entry.ownerName}'s ${entry.calendarName} (Google Calendar)`;

/** An event from a member's shared Google calendar: read-only, coloured like its calendar, opening it in Google. */
function GoogleEntryLine({ entry, compact }: { entry: AgendaGoogleEntry; compact: boolean }) {
  const when = timeLabel(entry.startTime, entry.endTime);
  return (
    <a
      href={entry.link ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`cal-entry cal-entry-google${compact ? " cal-chip" : ""}`}
      style={{ borderLeftColor: entry.color ?? undefined }}
      title={googleOrigin(entry)}
    >
      {when && <span className="cal-time">{when}</span>}
      <span className="cal-entry-title">{entry.title}</span>
      <span className="cal-muted"> {entry.ownerName}</span>
    </a>
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

/** Minutes after midnight on this device, kept current (for the "now" line); null until mounted (no server clock). */
function useNowMinute(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** A block's end time to show: an event's own (Domata's or Google's); meals are drawn half an hour but have no end. */
const endOf = (entry: AgendaEntry) => (entry.source === "item" || entry.source === "google" ? entry.endTime : null);
const blockLabel = (b: Block) => `${timeLabel(hhmm(b.start), endOf(b.entry))} ${b.entry.title}`;

function GridBlock({ block, ctx }: { block: Block; ctx: EntryContext }) {
  const { entry } = block;
  const style = {
    top: (block.start / 60) * HOUR_PX,
    height: Math.max(((block.end - block.start) / 60) * HOUR_PX - 2, 18),
    left: `calc(${(block.column / block.columns) * 100}% + 2px)`,
    width: `calc(${100 / block.columns}% - 4px)`,
  };
  // Half an hour or less: one line, "Title, 9:30 AM" (see .tg-block[data-short]).
  const short = block.end - block.start <= 30 || undefined;
  const body = (
    <>
      <span className="tg-block-title">{entry.title}</span>
      <span className="tg-block-time">
        {timeLabel(hhmm(block.start), endOf(entry))}
        {entry.source === "item" && entry.assigneeName && ` · ${entry.assigneeName}`}
        {entry.source === "google" && ` · ${entry.ownerName}`}
      </span>
    </>
  );
  if (entry.source === "meal") {
    return (
      <Link
        href={plannerHref(entry.date, ctx.today)}
        className="tg-block tg-block-meal"
        data-short={short}
        style={style}
        title={blockLabel(block)}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </Link>
    );
  }
  if (entry.source === "google") {
    return (
      <a
        href={entry.link ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="tg-block tg-block-google"
        data-short={short}
        style={{ ...style, borderLeftColor: entry.color ?? undefined }}
        title={`${blockLabel(block)} · ${googleOrigin(entry)}`}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="tg-block"
      data-short={short}
      style={style}
      title={blockLabel(block)}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onOpen(entry as AgendaItemEntry);
      }}
    >
      {body}
    </button>
  );
}

/**
 * The hour grid for one or more days (the week on a wide screen, and the day view): a row along the top for what has
 * no time (reminders, birthdays and dates, meals with no usual time), then 24 hours with each timed entry as a block,
 * overlapping ones side by side, and a line at the current time on today. Clicking an open spot starts a new event at
 * that half hour. It opens scrolled to the morning (see openingMinute).
 */
function TimeGrid({
  dates,
  entries,
  ctx,
  showDayHeads,
}: {
  dates: string[];
  entries: AgendaEntry[];
  ctx: EntryContext;
  showDayHeads: boolean;
}) {
  const byDate = groupByDate(entries);
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNowMinute();
  const opening = openingMinute(entries);

  useEffect(() => {
    // A few pixels above the hour, so its label isn't cut off at the top.
    scroller.current!.scrollTop = Math.max(0, (opening / 60) * HOUR_PX - 8);
  }, [opening, dates]);

  const columns = { gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))` };
  return (
    <div className="tg" data-days={dates.length}>
      {showDayHeads && (
        <div className="tg-row tg-heads" style={columns}>
          <div />
          {dates.map((date) => {
            const { weekday, monthDay } = formatDayHeading(date);
            const isToday = date === ctx.today;
            return (
              <div key={date} className="tg-head" data-today={isToday || undefined}>
                <Link href={ctx.hrefFor("day", date)} className="cal-day-link">
                  <strong>{weekday}</strong> {monthDay}
                  {isToday && <span className="cal-today"> · Today</span>}
                </Link>
                <AddButton date={date} ctx={ctx} />
              </div>
            );
          })}
        </div>
      )}
      <div className="tg-row tg-allday" style={columns}>
        <div className="tg-gutter-label">All day</div>
        {dates.map((date) => (
          <div key={date} className="tg-allday-cell" data-date={date} data-today={date === ctx.today || undefined}>
            {allDayEntries(byDate.get(date) ?? []).map((e) => (
              <EntryLine key={e.id} entry={e} ctx={ctx} compact />
            ))}
          </div>
        ))}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-row tg-body" style={{ ...columns, height: (DAY_MINUTES / 60) * HOUR_PX }}>
          <div className="tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="tg-hour" style={{ top: hour * HOUR_PX }}>
                {hourLabel(hour)}
              </div>
            ))}
          </div>
          {dates.map((date) => {
            const { weekday, monthDay } = formatDayHeading(date);
            const isToday = date === ctx.today;
            return (
              <div
                key={date}
                className="tg-col"
                data-date={date}
                data-today={isToday || undefined}
                role="group"
                aria-label={`${weekday} ${monthDay}`}
                onClick={(e) => ctx.onAddAt(date, hhmm(minuteAt(e.clientY - e.currentTarget.getBoundingClientRect().top)))}
              >
                {layoutDay(byDate.get(date) ?? []).map((block) => (
                  <GridBlock key={block.entry.id} block={block} ctx={ctx} />
                ))}
                {isToday && now !== null && <div className="tg-now" style={{ top: (now / 60) * HOUR_PX }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
    <>
      {/* Wide screens: the hour grid. Narrow ones: a list of days (CSS shows one or the other). */}
      <div className="cal-week-grid">
        <TimeGrid dates={dates} entries={entries} ctx={ctx} showDayHeads />
      </div>
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
    </>
  );
}

export function DayView({ date, entries, ctx }: { date: string; entries: AgendaEntry[]; ctx: EntryContext }) {
  const here = entries.filter((e) => e.date === date);
  return (
    <div className="cal-dayview">
      <div className="cal-dayview-head">
        {here.length === 0 && <span className="cal-muted">Nothing on the calendar for {formatCalendarDate(date)}.</span>}
        <AddButton date={date} ctx={ctx} />
      </div>
      <TimeGrid dates={[date]} entries={here} ctx={ctx} showDayHeads={false} />
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
              <div
                key={date}
                className="cal-cell"
                role="gridcell"
                data-today={date === ctx.today || undefined}
                data-outside={!date.startsWith(monthPrefix) || undefined}
              >
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
