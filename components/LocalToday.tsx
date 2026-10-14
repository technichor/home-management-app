"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { localDateString } from "@/lib/dates";
import { timeZoneCookie } from "@/lib/timeZoneCookie";

/**
 * Makes sure the page was drawn for the browser's own today (lib/today.ts). If the server didn't know it yet (no time
 * zone cookie: `today` is null) or it has moved on (the page was left open past midnight, or the device changed time
 * zone), this saves the browser's time zone and asks for the page again. Renders nothing.
 */
export default function LocalToday({ today }: { today: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (today === localDateString()) return;
    document.cookie = timeZoneCookie(Intl.DateTimeFormat().resolvedOptions().timeZone);
    router.refresh();
  }, [today, router]);

  return null;
}
