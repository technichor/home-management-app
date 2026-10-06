import type { RepeatUnit } from "@prisma/client";
import { addDays, addMonthsKeepingDay, daysBetween, formatCalendarDate, type DateRange } from "@/lib/dates";

/**
 * Repeating calendar items. A rule is "every N days/weeks/months/years from an anchor date, optionally until a date".
 * Occurrence n is always computed from the anchor (never from the previous occurrence), so a monthly item on the 31st
 * is the 28th in February and the 31st again in March. A year is twelve months, so Feb 29 falls on Feb 28 in the
 * years that have no 29th. Nothing is stored per occurrence.
 */
export type RepeatRule = { anchor: string; unit: RepeatUnit; every: number; until: string | null };

/** The most occurrences ever walked in one call: a guard, far above what a calendar range can hold. */
const MAX_STEPS = 1000;

const MAX_EVERY = 99;
export const REPEAT_UNITS: readonly RepeatUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];
export { MAX_EVERY };

/** The nth occurrence (0 is the anchor itself). */
export function occurrenceAt(rule: RepeatRule, n: number): string {
  switch (rule.unit) {
    case "DAY":
      return addDays(rule.anchor, n * rule.every);
    case "WEEK":
      return addDays(rule.anchor, n * rule.every * 7);
    case "MONTH":
      return addMonthsKeepingDay(rule.anchor, n * rule.every);
    case "YEAR":
      return addMonthsKeepingDay(rule.anchor, n * rule.every * 12);
  }
}

/** An occurrence index at or before the first one on/after `date`, so walking can start close to it. */
function indexNear(rule: RepeatRule, date: string): number {
  if (date <= rule.anchor) return 0;
  if (rule.unit === "DAY" || rule.unit === "WEEK") {
    const step = rule.every * (rule.unit === "DAY" ? 1 : 7);
    return Math.max(0, Math.floor(daysBetween(rule.anchor, date) / step) - 1);
  }
  const step = rule.every * (rule.unit === "MONTH" ? 1 : 12);
  const [ay, am] = rule.anchor.split("-").map(Number);
  const [dy, dm] = date.split("-").map(Number);
  return Math.max(0, Math.floor(((dy - ay) * 12 + (dm - am)) / step) - 1);
}

/** Every occurrence inside the range (inclusive), in order, never past the rule's end date. */
export function occurrencesInRange(rule: RepeatRule, range: DateRange): string[] {
  const dates: string[] = [];
  let n = indexNear(rule, range.start);
  for (let steps = 0; steps < MAX_STEPS; steps++, n++) {
    const date = occurrenceAt(rule, n);
    if (date > range.end || (rule.until !== null && date > rule.until)) break;
    if (date >= range.start) dates.push(date);
  }
  return dates;
}

const UNIT_WORDS: Record<RepeatUnit, [string, string]> = {
  DAY: ["day", "days"],
  WEEK: ["week", "weeks"],
  MONTH: ["month", "months"],
  YEAR: ["year", "years"],
};

/** "Every week", "Every 3 months, until Dec 31, 2027". */
export function describeRepeat(unit: RepeatUnit, every: number, until: string | null): string {
  const [one, many] = UNIT_WORDS[unit];
  const base = every === 1 ? `Every ${one}` : `Every ${every} ${many}`;
  return until ? `${base}, until ${formatCalendarDate(until)}` : base;
}
