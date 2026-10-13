import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { getSessionUser } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { googleConfigured, googleSignInUrl } from "@/lib/google";
import { sessionOptions, type SessionData } from "@/lib/session";

/** Start linking the signed-in member's Google account: remember a one-time value, then off to Google's sign-in. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.redirect(`${appUrl()}/login?next=/account`);
  if (!googleConfigured()) return NextResponse.redirect(`${appUrl()}/account?google=unavailable`);
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.googleState = randomBytes(24).toString("base64url");
  await session.save();
  return NextResponse.redirect(googleSignInUrl(session.googleState));
}
