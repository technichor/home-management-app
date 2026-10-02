import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/emailVerification", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  loginRetryAfterMinutes: vi.fn(),
  recordFailedLogin: vi.fn(),
  clearFailedLogins: vi.fn(),
}));

import { signupAction } from "@/app/signup/actions";
import { loginAction, logoutAction } from "@/app/login/actions";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/emailVerification";
import { loginRetryAfterMinutes, recordFailedLogin, clearFailedLogins } from "@/lib/rateLimit";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

let session: any;
beforeEach(() => {
  vi.clearAllMocks();
  session = { save: vi.fn(), destroy: vi.fn() };
  vi.mocked(getIronSession).mockResolvedValue(session);
  vi.mocked(loginRetryAfterMinutes).mockResolvedValue(0);
});

describe("signupAction", () => {
  const valid = { firstName: "Sam", lastName: "Smith", email: " Sam@Example.com ", password: "longenough" };

  it("rejects invalid input with every message", async () => {
    const r = await signupAction(null, fd({ firstName: "", lastName: "", email: "nope", password: "short" }));
    expect(r?.error).toContain("First name is required");
    expect(r?.error).toContain("Enter a valid email address");
    expect(r?.error).toContain("Password must be at least 8 characters");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an email that is already registered", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u0" } as any);
    const r = await signupAction(null, fd(valid));
    expect(r).toEqual({ error: "An account with that email already exists." });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates the user with a normalized email and hashed password, signs in, and goes to onboarding", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("HASH" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u1", household: null } as any);
    await expect(signupAction(null, fd(valid))).rejects.toThrow("REDIRECT:/onboarding");
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toEqual({
      email: "sam@example.com",
      passwordHash: "HASH",
      firstName: "Sam",
      lastName: "Smith",
    });
    expect(session.userId).toBe("u1");
    expect(session.save).toHaveBeenCalled();
  });

  it("emails a confirmation link to the new user, and an unverified user is sent to confirm first", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("HASH" as never);
    const created = { id: "u1", email: "sam@example.com", firstName: "Sam", emailVerifiedAt: null, household: null };
    vi.mocked(prisma.user.create).mockResolvedValue(created as any);
    await expect(signupAction(null, fd(valid))).rejects.toThrow("REDIRECT:/verify-email");
    expect(sendVerificationEmail).toHaveBeenCalledWith(created);
  });

  it("still signs the user in when the confirmation email fails to send", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("HASH" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u1", household: null } as any);
    vi.mocked(sendVerificationEmail).mockRejectedValue(new Error("provider down"));
    await expect(signupAction(null, fd(valid))).rejects.toThrow("REDIRECT:/onboarding");
    expect(session.userId).toBe("u1");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("reports a duplicate email caught by the database (signup race)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("HASH" as never);
    vi.mocked(prisma.user.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await signupAction(null, fd(valid))).toEqual({ error: "An account with that email already exists." });
  });

  it("rethrows unexpected database errors", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("HASH" as never);
    vi.mocked(prisma.user.create).mockRejectedValue(new Error("db down"));
    await expect(signupAction(null, fd(valid))).rejects.toThrow("db down");
  });
});

describe("loginAction", () => {
  const creds = { email: "Sam@Example.com", password: "longenough" };
  const user = { id: "u1", passwordHash: "HASH", household: { id: "h1", urlSlug: "smiths", deletedAt: null } };

  it("rejects invalid input", async () => {
    const r = await loginAction(null, fd({ email: "bad", password: "" }));
    expect(r?.error).toContain("Enter a valid email address");
    expect(r?.error).toContain("Password is required");
  });

  it("gives the same error for an unknown email as for a wrong password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const unknown = await loginAction(null, fd(creds));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    const wrong = await loginAction(null, fd(creds));
    expect(unknown).toEqual({ error: "Incorrect email or password." });
    expect(wrong).toEqual(unknown);
    expect(session.save).not.toHaveBeenCalled();
  });

  it("still compares a hash when the email is unknown, and never accepts it", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    expect(await loginAction(null, fd(creds))).toEqual({ error: "Incorrect email or password." });
    expect(bcrypt.compare).toHaveBeenCalled();
  });

  it("records each failure against the email and IP", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await loginAction(null, fd(creds));
    expect(recordFailedLogin).toHaveBeenCalledWith("sam@example.com", "1.2.3.4");
    expect(clearFailedLogins).not.toHaveBeenCalled();
  });

  it("refuses while locked out, without checking the password or recording more failures", async () => {
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(12);
    expect(await loginAction(null, fd(creds))).toEqual({ error: "Too many failed attempts. Try again in 12 minutes." });
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(1);
    expect(await loginAction(null, fd(creds))).toEqual({ error: "Too many failed attempts. Try again in 1 minute." });
    expect(loginRetryAfterMinutes).toHaveBeenCalledWith("sam@example.com", "1.2.3.4");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(recordFailedLogin).not.toHaveBeenCalled();
  });

  it("looks the user up by lowercased email, signs in, clears that email's failures and goes to their household", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    await expect(loginAction(null, fd(creds))).rejects.toThrow("REDIRECT:/smiths/contacts");
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0].where).toEqual({ email: "sam@example.com" });
    expect(session.userId).toBe("u1");
    expect(clearFailedLogins).toHaveBeenCalledWith("sam@example.com");
  });

  it("sends a user with no household to onboarding", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, household: null } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    await expect(loginAction(null, fd(creds))).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("logoutAction", () => {
  it("destroys the session and goes to the login page", async () => {
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
    expect(session.destroy).toHaveBeenCalled();
  });
});
