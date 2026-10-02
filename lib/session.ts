import { SessionOptions } from "iron-session";

export interface SessionData {
  // The signed-in individual. Household access is derived from this user.
  userId?: string;
  // Legacy shared-household-login fields; still read by the /[slug] routes until they are
  // replaced. Set at user login when the user's household still has a slug.
  householdId: string;
  householdSlug: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: "home-mgmt-session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};
