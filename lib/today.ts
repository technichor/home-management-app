import { cookies } from "next/headers";
import { utcDateString } from "@/lib/dates";
import { TIME_ZONE_COOKIE } from "@/lib/timeZoneCookie";

// "Today" is the date on the family's own device, not the server's (it runs in UTC, so in the evening it would be a
// day ahead). The browser keeps its time zone in a cookie (lib/timeZoneCookie.ts) and pages work the date out from it,
// so it never has to be in the URL.

/** The date in a time zone (YYYY-MM-DD), or null if the zone isn't one this server knows. */
export function dateInTimeZone(timeZone: string, now: Date = new Date()): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return null;
  }
}

/** The date and the minutes past midnight in a time zone, or null if the zone isn't one this server knows. */
export function clockInTimeZone(timeZone: string, now: Date = new Date()): { date: string; minutes: number } | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

/** Today and the time of day on the visitor's device, from their time zone cookie; null before the browser has set it. */
export async function pageClock(): Promise<{ date: string; minutes: number } | null> {
  const zone = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  return zone ? clockInTimeZone(zone) : null;
}

/** Today on the visitor's device, from their time zone cookie; null before the browser has set it (a first visit). */
export async function pageToday(): Promise<string | null> {
  return (await pageClock())?.date ?? null;
}

/** Today on the visitor's device, or the server's UTC date before the browser has said (pages that needn't wait). */
export async function pageTodayOrUtc(): Promise<string> {
  return (await pageToday()) ?? utcDateString();
}
