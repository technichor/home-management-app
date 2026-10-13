import type { MealSlot, RepeatUnit } from "@prisma/client";
import { SLOTS } from "@/lib/mealPlan";

/** What the calendar shows for a date, whatever it came from. `editable` says whether the household can change it. */
export type AgendaItemEntry = {
  source: "item";
  /** Unique per occurrence (a repeating event shows up on many dates); `itemId` is the stored item to act on. */
  id: string;
  itemId: string;
  date: string;
  title: string;
  notes: string | null;
  startTime: string | null;
  endTime: string | null;
  assigneeContactId: string | null;
  /** The assignee's name, kept even after their contact is removed from the household. */
  assigneeName: string | null;
  createdAt: string;
  /** Google Calendar: whether it is to be sent there, whether it is there, and the last error sending it. */
  google: { wanted: boolean; sent: boolean; error: string | null };
  /** How it repeats, or null. The date shown is one occurrence of the series; `start` is where the series begins. */
  repeat: { unit: RepeatUnit; every: number; until: string | null; start: string } | null;
  editable: true;
};

export type AgendaContactDateEntry = {
  source: "contact_date";
  id: string;
  date: string;
  title: string;
  type: "birthday" | "important";
  contactId: string;
  turns: number | null;
  editable: false;
};

export type AgendaMealEntry = {
  source: "meal";
  id: string;
  date: string;
  slot: MealSlot;
  title: string;
  /** The meal's usual time from the planner settings ("HH:MM"), or null; a meal is drawn 30 minutes long. */
  startTime: string | null;
  createdAt: string;
  editable: false;
};

/** An event from a member's shared Google calendar (lib/googleEvents.ts): read-only, opens in Google. */
export type AgendaGoogleEntry = {
  source: "google";
  id: string;
  /** Google's id for the event (the same in every calendar it is in). */
  googleId: string;
  date: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  /** The event in Google Calendar, or null. */
  link: string | null;
  calendarName: string;
  color: string | null;
  /** The member whose calendar it is. */
  ownerName: string;
  ownerContactId: string | null;
  editable: false;
};

export type AgendaEntry = AgendaItemEntry | AgendaContactDateEntry | AgendaMealEntry | AgendaGoogleEntry;

/** The sections of a day, in the order they are shown. */
const SECTION = { contactDate: 0, untimedEvent: 1, timedEvent: 2, meal: 3 } as const;

export function sectionOf(entry: AgendaEntry): number {
  if (entry.source === "contact_date") return SECTION.contactDate;
  if (entry.source === "meal") return SECTION.meal;
  // Events from Google sit with the household's own events.
  return entry.startTime ? SECTION.timedEvent : SECTION.untimedEvent;
}

const text = (a: string, b: string) => a.localeCompare(b);

/** Within a day: contact dates, untimed events, timed events by start time, then meals. */
export function compareAgenda(a: AgendaEntry, b: AgendaEntry): number {
  if (a.date !== b.date) return text(a.date, b.date);
  const sections = sectionOf(a) - sectionOf(b);
  if (sections !== 0) return sections;

  if (a.source === "contact_date" && b.source === "contact_date") {
    // Birthdays before other important dates.
    return Number(b.type === "birthday") - Number(a.type === "birthday") || text(a.title, b.title);
  }
  if (a.source === "meal" && b.source === "meal") {
    return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || text(a.createdAt, b.createdAt);
  }
  // Entries in the same section that aren't contact dates or meals are events: Domata's own (in the order added), or
  // from Google (after Domata's, by title).
  const x = a as AgendaItemEntry | AgendaGoogleEntry;
  const y = b as AgendaItemEntry | AgendaGoogleEntry;
  if (x.startTime && y.startTime && x.startTime !== y.startTime) return text(x.startTime, y.startTime);
  if (x.source !== y.source) return x.source === "item" ? -1 : 1;
  if (x.source === "google") return text(x.title, (y as AgendaGoogleEntry).title);
  return text(x.createdAt, (y as AgendaItemEntry).createdAt);
}

export const orderAgenda = (entries: AgendaEntry[]): AgendaEntry[] => [...entries].sort(compareAgenda);

/**
 * Whether an item belongs with a member's view: their own items plus the household-wide (unassigned) ones; items
 * assigned to someone else are hidden. With no filter everything shows.
 */
export function visibleToAssignee(item: { assigneeContactId: string | null }, filterContactId: string | null | undefined): boolean {
  return !filterContactId || item.assigneeContactId === null || item.assigneeContactId === filterContactId;
}
