import type { AgendaEntry } from "@/lib/agendaOrder";

// The hour grid of the calendar's week and day views (like Google Calendar): the hours down the left, each timed entry
// a block from its start to its end, side by side where they overlap. Pure functions; CalendarViews draws the result.

/** How tall an hour is on the grid, in pixels. */
export const HOUR_PX = 48;
export const DAY_MINUTES = 24 * 60;
/** A timed entry with no end time (and every meal) is drawn this long; nothing is stored. */
export const DEFAULT_BLOCK_MINUTES = 30;
/** The grid opens scrolled to this hour, or a little before the day's first timed entry if that is earlier. */
export const OPEN_AT_HOUR = 7;
/** A click on the grid starts a new event at the half hour clicked. */
export const CLICK_STEP_MINUTES = 30;

/** "HH:MM" as minutes after midnight. */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes after midnight as "HH:MM". */
export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** An entry's start time, if it has one: events with a time, and meals whose kind has a usual time. */
export function startOf(entry: AgendaEntry): string | null {
  return entry.source === "contact_date" ? null : entry.startTime;
}

/** The entries that go in the row along the top: reminders (no time), birthdays and dates, and meals with no time. */
export const allDayEntries = (entries: AgendaEntry[]) => entries.filter((e) => startOf(e) === null);

export type Block = {
  entry: AgendaEntry;
  /** Minutes after midnight. */
  start: number;
  end: number;
  /** Which of `columns` side-by-side columns it takes, counting from 0. */
  column: number;
  columns: number;
};

/**
 * The timed entries of one day as blocks. A block ends at the entry's end time, or DEFAULT_BLOCK_MINUTES after its
 * start (never past midnight). Blocks that overlap, directly or through others, form a group that shares the width:
 * each takes the first column free at its start, and every block in the group gets the group's column count. Groups
 * are found in start order (longer first on a tie), the usual calendar layout.
 */
export function layoutDay(entries: AgendaEntry[]): Block[] {
  const timed = entries
    .filter((e) => startOf(e) !== null)
    .map((entry) => {
      const start = minutesOf(startOf(entry)!);
      const end = entry.source === "item" && entry.endTime ? minutesOf(entry.endTime) : Math.min(start + DEFAULT_BLOCK_MINUTES, DAY_MINUTES);
      return { entry, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const blocks: Block[] = [];
  let group: Block[] = [];
  let groupEnd = -1;
  let columnEnds: number[] = [];
  const closeGroup = () => {
    for (const b of group) b.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };

  for (const t of timed) {
    if (t.start >= groupEnd) closeGroup();
    let column = columnEnds.findIndex((end) => end <= t.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = t.end;
    const block: Block = { ...t, column, columns: 1 };
    group.push(block);
    blocks.push(block);
    groupEnd = Math.max(groupEnd, t.end);
  }
  closeGroup();
  return blocks;
}

/** Where the grid opens: OPEN_AT_HOUR, or half an hour before the earliest timed entry shown if that is earlier. */
export function openingMinute(entries: AgendaEntry[]): number {
  const starts = entries.map(startOf).filter((t): t is string => t !== null).map(minutesOf);
  return Math.max(0, Math.min(OPEN_AT_HOUR * 60, ...starts.map((m) => m - 30)));
}

/** The time a click at `offsetPx` from the top of a day column means: the half hour it falls in. */
export function minuteAt(offsetPx: number): number {
  const minute = Math.floor(((offsetPx / HOUR_PX) * 60) / CLICK_STEP_MINUTES) * CLICK_STEP_MINUTES;
  return Math.min(Math.max(minute, 0), DAY_MINUTES - CLICK_STEP_MINUTES);
}

/** The hour labels down the left: "1 AM" ... "11 PM" (midnight's line has none, as in most calendars). */
export function hourLabel(hour: number): string {
  if (hour === 0) return "";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}
