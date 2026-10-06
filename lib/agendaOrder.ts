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
  createdAt: string;
  editable: false;
};

export type AgendaEntry = AgendaItemEntry | AgendaContactDateEntry | AgendaMealEntry;

/** The sections of a day, in the order they are shown. */
const SECTION = { contactDate: 0, untimedEvent: 1, timedEvent: 2, meal: 3 } as const;

export function sectionOf(entry: AgendaEntry): number {
  if (entry.source === "contact_date") return SECTION.contactDate;
  if (entry.source === "meal") return SECTION.meal;
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
  // Entries in the same section that aren't contact dates or meals are both items.
  const x = a as AgendaItemEntry;
  const y = b as AgendaItemEntry;
  if (x.startTime && y.startTime) return text(x.startTime, y.startTime) || text(x.createdAt, y.createdAt);
  return text(x.createdAt, y.createdAt);
}

export const orderAgenda = (entries: AgendaEntry[]): AgendaEntry[] => [...entries].sort(compareAgenda);

/**
 * Whether an item belongs with a member's view: their own items plus the household-wide (unassigned) ones; items
 * assigned to someone else are hidden. With no filter everything shows.
 */
export function visibleToAssignee(item: { assigneeContactId: string | null }, filterContactId: string | null | undefined): boolean {
  return !filterContactId || item.assigneeContactId === null || item.assigneeContactId === filterContactId;
}
