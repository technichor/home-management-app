import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const headerGet = vi.fn();
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: headerGet })) }));
vi.mock("@/lib/db", () => ({
  prisma: { authAttempt: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import {
  getClientIp,
  loginRetryAfterMinutes,
  recordFailedLogin,
  clearFailedLogins,
  resetRetryAfterMinutes,
  recordResetRequest,
  verifyRetryAfterMinutes,
  recordVerifyRequest,
  changeEmailRetryAfterMinutes,
  recordChangeEmailRequest,
  WINDOW_MS,
  MAX_FAILURES,
  RESET_WINDOW_MS,
  MAX_RESET_REQUESTS,
} from "@/lib/rateLimit";

const NOW = new Date("2026-10-01T12:00:00Z").getTime();
const ago = (ms: number) => ({ createdAt: new Date(NOW - ms) });
const rows = (n: number, ms = 60_000) => Array.from({ length: n }, () => ago(ms));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(prisma.authAttempt.findMany).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("getClientIp", () => {
  it("uses the first x-forwarded-for address", async () => {
    headerGet.mockReturnValue("9.9.9.9, 10.0.0.1");
    expect(await getClientIp()).toBe("9.9.9.9");
    expect(headerGet).toHaveBeenCalledWith("x-forwarded-for");
  });
  it("falls back to 'unknown'", async () => {
    headerGet.mockReturnValue(null);
    expect(await getClientIp()).toBe("unknown");
  });
});

describe("loginRetryAfterMinutes", () => {
  it("allows a caller under both limits, looking only inside the window", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockResolvedValue(rows(MAX_FAILURES.email - 1) as any);
    expect(await loginRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(0);
    const [emailQ, ipQ] = vi.mocked(prisma.authAttempt.findMany).mock.calls.map((c) => c[0]!);
    expect(emailQ.where).toEqual({ kind: "email", key: "a@b.co", createdAt: { gte: new Date(NOW - WINDOW_MS) } });
    expect(ipQ.where).toMatchObject({ kind: "ip", key: "1.1.1.1" });
  });

  it("blocks an email at its limit until the oldest counted failure leaves the window", async () => {
    // Failures 14, 10, 8, 5 and 2 minutes ago, newest first: the 5th newest (14 min ago) ages out in 1 minute.
    const mins = [2, 5, 8, 10, 14].map((m) => ago(m * 60_000));
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "email" ? mins : []) as any);
    expect(await loginRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(1);
  });

  it("blocks an IP at its limit", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "ip" ? rows(MAX_FAILURES.ip, 60_000) : []) as any);
    expect(await loginRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(14);
  });

  it("reports the longer wait when both are blocked", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "ip" ? rows(MAX_FAILURES.ip, 60_000) : rows(MAX_FAILURES.email, 10 * 60_000)) as any);
    expect(await loginRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(14);
  });
});

describe("password reset requests", () => {
  it("allows a few requests an hour per email, counting inside the hour window", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockResolvedValue(rows(MAX_RESET_REQUESTS.email - 1) as any);
    expect(await resetRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(0);
    const [emailQ] = vi.mocked(prisma.authAttempt.findMany).mock.calls.map((c) => c[0]!);
    expect(emailQ.where).toEqual({ kind: "reset-email", key: "a@b.co", createdAt: { gte: new Date(NOW - RESET_WINDOW_MS) } });
  });

  it("blocks an email at its limit until the oldest request leaves the hour", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "reset-email" ? rows(MAX_RESET_REQUESTS.email, 20 * 60_000) : []) as any);
    expect(await resetRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(40);
  });

  it("records the email and IP", async () => {
    await recordResetRequest("a@b.co", "1.1.1.1");
    expect(prisma.authAttempt.createMany).toHaveBeenCalledWith({
      data: [
        { kind: "reset-email", key: "a@b.co" },
        { kind: "reset-ip", key: "1.1.1.1" },
      ],
    });
  });
});

describe("verification email requests", () => {
  it("are limited per email like reset requests", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "verify-email" ? rows(MAX_RESET_REQUESTS.email, 20 * 60_000) : []) as any);
    expect(await verifyRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(40);
  });
  it("allows a caller under the limits", async () => {
    expect(await verifyRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(0);
  });
  it("records the email and IP", async () => {
    await recordVerifyRequest("a@b.co", "1.1.1.1");
    expect(prisma.authAttempt.createMany).toHaveBeenCalledWith({
      data: [
        { kind: "verify-email", key: "a@b.co" },
        { kind: "verify-ip", key: "1.1.1.1" },
      ],
    });
  });
});

describe("email-change requests", () => {
  it("are limited per email like reset requests", async () => {
    vi.mocked(prisma.authAttempt.findMany).mockImplementation((async (q: any) =>
      q.where.kind === "change-email" ? rows(MAX_RESET_REQUESTS.email, 20 * 60_000) : []) as any);
    expect(await changeEmailRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(40);
  });
  it("allows a caller under the limits, and records the email and IP", async () => {
    expect(await changeEmailRetryAfterMinutes("a@b.co", "1.1.1.1")).toBe(0);
    await recordChangeEmailRequest("a@b.co", "1.1.1.1");
    expect(prisma.authAttempt.createMany).toHaveBeenCalledWith({
      data: [
        { kind: "change-email", key: "a@b.co" },
        { kind: "change-ip", key: "1.1.1.1" },
      ],
    });
  });
});

describe("recordFailedLogin", () => {
  it("records the email and IP and sweeps day-old rows", async () => {
    await recordFailedLogin("a@b.co", "1.1.1.1");
    expect(prisma.authAttempt.createMany).toHaveBeenCalledWith({
      data: [
        { kind: "email", key: "a@b.co" },
        { kind: "ip", key: "1.1.1.1" },
      ],
    });
    expect(prisma.authAttempt.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW - 24 * 3600_000) } },
    });
  });
});

describe("clearFailedLogins", () => {
  it("wipes only that email's failures", async () => {
    await clearFailedLogins("a@b.co");
    expect(prisma.authAttempt.deleteMany).toHaveBeenCalledWith({ where: { kind: "email", key: "a@b.co" } });
  });
});
