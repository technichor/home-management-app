import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "@/lib/prismaErrors";

describe("isUniqueViolation", () => {
  it("is true only for Prisma's unique-constraint error", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("db down"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
