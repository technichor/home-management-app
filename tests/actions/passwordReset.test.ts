import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), appUrl: vi.fn(() => "https://app.test") }));
vi.mock("@/lib/passwordReset", async (orig) => ({ ...(await orig<typeof import("@/lib/passwordReset")>()), findValidResetToken: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  resetRetryAfterMinutes: vi.fn(),
  recordResetRequest: vi.fn(),
  clearFailedLogins: vi.fn(),
}));

import { requestPasswordResetAction } from "@/app/forgot-password/actions";
import { resetPasswordAction } from "@/app/reset-password/[token]/actions";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { findValidResetToken } from "@/lib/passwordReset";
import { resetRetryAfterMinutes, recordResetRequest, clearFailedLogins } from "@/lib/rateLimit";
import { hashInviteToken } from "@/lib/syncToken";
import bcrypt from "bcryptjs";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}
const SENT = { sent: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resetRetryAfterMinutes).mockResolvedValue(0);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", firstName: "Sam" } as any);
});

describe("requestPasswordResetAction", () => {
  it("rejects an invalid email", async () => {
    const r = await requestPasswordResetAction(null, fd({ email: "nope" }));
    expect(r && "error" in r && r.error).toContain("valid email");
    expect(recordResetRequest).not.toHaveBeenCalled();
  });

  it("answers the same, and sends nothing, when throttled", async () => {
    vi.mocked(resetRetryAfterMinutes).mockResolvedValue(30);
    expect(await requestPasswordResetAction(null, fd({ email: "a@b.co" }))).toEqual(SENT);
    expect(recordResetRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("answers the same, and sends nothing, for an unknown email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await requestPasswordResetAction(null, fd({ email: "a@b.co" }))).toEqual(SENT);
    expect(recordResetRequest).toHaveBeenCalledWith("a@b.co", "1.2.3.4");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("stores only the token's hash, replaces older links and emails the link", async () => {
    expect(await requestPasswordResetAction(null, fd({ email: " A@B.co " }))).toEqual(SENT);
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0].where).toEqual({ email: "a@b.co" });
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
    const data = vi.mocked(prisma.passwordResetToken.create).mock.calls[0][0].data as any;
    expect(data.userId).toBe("u1");
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("a@b.co");
    const token = mail.text.match(/https:\/\/app\.test\/reset-password\/(\S+)/)![1];
    expect(data.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("still gives the generic answer, and logs, when the email fails to send", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValue(new Error("provider down"));
    expect(await requestPasswordResetAction(null, fd({ email: "a@b.co" }))).toEqual(SENT);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("resetPasswordAction", () => {
  const good = { newPassword: "new-password-1", confirmPassword: "new-password-1" };
  const row = { id: "t1", user: { id: "u1", email: "a@b.co" } };

  beforeEach(() => {
    vi.mocked(findValidResetToken).mockResolvedValue(row as any);
    vi.mocked(bcrypt.hash).mockResolvedValue("NEWHASH" as never);
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 1 });
  });

  it.each([
    ["a short password", { newPassword: "short", confirmPassword: "short" }, "at least 8 characters"],
    ["a mismatch", { newPassword: "new-password-1", confirmPassword: "other-password" }, "don't match"],
  ])("rejects %s", async (_n, input, msg) => {
    const r = await resetPasswordAction("tok", null, fd(input));
    expect(r?.error).toContain(msg);
    expect(findValidResetToken).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired link", async () => {
    vi.mocked(findValidResetToken).mockResolvedValue(null);
    const r = await resetPasswordAction("tok", null, fd(good));
    expect(r?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("loses a race for the same link gracefully", async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });
    const r = await resetPasswordAction("tok", null, fd(good));
    expect(r?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("sets the password, stamps the change, burns every link, clears lockouts and goes to login", async () => {
    await expect(resetPasswordAction("tok", null, fd(good))).rejects.toThrow("REDIRECT:/login?reset=1");
    expect(bcrypt.hash).toHaveBeenCalledWith("new-password-1", 12);
    expect(vi.mocked(prisma.passwordResetToken.updateMany).mock.calls[0][0].where).toEqual({
      tokenHash: hashInviteToken("tok"),
      usedAt: null,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "NEWHASH", passwordChangedAt: expect.any(Date) },
    });
    expect(vi.mocked(prisma.passwordResetToken.updateMany).mock.calls[1][0].where).toEqual({ userId: "u1", usedAt: null });
    expect(clearFailedLogins).toHaveBeenCalledWith("a@b.co");
  });
});
