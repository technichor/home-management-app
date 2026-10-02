const DAY_MS = 24 * 60 * 60 * 1000;

type DateContact = {
  id: string;
  firstName: string;
  lastName: string;
  importantDate1: string | null;
  importantDate1Label: string | null;
  importantDate2: string | null;
  importantDate2Label: string | null;
};

export type UpcomingDate = {
  contactId: string;
  name: string;
  label: string;
  /** The next time it falls, as YYYY-MM-DD. */
  next: string;
  daysUntil: number;
};

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** A day that repeats every year (month, day), as a UTC timestamp in the given year. Feb 29 falls on Feb 28 in other years. */
function inYear(year: number, month: number, day: number): number {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return Date.UTC(year, month - 1, d);
}

/**
 * Contacts' important dates (birthdays, anniversaries...) that come round within the next
 * `withinDays` days, soonest first. The year a date was stored with doesn't matter: they repeat
 * yearly. Everything is judged in UTC.
 */
export function upcomingDates(contacts: DateContact[], now: Date, withinDays = 30): UpcomingDate[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const found: UpcomingDate[] = [];

  for (const c of contacts) {
    const slots = [
      [c.importantDate1, c.importantDate1Label],
      [c.importantDate2, c.importantDate2Label],
    ] as const;
    for (const [raw, label] of slots) {
      const match = raw?.match(/^\d{4}-(\d{2})-(\d{2})$/);
      if (!match) continue;
      const month = Number(match[1]);
      const day = Number(match[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;

      let year = now.getUTCFullYear();
      let next = inYear(year, month, day);
      if (next < today) next = inYear(++year, month, day);
      const daysUntil = Math.round((next - today) / DAY_MS);
      if (daysUntil > withinDays) continue;
      found.push({
        contactId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        label: label || "Important date",
        next: new Date(next).toISOString().slice(0, 10),
        daysUntil,
      });
    }
  }
  return found.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}

export function inDays(days: number): string {
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}
