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

/** Today on the visitor's device, from their time zone cookie; null before the browser has set it (a first visit). */
export async function pageToday(): Promise<string | null> {
  const zone = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  return zone ? dateInTimeZone(zone) : null;
}

/** Today on the visitor's device, or the server's UTC date before the browser has said (pages that needn't wait). */
export async function pageTodayOrUtc(): Promise<string> {
  return (await pageToday()) ?? utcDateString();
}
