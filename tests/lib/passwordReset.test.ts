import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { passwordResetToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), appUrl: vi.fn(() => "https://app.test") }));

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  ADMIN_RESET_TTL_MS,
  RESET_TTL_MS,
  createPasswordResetToken,
  findValidResetToken,
  sendPasswordResetEmail,
} from "@/lib/passwordReset";
import { hashInviteToken } from "@/lib/syncToken";

const row = (over: object = {}) => ({
  id: "t1", usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "u1", email: "a@b.co" }, ...over,
});
beforeEach(() => vi.clearAllMocks());

describe("findValidResetToken", () => {
  it("looks the token up by its hash and returns a usable row", async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(row() as any);
    expect(await findValidResetToken("tok")).toMatchObject({ id: "t1" });
    expect(vi.mocked(prisma.passwordResetToken.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashInviteToken("tok") });
  });

  it.each([
    ["unknown", null],
    ["already used", row({ usedAt: new Date() })],
    ["expired", row({ expiresAt: new Date(Date.now() - 1000) })],
  ])("returns null for a token that is %s", async (_n, value) => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(value as any);
    expect(await findValidResetToken("tok")).toBeNull();
  });
});

describe("createPasswordResetToken", () => {
  it("replaces unused links and stores only the hash, valid for an hour by default", async () => {
    const token = await createPasswordResetToken("u1");
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
    const data = vi.mocked(prisma.passwordResetToken.create).mock.calls[0][0].data as any;
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + RESET_TTL_MS - 5_000);
  });

  it("can be made to last longer (the admin's links)", async () => {
    await createPasswordResetToken("u1", ADMIN_RESET_TTL_MS);
    const data = vi.mocked(prisma.passwordResetToken.create).mock.calls[0][0].data as any;
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + ADMIN_RESET_TTL_MS - 5_000);
  });
});

describe("sendPasswordResetEmail", () => {
  const user = { email: "a@b.co", firstName: "Sam" };

  it("emails the reset link in the ordinary wording", async () => {
    await sendPasswordResetEmail(user, "tok");
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail).toMatchObject({ to: "a@b.co", subject: "Reset your Home Management password" });
    expect(mail.text).toContain("https://app.test/reset-password/tok");
    expect(mail.text).toContain("within an hour");
    expect(mail.text).not.toContain("administrator");
  });

  it("says an administrator started it, and for how long it works, when asked to", async () => {
    await sendPasswordResetEmail(user, "tok", { byAdmin: true });
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.text).toContain("An administrator started a password reset");
    expect(mail.text).toContain("within 24 hours");
    expect(mail.text).toContain("https://app.test/reset-password/tok");
  });
});
