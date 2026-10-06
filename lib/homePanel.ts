import type { AgendaEntry, AgendaItemEntry } from "@/lib/agendaOrder";

/** How far past today the "coming up" list looks. */
export const UPCOMING_DAYS = 7;
/** The lists are capped; a "View calendar" link covers the rest. */
export const UPCOMING_SHOWN = 6;
export const OVERDUE_SHOWN = 5;

export type TodayPanel = {
  overdue: AgendaItemEntry[];
  overdueMore: number;
  /** Everything on today: contact dates, events, tasks and (if shown) meals, in the day's order. */
  today: AgendaEntry[];
  /** Events and contact dates in the days after today. */
  upcoming: AgendaEntry[];
  upcomingMore: number;
};

/**
 * The home page's "Today & coming up": overdue tasks, then today in full, then the next seven days' events and
 * contact dates (not tasks, which appear only on their own date, and not meals). `entries` is the agenda from today
 * through UPCOMING_DAYS later, already in order; the lists are capped, with the leftovers counted.
 */
export function buildTodayPanel(input: { today: string; entries: AgendaEntry[]; overdue: AgendaItemEntry[] }): TodayPanel {
  const { today, entries, overdue } = input;
  const later = entries.filter((e) => e.date > today && (e.source === "contact_date" || (e.source === "item" && e.kind === "EVENT")));
  return {
    overdue: overdue.slice(0, OVERDUE_SHOWN),
    overdueMore: Math.max(0, overdue.length - OVERDUE_SHOWN),
    today: entries.filter((e) => e.date === today),
    upcoming: later.slice(0, UPCOMING_SHOWN),
    upcomingMore: Math.max(0, later.length - UPCOMING_SHOWN),
  };
}
