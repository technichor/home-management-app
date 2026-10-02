// Sends mail through Resend's REST API. Without RESEND_API_KEY (local dev) the message is printed
// to the server log instead, so flows that email a link can still be tried by hand.
//
// EMAIL_FROM defaults to Resend's shared test sender, which only delivers to the Resend
// account's own address. Set EMAIL_FROM to an address on a verified domain to email anyone.
const DEFAULT_FROM = "Home Management <onboarding@resend.dev>";

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${message.to} subject=${message.subject}\n${message.text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, ...message }),
  });
  if (!response.ok) throw new Error(`Email send failed (${response.status}): ${await response.text()}`);
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
