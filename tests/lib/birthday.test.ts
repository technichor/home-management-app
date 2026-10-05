import { describe, it, expect } from "vitest";
import {
  MIN_BIRTH_YEAR,
  birthdayProblem,
  birthdayToCell,
  birthdayWouldChange,
  daysInMonth,
  describeBirthdayChange,
  formatBirthday,
  isLeapYear,
  parseBirthdayCell,
} from "@/lib/birthday";

const TODAY = "2026-10-05";

describe("leap years and month lengths", () => {
  it("knows a leap year", () => {
    expect([2024, 2000, 1900, 2100, 2023].map(isLeapYear)).toEqual([true, true, false, false, false]);
  });

  it("lets February have 29 days when there is no year, or a leap year", () => {
    expect(daysInMonth(2, null)).toBe(29);
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(daysInMonth(2, 2023)).toBe(28);
    expect(daysInMonth(4, null)).toBe(30);
    expect(daysInMonth(12, 2023)).toBe(31);
  });
});

describe("birthdayProblem", () => {
  const ok = (month: number, day: number, year: number | null = null) => birthdayProblem({ month, day, year }, TODAY);

  it("accepts no birthday at all", () => {
    expect(birthdayProblem({}, TODAY)).toBeNull();
    expect(birthdayProblem({ month: null, day: null, year: null }, TODAY)).toBeNull();
  });

  it("accepts a month and day, with or without a year", () => {
    expect(ok(3, 4)).toBeNull();
    expect(ok(3, 4, 1985)).toBeNull();
    expect(ok(12, 31, 1900)).toBeNull();
  });

  it("needs month and day together; a year alone isn't a birthday", () => {
    const message = "Enter both a month and a day for the birthday";
    expect(birthdayProblem({ month: 3, day: null }, TODAY)).toBe(message);
    expect(birthdayProblem({ month: null, day: 4 }, TODAY)).toBe(message);
    expect(birthdayProblem({ year: 1985 }, TODAY)).toBe(message);
  });

  it("checks the month and day are in range and make a real date", () => {
    expect(ok(13, 1)).toBe("The birthday month must be from 1 to 12");
    expect(ok(0, 1)).toBe("The birthday month must be from 1 to 12");
    expect(ok(3, 32)).toBe("The birthday day must be from 1 to 31");
    expect(ok(3, 0)).toBe("The birthday day must be from 1 to 31");
    expect(birthdayProblem({ month: 2.5, day: 1 }, TODAY)).toBe("The birthday month must be from 1 to 12");
    expect(ok(4, 31)).toBe("April doesn't have 31 days");
    expect(ok(4, 31, 1990)).toBe("April doesn't have 31 days");
    expect(ok(2, 30)).toBe("February doesn't have 30 days");
  });

  it("allows Feb 29 with no year or a leap year, and refuses it in a common year", () => {
    expect(ok(2, 29)).toBeNull();
    expect(ok(2, 29, 2024)).toBeNull();
    expect(ok(2, 29, 2000)).toBeNull();
    expect(ok(2, 29, 2023)).toBe("2023 isn't a leap year, so February doesn't have 29 days");
    expect(ok(2, 29, 1900)).toBe("1900 isn't a leap year, so February doesn't have 29 days");
  });

  it("limits the year to 1900 through this year", () => {
    expect(MIN_BIRTH_YEAR).toBe(1900);
    expect(ok(6, 1, 1899)).toBe("The birth year must be from 1900 to 2026");
    expect(ok(6, 1, 2027)).toBe("The birth year must be from 1900 to 2026");
    expect(birthdayProblem({ month: 6, day: 1, year: 1985.5 }, TODAY)).toBe("The birth year must be from 1900 to 2026");
  });

  it("refuses a date in the future, but allows today and (for people ahead of UTC) tomorrow", () => {
    expect(ok(10, 5, 2026)).toBeNull();
    expect(ok(10, 6, 2026)).toBeNull();
    expect(ok(10, 7, 2026)).toBe("The birthday can't be in the future");
    expect(ok(12, 31, 2026)).toBe("The birthday can't be in the future");
    expect(ok(1, 1, 2026)).toBeNull();
  });

  it("uses today's real date by default", () => {
    expect(birthdayProblem({ month: 1, day: 1, year: 2000 })).toBeNull();
    expect(birthdayProblem({ month: 1, day: 1, year: 2999 })).toContain("The birth year must be from 1900 to");
  });
});

