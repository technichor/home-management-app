import type { CalendarItem } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateToString, stringToDate } from "@/lib/dates";
import { contactDateOccurrences, calendarName } from "@/lib/contactDates";
import { contactsOf } from "@/lib/scope";
import { entriesInRange, getMealPlanSettings, SLOT_LABELS, visibleSlots } from "@/lib/mealPlan";
import {
  isOverdue,
  orderAgenda,
  type AgendaContactDateEntry,
  type AgendaEntry,
  type AgendaItemEntry,
  type AgendaMealEntry,
} from "@/lib/agendaOrder";

export type { AgendaEntry, AgendaItemEntry, AgendaContactDateEntry, AgendaMealEntry } from "@/lib/agendaOrder";

export type AgendaOptions = {
  /** The browser's local date: it decides what is overdue. */
  today: string;
  /** Show this member's items plus the household-wide ones; hide items assigned to others. Null/absent: everything. */
  assigneeContactId?: string | null;
  /** Add the planned meals (for the slots the household shows). */
  includeMeals?: boolean;
};

export type Agenda = {
  /** Everything dated within the range, already in day order (see compareAgenda). */
  entries: AgendaEntry[];
  /** Every open task dated before today, oldest first, wherever the range is (for the "Overdue" strip). */
  overdue: AgendaItemEntry[];
};

type ItemRow = CalendarItem & { assignee: { firstName: string; nickname: string | null } | null };

function toItemEntry(row: ItemRow, today: string): AgendaItemEntry {
  const date = dateToString(row.date);
  const completed = row.completedAt !== null;
  return {
    source: "item",
    id: row.id,
    kind: row.kind,
    date,
    title: row.title,
    notes: row.notes,
    startTime: row.startTime,
    endTime: row.endTime,
    assigneeContactId: row.assigneeContactId,
    assigneeName: row.assignee ? calendarName(row.assignee) : null,
    completed,
    overdue: isOverdue({ kind: row.kind, date, completed }, today),
    createdAt: row.createdAt.toISOString(),
    editable: true,
  };
}

/**
 * The calendar for a household between two dates (inclusive), unified from three sources: items the household entered,
 * contact dates (birthdays and important dates, derived fresh from active contacts), and optionally planned meals.
 * Every query is scoped to the household. This is the one place the calendar views, the home page and any future
 * morning brief read from; it has no UI in it.
 */
export async function getAgenda(householdId: string, startDate: string, endDate: string, options: AgendaOptions): Promise<Agenda> {
  const { today, assigneeContactId = null, includeMeals = false } = options;
  const assigneeWhere = assigneeContactId ? { OR: [{ assigneeContactId: null }, { assigneeContactId }] } : {};
  const assignee = { select: { firstName: true, nickname: true } };

  const [rows, overdueRows, contacts, meals] = await Promise.all([
    prisma.calendarItem.findMany({
      where: { householdId, date: { gte: stringToDate(startDate), lte: stringToDate(endDate) }, ...assigneeWhere },
      include: { assignee },
    }),
    prisma.calendarItem.findMany({
      where: { householdId, kind: "TASK", completedAt: null, date: { lt: stringToDate(today) }, ...assigneeWhere },
      include: { assignee },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.contact.findMany({
      where: {
        ...contactsOf(householdId),
        deletedAt: null,
        OR: [{ birthdayMonth: { not: null } }, { importantDate1: { not: null } }, { importantDate2: { not: null } }],
      },
      select: {
        id: true, firstName: true, nickname: true,
        birthdayMonth: true, birthdayDay: true, birthdayYear: true,
        importantDate1: true, importantDate1Label: true, importantDate2: true, importantDate2Label: true,
      },
    }),
    includeMeals ? loadMeals(householdId, startDate, endDate) : Promise.resolve([] as AgendaMealEntry[]),
  ]);

  const contactDates: AgendaContactDateEntry[] = contactDateOccurrences(contacts, { start: startDate, end: endDate }).map((o, i) => ({
    source: "contact_date",
    id: `${o.contactId}:${o.date}:${o.type}:${i}`,
    date: o.date,
    title: o.title,
    type: o.type,
    contactId: o.contactId,
    turns: o.turns,
    editable: false,
  }));

  return {
    entries: orderAgenda([...rows.map((r) => toItemEntry(r, today)), ...contactDates, ...meals]),
    overdue: overdueRows.map((r) => toItemEntry(r, today)),
  };
}

/** Planned meals in the range, for the meal slots the household has switched on, labelled like "Dinner: Tacos". */
async function loadMeals(householdId: string, start: string, end: string): Promise<AgendaMealEntry[]> {
  const [settings, entries] = await Promise.all([getMealPlanSettings(householdId), entriesInRange(householdId, start, end)]);
  const shown = visibleSlots(settings);
  return entries
    .filter((e) => shown.includes(e.slot) && e.label)
    .map((e) => ({
      source: "meal" as const,
      id: e.id,
      date: e.date,
      slot: e.slot,
      title: `${SLOT_LABELS[e.slot]}: ${e.label}`,
      createdAt: e.createdAt,
      editable: false as const,
    }));
}
