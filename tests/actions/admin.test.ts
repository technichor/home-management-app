import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ requireSuperuser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    adminAuditEntry: { create: vi.fn() },
  },
}));
vi.mock("@/lib/passwordReset", async (orig) => ({
  ...(await orig<typeof import("@/lib/passwordReset")>()),
  createPasswordResetToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  loginRetryAfterMinutes: vi.fn(),
  recordFailedLogin: vi.fn(),
}));

import { createResetLinkAction, emailResetLinkAction, setSuperuserAction } from "@/app/admin/actions";
import { prisma } from "@/lib/db";
import { requireSuperuser } from "@/lib/auth";
import { ADMIN_RESET_TTL_MS, createPasswordResetToken, sendPasswordResetEmail } from "@/lib/passwordReset";
import { loginRetryAfterMinutes, recordFailedLogin } from "@/lib/rateLimit";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

const admin = { id: "a1", email: "admin@x.co", passwordHash: "HASH" };
const target = { id: "t1", email: "pat@x.co", firstName: "Pat", isSuperuser: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSuperuser).mockResolvedValue(admin as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(target as any);
  vi.mocked(createPasswordResetToken).mockResolvedValue("tok123");
  vi.mocked(loginRetryAfterMinutes).mockResolvedValue(0);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(prisma.user.count).mockResolvedValue(2);
});

describe("every admin action is for superusers only", () => {
  it.each([
    ["createResetLink", () => createResetLinkAction("t1")],
    ["emailResetLink", () => emailResetLinkAction("t1")],
    ["setSuperuser", () => setSuperuserAction("t1", true, "pw")],
  ])("%s refuses anyone else before touching anything", async (_n, call) => {
    vi.mocked(requireSuperuser).mockRejectedValue(new Error("Not found"));
    await expect(call()).rejects.toThrow("Not found");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditEntry.create).not.toHaveBeenCalled();
  });
});

describe("createResetLinkAction", () => {
  it("reports an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await createResetLinkAction("nope")).toEqual({ ok: false, error: "User not found." });
    expect(createPasswordResetToken).not.toHaveBeenCalled();
  });

  it("makes a 24-hour link, hands back its path, and records it", async () => {
    expect(await createResetLinkAction("t1")).toEqual({ ok: true, path: "/reset-password/tok123" });
    expect(createPasswordResetToken).toHaveBeenCalledWith("t1", ADMIN_RESET_TTL_MS);
    expect(prisma.adminAuditEntry.create).toHaveBeenCalledWith({
      data: { actorId: "a1", targetUserId: "t1", action: "PASSWORD_RESET_LINK_CREATED", detail: undefined },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/t1");
  });
});

describe("emailResetLinkAction", () => {
  it("reports an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await emailResetLinkAction("nope")).toEqual({ ok: false, error: "User not found." });
  });

  it("emails the user's own address in the administrator wording and records it", async () => {
    expect(await emailResetLinkAction("t1")).toEqual({ ok: true });
    expect(createPasswordResetToken).toHaveBeenCalledWith("t1", ADMIN_RESET_TTL_MS);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(target, "tok123", { byAdmin: true });
    expect(prisma.adminAuditEntry.create).toHaveBeenCalledWith({
      data: { actorId: "a1", targetUserId: "t1", action: "PASSWORD_RESET_EMAIL_SENT", detail: "pat@x.co" },
    });
  });

  it("says so, and records nothing, when the email can't be sent", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(new Error("provider down"));
    expect(await emailResetLinkAction("t1")).toEqual({
      ok: false,
      error: "The email couldn't be sent. Create a link to copy instead.",
    });
    expect(prisma.adminAuditEntry.create).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("setSuperuserAction", () => {
  it("is refused while the admin is locked out by failed logins", async () => {
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(9);
    expect(await setSuperuserAction("t1", true, "pw")).toEqual({ ok: false, error: "Too many failed attempts. Try again in 9 minutes." });
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(1);
    expect(await setSuperuserAction("t1", true, "pw")).toEqual({ ok: false, error: "Too many failed attempts. Try again in 1 minute." });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("needs the admin's own password, counting wrong guesses as failed logins", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect(await setSuperuserAction("t1", true, "wrong")).toEqual({ ok: false, error: "Your password is incorrect." });
    expect(bcrypt.compare).toHaveBeenCalledWith("wrong", "HASH");
    expect(recordFailedLogin).toHaveBeenCalledWith("admin@x.co", "1.2.3.4");
    expect(await setSuperuserAction("t1", true, "")).toEqual({ ok: false, error: "Your password is incorrect." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("reports an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await setSuperuserAction("nope", true, "pw")).toEqual({ ok: false, error: "User not found." });
  });

  it("says when there is nothing to change", async () => {
    expect(await setSuperuserAction("t1", false, "pw")).toEqual({ ok: false, error: "They are not a superuser." });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...target, isSuperuser: true } as any);
    expect(await setSuperuserAction("t1", true, "pw")).toEqual({ ok: false, error: "They are already a superuser." });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("grants superuser access and records it", async () => {
    expect(await setSuperuserAction("t1", true, "pw")).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { isSuperuser: true } });
    expect(prisma.adminAuditEntry.create).toHaveBeenCalledWith({
      data: { actorId: "a1", targetUserId: "t1", action: "SUPERUSER_GRANTED", detail: "pat@x.co" },
    });
  });

  it("revokes it while another superuser remains, and records it", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...target, isSuperuser: true } as any);
    expect(await setSuperuserAction("t1", false, "pw")).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { isSuperuser: false } });
    expect(vi.mocked(prisma.adminAuditEntry.create).mock.calls[0][0].data).toMatchObject({ action: "SUPERUSER_REVOKED" });
  });

  it("never removes the last superuser", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...target, isSuperuser: true } as any);
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    expect(await setSuperuserAction("t1", false, "pw")).toEqual({ ok: false, error: "There must always be at least one superuser." });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { isSuperuser: true } });
  });
});
