import { addDays, utcDateString } from "@/lib/dates";

/** A contact's birthday: month and day, and the year if it's known. */
export type Birthday = { month: number; day: number; year: number | null };

/** The three stored columns; null when there is no birthday (or no year). */
export type BirthdayParts = { birthdayMonth: number | null; birthdayDay: number | null; birthdayYear: number | null };

export const MIN_BIRTH_YEAR = 1900;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Days in a month. With no year, February has 29 (a Feb 29 birthday is allowed). */
export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * What is wrong with a birthday, in plain words, or null if it is fine. All three parts are empty, or month and day
 * are both set (year optional). A year must be from 1900 to the current year, Feb 29 needs a leap year, and the full
 * date can't be in the future. (`today` is only for tests; a day's tolerance covers people ahead of UTC.)
 */
export function birthdayProblem(
  parts: { month?: number | null; day?: number | null; year?: number | null },
  today: string = utcDateString()
): string | null {
  const { month = null, day = null, year = null } = parts;
  if (month === null && day === null && year === null) return null;
  if (month === null || day === null) return "Enter both a month and a day for the birthday";
  if (!Number.isInteger(month) || month < 1 || month > 12) return "The birthday month must be from 1 to 12";
  if (!Number.isInteger(day) || day < 1 || day > 31) return "The birthday day must be from 1 to 31";
  if (day > daysInMonth(month, null)) return `${MONTH_NAMES[month - 1]} doesn't have ${day} days`;
  if (year === null) return null;

  const thisYear = Number(today.slice(0, 4));
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > thisYear) {
    return `The birth year must be from ${MIN_BIRTH_YEAR} to ${thisYear}`;
  }
  // Only February differs by year (every other month was checked above).
  if (day > daysInMonth(month, year)) return `${year} isn't a leap year, so February doesn't have ${day} days`;
  if (`${year}-${pad(month)}-${pad(day)}` > addDays(today, 1)) return "The birthday can't be in the future";
  return null;
}

export type BirthdayCell = { ok: true; value: Birthday | null } | { ok: false; error: string };

const FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHORT = /^(\d{2})-(\d{2})$/;

/** A CSV birthday cell: "YYYY-MM-DD" (with the year), "MM-DD" (without), or blank (no birthday). */
export function parseBirthdayCell(raw: string, today: string = utcDateString()): BirthdayCell {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  const full = FULL.exec(text);
  const short = full ? null : SHORT.exec(text);
  if (!full && !short) {
    return { ok: false, error: `birthday "${text}" isn't in a recognised format. Use YYYY-MM-DD (like 1985-03-04) or MM-DD (like 03-04)` };
  }
  const year = full ? Number(full[1]) : null;
  const month = Number(full ? full[2] : short![1]);
  const day = Number(full ? full[3] : short![2]);
  const problem = birthdayProblem({ month, day, year }, today);
  return problem ? { ok: false, error: `birthday "${text}" is not valid: ${problem}` } : { ok: true, value: { month, day, year } };
}

/** The CSV form of a stored birthday: "1985-03-04", "03-04", or "". */
export function birthdayToCell(parts: Partial<BirthdayParts>): string {
  const { birthdayMonth: m, birthdayDay: d, birthdayYear: y } = parts;
  if (m == null || d == null) return "";
  return y != null ? `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}` : `${pad(m)}-${pad(d)}`;
}

/** How a birthday reads on screen: "March 4" or "March 4, 1985"; null when there is none. */
export function formatBirthday(parts: Partial<BirthdayParts>): string | null {
  const { birthdayMonth: m, birthdayDay: d, birthdayYear: y } = parts;
  if (m == null || d == null) return null;
  return `${MONTH_NAMES[m - 1]} ${d}${y != null ? `, ${y}` : ""}`;
}

const same = (a: Partial<BirthdayParts>, b: Partial<BirthdayParts>) =>
  (a.birthdayMonth ?? null) === (b.birthdayMonth ?? null) &&
  (a.birthdayDay ?? null) === (b.birthdayDay ?? null) &&
  (a.birthdayYear ?? null) === (b.birthdayYear ?? null);

/**
 * Whether an import changes a contact's birthday. `after` parts of undefined mean the file had no birthday column,
 * so nothing is being asked of the birthday: it is left as it is.
 */
export function birthdayWouldChange(before: Partial<BirthdayParts>, after: { birthdayMonth?: number | null; birthdayDay?: number | null; birthdayYear?: number | null }): boolean {
  if (after.birthdayMonth === undefined) return false;
  return !same(before, after);
}

/** The import diff's plain-language note for one contact's birthday, or null if it doesn't change. */
export function describeBirthdayChange(before: Partial<BirthdayParts>, after: Partial<BirthdayParts>): string | null {
  if (!birthdayWouldChange(before, after)) return null;
  const was = formatBirthday(before);
  const now = formatBirthday(after);
  if (!was && now) return `birthday added (${now})`;
  if (was && !now) return `birthday removed (was ${was})`;
  return `birthday changed from ${was} to ${now}`;
}
