import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { emailVerificationToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), appUrl: vi.fn(() => "https://app.test") }));

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { findValidVerificationToken, sendVerificationEmail, VERIFY_TTL_MS } from "@/lib/emailVerification";
import { hashInviteToken } from "@/lib/syncToken";

const row = (over: object = {}) => ({
  id: "t1", usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "u1", emailVerifiedAt: null }, ...over,
});
beforeEach(() => vi.clearAllMocks());

describe("findValidVerificationToken", () => {
  it("looks the token up by its hash and returns a usable row", async () => {
    vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue(row() as any);
    expect(await findValidVerificationToken("tok")).toMatchObject({ id: "t1" });
    expect(vi.mocked(prisma.emailVerificationToken.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashInviteToken("tok") });
  });

  it.each([
    ["unknown", null],
    ["used", row({ usedAt: new Date() })],
    ["expired", row({ expiresAt: new Date(Date.now() - 1000) })],
  ])("returns null for a token that is %s", async (_n, value) => {
    vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue(value as any);
    expect(await findValidVerificationToken("tok")).toBeNull();
  });
});

describe("sendVerificationEmail", () => {
  it("replaces unused links, stores only the hash, and emails the link", async () => {
    await sendVerificationEmail({ id: "u1", email: "a@b.co", firstName: "Sam" });
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
    const data = vi.mocked(prisma.emailVerificationToken.create).mock.calls[0][0].data as any;
    expect(data.userId).toBe("u1");
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + VERIFY_TTL_MS);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("a@b.co");
    const token = mail.text.match(/https:\/\/app\.test\/verify-email\/(\S+)/)![1];
    expect(data.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("lets a send failure reach the caller", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("provider down"));
    await expect(sendVerificationEmail({ id: "u1", email: "a@b.co", firstName: "Sam" })).rejects.toThrow("provider down");
  });
});
