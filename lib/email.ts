import { appendFile } from "node:fs/promises";
import { prisma } from "@/lib/db";

// Sends mail through Resend's REST API. Without RESEND_API_KEY (local dev) the message is printed
// to the server log instead, so flows that email a link can still be tried by hand.
//
// EMAIL_FROM defaults to Resend's shared test sender, which only delivers to the Resend
// account's own address. Set EMAIL_FROM to an address on a verified domain to email anyone.
const DEFAULT_FROM = "Domata <onboarding@resend.dev>";

const LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Message = { to: string; subject: string; text: string };

/**
 * Record that a send was attempted, so a problem can be found later in /admin/email. Only the
 * recipient and subject are kept (never the body: the links inside are secrets), and logging can
 * never be the reason an email fails to go out.
 */
async function logAttempt(
  message: Message,
  outcome: { status: "SENT" | "FAILED" | "NOT_SENT"; providerId?: string; error?: string }
): Promise<void> {
  try {
    await prisma.emailLogEntry.create({
      data: { toAddress: message.to, subject: message.subject, ...outcome },
    });
    await prisma.emailLogEntry.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOG_RETENTION_MS) } } });
  } catch (e) {
    console.error("Could not record the email attempt", e);
  }
}

export async function sendEmail(message: Message): Promise<void> {
  // End-to-end tests set EMAIL_OUTBOX_FILE so the browser tests can read the links the app emails.
  if (process.env.EMAIL_OUTBOX_FILE) {
    await appendFile(process.env.EMAIL_OUTBOX_FILE, JSON.stringify(message) + "\n");
    await logAttempt(message, { status: "SENT", providerId: "outbox" });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${message.to} subject=${message.subject}\n${message.text}`);
    await logAttempt(message, { status: "NOT_SENT", error: "No RESEND_API_KEY is configured." });
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, ...message }),
    });
  } catch (e) {
    await logAttempt(message, { status: "FAILED", error: `Could not reach the email provider: ${(e as Error).message}`.slice(0, 500) });
    throw e;
  }
  if (!response.ok) {
    const error = `Email send failed (${response.status}): ${await response.text()}`;
    await logAttempt(message, { status: "FAILED", error: error.slice(0, 500) });
    throw new Error(error);
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  await logAttempt(message, { status: "SENT", providerId: body?.id });
}

/**
 * The site's own address, for links in emails. Never taken from the request's Host header (that
 * would let an attacker point a victim's reset link at their own site): set APP_URL, or on
 * Vercel the production URL is used.
 */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
