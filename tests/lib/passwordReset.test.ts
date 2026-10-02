import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { passwordResetToken: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { findValidResetToken } from "@/lib/passwordReset";
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