describe("parseBirthdayCell", () => {
  const parse = (raw: string) => parseBirthdayCell(raw, TODAY);

  it("treats blank as no birthday", () => {
    expect(parse("")).toEqual({ ok: true, value: null });
    expect(parse("   ")).toEqual({ ok: true, value: null });
  });

  it("reads YYYY-MM-DD with the year", () => {
    expect(parse("1985-03-04")).toEqual({ ok: true, value: { month: 3, day: 4, year: 1985 } });
    expect(parse(" 2024-02-29 ")).toEqual({ ok: true, value: { month: 2, day: 29, year: 2024 } });
  });

  it("reads MM-DD without a year, including Feb 29", () => {
    expect(parse("03-04")).toEqual({ ok: true, value: { month: 3, day: 4, year: null } });
    expect(parse("02-29")).toEqual({ ok: true, value: { month: 2, day: 29, year: null } });
  });

  it.each(["March 4", "3-4", "1985/03/04", "85-03-04", "1985-3-4", "03-04-1985", "abcd", "1985-03"])(
    "refuses %s as an unrecognised format, saying what is accepted",
    (raw) => {
      const r = parse(raw);
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toContain(`birthday "${raw}" isn't in a recognised format`);
      expect((r as { error: string }).error).toContain("YYYY-MM-DD");
      expect((r as { error: string }).error).toContain("MM-DD");
    }
  );

  it("names the value and what's wrong when it isn't a real date", () => {
    expect(parse("02-30")).toEqual({ ok: false, error: 'birthday "02-30" is not valid: February doesn\'t have 30 days' });
    expect(parse("13-01")).toEqual({ ok: false, error: 'birthday "13-01" is not valid: The birthday month must be from 1 to 12' });
    expect(parse("2023-02-29")).toEqual({ ok: false, error: 'birthday "2023-02-29" is not valid: 2023 isn\'t a leap year, so February doesn\'t have 29 days' });
    expect(parse("1850-01-01")).toEqual({ ok: false, error: 'birthday "1850-01-01" is not valid: The birth year must be from 1900 to 2026' });
    expect(parse("2099-01-01")).toEqual({ ok: false, error: 'birthday "2099-01-01" is not valid: The birth year must be from 1900 to 2026' });
    expect(parse("2026-12-25")).toEqual({ ok: false, error: 'birthday "2026-12-25" is not valid: The birthday can\'t be in the future' });
  });

  it("uses today's real date by default", () => {
    expect(parseBirthdayCell("1985-03-04")).toEqual({ ok: true, value: { month: 3, day: 4, year: 1985 } });
  });
});

describe("writing a birthday", () => {
  it("writes the CSV cell in the same two formats", () => {
    expect(birthdayToCell({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 })).toBe("1985-03-04");
    expect(birthdayToCell({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: null })).toBe("03-04");
    expect(birthdayToCell({ birthdayMonth: 12, birthdayDay: 25, birthdayYear: 1900 })).toBe("1900-12-25");
    expect(birthdayToCell({ birthdayMonth: null, birthdayDay: null, birthdayYear: null })).toBe("");
    expect(birthdayToCell({})).toBe("");
  });

  it("round-trips through the parser", () => {
    for (const parts of [
      { birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 },
      { birthdayMonth: 2, birthdayDay: 29, birthdayYear: null },
      { birthdayMonth: 2, birthdayDay: 29, birthdayYear: 2000 },
    ]) {
      const parsed = parseBirthdayCell(birthdayToCell(parts), TODAY);
      expect(parsed).toMatchObject({ ok: true });
      const v = (parsed as { value: { month: number; day: number; year: number | null } }).value;
      expect({ birthdayMonth: v.month, birthdayDay: v.day, birthdayYear: v.year }).toEqual(parts);
    }
  });

  it("shows it on screen with or without the year", () => {
    expect(formatBirthday({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: null })).toBe("March 4");
    expect(formatBirthday({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 })).toBe("March 4, 1985");
    expect(formatBirthday({ birthdayMonth: null, birthdayDay: null, birthdayYear: null })).toBeNull();
    expect(formatBirthday({})).toBeNull();
  });
});

describe("what an import does to a birthday", () => {
  const had = { birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 };
  const none = { birthdayMonth: null, birthdayDay: null, birthdayYear: null };

  it("does nothing when the file had no birthday column (parts are undefined)", () => {
    expect(birthdayWouldChange(had, {})).toBe(false);
    expect(birthdayWouldChange(had, { birthdayMonth: undefined, birthdayDay: undefined, birthdayYear: undefined })).toBe(false);
    expect(describeBirthdayChange(had, {})).toBeNull();
  });

  it("does nothing when the birthday is the same", () => {
    expect(birthdayWouldChange(had, { ...had })).toBe(false);
    expect(birthdayWouldChange(none, { ...none })).toBe(false);
    expect(birthdayWouldChange({}, { ...none })).toBe(false);
  });

  it("notices a change in any part", () => {
    expect(birthdayWouldChange(had, { ...had, birthdayDay: 5 })).toBe(true);
    expect(birthdayWouldChange(had, { ...had, birthdayMonth: 4 })).toBe(true);
    expect(birthdayWouldChange(had, { ...had, birthdayYear: null })).toBe(true);
    expect(birthdayWouldChange(had, { ...had, birthdayYear: 1986 })).toBe(true);
  });

  it("says in plain language what changes", () => {
    expect(describeBirthdayChange(none, had)).toBe("birthday added (March 4, 1985)");
    expect(describeBirthdayChange(had, none)).toBe("birthday removed (was March 4, 1985)");
    expect(describeBirthdayChange(had, { birthdayMonth: 3, birthdayDay: 5, birthdayYear: null })).toBe("birthday changed from March 4, 1985 to March 5");
  });
});
