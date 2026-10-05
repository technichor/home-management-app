import { formatCalendarDate, formatWeekRange, type CalendarView, type DateRange } from "@/lib/dates";
import { MONTH_NAMES } from "@/lib/birthday";
import type { AgendaEntry } from "@/lib/agendaOrder";

/** How often the calendar re-checks for changes made by someone else (and on window focus), like the other modules. */
export const CALENDAR_POLL_MS = 30_000;

/** Below this width the week becomes a list of days and the month a compact grid. */
export const CALENDAR_LIST_QUERY = "(max-width: 1100px)";

/** A month cell shows at most this many entries, then "+N more". */
export const MAX_CHIPS = 3;

/** The address of a calendar view. `today` is the browser's date, which pages need to know. */
export function calendarHref(p: { view: CalendarView; date?: string; who?: string | null; today: string }): string {
  const q = new URLSearchParams({ view: p.view });
  if (p.date) q.set("date", p.date);
  if (p.who) q.set("who", p.who);
  q.set("today", p.today);
  return `/calendar?${q.toString()}`;
}

/** The heading for what is being viewed: a day, a week, or a month. */
export function rangeTitle(view: CalendarView, anchor: string): string {
  if (view === "day") {
    const weekday = new Date(`${anchor}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    return `${weekday}, ${formatCalendarDate(anchor)}`;
  }
  if (view === "week") return formatWeekRange(anchor);
  return `${MONTH_NAMES[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
}

/** Entries by date (each date's entries keep the order they were given in). */
export function groupByDate(entries: AgendaEntry[]): Map<string, AgendaEntry[]> {
  const map = new Map<string, AgendaEntry[]>();
  for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

/** A range's dates as rows of seven (a month grid's weeks). */
export function weeksOf(dates: string[]): string[][] {
  return Array.from({ length: dates.length / 7 }, (_, i) => dates.slice(i * 7, i * 7 + 7));
}

/** "9:30 AM" from "09:30". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:30 AM" or "9:30 AM – 10:15 AM"; empty for an untimed item. */
export function timeLabel(startTime: string | null, endTime: string | null): string {
  if (!startTime) return "";
  return endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime);
}

/** Where a date should go when quick-add is opened with nothing chosen: the viewed day, or today if it's in view. */
export function defaultQuickAddDate(view: CalendarView, anchor: string, range: DateRange, today: string): string {
  if (view === "day") return anchor;
  return today >= range.start && today <= range.end ? today : anchor;
}

/** The planner week a meal entry links to. */
export const plannerHref = (date: string, today: string) => `/meals?week=${date}&today=${today}`;
