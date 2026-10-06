import { describe, it, expect, vi } from "vitest";
import { isUniqueViolation, retryOnUniqueViolation } from "@/lib/prismaErrors";

describe("isUniqueViolation", () => {
  it("is true only for Prisma's unique-constraint error", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("db down"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("retryOnUniqueViolation", () => {
  it("returns the write's result", async () => {
    expect(await retryOnUniqueViolation(async () => "row")).toBe("row");
  });

  it("tries once more after losing a race to create the row", async () => {
    const write = vi.fn().mockRejectedValueOnce({ code: "P2002" }).mockResolvedValueOnce("row");
    expect(await retryOnUniqueViolation(write)).toBe("row");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("passes any other failure on, without retrying", async () => {
    const write = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(retryOnUniqueViolation(write)).rejects.toThrow("db down");
    expect(write).toHaveBeenCalledTimes(1);
  });
});
