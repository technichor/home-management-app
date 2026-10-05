import { describe, it, expect } from "vitest";
import {
  contactFormSchema,
  contactSchema,
  householdFormSchema,
  householdSchema,
  personNameSchema,
  requestSyncSchema,
} from "@/lib/validations";

describe("contactSchema", () => {
  it("requires firstName", () => {
    const r = contactSchema.safeParse({ lastName: "Smith", category: "SERVICE_PROVIDER" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "firstName")).toBe(true);
    }
  });

  it("requires lastName", () => {
    const r = contactSchema.safeParse({ firstName: "Jane", category: "SERVICE_PROVIDER" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "lastName")).toBe(true);
    }
  });

  it("rejects invalid category", () => {
    const r = contactSchema.safeParse({ firstName: "A", lastName: "B", category: "INVALID" });
    expect(r.success).toBe(false);
  });

  it("requires householdId for FAMILY_FRIEND", () => {
    const r = contactSchema.safeParse({
      firstName: "A",
      lastName: "B",
      category: "FAMILY_FRIEND",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "householdId")).toBe(true);
    }
  });

  it("accepts FAMILY_FRIEND with householdId", () => {
    const r = contactSchema.safeParse({
      firstName: "A",
      lastName: "B",
      category: "FAMILY_FRIEND",
      householdId: "hh1",
    });
    expect(r.success).toBe(true);
  });

  it("accepts SERVICE_PROVIDER without householdId", () => {
    const r = contactSchema.safeParse({ firstName: "A", lastName: "B", category: "SERVICE_PROVIDER" });
    expect(r.success).toBe(true);
  });

  it("accepts MEDICAL_SCHOOL without householdId", () => {
    const r = contactSchema.safeParse({ firstName: "A", lastName: "B", category: "MEDICAL_SCHOOL" });
    expect(r.success).toBe(true);
  });

  it("accepts HOUSEHOLD_ADMIN without householdId", () => {
    const r = contactSchema.safeParse({ firstName: "A", lastName: "B", category: "HOUSEHOLD_ADMIN" });
    expect(r.success).toBe(true);
  });

  it("defaults tags to [] and favorite to false", () => {
    const r = contactSchema.safeParse({ firstName: "A", lastName: "B", category: "SERVICE_PROVIDER" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual([]);
      expect(r.data.favorite).toBe(false);
    }
  });
});

describe("householdSchema", () => {
  it("requires displayName", () => {
    const r = householdSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects empty displayName", () => {
    const r = householdSchema.safeParse({ displayName: "" });
    expect(r.success).toBe(false);
  });

  it("accepts minimal valid input", () => {
    const r = householdSchema.safeParse({ displayName: "The Smiths" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual([]);
      expect(r.data.displayName).toBe("The Smiths");
    }
  });

  it("accepts full input", () => {
    const r = householdSchema.safeParse({
      displayName: "The Smiths",
      mailingAddress: "123 Main St",
      tags: ["friends", "church"],
      notes: "Met at work",
    });
    expect(r.success).toBe(true);
  });
});

describe("personNameSchema", () => {
  it("accepts a trimmed first and last name and rejects blanks", () => {
    expect(personNameSchema.safeParse({ firstName: " A ", lastName: "B" }).data).toEqual({ firstName: "A", lastName: "B" });
    expect(personNameSchema.safeParse({ firstName: "", lastName: "B" }).success).toBe(false);
    expect(personNameSchema.safeParse({ firstName: "A", lastName: " " }).success).toBe(false);
  });
});

describe("requestSyncSchema", () => {
  it("normalizes the email to trimmed lowercase", () => {
    const r = requestSyncSchema.safeParse({ contactId: "c1", email: "  Pat@Example.COM " });
    expect(r.data).toEqual({ contactId: "c1", email: "pat@example.com" });
  });

  it("rejects a malformed email and a missing contact", () => {
    expect(requestSyncSchema.safeParse({ contactId: "c1", email: "not-an-email" }).error?.issues[0].message).toBe(
      "Enter a valid email address"
    );
    expect(requestSyncSchema.safeParse({ contactId: "", email: "a@b.co" }).error?.issues[0].message).toBe("Choose a contact");
  });
});

describe("contactFormSchema", () => {
  const ok = { firstName: "Jane", lastName: "Smith", category: "SERVICE_PROVIDER" };

  it("accepts the minimum and applies defaults", () => {
    const r = contactFormSchema.parse(ok);
    expect(r).toMatchObject({ tags: [], favorite: false });
  });

  it("requires a name, with friendly messages", () => {
    const r = contactFormSchema.safeParse({ ...ok, firstName: "  ", lastName: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message);
      expect(messages).toContain("First name is required");
      expect(messages).toContain("Last name is required");
    }
  });

  it("trims text and turns blanks into undefined", () => {
    const r = contactFormSchema.parse({ ...ok, firstName: " Jane ", nickname: "  ", notes: " hi " });
    expect(r.firstName).toBe("Jane");
    expect(r.nickname).toBeUndefined();
    expect(r.notes).toBe("hi");
  });

  it("requires a household only for Family & Friend", () => {
    const ff = contactFormSchema.safeParse({ ...ok, category: "FAMILY_FRIEND" });
    expect(ff.success).toBe(false);
    if (!ff.success) expect(ff.error.issues[0]).toMatchObject({ path: ["householdId"], message: "Choose the household this person belongs to" });
    expect(contactFormSchema.safeParse({ ...ok, category: "FAMILY_FRIEND", householdId: "h1" }).success).toBe(true);
    expect(contactFormSchema.safeParse(ok).success).toBe(true);
  });

  it("checks email format only when an email is given", () => {
    expect(contactFormSchema.safeParse({ ...ok, emailPrimary: "", emailSecondary: undefined }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...ok, emailPrimary: "a@b.co" }).success).toBe(true);
    const bad = contactFormSchema.safeParse({ ...ok, emailSecondary: "nope" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]).toMatchObject({ path: ["emailSecondary"], message: "Enter a valid email address" });
  });

  it("accepts only real YYYY-MM-DD dates", () => {
    expect(contactFormSchema.safeParse({ ...ok, importantDate1: "2026-02-28", importantDate2: "" }).success).toBe(true);
    for (const bad of ["28/02/2026", "2026-13-40", "tomorrow"]) {
      expect(contactFormSchema.safeParse({ ...ok, importantDate1: bad }).success).toBe(false);
    }
  });
});

