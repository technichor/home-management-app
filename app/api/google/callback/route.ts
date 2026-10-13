import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { getSessionUser } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { connectGoogle, GoogleError } from "@/lib/google";
import { sessionOptions, type SessionData } from "@/lib/session";

const sameValue = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Where Google sends the member back. The one-time value must match the one in their session (and is used up either
 * way); then the code is traded for tokens. Every outcome lands on the Account page, which says what happened.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.redirect(`${appUrl()}/login?next=/account`);
  const params = new URL(request.url).searchParams;
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const expected = session.googleState;
  delete session.googleState;
  await session.save();

  const back = (outcome: string) => NextResponse.redirect(`${appUrl()}/account?google=${outcome}`);
  const state = params.get("state");
  if (!expected || !state || !sameValue(state, expected)) return back("failed");
  if (params.get("error")) return back("cancelled");
  const code = params.get("code");
  if (!code) return back("failed");
  try {
    await connectGoogle(user.id, code);
    return back("connected");
  } catch (e) {
    if (e instanceof GoogleError) return back("failed");
    throw e;
  }
}
