import { headers } from "next/headers";
import { prisma } from "@/lib/db";

// Attempts are counted per key (an email, or a client IP) over a sliding window. The counts live
// in the database because serverless instances share no memory.
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES = { email: 5, ip: 30 } as const;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const MAX_RESET_REQUESTS = { email: 3, ip: 10 } as const;

const RETENTION_MS = 24 * 60 * 60 * 1000;

type Limit = { kind: string; key: string; max: number; windowMs: number };

/** The caller's IP as set by the host's proxy (Vercel overwrites x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

/** Minutes until every limit allows another attempt, or 0 if the caller may try now. */
async function retryAfterMinutes(limits: Limit[]): Promise<number> {
  let blockedUntil = 0;
  for (const { kind, key, max, windowMs } of limits) {
    const recent = await prisma.authAttempt.findMany({
      where: { kind, key, createdAt: { gte: new Date(Date.now() - windowMs) } },
      orderBy: { createdAt: "desc" },
      take: max,
      select: { createdAt: true },
    });
    // Blocked until the max-th most recent attempt ages out of the window.
    if (recent.length >= max) blockedUntil = Math.max(blockedUntil, recent[max - 1].createdAt.getTime() + windowMs);
  }
  return blockedUntil > Date.now() ? Math.ceil((blockedUntil - Date.now()) / 60_000) : 0;
}

async function record(attempts: { kind: string; key: string }[]): Promise<void> {
  await prisma.authAttempt.createMany({ data: attempts });
  // Old rows are useless to any window; sweep them as we go instead of needing a cron job.
  await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
}

// ---- Failed logins (also counts wrong current passwords) ----

export const loginRetryAfterMinutes = (email: string, ip: string) =>
  retryAfterMinutes([
    { kind: "email", key: email, max: MAX_FAILURES.email, windowMs: WINDOW_MS },
    { kind: "ip", key: ip, max: MAX_FAILURES.ip, windowMs: WINDOW_MS },
  ]);

export const recordFailedLogin = (email: string, ip: string) =>
  record([
    { kind: "email", key: email },
    { kind: "ip", key: ip },
  ]);

/** A successful login wipes that email's failures (the IP's count is left to age out). */
export async function clearFailedLogins(email: string): Promise<void> {
  await prisma.authAttempt.deleteMany({ where: { kind: "email", key: email } });
}

// ---- Password reset requests (every request counts, so nobody can flood an inbox) ----

export const resetRetryAfterMinutes = (email: string, ip: string) =>
  retryAfterMinutes([
    { kind: "reset-email", key: email, max: MAX_RESET_REQUESTS.email, windowMs: RESET_WINDOW_MS },
    { kind: "reset-ip", key: ip, max: MAX_RESET_REQUESTS.ip, windowMs: RESET_WINDOW_MS },
  ]);

export const recordResetRequest = (email: string, ip: string) =>
  record([
    { kind: "reset-email", key: email },
    { kind: "reset-ip", key: ip },
  ]);

// ---- Verification emails (resends count, so nobody can flood an inbox) ----

export const verifyRetryAfterMinutes = (email: string, ip: string) =>
  retryAfterMinutes([
    { kind: "verify-email", key: email, max: MAX_RESET_REQUESTS.email, windowMs: RESET_WINDOW_MS },
    { kind: "verify-ip", key: ip, max: MAX_RESET_REQUESTS.ip, windowMs: RESET_WINDOW_MS },
  ]);

export const recordVerifyRequest = (email: string, ip: string) =>
  record([
    { kind: "verify-email", key: email },
    { kind: "verify-ip", key: ip },
  ]);
