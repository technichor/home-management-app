"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { attempt, UserError } from "@/lib/actionResult";
import { disconnectGoogle, GoogleError, listGoogleCalendars } from "@/lib/google";

// A member's own Google link (Account page). Server actions are public endpoints: each acts only for the signed-in user.

function refresh() {
  revalidatePath("/account");
  revalidatePath("/calendar");
  revalidatePath("/household");
}

/**
 * Which of the member's Google calendars the household sees. Every id must be one of their calendars as Google lists it
 * now (names and colours are copied from there); the rest stop being shown.
 */
export async function setSharedCalendarsAction(calendarIds: string[]) {
  const user = await requireMember();
  return attempt(async () => {
    if (!Array.isArray(calendarIds) || calendarIds.some((id) => typeof id !== "string")) throw new UserError("Choose calendars from the list");
    let calendars;
    try {
      calendars = await listGoogleCalendars(user.id);
    } catch (e) {
      if (e instanceof GoogleError) throw new UserError(e.needsReconnect ? "Connect Google again first" : e.message);
      throw e;
    }
    const chosen = calendars.filter((c) => calendarIds.includes(c.id));
    if (chosen.length !== new Set(calendarIds).size) throw new UserError("Choose calendars from the list");
    await prisma.$transaction([
      prisma.googleSharedCalendar.deleteMany({ where: { userId: user.id } }),
      prisma.googleSharedCalendar.createMany({ data: chosen.map((c) => ({ userId: user.id, calendarId: c.id, name: c.name, color: c.color })) }),
    ]);
    refresh();
  });
}

/**
 * Unlink the member's Google account (Google is asked to revoke Domata's access). If the household's Google calendar
 * was in their account, Domata stops sending events there until an owner chooses another.
 */
export async function disconnectGoogleAction() {
  const user = await requireMember();
  return attempt(async () => {
    await disconnectGoogle(user.id);
    await prisma.calendarSettings.updateMany({
      where: { googleCalendarUserId: user.id },
      data: { googleCalendarId: null, googleCalendarName: null, googleCalendarUserId: null },
    });
    refresh();
  });
}
