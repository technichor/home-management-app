import { z } from "zod";
import type { CalendarKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isDateString } from "@/lib/dates";
import { calendarName } from "@/lib/contactDates";

export const MAX_TITLE = 200;
export const MAX_NOTES = 5000;
/** 24-hour wall-clock time, "HH:mm". (No time zone: a calendar entry's time is whatever the wall clock says.) */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);
const time = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || TIME_PATTERN.test(v), "Enter the time as HH:MM (24-hour)");

/**
 * The fields of a calendar item, checked for the kind it is (the kind itself never changes after creation):
 *  - a TASK has no times; an EVENT may have a start time, and an end time only with a start, after it.
 * An event with no time is a reminder.
 */
export function calendarItemSchema(kind: CalendarKind) {
  return z
    .object({
      title: z.string().trim().min(1, "Give it a title").max(MAX_TITLE, `Titles can be at most ${MAX_TITLE} characters`),
      notes: z
        .string()
        .max(MAX_NOTES, `Notes can be at most ${MAX_NOTES.toLocaleString("en-US")} characters`)
        .nullish()
        // Kept exactly as typed (line breaks and all); only a blank note becomes none.
        .transform(blankToNull),
      date: z.string().refine(isDateString, "Choose a valid date"),
      startTime: time,
      endTime: time,
      assigneeContactId: z.string().nullish().transform(blankToNull),
    })
    .superRefine((v, ctx) => {
      if (kind === "TASK") {
        if (v.startTime || v.endTime) ctx.addIssue({ code: "custom", message: "Tasks don't have a time", path: [v.startTime ? "startTime" : "endTime"] });
        return;
      }
      if (v.endTime && !v.startTime) ctx.addIssue({ code: "custom", message: "Add a start time before an end time", path: ["endTime"] });
      else if (v.startTime && v.endTime && v.endTime <= v.startTime) {
        ctx.addIssue({ code: "custom", message: "The end time must be after the start time", path: ["endTime"] });
      }
    });
}

export type CalendarItemFields = z.input<ReturnType<typeof calendarItemSchema>>;

/** The household's own members that an item can be assigned to: their Family & Friend contacts, not removed. */
export async function assigneeOptionsOf(householdId: string) {
  const rows = await prisma.contact.findMany({
    where: { ownerHouseholdId: householdId, householdId, category: "FAMILY_FRIEND", deletedAt: null },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: calendarName(r), fullName: `${r.firstName} ${r.lastName}` }));
}

export type AssigneeOption = Awaited<ReturnType<typeof assigneeOptionsOf>>[number];

/** Household-wide calendar settings, created with the defaults (meals hidden) the first time they are read. */
export async function getCalendarSettings(householdId: string): Promise<{ showMeals: boolean }> {
  const row = await prisma.calendarSettings.upsert({ where: { householdId }, create: { householdId }, update: {} });
  return { showMeals: row.showMeals };
}
