import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const jar = vi.hoisted(() => ({ tz: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tz" && jar.tz !== undefined ? { value: jar.tz } : undefined) }),
}));

import { dateInTimeZone, pageToday, pageTodayOrUtc } from "@/lib/today";
import { TIME_ZONE_COOKIE, TIME_ZONE_SCRIPT, timeZoneCookie } from "@/lib/timeZoneCookie";

// 03:30 UTC on Oct 8 is still the evening of Oct 7 in Chicago, and already Oct 8 in Tokyo.
const NOW = new Date("2026-10-08T03:30:00Z");

beforeEach(() => {
  jar.tz = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("dateInTimeZone", () => {
  it("gives the date in the zone, not the server's UTC date", () => {
    expect(dateInTimeZone("America/Chicago", NOW)).toBe("2026-10-07");
    expect(dateInTimeZone("Asia/Tokyo", NOW)).toBe("2026-10-08");
    expect(dateInTimeZone("UTC")).toBe("2026-10-08");
  });

  it("is null for a zone it doesn't know", () => {
    expect(dateInTimeZone("Mars/Base", NOW)).toBeNull();
  });
});

describe("pageToday", () => {
  it("is the date in the browser's time zone, from its cookie", async () => {
    jar.tz = "America/Chicago";
    expect(await pageToday()).toBe("2026-10-07");
    expect(await pageTodayOrUtc()).toBe("2026-10-07");
  });

  it("is unknown before the browser has said (or if it said nonsense)", async () => {
    expect(await pageToday()).toBeNull();
    jar.tz = "Mars/Base";
    expect(await pageToday()).toBeNull();
    jar.tz = "";
    expect(await pageToday()).toBeNull();
  });

  it("falls back to the server's UTC date where a page needn't wait", async () => {
    expect(await pageTodayOrUtc()).toBe("2026-10-08");
  });
});

describe("the time zone cookie", () => {
  it("is set site-wide for a year, its value escaped", () => {
    expect(TIME_ZONE_COOKIE).toBe("tz");
    expect(timeZoneCookie("America/Argentina/Buenos_Aires")).toBe("tz=America%2FArgentina%2FBuenos_Aires; path=/; max-age=31536000; samesite=lax");
  });

  it("is set before paint from the browser's own zone", () => {
    const doc = { cookie: "" };
    new Function("document", TIME_ZONE_SCRIPT)(doc);
    expect(doc.cookie).toBe(timeZoneCookie(Intl.DateTimeFormat().resolvedOptions().timeZone));
  });
});
