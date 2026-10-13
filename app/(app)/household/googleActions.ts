"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { calendarApi, GoogleError, googleConfigured, listGoogleCalendars } from "@/lib/google";
import { isTimeZone } from "@/lib/googleCalendar";
import { getCalendarSettings } from "@/lib/calendarItem";

// The household's Google calendar and time zone (Household page; owners only). Server actions are public endpoints.

function refresh() {
  revalidatePath("/household");
  revalidatePath("/calendar");
}

const asUserError = (e: unknown): never => {
  if (e instanceof GoogleError) throw new UserError(e.needsReconnect ? "Connect Google again first (on your Account page)" : e.message);
  throw e;
};

/**
 * Choose where Domata's events go in Google: one of the owner's own calendars they can add events to, or "new" for a
 * new calendar named after the household (in the household's time zone). Events are then created as the owner.
 */
export async function setHouseholdGoogleCalendarAction(choice: string) {
  const owner = await requireOwner();
  return attempt(async () => {
    if (!googleConfigured()) throw new UserError("Google isn't set up for Domata yet");
    if (typeof choice !== "string" || !choice) throw new UserError("Choose a calendar");
    const settings = await getCalendarSettings(owner.householdId);
    let calendar: { id: string; name: string };
    if (choice === "new") {
      const name = `Domata · ${owner.household.displayName}`;
      const created = await calendarApi<{ id: string }>(owner.id, "/calendars", { method: "POST", body: { summary: name, timeZone: settings.timeZone } }).catch(asUserError);
      calendar = { id: created.id, name };
    } else {
      const mine = await listGoogleCalendars(owner.id).catch(asUserError);
      const found = mine.find((c) => c.id === choice && c.canWrite);
      if (!found) throw new UserError("Choose one of your Google calendars that you can add events to");
      calendar = { id: found.id, name: found.name };
    }
    await prisma.calendarSettings.update({
      where: { householdId: owner.householdId },
      data: { googleCalendarId: calendar.id, googleCalendarName: calendar.name, googleCalendarUserId: owner.id },
    });
    refresh();
  });
}

/** Stop sending Domata's events to Google (events already there stay). */
export async function stopHouseholdGoogleCalendarAction() {
  const owner = await requireOwner();
  return attempt(async () => {
    await prisma.calendarSettings.updateMany({
      where: { householdId: owner.householdId },
      data: { googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null },
    });
    refresh();
  });
}

/** The household's time zone, which Domata's wall-clock times are in when they go to Google. */
export async function setHouseholdTimeZoneAction(timeZone: string) {
  const owner = await requireOwner();
  return attempt(async () => {
    if (!isTimeZone(timeZone)) throw new UserError("Choose a time zone from the list");
    await getCalendarSettings(owner.householdId);
    await prisma.calendarSettings.update({ where: { householdId: owner.householdId }, data: { timeZone } });
    refresh();
  });
}
