import { SessionOptions } from "iron-session";

export interface SessionData {
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
