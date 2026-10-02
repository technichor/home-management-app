import { describe, it, expect } from "vitest";
import { formatWhen, AUDIT_LABELS } from "@/lib/format";

describe("formatWhen", () => {
  it("writes a UTC date and time for a Date or an ISO string", () => {
    expect(formatWhen(new Date("2026-10-02T15:57:44.123Z"))).toBe("2026-10-02 15:57 UTC");
    expect(formatWhen("2026-01-05T04:09:00.000Z")).toBe("2026-01-05 04:09 UTC");
  });
  it("says Never for a missing time", () => {
    expect(formatWhen(null)).toBe("Never");
    expect(formatWhen(undefined)).toBe("Never");
  });
});

describe("AUDIT_LABELS", () => {
  it("has wording for every recorded admin action", () => {
    expect(Object.keys(AUDIT_LABELS).sort()).toEqual([
      "PASSWORD_RESET_EMAIL_SENT",
      "PASSWORD_RESET_LINK_CREATED",
      "SUPERUSER_GRANTED",
      "SUPERUSER_REVOKED",
    ]);
  });
});
