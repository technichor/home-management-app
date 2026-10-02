import { headers } from "next/headers";
import { prisma } from "@/lib/db";

// Failed logins are counted per email (stops guessing one person's password) and per client IP
// (stops one machine trying many emails) over a sliding window. The counts live in the database
// because serverless instances share no memory.
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES = { email: 5, ip: 30 } as const;
type Kind = keyof typeof MAX_FAILURES;

const RETENTION_MS = 24 * 60 * 60 * 1000;

/** The caller's IP as set by the host's proxy (Vercel overwrites x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

/** Minutes until another attempt is allowed, or 0 if the caller may try now. */
export async function loginRetryAfterMinutes(email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  let blockedUntil = 0;
  for (const [kind, key] of [["email", email], ["ip", ip]] as [Kind, string][]) {
    const max = MAX_FAILURES[kind];
    const recent = await prisma.authAttempt.findMany({
      where: { kind, key, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: max,
      select: { createdAt: true },
    });
    // Blocked until the max-th most recent failure ages out of the window.
    if (recent.length >= max) {
      blockedUntil = Math.max(blockedUntil, recent[max - 1].createdAt.getTime() + WINDOW_MS);
    }
  }
  return blockedUntil > Date.now() ? Math.ceil((blockedUntil - Date.now()) / 60_000) : 0;
}

export async function recordFailedLogin(email: string, ip: string): Promise<void> {
  await prisma.authAttempt.createMany({
    data: [
      { kind: "email", key: email },
      { kind: "ip", key: ip },
    ],
  });
  // Old rows are useless to the window; sweep them as we go instead of needing a cron job.
  await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
}

/** A successful login wipes that email's failures (the IP's count is left to age out). */
export async function clearFailedLogins(email: string): Promise<void> {
  await prisma.authAttempt.deleteMany({ where: { kind: "email", key: email } });
}
