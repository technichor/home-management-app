import { addDays, dayOfWeek } from "@/lib/dates";
import { DEFAULT_BLOCK_MINUTES, minutesOf, startOf } from "@/lib/calendarLayout";
import type { AgendaEntry } from "@/lib/agendaOrder";

// The home page's day (docs/HANDOFF.md, /home): today as a timeline (what's done, what's on now, what's next, and the
// free time between), then the next couple of days. Pure functions; the page draws them.

const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Free time is only pointed out during the waking day, and only when it is at least this long. */
export const DAY_STARTS = 7 * 60;
export const DAY_ENDS = 21 * 60;
export const MIN_FREE_MINUTES = 60;
/** How many days after today the home page looks ahead. */
export const DAYS_AHEAD = 2;

/** "Good morning" until noon, "Good afternoon" until 5 PM, then "Good evening". */
export function greeting(minutes: number): string {
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** "Wednesday, October 15". */
export function longDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const month = new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${LONG[dayOfWeek(date)]}, ${month} ${d}`;
}

export type TimelineRow =
  | { kind: "entry"; entry: AgendaEntry; start: number; end: number; state: "past" | "now" | "later" }
  /** `fromNow`: the free stretch starts now (shown as "Now", not a time). */
  | { kind: "free"; start: number; end: number; fromNow: boolean };

/** When an entry with a time ends: its end time, else half an hour after it starts (as on the calendar's grid). */
const endOf = (entry: AgendaEntry, start: number) =>
  (entry.source === "item" || entry.source === "google") && entry.endTime ? minutesOf(entry.endTime) : start + DEFAULT_BLOCK_MINUTES;

/**
 * Today's entries as the home page shows them: the ones without a time (reminders, birthdays, all-day Google events)
 * along the top, and the timed ones in order, each past, on now, or later, with the free stretches still ahead
 * (an hour or more, between DAY_STARTS and DAY_ENDS) between them. Free time after the last entry isn't pointed out.
 * "Now" is rounded up to the next five minutes, so free time reads "2 hours 5 min", not "2 hours 3 min".
 */
export function todayTimeline(entries: AgendaEntry[], nowMinutes: number): { allDay: AgendaEntry[]; rows: TimelineRow[] } {
  const allDay = entries.filter((e) => startOf(e) === null);
  const timed = entries
    .filter((e) => startOf(e) !== null)
    .map((entry) => {
      const start = minutesOf(startOf(entry)!);
      return { entry, start, end: endOf(entry, start) };
    })
    .sort((a, b) => a.start - b.start);

  const rows: TimelineRow[] = [];
  const now = Math.ceil(nowMinutes / 5) * 5;
  let free = Math.max(now, DAY_STARTS);
  for (const t of timed) {
    const until = Math.min(t.start, DAY_ENDS);
    if (until - free >= MIN_FREE_MINUTES) rows.push({ kind: "free", start: free, end: until, fromNow: free === now });
    const state = t.end <= nowMinutes ? "past" : t.start <= nowMinutes ? "now" : "later";
    rows.push({ kind: "entry", ...t, state });
    free = Math.max(free, t.end);
  }
  return { allDay, rows };
}

export type UpcomingDay = { date: string; weekday: string; monthDay: string; entries: AgendaEntry[] };

/** The DAYS_AHEAD days after today, each with its entries (in the agenda's order). */
export function upcomingDays(entries: AgendaEntry[], today: string): UpcomingDay[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = addDays(today, i + 1);
    const [, m, d] = date.split("-").map(Number);
    return { date, weekday: LONG[dayOfWeek(date)], monthDay: `${MONTHS[m - 1]} ${d}`, entries: entries.filter((e) => e.date === date) };
  });
}

/** "2 hours", "1.5 hours", "1 hour 10 min". */
export function freeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  if (rest === 30) return `${hours}.5 hours`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${rest} min`;
}
