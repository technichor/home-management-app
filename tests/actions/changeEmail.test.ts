import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ requireMember: vi.fn(), requireHouseholdId: vi.fn(), startSession: vi.fn(), getSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    emailChangeToken: { updateMany: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock("@/lib/emailChange", () => ({
  findValidChangeToken: vi.fn(),
  sendChangeEmailLink: vi.fn(),
  sendEmailChangedNotice: vi.fn(),
}));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  loginRetryAfterMinutes: vi.fn(),
  recordFailedLogin: vi.fn(),
  changeEmailRetryAfterMinutes: vi.fn(),
  recordChangeEmailRequest: vi.fn(),
}));

import { requestEmailChangeAction } from "@/app/(app)/account/actions";
import { confirmEmailChangeAction } from "@/app/change-email/[token]/actions";
import { prisma } from "@/lib/db";
import { requireMember, getSessionUser } from "@/lib/auth";
import { findValidChangeToken, sendChangeEmailLink, sendEmailChangedNotice } from "@/lib/emailChange";
import { changeEmailRetryAfterMinutes, loginRetryAfterMinutes, recordChangeEmailRequest, recordFailedLogin } from "@/lib/rateLimit";
import { hashInviteToken } from "@/lib/syncToken";
import bcrypt from "bcryptjs";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}
const me = { id: "u1", email: "old@x.co", firstName: "Sam", passwordHash: "HASH" };
const input = { newEmail: " New@X.co ", password: "pw-12345" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireMember).mockResolvedValue(me as any);
  vi.mocked(loginRetryAfterMinutes).mockResolvedValue(0);
  vi.mocked(changeEmailRetryAfterMinutes).mockResolvedValue(0);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
});

describe("requestEmailChangeAction", () => {
  it("requires a signed-in member", async () => {
    vi.mocked(requireMember).mockRejectedValue(new Error("Not authenticated"));
    await expect(requestEmailChangeAction(null, fd(input))).rejects.toThrow("Not authenticated");
    expect(sendChangeEmailLink).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid address", { newEmail: "nope", password: "pw" }, "valid email"],
    ["a missing password", { newEmail: "a@b.co", password: "" }, "Enter your password"],
  ])("rejects %s", async (_n, fields, message) => {
    const r = await requestEmailChangeAction(null, fd(fields));
    expect(r && "error" in r && r.error).toContain(message);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects the address you already have (case-insensitively)", async () => {
    expect(await requestEmailChangeAction(null, fd({ newEmail: "OLD@x.co", password: "pw" }))).toEqual({
      error: "That is already your email address.",
    });
    expect(sendChangeEmailLink).not.toHaveBeenCalled();
  });

  it("refuses while the account is locked out by failed logins", async () => {
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(7);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "Too many failed attempts. Try again in 7 minutes." });
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(1);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "Too many failed attempts. Try again in 1 minute." });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects a wrong password and counts it as a failed login", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "Your password is incorrect." });
    expect(bcrypt.compare).toHaveBeenCalledWith("pw-12345", "HASH");
    expect(recordFailedLogin).toHaveBeenCalledWith("old@x.co", "1.2.3.4");
    expect(sendChangeEmailLink).not.toHaveBeenCalled();
  });

  it("limits how many confirmation emails can be requested", async () => {
    vi.mocked(changeEmailRetryAfterMinutes).mockResolvedValue(25);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "Too many requests. Try again in 25 minutes." });
    vi.mocked(changeEmailRetryAfterMinutes).mockResolvedValue(1);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "Too many requests. Try again in 1 minute." });
    expect(sendChangeEmailLink).not.toHaveBeenCalled();
  });

  it("refuses an address another account already uses, sending nothing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u2" } as any);
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "An account already uses that email address." });
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0].where).toEqual({ email: "new@x.co" });
    expect(sendChangeEmailLink).not.toHaveBeenCalled();
    expect(recordChangeEmailRequest).not.toHaveBeenCalled();
  });

  it("records the request and emails a link to the normalized new address", async () => {
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ sentTo: "new@x.co" });
    expect(recordChangeEmailRequest).toHaveBeenCalledWith("old@x.co", "1.2.3.4");
    expect(sendChangeEmailLink).toHaveBeenCalledWith(me, "new@x.co");
    expect(prisma.user.update).not.toHaveBeenCalled(); // nothing changes until the link is opened
  });

  it("reports an email that couldn't be sent", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendChangeEmailLink).mockRejectedValueOnce(new Error("provider down"));
    expect(await requestEmailChangeAction(null, fd(input))).toEqual({ error: "We couldn't send the email. Try again in a few minutes." });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("confirmEmailChangeAction", () => {
  const row = { id: "t1", newEmail: "new@x.co", user: { id: "u1", email: "old@x.co", firstName: "Sam" } };
  beforeEach(() => {
    vi.mocked(findValidChangeToken).mockResolvedValue(row as any);
    vi.mocked(prisma.emailChangeToken.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as any);
  });

  it("rejects an invalid or expired link", async () => {
    vi.mocked(findValidChangeToken).mockResolvedValue(null);
    expect((await confirmEmailChangeAction("tok"))?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("loses a race for the same link gracefully", async () => {
    vi.mocked(prisma.emailChangeToken.updateMany).mockResolvedValue({ count: 0 });
    expect((await confirmEmailChangeAction("tok"))?.error).toContain("not valid or has expired");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("reports an address someone registered after the link was sent", async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await confirmEmailChangeAction("tok")).toEqual({ error: "An account already uses that email address." });
    expect(sendEmailChangedNotice).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error("db down"));
    await expect(confirmEmailChangeAction("tok")).rejects.toThrow("db down");
  });

  it("switches the login email, marks it verified, burns other links and tells the old address", async () => {
    await expect(confirmEmailChangeAction("tok")).rejects.toThrow("REDIRECT:/account");
    expect(vi.mocked(prisma.emailChangeToken.updateMany).mock.calls[0][0].where).toEqual({
      tokenHash: hashInviteToken("tok"),
      usedAt: null,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { email: "new@x.co", emailVerifiedAt: expect.any(Date) },
    });
    expect(vi.mocked(prisma.emailChangeToken.updateMany).mock.calls[1][0].where).toEqual({ userId: "u1", usedAt: null });
    expect(sendEmailChangedNotice).toHaveBeenCalledWith(row.user, "old@x.co", "new@x.co");
  });

  it("still succeeds when the notice to the old address fails to send", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmailChangedNotice).mockRejectedValueOnce(new Error("provider down"));
    await expect(confirmEmailChangeAction("tok")).rejects.toThrow("REDIRECT:/account");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("sends someone who isn't logged in to the login page with a notice", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(confirmEmailChangeAction("tok")).rejects.toThrow("REDIRECT:/login?changed=1");
  });
});
