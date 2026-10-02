import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = { emailVerificationToken: { updateMany: vi.fn() }, user: { update: vi.fn() } };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock("@/lib/emailVerification", () => ({ findValidVerificationToken: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  verifyRetryAfterMinutes: vi.fn(),
  recordVerifyRequest: vi.fn(),
}));

import { resendVerificationAction } from "@/app/verify-email/actions";
import { verifyEmailAction } from "@/app/verify-email/[token]/actions";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { findValidVerificationToken, sendVerificationEmail } from "@/lib/emailVerification";
import { verifyRetryAfterMinutes, recordVerifyRequest } from "@/lib/rateLimit";
import { hashInviteToken } from "@/lib/syncToken";

const unverified = { id: "u1", email: "a@b.co", firstName: "Sam", emailVerifiedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(unverified as any);
  vi.mocked(verifyRetryAfterMinutes).mockResolvedValue(0);
});

describe("resendVerificationAction", () => {
  it("needs a signed-in, unverified user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await resendVerificationAction()).toEqual({ error: "Log in first." });
    vi.mocked(getSessionUser).mockResolvedValue({ ...unverified, emailVerifiedAt: new Date() } as any);
    expect(await resendVerificationAction()).toEqual({ error: "Your email is already confirmed." });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    vi.mocked(verifyRetryAfterMinutes).mockResolvedValue(20);
    expect(await resendVerificationAction()).toEqual({ error: "Too many requests. Try again in 20 minutes." });
    vi.mocked(verifyRetryAfterMinutes).mockResolvedValue(1);
    expect(await resendVerificationAction()).toEqual({ error: "Too many requests. Try again in 1 minute." });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("records the request and sends a new link", async () => {
    expect(await resendVerificationAction()).toEqual({ sent: true });
    expect(recordVerifyRequest).toHaveBeenCalledWith("a@b.co", "1.2.3.4");
    expect(sendVerificationEmail).toHaveBeenCalledWith(unverified);
  });

  it("reports an email that couldn't be sent", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendVerificationEmail).mockRejectedValue(new Error("provider down"));
    expect(await resendVerificationAction()).toEqual({ error: "We couldn't send the email. Try again in a few minutes." });
    err.mockRestore();
  });
});

describe("verifyEmailAction", () => {
  const row = { id: "t1", user: { id: "u1", emailVerifiedAt: null } };
  beforeEach(() => {
    vi.mocked(findValidVerificationToken).mockResolvedValue(row as any);
    vi.mocked(prisma.emailVerificationToken.updateMany).mockResolvedValue({ count: 1 });
  });

  it("rejects an invalid or expired link", async () => {
    vi.mocked(findValidVerificationToken).mockResolvedValue(null);
    expect((await verifyEmailAction("tok", null))?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("loses a race for the same link gracefully", async () => {
    vi.mocked(prisma.emailVerificationToken.updateMany).mockResolvedValue({ count: 0 });
    expect((await verifyEmailAction("tok", null))?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("marks the link used and the email verified, then returns a signed-in user to onboarding", async () => {
    await expect(verifyEmailAction("tok", null)).rejects.toThrow("REDIRECT:/onboarding");
    expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashInviteToken("tok"), usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerifiedAt: expect.any(Date) } });
  });

  it("sends someone who isn't logged in to the login page", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(verifyEmailAction("tok", null)).rejects.toThrow("REDIRECT:/login?verified=1");
  });
});
