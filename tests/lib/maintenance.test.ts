import { describe, expect, it } from "vitest";
import { ageLabel, ageYears, maintenanceItemSchema, serviceStatus } from "@/lib/maintenance";

const base = { name: "Furnace", category: "HVAC" as const };

describe("maintenanceItemSchema", () => {
  it("accepts a name and category alone, with everything else empty", () => {
    expect(maintenanceItemSchema.parse(base)).toEqual({
      name: "Furnace", category: "HVAC", location: null, brand: null, modelNumber: null, serialNumber: null, installedYear: null,
      warrantyUntil: null, serviceEveryMonths: null, lastServicedOn: null, manualUrl: null, notes: null,
    });
  });

  it("trims text, turns blanks into nothing, and keeps notes as typed", () => {
    const parsed = maintenanceItemSchema.parse({
      ...base, name: "  Furnace ", brand: " Carrier ", location: "  ", warrantyUntil: "", lastServicedOn: "2026-01-02", notes: "  a\nb ", manualUrl: " https://x.test/m.pdf ",
      installedYear: 2004, serviceEveryMonths: 12,
    });
    expect(parsed).toMatchObject({ name: "Furnace", brand: "Carrier", location: null, warrantyUntil: null, lastServicedOn: "2026-01-02", notes: "  a\nb ", manualUrl: "https://x.test/m.pdf", installedYear: 2004, serviceEveryMonths: 12 });
    expect(maintenanceItemSchema.parse({ ...base, notes: "   " }).notes).toBeNull();
  });

  it.each([
    ["a blank name", { name: " " }, "Give it a name"],
    ["a long name", { name: "a".repeat(121) }, "The name can be at most 120 characters"],
    ["no category", { category: undefined }, "Choose a category"],
    ["a long brand", { brand: "a".repeat(121) }, "The brand can be at most 120 characters"],
    ["a fractional year", { installedYear: 2004.5 }, "The year must be a whole number"],
    ["a year too early", { installedYear: 1800 }, "The year can't be before 1900"],
    ["a year too late", { installedYear: 2101 }, "The year can't be after 2100"],
    ["a bad warranty date", { warrantyUntil: "2026-02-30" }, "Choose a valid warranty date"],
    ["a bad service date", { lastServicedOn: "soon" }, "Choose a valid service date"],
    ["a fractional interval", { serviceEveryMonths: 1.5 }, "Months between service must be a whole number"],
    ["a zero interval", { serviceEveryMonths: 0 }, "Months between service must be at least 1"],
    ["a huge interval", { serviceEveryMonths: 601 }, "Months between service can be at most 600"],
    ["a script link", { manualUrl: "javascript:alert(1)" }, "The manual link must start with http:// or https://"],
    ["a non-link", { manualUrl: "the manual is in the drawer" }, "The manual link must start with http:// or https://"],
    ["a long link", { manualUrl: `https://x.test/${"a".repeat(500)}` }, "The manual link can be at most 500 characters"],
    ["long notes", { notes: "a".repeat(5001) }, "Notes can be at most 5,000 characters"],
  ])("rejects %s", (_n, over, message) => {
    const result = maintenanceItemSchema.safeParse({ ...base, ...over });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});

describe("serviceStatus", () => {
  const today = "2026-10-05";
  it("is nothing without a schedule", () => {
    expect(serviceStatus({ serviceEveryMonths: null, lastServicedOn: "2026-01-01" }, today)).toBeNull();
  });
  it("says so when a scheduled item has never been serviced", () => {
    expect(serviceStatus({ serviceEveryMonths: 3, lastServicedOn: null }, today)).toEqual({ text: "No service recorded yet", overdue: false });
  });
  it("gives the next service date, and flags one that has passed", () => {
    expect(serviceStatus({ serviceEveryMonths: 3, lastServicedOn: "2026-08-01" }, today)).toEqual({ text: "Next service Nov 1, 2026", overdue: false });
    expect(serviceStatus({ serviceEveryMonths: 3, lastServicedOn: "2026-07-05" }, today)).toEqual({ text: "Next service Oct 5, 2026", overdue: false });
    expect(serviceStatus({ serviceEveryMonths: 3, lastServicedOn: "2026-06-01" }, today)).toEqual({ text: "Service was due Sep 1, 2026", overdue: true });
  });
});

describe("age", () => {
  it("is the calendar-year difference, never negative, and unknown without a year", () => {
    expect(ageYears(2006, "2026-10-05")).toBe(20);
    expect(ageYears(2030, "2026-10-05")).toBe(0);
    expect(ageYears(null, "2026-10-05")).toBeNull();
  });
  it("reads naturally", () => {
    expect(ageLabel(null)).toBeNull();
    expect(ageLabel(0)).toBe("Installed this year");
    expect(ageLabel(1)).toBe("1 year old");
    expect(ageLabel(20)).toBe("20 years old");
  });
});
