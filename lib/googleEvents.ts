import { prisma } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { calendarName } from "@/lib/contactDates";
import { calendarApi, GoogleError } from "@/lib/google";
import type { AgendaGoogleEntry } from "@/lib/agendaOrder";

// Members' shared Google calendars, shown read-only on the household calendar (docs/domains/google-calendar.md).

/** Google's answer for a calendar and window is reused this long (the calendar page looks again every 30 seconds). */
export const GOOGLE_CACHE_MS = 60_000;

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const cache = new Map<string, { at: number; events: GoogleEvent[] }>();

/** Forget cached answers (after Domata changes Google, and in tests). */
export function clearGoogleEventCache() {
  cache.clear();
}

/** A moment (RFC 3339 with offset) as the wall-clock date and time in a time zone. */
export function wallClock(moment: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(moment))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * One Google event as calendar entries in the range: an all-day one on each of its days (Google's end date is the day
 * after), a timed one on the day it starts in the household's time zone, ending at its end time that day (or the end
 * of the day if it runs past midnight). Cancelled ones are left out.
 */
export function entriesOf(
  event: GoogleEvent,
  source: { calendarName: string; color: string | null; ownerName: string; ownerContactId: string | null },
  range: { start: string; end: string },
  timeZone: string,
): AgendaGoogleEntry[] {
  if (event.status === "cancelled" || !event.start) return [];
  const base = {
    source: "google" as const,
    googleId: event.iCalUID ?? event.id,
    title: event.summary?.trim() || "(No title)",
    link: event.htmlLink ?? null,
    calendarName: source.calendarName,
    color: source.color,
    ownerName: source.ownerName,
    ownerContactId: source.ownerContactId,
    editable: false as const,
  };
  if (event.start.date) {
    const last = event.end?.date ? addDays(event.end.date, -1) : event.start.date;
    const entries: AgendaGoogleEntry[] = [];
    for (let d = event.start.date; d <= last; d = addDays(d, 1)) {
      if (d >= range.start && d <= range.end) entries.push({ ...base, id: `g:${base.googleId}:${d}`, date: d, startTime: null, endTime: null });
    }
    return entries;
  }
  const start = wallClock(event.start.dateTime!, timeZone);
  if (start.date < range.start || start.date > range.end) return [];
  const end = event.end?.dateTime ? wallClock(event.end.dateTime, timeZone) : null;
  const endTime = end && end.date === start.date && end.time > start.time ? end.time : end && end.date > start.date ? "23:59" : null;
  return [{ ...base, id: `g:${base.googleId}:${start.date}`, date: start.date, startTime: start.time, endTime }];
}

async function eventsOf(userId: string, calendarId: string, timeMin: string, timeMax: string, timeZone: string): Promise<GoogleEvent[]> {
  const key = `${userId}|${calendarId}|${timeMin}|${timeMax}|${timeZone}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < GOOGLE_CACHE_MS) return hit.events;
  const params = new URLSearchParams({ timeMin, timeMax, timeZone, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const answer = await calendarApi<{ items?: GoogleEvent[] }>(userId, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  const events = answer.items ?? [];
  cache.set(key, { at: Date.now(), events });
  return events;
}

export type GoogleAgenda = {
  entries: AgendaGoogleEntry[];
  /** Calendars that couldn't be read, as "Sam's Work"; the rest still show. */
  problems: string[];
};

/**
 * The household members' shared Google calendars between two dates (inclusive), as calendar entries. Events Domata
 * made itself (and attendees' copies of them) are left out, since they are already on the calendar as Domata's own; an
 * event in several members' calendars shows once.
 */
export async function googleAgenda(householdId: string, range: { start: string; end: string }, timeZone: string): Promise<GoogleAgenda> {
  const [calendars, made] = await Promise.all([
    prisma.googleSharedCalendar.findMany({
      where: { connection: { needsReconnect: false, user: { householdId } } },
      include: { connection: { select: { user: { select: { firstName: true, contactId: true, contact: { select: { firstName: true, nickname: true } } } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.calendarItem.findMany({ where: { householdId, googleEventId: { not: null } }, select: { googleEventId: true } }),
  ]);
  if (calendars.length === 0) return { entries: [], problems: [] };
  const ours = new Set(made.map((m) => m.googleEventId));
  // A day either side, in UTC: entries are then cut to the range in the household's own time zone.
  const timeMin = `${addDays(range.start, -1)}T00:00:00Z`;
  const timeMax = `${addDays(range.end, 2)}T00:00:00Z`;

  const results = await Promise.all(
    calendars.map(async (c) => {
      const user = c.connection.user;
      const ownerName = user.contact ? calendarName(user.contact) : user.firstName;
      try {
        const events = await eventsOf(c.userId, c.calendarId, timeMin, timeMax, timeZone);
        return events
          .filter((e) => !ours.has(e.id) && !e.extendedProperties?.private?.domataItemId)
          .flatMap((e) => entriesOf(e, { calendarName: c.name, color: c.color, ownerName, ownerContactId: user.contactId }, range, timeZone));
      } catch (e) {
        if (e instanceof GoogleError) return `${ownerName}'s ${c.name}`;
        throw e;
      }
    }),
  );
  const seen = new Set<string>();
  const entries: AgendaGoogleEntry[] = [];
  const problems: string[] = [];
  for (const r of results) {
    if (typeof r === "string") problems.push(r);
    else
      for (const entry of r) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        entries.push(entry);
      }
  }
  return { entries, problems };
}
