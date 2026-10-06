"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireHouseholdId } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { stringToDate, type WeekStart } from "@/lib/dates";
import { updatePlanSettings } from "@/lib/mealPlan";
import { assertMemberChoice } from "@/lib/householdMembers";
import { calendarItemSchema, getCalendarSettings, type CalendarItemFields } from "@/lib/calendarItem";

// Server actions are public endpoints: each one takes the household from the session and only ever touches that
// household's items. An item id or assignee id sent from the browser that isn't the household's is "not found".

async function loadItem(householdId: string, id: string) {
  const item = await prisma.calendarItem.findFirst({ where: { id, householdId } });
  if (!item) throw new UserError("That item isn't on your calendar any more");
  return item;
}

function parseFields(fields: CalendarItemFields) {
  const parsed = calendarItemSchema.safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data;
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
  repeatUnit: f.repeatUnit,
  repeatEvery: f.repeatUnit ? f.repeatEvery : 1,
  repeatUntil: f.repeatUnit && f.repeatUntil ? stringToDate(f.repeatUntil) : null,
});

/** Add an event (an event with no time is a reminder). */
export async function createCalendarItemAction(fields: CalendarItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const data = parseFields(fields);
    await assertMemberChoice(householdId, data.assigneeContactId);
    const created = await prisma.calendarItem.create({ data: { householdId, ...dataOf(data) } });
    refresh();
    return { id: created.id };
  });
}

/** Change an event (a repeating one as a whole series). */
export async function updateCalendarItemAction(id: string, fields: CalendarItemFields) {
  const householdId = await requireHouseholdId();
  return attempt(async () => {
    const item = await loadItem(householdId, id);
    const data = parseFields(fields);
    await assertMemberChoice(householdId, data.assigneeContactId, item.assigneeContactId);
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
