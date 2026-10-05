"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { localDateString } from "@/lib/dates";

/**
 * The server runs in UTC, so it can't know the user's "today" (in the evening it would be a day ahead).
 * This puts the browser's local date in the URL as ?today=YYYY-MM-DD and keeps it current; the page reads
 * it with `dateOr(searchParams.today, utcDateString())`. Renders nothing.
 */
export default function LocalToday() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("today");

  useEffect(() => {
    const today = localDateString();
    if (current === today) return;
    const next = new URLSearchParams(params.toString());
    next.set("today", today);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [current, params, pathname, router]);

  return null;
}
