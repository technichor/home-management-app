import { z } from "zod";
import type { RepeatUnit } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isDateString } from "@/lib/dates";
import { optionalDate, optionalId, optionalNotes, trimToNull } from "@/lib/formFields";
import { MAX_EVERY, REPEAT_UNITS } from "@/lib/recurrence";

export const MAX_TITLE = 200;
export const MAX_NOTES = 5000;
/** 24-hour wall-clock time, "HH:mm". (No time zone: a calendar entry's time is whatever the wall clock says.) */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const time = z
  .string()
  .nullish()
  .transform(trimToNull)
  .refine((v) => v === null || TIME_PATTERN.test(v), "Enter the time as HH:MM (24-hour)");

/**
 * The fields of a calendar event. It may have a start time, and an end time only with a start, after it. An event with
 * no time is a reminder.
 */
export const calendarItemSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(MAX_TITLE, `Titles can be at most ${MAX_TITLE} characters`),
    notes: optionalNotes(MAX_NOTES),
    date: z.string().refine(isDateString, "Choose a valid date"),
    startTime: time,
    endTime: time,
    assigneeContactId: optionalId(),
    repeatUnit: z.enum(REPEAT_UNITS as [RepeatUnit, ...RepeatUnit[]]).nullish().transform((v) => v ?? null),
    repeatEvery: z.number().int("Repeat every a whole number of times").min(1, "Repeat every at least 1").max(MAX_EVERY, `Repeat every at most ${MAX_EVERY}`).nullish().transform((v) => v ?? 1),
    repeatUntil: optionalDate("end date"),
  })
  .superRefine((v, ctx) => {
    if (v.repeatUntil && !v.repeatUnit) ctx.addIssue({ code: "custom", message: "An end date needs a repeat", path: ["repeatUntil"] });
    else if (v.repeatUntil && v.repeatUntil < v.date) ctx.addIssue({ code: "custom", message: "The repeat can't end before it starts", path: ["repeatUntil"] });
    if (v.endTime && !v.startTime) ctx.addIssue({ code: "custom", message: "Add a start time before an end time", path: ["endTime"] });
    else if (v.startTime && v.endTime && v.endTime <= v.startTime) {
      ctx.addIssue({ code: "custom", message: "The end time must be after the start time", path: ["endTime"] });
    }
  });

export type CalendarItemFields = z.input<typeof calendarItemSchema>;

/** Household-wide calendar settings, created with the defaults (meals hidden) the first time they are read. */
export async function getCalendarSettings(householdId: string): Promise<{ showMeals: boolean }> {
  const row = await prisma.calendarSettings.upsert({ where: { householdId }, create: { householdId }, update: {} });
  return { showMeals: row.showMeals };
}
