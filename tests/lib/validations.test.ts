import { describe, it, expect } from "vitest";
import {
  contactSchema,
  householdSchema,
  createHouseholdSchema,
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

describe("createHouseholdSchema", () => {
  const valid = { displayName: "The Reynolds", urlSlug: "reynolds-family", password: "secure-pw-1" };

  it("requires displayName", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, displayName: "" });
    expect(r.success).toBe(false);
  });

  it("requires slug at least 2 chars", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, urlSlug: "a" });
    expect(r.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, urlSlug: "my household" });
    expect(r.success).toBe(false);
  });

  it("rejects slug with uppercase", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, urlSlug: "MyHousehold" });
    expect(r.success).toBe(false);
  });

  it("rejects slug with special chars", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, urlSlug: "my!slug" });
    expect(r.success).toBe(false);
  });

  it("requires password at least 8 chars", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, password: "short" });
    expect(r.success).toBe(false);
  });

  it("accepts valid input", () => {
    const r = createHouseholdSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.urlSlug).toBe("reynolds-family");
    }
  });

  it("accepts slug with numbers and hyphens", () => {
    const r = createHouseholdSchema.safeParse({ ...valid, urlSlug: "smith-family-123" });
    expect(r.success).toBe(true);
  });
});
