import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { emailChangeToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), appUrl: vi.fn(() => "https://app.test") }));

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { findValidChangeToken, sendChangeEmailLink, sendEmailChangedNotice, CHANGE_TTL_MS } from "@/lib/emailChange";
import { hashInviteToken } from "@/lib/syncToken";

const row = (over: object = {}) => ({
  id: "t1", newEmail: "new@x.co", usedAt: null, expiresAt: new Date(Date.now() + 60_000),
  user: { id: "u1", email: "old@x.co", firstName: "Sam" }, ...over,
});
beforeEach(() => vi.clearAllMocks());

describe("findValidChangeToken", () => {
  it("looks the token up by its hash and returns a usable row", async () => {
    vi.mocked(prisma.emailChangeToken.findUnique).mockResolvedValue(row() as any);
    expect(await findValidChangeToken("tok")).toMatchObject({ id: "t1", newEmail: "new@x.co" });
    expect(vi.mocked(prisma.emailChangeToken.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashInviteToken("tok") });
  });

  it.each([
    ["unknown", null],
    ["used", row({ usedAt: new Date() })],
    ["expired", row({ expiresAt: new Date(Date.now() - 1000) })],
  ])("returns null for a token that is %s", async (_n, value) => {
    vi.mocked(prisma.emailChangeToken.findUnique).mockResolvedValue(value as any);
    expect(await findValidChangeToken("tok")).toBeNull();
  });
});

describe("sendChangeEmailLink", () => {
  it("replaces unused links, stores only the hash with the new address, and emails the NEW address", async () => {
    await sendChangeEmailLink({ id: "u1", firstName: "Sam" }, "new@x.co");
    expect(prisma.emailChangeToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
    const data = vi.mocked(prisma.emailChangeToken.create).mock.calls[0][0].data as any;
    expect(data).toMatchObject({ userId: "u1", newEmail: "new@x.co" });
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CHANGE_TTL_MS);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("new@x.co");
    const token = mail.text.match(/https:\/\/app\.test\/change-email\/(\S+)/)![1];
    expect(data.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("lets a send failure reach the caller", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("provider down"));
    await expect(sendChangeEmailLink({ id: "u1", firstName: "Sam" }, "new@x.co")).rejects.toThrow("provider down");
  });
});

describe("sendEmailChangedNotice", () => {
  it("tells the OLD address what changed and how to react", async () => {
    await sendEmailChangedNotice({ firstName: "Sam" }, "old@x.co", "new@x.co");
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("old@x.co");
    expect(mail.text).toContain("old@x.co");
    expect(mail.text).toContain("new@x.co");
    expect(mail.text).toContain("https://app.test/forgot-password");
  });
});