describe("householdFormSchema", () => {
  it("requires a name and applies defaults", () => {
    const bad = householdFormSchema.safeParse({ displayName: "  " });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("Household name is required");
    expect(householdFormSchema.parse({ displayName: "The Smiths" })).toMatchObject({ tags: [] });
  });

  it("trims, drops blank optionals, and caps the name length", () => {
    const r = householdFormSchema.parse({ displayName: " The Smiths ", mailingAddress: "  ", notes: " gate " });
    expect(r).toMatchObject({ displayName: "The Smiths", notes: "gate" });
    expect(r.mailingAddress).toBeUndefined();
    expect(householdFormSchema.safeParse({ displayName: "x".repeat(101) }).success).toBe(false);
  });
});

describe("birthday in the contact schemas", () => {
  const base = { firstName: "Jo", lastName: "Jones", category: "SERVICE_PROVIDER" as const };

  describe("contactSchema (CSV)", () => {
    it("accepts no birthday, a month and day, or all three", () => {
      expect(contactSchema.safeParse(base).success).toBe(true);
      expect(contactSchema.safeParse({ ...base, birthdayMonth: 3, birthdayDay: 4 }).success).toBe(true);
      expect(contactSchema.safeParse({ ...base, birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 }).success).toBe(true);
      expect(contactSchema.safeParse({ ...base, birthdayMonth: null, birthdayDay: null, birthdayYear: null }).success).toBe(true);
    });

    it("keeps an absent birthday absent (undefined), distinct from null", () => {
      const r = contactSchema.parse(base);
      expect(r.birthdayMonth).toBeUndefined();
      expect(contactSchema.parse({ ...base, birthdayMonth: null, birthdayDay: null }).birthdayMonth).toBeNull();
    });

    it("reports a problem against the birthday column", () => {
      const r = contactSchema.safeParse({ ...base, birthdayMonth: 2, birthdayDay: 30 });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ["birthday"], message: "February doesn't have 30 days" });
      expect(contactSchema.safeParse({ ...base, birthdayYear: 1985 }).success).toBe(false);
    });
  });

  describe("contactFormSchema (in-app)", () => {
    it("turns empty birthday fields into null", () => {
      const r = contactFormSchema.parse(base);
      expect([r.birthdayMonth, r.birthdayDay, r.birthdayYear]).toEqual([null, null, null]);
      const blank = contactFormSchema.parse({ ...base, birthdayMonth: null, birthdayDay: null, birthdayYear: null });
      expect([blank.birthdayMonth, blank.birthdayDay, blank.birthdayYear]).toEqual([null, null, null]);
    });

    it("accepts a birthday with or without a year, including Feb 29", () => {
      expect(contactFormSchema.parse({ ...base, birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 })).toMatchObject({ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1985 });
      expect(contactFormSchema.parse({ ...base, birthdayMonth: 2, birthdayDay: 29 })).toMatchObject({ birthdayYear: null });
      expect(contactFormSchema.parse({ ...base, birthdayMonth: 2, birthdayDay: 29, birthdayYear: 2000 }).birthdayYear).toBe(2000);
    });

    it("explains a bad birthday under one field name", () => {
      const cases: [object, string][] = [
        [{ birthdayMonth: 3 }, "Enter both a month and a day for the birthday"],
        [{ birthdayYear: 1985 }, "Enter both a month and a day for the birthday"],
        [{ birthdayMonth: 2, birthdayDay: 29, birthdayYear: 2023 }, "2023 isn't a leap year, so February doesn't have 29 days"],
        [{ birthdayMonth: 4, birthdayDay: 31 }, "April doesn't have 31 days"],
        [{ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 1899 }, expect.stringContaining("The birth year must be from 1900")],
        [{ birthdayMonth: 3, birthdayDay: 4, birthdayYear: 2999 }, expect.stringContaining("The birth year must be from 1900")],
      ];
      for (const [extra, message] of cases) {
        const r = contactFormSchema.safeParse({ ...base, ...extra });
        expect(r.success).toBe(false);
        if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ["birthday"], message });
      }
    });
  });
});
