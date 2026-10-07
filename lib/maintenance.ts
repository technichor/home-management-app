import { z } from "zod";
import type { MaintenanceCategory, MaintenanceItem } from "@prisma/client";
import { addMonthsKeepingDay, dateToString, formatCalendarDate } from "@/lib/dates";
import { optionalDate, optionalHttpUrl, optionalNotes, optionalText } from "@/lib/formFields";

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

export const maintenanceItemSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(MAX_FIELD, `The name can be at most ${MAX_FIELD} characters`),
  category: z.enum(MAINTENANCE_CATEGORIES as [MaintenanceCategory, ...MaintenanceCategory[]], "Choose a category"),
  location: optionalText("The location", MAX_FIELD),
  brand: optionalText("The brand", MAX_FIELD),
  modelNumber: optionalText("The model number", MAX_FIELD),
  serialNumber: optionalText("The serial number", MAX_FIELD),
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
  manualUrl: optionalHttpUrl("The manual link", MAX_URL),
  notes: optionalNotes(MAX_NOTES),
});

export type MaintenanceItemFields = z.input<typeof maintenanceItemSchema>;

export type ServiceStatus = { text: string; overdue: boolean };

/** When the next service is due (last service + the interval), or null without a schedule or a recorded service. */
export function nextServiceDue(item: { serviceEveryMonths: number | null; lastServicedOn: string | null }): string | null {
  if (item.serviceEveryMonths === null || item.lastServicedOn === null) return null;
  return addMonthsKeepingDay(item.lastServicedOn, item.serviceEveryMonths);
}

/**
 * Where an item stands on its service schedule, or null when it has none. Next service is the last service plus the
 * interval; an item with a schedule but no recorded service just says so (it can't be called overdue).
 */
export function serviceStatus(item: { serviceEveryMonths: number | null; lastServicedOn: string | null }, today: string): ServiceStatus | null {
  if (item.serviceEveryMonths === null) return null;
  const due = nextServiceDue(item);
  if (due === null) return { text: "No service recorded yet", overdue: false };
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

/** A stored item as the pages hand it to the browser: dates as plain YYYY-MM-DD strings. */
export function toMaintenanceView(item: MaintenanceItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    location: item.location,
    brand: item.brand,
    modelNumber: item.modelNumber,
    serialNumber: item.serialNumber,
    installedYear: item.installedYear,
    warrantyUntil: item.warrantyUntil ? dateToString(item.warrantyUntil) : null,
    serviceEveryMonths: item.serviceEveryMonths,
    lastServicedOn: item.lastServicedOn ? dateToString(item.lastServicedOn) : null,
    manualUrl: item.manualUrl,
    notes: item.notes,
  };
}

export type MaintenanceView = ReturnType<typeof toMaintenanceView>;
