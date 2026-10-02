import { describe, it, expect } from "vitest";
import {
  contactFormSchema,
  contactSchema,
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
