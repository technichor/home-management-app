import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { open, seal, secretBoxReady } from "@/lib/secretBox";

// Talking to Google for the Google Calendar integration (docs/domains/google-calendar.md): the OAuth sign-in that links
// a member's Google account, keeping their access token fresh, and calls to the Calendar API made as them. Tokens are
// stored encrypted (lib/secretBox.ts). The base URLs can be pointed elsewhere (a stand-in Google in the browser tests).

const OAUTH_SIGN_IN = process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_API = process.env.GOOGLE_OAUTH_API ?? "https://oauth2.googleapis.com";
const CALENDAR_API = process.env.GOOGLE_CALENDAR_API ?? "https://www.googleapis.com/calendar/v3";

/**
 * What Domata asks for: who you are, your list of calendars (read only), events (to show and to create), and making a
 * calendar for the household (it can only manage calendars it made itself).
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.app.created",
];

/** An access token is renewed this long before it expires. */
const EXPIRY_MARGIN_MS = 60_000;

/** Google answered with an error, or a member's link needs renewing (`needsReconnect`). */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly needsReconnect = false,
  ) {
    super(message);
  }
}

/** Whether the integration is set up: the OAuth client from Google Cloud and the key that encrypts tokens. */
export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) && secretBoxReady();
}

export const googleRedirectUri = () => `${appUrl()}/api/google/callback`;

/** Where to send someone to link their Google account. `state` ties the answer to their session. */
export function googleSignInUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // A refresh token, so Domata can keep working while they're away, and asked for every time so one is always given.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_SIGN_IN}?${params}`;
}

type TokenAnswer = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenAnswer> {
  const response = await fetch(`${OAUTH_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const answer = (await response.json().catch(() => ({}))) as TokenAnswer;
  if (!response.ok) throw new GoogleError(`Google refused the sign-in (${answer.error ?? response.status})`, answer.error === "invalid_grant");
  return answer;
}

/** The email in Google's ID token. (It comes straight from Google over TLS, so its signature needn't be checked.) */
function emailOf(idToken: string | undefined): string {
  const payload = idToken?.split(".")[1];
  const claims = payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string }) : {};
  if (!claims.email) throw new GoogleError("Google didn't say which account this is");
  return claims.email.toLowerCase();
}

/** Finish linking: trade the code Google sent back for tokens, and keep them (encrypted) for this user. */
export async function connectGoogle(userId: string, code: string): Promise<{ email: string }> {
  const answer = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: googleRedirectUri() });
  if (!answer.refresh_token) throw new GoogleError("Google didn't grant ongoing access; try connecting again");
  const email = emailOf(answer.id_token);
  const data = {
    googleEmail: email,
    refreshToken: seal(answer.refresh_token),
    accessToken: seal(answer.access_token),
    accessTokenExpiresAt: new Date(Date.now() + answer.expires_in * 1000),
    needsReconnect: false,
  };
  await prisma.googleConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { email };
}

/** A current access token for the user, renewed when needed. A refused renewal marks the link as needing reconnecting. */
export async function accessTokenFor(userId: string): Promise<string> {
  const connection = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!connection) throw new GoogleError("Google isn't connected", true);
  if (connection.needsReconnect) throw new GoogleError("Connect Google again", true);
  if (connection.accessToken && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
    return open(connection.accessToken);
  }
  try {
    const answer = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(connection.refreshToken) });
    await prisma.googleConnection.update({
      where: { userId },
      data: { accessToken: seal(answer.access_token), accessTokenExpiresAt: new Date(Date.now() + answer.expires_in * 1000) },
    });
    return answer.access_token;
  } catch (e) {
    if (e instanceof GoogleError && e.needsReconnect) await prisma.googleConnection.update({ where: { userId }, data: { needsReconnect: true } });
    throw e;
  }
}

/** A Calendar API call made as the user. Returns the JSON answer (null for an empty one). */
export async function calendarApi<T>(userId: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessTokenFor(userId);
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined && { "Content-Type": "application/json" }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new GoogleError(`Google Calendar: ${detail?.error?.message ?? response.statusText} (${response.status})`, response.status === 401);
  }
  return (response.status === 204 ? null : await response.json()) as T;
}

export type GoogleCalendarSummary = { id: string; name: string; color: string | null; canWrite: boolean; primary: boolean };

/** The calendars in the user's Google account (their own and ones shared with them), primary first. */
export async function listGoogleCalendars(userId: string): Promise<GoogleCalendarSummary[]> {
  const answer = await calendarApi<{ items?: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; accessRole: string; primary?: boolean }[] }>(
    userId,
    "/users/me/calendarList?minAccessRole=reader",
  );
  return (answer.items ?? [])
    .map((c) => ({
      id: c.id,
      name: c.summaryOverride ?? c.summary,
      color: c.backgroundColor ?? null,
      canWrite: c.accessRole === "owner" || c.accessRole === "writer",
      primary: c.primary === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/**
 * Unlink a member's Google account: ask Google to revoke Domata's access (best effort: it may already be revoked), and
 * forget the tokens and their shared calendars.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const connection = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!connection) return;
  try {
    await fetch(`${OAUTH_API}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: open(connection.refreshToken) }),
    });
  } catch {
    // Already revoked, or Google is unreachable: the stored tokens are deleted either way.
  }
  await prisma.googleConnection.delete({ where: { userId } });
}
