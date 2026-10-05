"use server";

import { revalidatePath } from "next/cache";
import type { CalendarKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { isDateString, stringToDate, type WeekStart } from "@/lib/dates";
import { updatePlanSettings } from "@/lib/mealPlan";
import { assigneeOptionsOf, calendarItemSchema, getCalendarSettings, type CalendarItemFields } from "@/lib/calendarItem";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's items. An item id or assignee id sent from the browser that isn't the household's is "not found".

async function loadItem(householdId: string, id: string) {
  const item = await prisma.calendarItem.findFirst({ where: { id, householdId } });
  if (!item) throw new UserError("That item isn't on your calendar any more");
  return item;
}

function parseFields(kind: CalendarKind, fields: CalendarItemFields) {
  const parsed = calendarItemSchema(kind).safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
}

/**
 * Whether someone can be the assignee: one of the household's own members who hasn't been removed. (An item that is
 * already assigned to someone later removed keeps them; only choosing a new assignee is checked.)
 */
async function assertAssignee(householdId: string, assigneeContactId: string | null, current: string | null = null) {
  if (assigneeContactId === null || assigneeContactId === current) return;
  const options = await assigneeOptionsOf(householdId);
  if (!options.some((o) => o.id === assigneeContactId)) throw new UserError("Choose one of your household's members");
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/home");
}

const dataOf = (f: ReturnType<typeof parseFields>) => ({
  title: f.title,
  notes: f.notes,
  date: stringToDate(f.date),
  startTime: f.startTime,
  endTime: f.endTime,
  assigneeContactId: f.assigneeContactId,
});

/** Add an event (an event with no time is a reminder) or a task. */
export async function createCalendarItemAction(kind: CalendarKind, fields: CalendarItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (kind !== "EVENT" && kind !== "TASK") throw new UserError("Choose event or task");
    const data = parseFields(kind, fields);
    await assertAssignee(householdId, data.assigneeContactId);
    const created = await prisma.calendarItem.create({ data: { householdId, kind, ...dataOf(data) } });
    refresh();
    return { id: created.id };
  });
}

/** Change an item. Its kind never changes, and its completion is untouched (use setTaskCompletedAction). */
export async function updateCalendarItemAction(id: string, fields: CalendarItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const item = await loadItem(householdId, id);
    const data = parseFields(item.kind, fields);
    await assertAssignee(householdId, data.assigneeContactId, item.assigneeContactId);
    await prisma.calendarItem.update({ where: { id }, data: dataOf(data) });
    refresh();
  });
}

/** Hard delete (no undo, no history). */
export async function deleteCalendarItemAction(id: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    await loadItem(householdId, id);
    await prisma.calendarItem.delete({ where: { id } });
    refresh();
  });
}

/** Check or uncheck a task. Completing never changes the task's date. */
export async function setTaskCompletedAction(id: string, completed: boolean) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const item = await loadItem(householdId, id);
    if (item.kind !== "TASK") throw new UserError("Only a task can be checked off");
    await prisma.calendarItem.update({ where: { id }, data: { completedAt: completed ? new Date() : null } });
    refresh();
  });
}

/** Move an open task to today (the browser's date), for a task that has been left behind. */
export async function moveTaskToTodayAction(id: string, today: string) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (!isDateString(today)) throw new UserError("Choose a valid date");
    const item = await loadItem(householdId, id);
    if (item.kind !== "TASK") throw new UserError("Only a task can be moved to today");
    if (item.completedAt) throw new UserError("A completed task stays on its date");
    await prisma.calendarItem.update({ where: { id }, data: { date: stringToDate(today) } });
    refresh();
  });
}

/** Whether planned meals show on the calendar (household-wide; off by default). */
export async function setShowMealsAction(showMeals: boolean) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    if (typeof showMeals !== "boolean") throw new UserError("Invalid setting");
    await getCalendarSettings(householdId); // creates the row on first use
    await prisma.calendarSettings.update({ where: { householdId }, data: { showMeals } });
    refresh();
  });
}

/**
 * The week's first day. It is the Meal Planning setting (the planner and the calendar share it), written through the
 * same code, so changing it here changes the planner too.
 */
export async function setWeekStartAction(weekStartsOn: WeekStart) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const result = await updatePlanSettings(householdId, { weekStartsOn });
    if (!result.ok) throw new UserError(result.error);
    refresh();
    revalidatePath("/meals");
  });
}
