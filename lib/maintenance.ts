import { z } from "zod";
import type { MaintenanceCategory } from "@prisma/client";
import { formatCalendarDate, isDateString } from "@/lib/dates";
import { isHttpUrl } from "@/lib/urls";

export const MAINTENANCE_CATEGORIES: readonly MaintenanceCategory[] = ["HVAC", "APPLIANCE", "PLUMBING", "ELECTRICAL", "EXTERIOR", "YARD", "VEHICLE", "OTHER"];

export const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  HVAC: "Heating & cooling",
  APPLIANCE: "Appliance",
  PLUMBING: "Plumbing & water",
  ELECTRICAL: "Electrical",
  EXTERIOR: "Exterior & structure",
  YARD: "Yard",
  VEHICLE: "Vehicle",
  OTHER: "Other",
};

export const MAX_FIELD = 120;
export const MAX_URL = 500;
export const MAX_NOTES = 5000;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const MAX_INTERVAL_MONTHS = 600;

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);
const short = (label: string) =>
  z
    .string()
    .max(MAX_FIELD, `${label} can be at most ${MAX_FIELD} characters`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));
const optionalDate = (label: string) =>
  z
    .string()
    .nullish()
    .transform(blankToNull)
    .refine((v) => v === null || isDateString(v), `Choose a valid ${label}`);

export const maintenanceItemSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(MAX_FIELD, `The name can be at most ${MAX_FIELD} characters`),
  category: z.enum(MAINTENANCE_CATEGORIES as [MaintenanceCategory, ...MaintenanceCategory[]], "Choose a category"),
  location: short("The location"),
  brand: short("The brand"),
  modelNumber: short("The model number"),
  serialNumber: short("The serial number"),
  installedYear: z
    .number()
    .int("The year must be a whole number")
    .min(MIN_YEAR, `The year can't be before ${MIN_YEAR}`)
    .max(MAX_YEAR, `The year can't be after ${MAX_YEAR}`)
    .nullish()
    .transform((v) => v ?? null),
  warrantyUntil: optionalDate("warranty date"),
  serviceEveryMonths: z
    .number()
    .int("Months between service must be a whole number")
    .min(1, "Months between service must be at least 1")
    .max(MAX_INTERVAL_MONTHS, `Months between service can be at most ${MAX_INTERVAL_MONTHS}`)
    .nullish()
    .transform((v) => v ?? null),
  lastServicedOn: optionalDate("service date"),
  manualUrl: z
    .string()
    .max(MAX_URL, `The manual link can be at most ${MAX_URL} characters`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || isHttpUrl(v), "The manual link must start with http:// or https://"),
  notes: z
    .string()
    .max(MAX_NOTES, `Notes can be at most ${MAX_NOTES.toLocaleString("en-US")} characters`)
    .nullish()
    .transform(blankToNull),
});

export type MaintenanceItemFields = z.input<typeof maintenanceItemSchema>;

/** The date `months` after `date`, on the same day of the month (or the month's last day when it is shorter). */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export type ServiceStatus = { text: string; overdue: boolean };

/**
 * Where an item stands on its service schedule, or null when it has none. Next service is the last service plus the
 * interval; an item with a schedule but no recorded service just says so (it can't be called overdue).
 */
export function serviceStatus(item: { serviceEveryMonths: number | null; lastServicedOn: string | null }, today: string): ServiceStatus | null {
  if (item.serviceEveryMonths === null) return null;
  if (item.lastServicedOn === null) return { text: "No service recorded yet", overdue: false };
  const due = addMonthsToDate(item.lastServicedOn, item.serviceEveryMonths);
  return due < today
    ? { text: `Service was due ${formatCalendarDate(due)}`, overdue: true }
    : { text: `Next service ${formatCalendarDate(due)}`, overdue: false };
}

/** Age in whole years by calendar year (an item installed in 2006 is 20 in 2026), or null when the year isn't known. */
export function ageYears(installedYear: number | null, today: string): number | null {
  return installedYear === null ? null : Math.max(0, Number(today.slice(0, 4)) - installedYear);
}

export function ageLabel(age: number | null): string | null {
  if (age === null) return null;
  if (age === 0) return "Installed this year";
  return age === 1 ? "1 year old" : `${age} years old`;
}
