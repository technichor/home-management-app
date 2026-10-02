import { describe, it, expect } from "vitest";
import { inDays, upcomingDates } from "@/lib/home";

const contact = (over: object = {}) => ({
  id: "c1", firstName: "Jane", lastName: "Smith",
  importantDate1: null, importantDate1Label: null, importantDate2: null, importantDate2Label: null,
  ...over,
});
const now = new Date("2026-10-02T15:30:00Z");

describe("upcomingDates", () => {
  it("finds dates within 30 days, ignoring the stored year, soonest first", () => {
    const found = upcomingDates(
      [
        contact({ id: "a", firstName: "Al", importantDate1: "1985-10-20", importantDate1Label: "Birthday" }),
        contact({ id: "b", firstName: "Bo", importantDate1: "2001-10-02", importantDate1Label: "Anniversary" }),
        contact({ id: "c", firstName: "Cy", importantDate1: "1999-11-01" }), // exactly 30 days
        contact({ id: "d", firstName: "Di", importantDate1: "1999-11-02" }), // 31 days: too far
      ],
      now
    );
    expect(found.map((d) => [d.contactId, d.daysUntil, d.next, d.label])).toEqual([
      ["b", 0, "2026-10-02", "Anniversary"],
      ["a", 18, "2026-10-20", "Birthday"],
      ["c", 30, "2026-11-01", "Important date"],
    ]);
  });

  it("rolls a date that already passed this year over to next year", () => {
    const found = upcomingDates([contact({ importantDate1: "1990-01-05" })], new Date("2026-12-20T00:00:00Z"));
    expect(found).toMatchObject([{ next: "2027-01-05", daysUntil: 16 }]);
    expect(upcomingDates([contact({ importantDate1: "1990-09-30" })], now)).toEqual([]); // 363 days away
  });

  it("reads both date slots", () => {
    const found = upcomingDates(
      [contact({ importantDate1: "2000-10-05", importantDate1Label: "A", importantDate2: "2000-10-03", importantDate2Label: "B" })],
      now
    );
    expect(found.map((d) => d.label)).toEqual(["B", "A"]);
  });

  it("breaks ties by name", () => {
    const found = upcomingDates(
      [contact({ id: "z", firstName: "Zed", importantDate1: "2000-10-10" }), contact({ id: "a", firstName: "Abe", importantDate1: "2000-10-10" })],
      now
    );
    expect(found.map((d) => d.contactId)).toEqual(["a", "z"]);
  });

  it("puts Feb 29 on Feb 28 in a year that has none, and keeps it on a leap year", () => {
    const c = [contact({ importantDate1: "2000-02-29" })];
    expect(upcomingDates(c, new Date("2027-02-20T00:00:00Z"))).toMatchObject([{ next: "2027-02-28", daysUntil: 8 }]);
    expect(upcomingDates(c, new Date("2028-02-20T00:00:00Z"))).toMatchObject([{ next: "2028-02-29", daysUntil: 9 }]);
  });

  it("skips missing and malformed dates", () => {
    expect(
      upcomingDates(
        [
          contact({ importantDate1: null }),
          contact({ importantDate1: "10/05/2000" }),
          contact({ importantDate1: "2000-13-05" }),
          contact({ importantDate1: "2000-10-00" }),
          contact({ importantDate1: "2000-00-10" }),
        ],
        now
      )
    ).toEqual([]);
  });

  it("honors a custom window", () => {
    const c = [contact({ importantDate1: "2000-10-20" })];
    expect(upcomingDates(c, now, 10)).toEqual([]);
    expect(upcomingDates(c, now, 20)).toHaveLength(1);
  });
});

describe("inDays", () => {
  it("says today, tomorrow, or the number of days", () => {
    expect([inDays(0), inDays(1), inDays(9)]).toEqual(["Today", "Tomorrow", "In 9 days"]);
  });
});
