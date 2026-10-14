// The browser's time zone, kept in a cookie so the server can work out the family's "today" (lib/today.ts). Set
// before first paint on every page load by TIME_ZONE_SCRIPT (root layout), so it follows a device that travels, and
// by components/LocalToday.tsx on a first visit.

export const TIME_ZONE_COOKIE = "tz";

/** The cookie as document.cookie wants it, for a time zone. */
export const timeZoneCookie = (timeZone: string) => `${TIME_ZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`;

export const TIME_ZONE_SCRIPT = `(function(){try{document.cookie="${TIME_ZONE_COOKIE}="+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+"; path=/; max-age=31536000; samesite=lax"}catch(e){}})()`;
