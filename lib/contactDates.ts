import type { DateRange } from "@/lib/dates";
import { daysInMonth } from "@/lib/birthday";

/** The part of a contact the calendar needs: who they are, their birthday, and their two important-date slots. */
export type ContactForDates = {
  id: string;
  firstName: string;
  nickname: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  birthdayYear: number | null;
  importantDate1: string | null;
  importantDate1Label: string | null;
  importantDate2: string | null;
  importantDate2Label: string | null;
};

export type ContactDateOccurrence = {
  contactId: string;
  date: string;
  type: "birthday" | "important";
  title: string;
  /** The age being turned, only for a birthday with a known year. */
  turns: number | null;
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The name a contact goes by on the calendar: their nickname if they have one, else their first name. */
export const calendarName = (c: Pick<ContactForDates, "firstName" | "nickname">) => c.nickname?.trim() || c.firstName;

/** The date a yearly month/day falls on in a year. Feb 29 falls on Feb 28 in a year that has no Feb 29. */
export function occurrenceIn(year: number, month: number, day: number): string {
  const real = month === 2 && day === 29 && daysInMonth(2, year) === 28 ? 28 : day;
  return `${pad(year, 4)}-${pad(month)}-${pad(real)}`;
}

/** "Jo: Anniversary", the bare label when it already names the person, or "Jo: Important date" for a blank label. */
export function importantDateTitle(name: string, label: string | null): string {
  const text = label?.trim();
  if (!text) return `${name}: Important date`;
  return text.toLowerCase().includes(name.toLowerCase()) ? text : `${name}: ${text}`;
}

/** An important date as stored ("YYYY-MM-DD", the year ignored): its month and day, or null if it isn't a real date. */
function monthDayOf(raw: string | null): { month: number; day: number } | null {
  const m = raw ? /^\d{4}-(\d{2})-(\d{2})$/.exec(raw) : null;
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, null) ? { month, day } : null;
}

/**
 * Every birthday and important date of these contacts that falls inside the range, derived fresh each time (nothing is
 * stored): they repeat every year on their month and day, so a range crossing New Year picks up both years. The caller
 * passes only the household's active contacts. Results are not ordered (see orderAgenda).
 */
export function contactDateOccurrences(contacts: ContactForDates[], range: DateRange): ContactDateOccurrence[] {
  const firstYear = Number(range.start.slice(0, 4));
  const lastYear = Number(range.end.slice(0, 4));
  const found: ContactDateOccurrence[] = [];

  for (const c of contacts) {
    const name = calendarName(c);
    const specs: { month: number; day: number; type: "birthday" | "important"; title: string; birthYear: number | null }[] = [];
    if (c.birthdayMonth !== null && c.birthdayDay !== null) {
      specs.push({ month: c.birthdayMonth, day: c.birthdayDay, type: "birthday", title: `${name}'s birthday`, birthYear: c.birthdayYear });
    }
    for (const [raw, label] of [[c.importantDate1, c.importantDate1Label], [c.importantDate2, c.importantDate2Label]] as const) {
      const md = monthDayOf(raw);
      if (md) specs.push({ ...md, type: "important", title: importantDateTitle(name, label), birthYear: null });
    }

    for (const spec of specs) {
      for (let year = firstYear; year <= lastYear; year++) {
        const date = occurrenceIn(year, spec.month, spec.day);
        if (date < range.start || date > range.end) continue;
        const age = spec.birthYear === null ? 0 : year - spec.birthYear;
        found.push({ contactId: c.id, date, type: spec.type, title: spec.title, turns: age >= 1 ? age : null });
      }
    }
  }
  return found;
}
