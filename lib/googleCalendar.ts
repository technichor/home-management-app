import { prisma } from "@/lib/db";
import { GoogleError, googleConfigured, listGoogleCalendars, type GoogleCalendarSummary } from "@/lib/google";

// The household side of the Google Calendar integration (docs/domains/google-calendar.md): what each member links and
// shares, and the household's Google calendar that Domata's events go to.

export type GoogleAccountView = {
  /** False until the Google Cloud client and the token key are set (then there is nothing to connect to). */
  configured: boolean;
  connection: { email: string; needsReconnect: boolean } | null;
  /** The member's Google calendars, or null if they couldn't be read (the link needs renewing, or Google failed). */
  calendars: GoogleCalendarSummary[] | null;
  /** Ids of the calendars they show on the household calendar. */
  shared: string[];
};

/** What the Account page shows about a member's Google link. Reads their calendar list from Google live. */
export async function googleAccountView(userId: string): Promise<GoogleAccountView> {
  const configured = googleConfigured();
  const connection = configured ? await prisma.googleConnection.findUnique({ where: { userId }, include: { sharedCalendars: true } }) : null;
  if (!connection) return { configured, connection: null, calendars: null, shared: [] };
  let calendars: GoogleCalendarSummary[] | null = null;
  try {
    calendars = await listGoogleCalendars(userId);
  } catch (e) {
    if (!(e instanceof GoogleError)) throw e;
  }
  // Reading the list renews the access token if needed; a refused renewal marks the link as needing reconnecting.
  const needsReconnect = calendars === null && ((await prisma.googleConnection.findUnique({ where: { userId } }))?.needsReconnect ?? true);
  return {
    configured,
    connection: { email: connection.googleEmail, needsReconnect },
    calendars,
    shared: connection.sharedCalendars.map((c) => c.calendarId),
  };
}

export type HouseholdGoogleView = {
  configured: boolean;
  timeZone: string;
  /** The household's Google calendar, whose account it is in, and whether that is the viewer. */
  calendar: { name: string; ownerEmail: string | null; mine: boolean; needsReconnect: boolean } | null;
  /** The viewer's own Google calendars they can add events to (to choose one), or null if they haven't linked Google. */
  myWritable: GoogleCalendarSummary[] | null;
};

/** What the Household page shows about the household's Google calendar. */
export async function householdGoogleView(householdId: string, userId: string): Promise<HouseholdGoogleView> {
  const configured = googleConfigured();
  const settings = await prisma.calendarSettings.findUnique({ where: { householdId } });
  const timeZone = settings?.timeZone ?? "America/Chicago";
  if (!configured) return { configured, timeZone, calendar: null, myWritable: null };

  const owner = settings?.googleCalendarUserId ? await prisma.googleConnection.findUnique({ where: { userId: settings.googleCalendarUserId } }) : null;
  const calendar = settings?.googleCalendarId
    ? {
        name: settings.googleCalendarName ?? settings.googleCalendarId,
        ownerEmail: owner?.googleEmail ?? null,
        mine: settings.googleCalendarUserId === userId,
        needsReconnect: !owner || owner.needsReconnect,
      }
    : null;

  let myWritable: GoogleCalendarSummary[] | null = null;
  if (await prisma.googleConnection.findUnique({ where: { userId } })) {
    try {
      myWritable = (await listGoogleCalendars(userId)).filter((c) => c.canWrite);
    } catch (e) {
      if (!(e instanceof GoogleError)) throw e;
    }
  }
  return { configured, timeZone, calendar, myWritable };
}

/** Every IANA time zone this server knows, for choosing the household's. */
export const TIME_ZONES: readonly string[] = Intl.supportedValuesOf("timeZone");

export const isTimeZone = (value: unknown): value is string => typeof value === "string" && TIME_ZONES.includes(value);
