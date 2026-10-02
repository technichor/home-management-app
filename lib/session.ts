import { SessionOptions } from "iron-session";

export interface SessionData {
  // The signed-in individual. Their household is looked up from the database on every request.
  userId?: string;
  // When this session started (ms). A password change signs out sessions older than it.
  issuedAt?: number;
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
