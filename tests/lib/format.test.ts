import { describe, it, expect } from "vitest";
import { formatWhen, shortWhen, AUDIT_LABELS } from "@/lib/format";

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

describe("shortWhen", () => {
  const now = new Date(2026, 9, 5, 15, 30); // local time, 5 Oct 2026

  it("shows just the time for today, as a Date or an ISO string", () => {
    const morning = new Date(2026, 9, 5, 9, 5);
    expect(shortWhen(morning, now)).toBe(morning.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    expect(shortWhen(morning.toISOString(), now)).toBe(shortWhen(morning, now));
  });

  it("shows month and day for earlier this year", () => {
    const d = new Date(2026, 2, 14);
    expect(shortWhen(d, now)).toBe(d.toLocaleDateString([], { month: "short", day: "numeric" }));
    expect(shortWhen(d, now)).not.toContain("2026");
  });

  it("adds the year for earlier years", () => {
    const d = new Date(2025, 11, 31);
    expect(shortWhen(d, now)).toContain("2025");
  });

  it("defaults to the current time", () => {
    expect(shortWhen(new Date())).toBe(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  });
});
