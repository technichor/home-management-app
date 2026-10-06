import type { AgendaEntry } from "@/lib/agendaOrder";

/** How far past today the "coming up" list looks. */
export const UPCOMING_DAYS = 7;
/** The lists are capped; a "View calendar" link covers the rest. */
export const UPCOMING_SHOWN = 6;

export type TodayPanel = {
  /** Everything on today: contact dates, events and (if shown) meals, in the day's order. */
  today: AgendaEntry[];
  /** Events and contact dates in the days after today. */
  upcoming: AgendaEntry[];
  upcomingMore: number;
};

/**
 * The calendar part of the home page's "Today & coming up": today in full, then the next seven days' events and contact
 * dates (not meals). `entries` is the agenda from today through UPCOMING_DAYS later, already in order; the upcoming
 * list is capped, with the leftovers counted. (Due to-dos are added beside it from lib/todo.)
 */
export function buildTodayPanel(input: { today: string; entries: AgendaEntry[] }): TodayPanel {
  const { today, entries } = input;
  const later = entries.filter((e) => e.date > today && e.source !== "meal");
  return {
    today: entries.filter((e) => e.date === today),
    upcoming: later.slice(0, UPCOMING_SHOWN),
    upcomingMore: Math.max(0, later.length - UPCOMING_SHOWN),
  };
}
