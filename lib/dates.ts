/**
 * Calendar dates as plain "YYYY-MM-DD" strings, with no time or time zone. The server runs in UTC but a
 * family's "today" is the date on their own device, so "today" is always passed in from the browser
 * (see components/LocalToday.tsx) and never read from the server clock for anything the user sees.
 */

export type WeekStart = "SUNDAY" | "MONDAY";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in the form YYYY-MM-DD (so 2026-02-30 is not). */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** The date on this device right now (browser use only). */
export function localDateString(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The server's own UTC date: only a fallback for when the browser hasn't said what its date is. */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A valid date string from a URL parameter, else the fallback. */
export function dateOr(value: unknown, fallback: string): string {
  return isDateString(value) ? value : fallback;
}

const toUtc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

/** The first day of the week containing `date`. */
export function weekStartOf(date: string, weekStartsOn: WeekStart): string {
  const first = weekStartsOn === "MONDAY" ? 1 : 0;
  return addDays(date, -((dayOfWeek(date) - first + 7) % 7));
}

/** The seven dates of the week starting on `start`. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** A database DATE (UTC midnight) as a plain date string. */
export function dateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A plain date string as the value to store in a DATE column. */
export function stringToDate(date: string): Date {
  return toUtc(date);
}

/** "Oct 4, 2026" (always the same on the server and in the browser). */
export function formatCalendarDate(date: string): string {
  return toUtc(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Oct 4 – 10, 2026", or "Sep 28 – Oct 4, 2026" when the week spans two months (or years). */
export function formatWeekRange(start: string): string {
  const end = addDays(start, 6);
  const [a, b] = [toUtc(start), toUtc(end)];
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${fmt(a, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(b, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(b, { month: "short", day: "numeric" })}, ${a.getUTCFullYear()}`;
  }
  return `${fmt(a, { month: "short", day: "numeric" })} – ${b.getUTCDate()}, ${a.getUTCFullYear()}`;
}

/** "Mon" and "Oct 5" for a column or row heading. */
export function formatDayHeading(date: string): { weekday: string; monthDay: string } {
  const d = toUtc(date);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    monthDay: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

// ---- Calendar views: day, week and month ranges (Scheduling) ----

export type CalendarView = "day" | "week" | "month";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month"];

/** The view named in a URL parameter; anything else is the default, the week. */
export function parseView(value: unknown): CalendarView {
  return CALENDAR_VIEWS.find((v) => v === value) ?? "week";
}

/** An inclusive range of calendar dates. */
export type DateRange = { start: string; end: string };

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Every date in the range, in order. */
export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEndOf(date: string): string {
  return addDays(monthStartOf(addMonths(date, 1)), -1);
}

/** The first day of the month `months` away from the one containing `date`. */
export function addMonths(date: string, months: number): string {
  const d = toUtc(monthStartOf(date));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * The date `months` after (or before) `date`, on the same day of the month, or the month's last day when it is
 * shorter (Jan 31 + 1 month is Feb 28, or 29 in a leap year). Compare addMonths, which gives the first of the month.
 */
export function addMonthsKeepingDay(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/**
 * The date a view is anchored on: the day itself, the first day of its week (honoring the week-start setting), or
 * the first day of its month. A URL's `date` can be any date inside the range; this is what it is normalized to.
 */
export function viewAnchor(view: CalendarView, date: string, weekStartsOn: WeekStart): string {
  if (view === "day") return date;
  return view === "week" ? weekStartOf(date, weekStartsOn) : monthStartOf(date);
}

/**
 * The dates a view shows. A month is the full grid of weeks: it starts on the week's first day on or before the 1st
 * and ends on the last day of the week containing the month's last day, so it includes leading and trailing days.
 */
export function viewRange(view: CalendarView, anchor: string, weekStartsOn: WeekStart): DateRange {
  if (view === "day") return { start: anchor, end: anchor };
  if (view === "week") return { start: anchor, end: addDays(anchor, 6) };
  return { start: weekStartOf(anchor, weekStartsOn), end: addDays(weekStartOf(monthEndOf(anchor), weekStartsOn), 6) };
}

/** The anchor one view-unit earlier (-1) or later (+1): a day, a week, or a month. */
export function stepAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === "day") return addDays(anchor, direction);
  return view === "week" ? addDays(anchor, direction * 7) : addMonths(anchor, direction);
}

export type CalendarRange = {
  view: CalendarView;
  anchor: string;
  range: DateRange;
  prev: string;
  next: string;
  /** Whether today is among the dates shown (the overdue strip depends on it). */
  containsToday: boolean;
};

/**
 * Everything a calendar page needs from its URL: the view (default week), the date (default today; any date inside the
 * range works), and the browser's own today. Unbounded in both directions.
 */
export function resolveCalendarRange(input: { view?: unknown; date?: unknown; today: string; weekStartsOn: WeekStart }): CalendarRange {
  const view = parseView(input.view);
  const anchor = viewAnchor(view, dateOr(input.date, input.today), input.weekStartsOn);
  const range = viewRange(view, anchor, input.weekStartsOn);
  return {
    view,
    anchor,
    range,
    prev: stepAnchor(view, anchor, -1),
    next: stepAnchor(view, anchor, 1),
    containsToday: inRange(input.today, range),
  };
}
