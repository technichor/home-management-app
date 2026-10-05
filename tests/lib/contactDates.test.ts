import { describe, it, expect } from "vitest";
import { calendarName, contactDateOccurrences, importantDateTitle, occurrenceIn, type ContactForDates } from "@/lib/contactDates";

const contact = (over: Partial<ContactForDates> = {}): ContactForDates => ({
  id: "c1", firstName: "Jo", nickname: null,
  birthdayMonth: null, birthdayDay: null, birthdayYear: null,
  importantDate1: null, importantDate1Label: null, importantDate2: null, importantDate2Label: null,
  ...over,
});
const range = (start: string, end: string) => ({ start, end });
const week = range("2026-10-04", "2026-10-10");

describe("names and titles", () => {
  it("goes by a nickname if there is one", () => {
    expect(calendarName({ firstName: "Elizabeth", nickname: "Ellie" })).toBe("Ellie");
    expect(calendarName({ firstName: "Elizabeth", nickname: "  " })).toBe("Elizabeth");
    expect(calendarName({ firstName: "Elizabeth", nickname: null })).toBe("Elizabeth");
  });

  it("titles an important date with its label, the bare label when it names the person, or a fallback", () => {
    expect(importantDateTitle("Jo", "Anniversary")).toBe("Jo: Anniversary");
    expect(importantDateTitle("Jo", "Jo's graduation")).toBe("Jo's graduation");
    expect(importantDateTitle("Ellie", "ELLIE moved in")).toBe("ELLIE moved in");
    expect(importantDateTitle("Jo", "  Anniversary ")).toBe("Jo: Anniversary");
    expect(importantDateTitle("Jo", "")).toBe("Jo: Important date");
    expect(importantDateTitle("Jo", "   ")).toBe("Jo: Important date");
    expect(importantDateTitle("Jo", null)).toBe("Jo: Important date");
  });
});

describe("a yearly date in a given year", () => {
  it("is the same month and day", () => {
    expect(occurrenceIn(2026, 10, 5)).toBe("2026-10-05");
    expect(occurrenceIn(2026, 1, 1)).toBe("2026-01-01");
  });

  it("puts Feb 29 on Feb 28 in a year with no Feb 29, and on Feb 29 in a leap year", () => {
    expect(occurrenceIn(2023, 2, 29)).toBe("2023-02-28");
    expect(occurrenceIn(2024, 2, 29)).toBe("2024-02-29");
    expect(occurrenceIn(2100, 2, 29)).toBe("2100-02-28");
    expect(occurrenceIn(2000, 2, 29)).toBe("2000-02-29");
    expect(occurrenceIn(2023, 2, 28)).toBe("2023-02-28");
  });
});

describe("birthdays", () => {
  it("appear in the range on their month and day, titled with the name", () => {
    const found = contactDateOccurrences([contact({ birthdayMonth: 10, birthdayDay: 8, birthdayYear: null })], week);
    expect(found).toEqual([{ contactId: "c1", date: "2026-10-08", type: "birthday", title: "Jo's birthday", turns: null }]);
  });

  it("use the nickname", () => {
    const [b] = contactDateOccurrences([contact({ firstName: "Elizabeth", nickname: "Ellie", birthdayMonth: 10, birthdayDay: 5 })], week);
    expect(b.title).toBe("Ellie's birthday");
  });

  it("say how old someone turns only when the birth year is known", () => {
    const withYear = contactDateOccurrences([contact({ birthdayMonth: 10, birthdayDay: 8, birthdayYear: 1985 })], week);
    expect(withYear[0].turns).toBe(41);
    const without = contactDateOccurrences([contact({ birthdayMonth: 10, birthdayDay: 8 })], week);
    expect(without[0].turns).toBeNull();
  });

  it("don't say 'turns 0' in the year someone is born", () => {
    const [b] = contactDateOccurrences([contact({ birthdayMonth: 10, birthdayDay: 8, birthdayYear: 2026 })], week);
    expect(b.turns).toBeNull();
  });

  it("recur every year (the same date, a different age)", () => {
    const c = contact({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 });
    expect(contactDateOccurrences([c], range("2026-03-01", "2026-03-07"))[0]).toMatchObject({ date: "2026-03-04", turns: 41 });
    expect(contactDateOccurrences([c], range("2031-03-01", "2031-03-07"))[0]).toMatchObject({ date: "2031-03-04", turns: 46 });
  });

  it("stay out of ranges they don't fall in, including the day before and after", () => {
    const c = contact({ birthdayMonth: 10, birthdayDay: 8 });
    expect(contactDateOccurrences([c], range("2026-10-09", "2026-10-15"))).toEqual([]);
    expect(contactDateOccurrences([c], range("2026-10-01", "2026-10-07"))).toEqual([]);
    expect(contactDateOccurrences([c], range("2026-10-08", "2026-10-08"))).toHaveLength(1);
  });

  it("need both a month and a day", () => {
    expect(contactDateOccurrences([contact({ birthdayMonth: 10, birthdayDay: null })], week)).toEqual([]);
    expect(contactDateOccurrences([contact({ birthdayMonth: null, birthdayDay: 8 })], week)).toEqual([]);
  });
});

