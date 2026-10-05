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
