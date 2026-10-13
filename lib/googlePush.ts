import type { CalendarItem, RepeatUnit } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, dateToString } from "@/lib/dates";
import { DEFAULT_BLOCK_MINUTES, hhmm, minutesOf } from "@/lib/calendarLayout";
import { calendarApi, GoogleError } from "@/lib/google";
import { clearGoogleEventCache } from "@/lib/googleEvents";

// Domata's events into the household's Google calendar (docs/domains/google-calendar.md). Domata is the source: each
// save sends the whole event (Google-side edits are overwritten), and a delete or unticking "Create Google Calendar
// event" removes it from Google. Calls are made as the owner who chose the calendar; attendees get Google's invites.
// A failure never stops the save in Domata: it is kept on the item (googleSyncError) and shown on it.

const FREQ: Record<RepeatUnit, string> = { DAY: "DAILY", WEEK: "WEEKLY", MONTH: "MONTHLY", YEAR: "YEARLY" };

type Settings = { googleCalendarId: string; googleCalendarUserId: string; timeZone: string };

/** The household's Google calendar settings, or null when events aren't going to Google. */
async function googleTarget(householdId: string): Promise<Settings | null> {
  const s = await prisma.calendarSettings.findUnique({ where: { householdId } });
  return s?.googleCalendarId && s.googleCalendarUserId
    ? { googleCalendarId: s.googleCalendarId, googleCalendarUserId: s.googleCalendarUserId, timeZone: s.timeZone }
    : null;
}

/**
 * Who to invite: the member it's for, or every member for a whole-household event (not the calendar's owner, whose
 * calendar it is). A member's Google address if they linked Google, else the email they sign in with.
 */
async function attendeesFor(householdId: string, assigneeContactId: string | null, organizerUserId: string): Promise<{ email: string }[]> {
  const members = await prisma.user.findMany({
    where: { householdId, ...(assigneeContactId && { contactId: assigneeContactId }) },
    select: { id: true, email: true, googleConnection: { select: { googleEmail: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.filter((m) => m.id !== organizerUserId).map((m) => ({ email: m.googleConnection?.googleEmail ?? m.email }));
}

/** The event as Google wants it: all-day without a time, else times in the household's zone (half an hour without an end). */
export function googleEventBody(item: CalendarItem, timeZone: string, attendees: { email: string }[]) {
  const date = dateToString(item.date);
  const timing = item.startTime
    ? {
        start: { dateTime: `${date}T${item.startTime}:00`, timeZone },
        end: { dateTime: `${date}T${item.endTime ?? hhmm(Math.min(minutesOf(item.startTime) + DEFAULT_BLOCK_MINUTES, 23 * 60 + 59))}:00`, timeZone },
      }
    : { start: { date }, end: { date: addDays(date, 1) } };
  const until = item.repeatUntil ? dateToString(item.repeatUntil).replace(/-/g, "") : null;
  return {
    summary: item.title,
    description: [item.notes, "Made in Domata."].filter(Boolean).join("\n\n"),
    ...timing,
    ...(item.repeatUnit && {
      recurrence: [`RRULE:FREQ=${FREQ[item.repeatUnit]};INTERVAL=${item.repeatEvery}${until ? `;UNTIL=${until}${item.startTime ? "T235959Z" : ""}` : ""}`],
    }),
    attendees,
    extendedProperties: { private: { domataItemId: item.id } },
  };
}

const eventPath = (calendarId: string, eventId?: string) =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}?sendUpdates=all`;

const gone = (e: unknown) => e instanceof GoogleError && /\((404|410)\)$/.test(e.message);

/**
 * Bring an item's Google event in line with it: create or replace it when the household has a Google calendar and the
 * item is ticked for Google; remove it when unticked. Records the event id, or the error.
 */
export async function syncItemToGoogle(itemId: string): Promise<void> {
  const item = await prisma.calendarItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const target = await googleTarget(item.householdId);
  if (!target) return;
  try {
    if (!item.toGoogle) {
      if (item.googleEventId) await removeEvent(target, item.googleEventId);
      await prisma.calendarItem.update({ where: { id: item.id }, data: { googleEventId: null, googleSyncError: null } });
      return;
    }
    const body = googleEventBody(item, target.timeZone, await attendeesFor(item.householdId, item.assigneeContactId, target.googleCalendarUserId));
    let event: { id: string } | null = null;
    if (item.googleEventId) {
      try {
        event = await calendarApi<{ id: string }>(target.googleCalendarUserId, eventPath(target.googleCalendarId, item.googleEventId), { method: "PUT", body });
      } catch (e) {
        if (!gone(e)) throw e; // deleted in Google, or the household chose another calendar: make it again
      }
    }
    event ??= await calendarApi<{ id: string }>(target.googleCalendarUserId, eventPath(target.googleCalendarId), { method: "POST", body });
    await prisma.calendarItem.update({ where: { id: item.id }, data: { googleEventId: event.id, googleSyncError: null } });
  } catch (e) {
    if (!(e instanceof GoogleError)) throw e;
    await prisma.calendarItem.update({ where: { id: item.id }, data: { googleSyncError: e.message.slice(0, 300) } });
  } finally {
    clearGoogleEventCache();
  }
}

async function removeEvent(target: Settings, eventId: string) {
  try {
    await calendarApi(target.googleCalendarUserId, eventPath(target.googleCalendarId, eventId), { method: "DELETE" });
  } catch (e) {
    if (!gone(e)) throw e; // already gone is fine
  }
}

/** Before an item is deleted from Domata: remove its Google event (best effort; a failure doesn't stop the delete). */
export async function removeItemFromGoogle(item: Pick<CalendarItem, "householdId" | "googleEventId">): Promise<void> {
  if (!item.googleEventId) return;
  const target = await googleTarget(item.householdId);
  if (!target) return;
  try {
    await removeEvent(target, item.googleEventId);
  } catch (e) {
    if (!(e instanceof GoogleError)) throw e;
  } finally {
    clearGoogleEventCache();
  }
}