describe("Feb 29", () => {
  const leapling = (year: number | null = 2000) => contact({ birthdayMonth: 2, birthdayDay: 29, birthdayYear: year });

  it("is on Feb 29 in a leap year", () => {
    const [b] = contactDateOccurrences([leapling()], range("2028-02-26", "2028-03-03"));
    expect(b).toMatchObject({ date: "2028-02-29", turns: 28 });
  });

  it("is on Feb 28 in a year that has no Feb 29", () => {
    const [b] = contactDateOccurrences([leapling()], range("2027-02-22", "2027-02-28"));
    expect(b).toMatchObject({ date: "2027-02-28", turns: 27 });
    expect(contactDateOccurrences([leapling()], range("2027-03-01", "2027-03-07"))).toEqual([]);
  });

  it("is never on both days in a leap year", () => {
    const found = contactDateOccurrences([leapling(null)], range("2028-02-20", "2028-03-05"));
    expect(found.map((f) => f.date)).toEqual(["2028-02-29"]);
  });

  it("works for an important date too", () => {
    const c = contact({ importantDate1: "2000-02-29", importantDate1Label: "Anniversary" });
    expect(contactDateOccurrences([c], range("2027-02-22", "2027-02-28"))[0].date).toBe("2027-02-28");
    expect(contactDateOccurrences([c], range("2028-02-22", "2028-03-01"))[0].date).toBe("2028-02-29");
  });
});

describe("important dates", () => {
  it("repeat yearly on their month and day, whatever year was stored, with no age", () => {
    const c = contact({ importantDate1: "2010-10-06", importantDate1Label: "Anniversary" });
    const found = contactDateOccurrences([c], week);
    expect(found).toEqual([{ contactId: "c1", date: "2026-10-06", type: "important", title: "Jo: Anniversary", turns: null }]);
  });

  it("include both slots", () => {
    const c = contact({
      importantDate1: "2010-10-06", importantDate1Label: "Anniversary",
      importantDate2: "1999-10-09", importantDate2Label: null,
    });
    expect(contactDateOccurrences([c], week).map((f) => [f.date, f.title])).toEqual([
      ["2026-10-06", "Jo: Anniversary"],
      ["2026-10-09", "Jo: Important date"],
    ]);
  });

  it("ignore a slot that isn't a real date", () => {
    for (const bad of ["tomorrow", "2010-13-06", "2010-10-32", "2010-02-30", "10-06", "", "2010-00-10", "2010-10-00"]) {
      expect(contactDateOccurrences([contact({ importantDate1: bad })], range("2026-01-01", "2026-12-31"))).toEqual([]);
    }
  });

  it("can fall on the same day as the contact's birthday", () => {
    const c = contact({ birthdayMonth: 10, birthdayDay: 6, importantDate1: "2010-10-06", importantDate1Label: "Moved in" });
    expect(contactDateOccurrences([c], week).map((f) => f.type).sort()).toEqual(["birthday", "important"]);
  });
});

describe("ranges that cross a year boundary", () => {
  const winter = range("2026-12-28", "2027-01-03");
  const dec = contact({ id: "dec", birthdayMonth: 12, birthdayDay: 30, birthdayYear: 1990 });
  const jan = contact({ id: "jan", birthdayMonth: 1, birthdayDay: 2, birthdayYear: 1990 });

  it("finds December dates in the old year and January dates in the new one", () => {
    const found = contactDateOccurrences([dec, jan], winter);
    expect(found.map((f) => [f.contactId, f.date, f.turns])).toEqual([
      ["dec", "2026-12-30", 36],
      ["jan", "2027-01-02", 37],
    ]);
  });

  it("covers a month grid that spans New Year", () => {
    const grid = range("2026-11-29", "2027-01-02");
    expect(contactDateOccurrences([dec, jan], grid)).toHaveLength(2);
  });

  it("finds the same date in more than one year when the range is long", () => {
    const found = contactDateOccurrences([contact({ birthdayMonth: 6, birthdayDay: 1, birthdayYear: 2000 })], range("2026-01-01", "2028-12-31"));
    expect(found.map((f) => [f.date, f.turns])).toEqual([["2026-06-01", 26], ["2027-06-01", 27], ["2028-06-01", 28]]);
  });

  it("finds nothing for a contact with no dates", () => {
    expect(contactDateOccurrences([contact()], range("2026-01-01", "2026-12-31"))).toEqual([]);
    expect(contactDateOccurrences([], week)).toEqual([]);
  });
});
