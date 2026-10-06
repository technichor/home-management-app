import { describe, expect, it } from "vitest";
import { accountRecordSchema, accountSummary } from "@/lib/accounts";
import { isHttpUrl } from "@/lib/urls";

const base = { name: "Corey's HSA", kind: "HEALTH_SAVINGS" as const, status: "ACTIVE" as const };

describe("accountRecordSchema", () => {
  it("accepts a name, kind and status alone", () => {
    expect(accountRecordSchema.parse(base)).toEqual({
      name: "Corey's HSA", kind: "HEALTH_SAVINGS", status: "ACTIVE", institution: null, lastFour: null, ownerContactId: null, website: null, phone: null, notes: null,
    });
  });

  it("trims text, turns blanks into nothing, and keeps notes as typed", () => {
    expect(
      accountRecordSchema.parse({ ...base, name: " HSA ", institution: " Fidelity ", lastFour: " 1234 ", phone: "  ", ownerContactId: "", website: " https://f.test ", notes: " a\nb " }),
    ).toMatchObject({ name: "HSA", institution: "Fidelity", lastFour: "1234", phone: null, ownerContactId: null, website: "https://f.test", notes: " a\nb " });
    expect(accountRecordSchema.parse({ ...base, notes: "  " }).notes).toBeNull();
  });

  it.each([
    ["a blank name", { name: " " }, "Give it a name"],
    ["a long name", { name: "a".repeat(121) }, "The name can be at most 120 characters"],
    ["no kind", { kind: undefined }, "Choose what kind of account it is"],
    ["no status", { status: undefined }, "Choose a status"],
    ["a long institution", { institution: "a".repeat(121) }, "The institution can be at most 120 characters"],
    ["a whole account number", { lastFour: "1234567890" }, "Enter only the last 4 letters or digits of the account number (never the whole number)"],
    ["a number with spaces or dashes", { lastFour: "12-3" }, "Enter only the last 4 letters or digits of the account number (never the whole number)"],
    ["a script website", { website: "javascript:alert(1)" }, "The website must start with http:// or https://"],
    ["a long website", { website: `https://x.test/${"a".repeat(500)}` }, "The website can be at most 500 characters"],
    ["a long phone", { phone: "1".repeat(121) }, "The phone number can be at most 120 characters"],
    ["long notes", { notes: "a".repeat(5001) }, "Notes can be at most 5,000 characters"],
  ])("rejects %s", (_n, over, message) => {
    const result = accountRecordSchema.safeParse({ ...base, ...over });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });

  it("has nowhere to put a password or a balance", () => {
    expect(Object.keys(accountRecordSchema.shape)).not.toEqual(expect.arrayContaining(["password"]));
    expect(Object.keys(accountRecordSchema.parse({ ...base, password: "hunter2", balance: 5 } as any))).not.toEqual(expect.arrayContaining(["password", "balance"]));
  });
});

describe("accountSummary", () => {
  it("joins the institution and the masked number, whichever are known", () => {
    expect(accountSummary({ institution: "Fidelity", lastFour: "1234" })).toBe("Fidelity ····1234");
    expect(accountSummary({ institution: "Fidelity", lastFour: null })).toBe("Fidelity");
    expect(accountSummary({ institution: null, lastFour: "1234" })).toBe("····1234");
    expect(accountSummary({ institution: null, lastFour: null })).toBe("");
  });
});

describe("isHttpUrl", () => {
  it("allows only http and https", () => {
    expect(isHttpUrl("http://a.test")).toBe(true);
    expect(isHttpUrl("https://a.test/x?y=1")).toBe(true);
    expect(isHttpUrl("ftp://a.test")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("nope")).toBe(false);
  });
});
