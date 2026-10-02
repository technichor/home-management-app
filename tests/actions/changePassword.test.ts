import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ requireMember: vi.fn(), requireHouseholdId: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: vi.fn() } } }));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  loginRetryAfterMinutes: vi.fn(),
  recordFailedLogin: vi.fn(),
}));

import { changePasswordAction } from "@/app/[slug]/(app)/account/actions";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { loginRetryAfterMinutes, recordFailedLogin } from "@/lib/rateLimit";
import bcrypt from "bcryptjs";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}
const valid = { currentPassword: "old-password", newPassword: "new-password-1", confirmPassword: "new-password-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireMember).mockResolvedValue({ id: "u1", email: "sam@x.co", passwordHash: "OLDHASH" } as any);
  vi.mocked(loginRetryAfterMinutes).mockResolvedValue(0);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(bcrypt.hash).mockResolvedValue("NEWHASH" as never);
});

describe("changePasswordAction", () => {
  it("requires a signed-in member", async () => {
    vi.mocked(requireMember).mockRejectedValue(new Error("Not authenticated"));
    await expect(changePasswordAction(null, fd(valid))).rejects.toThrow("Not authenticated");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing current password", { ...valid, currentPassword: "" }, "Enter your current password"],
    ["a short new password", { ...valid, newPassword: "short", confirmPassword: "short" }, "at least 8 characters"],
    ["a mismatched confirmation", { ...valid, confirmPassword: "different-1" }, "don't match"],
    ["a new password equal to the old", { ...valid, newPassword: "old-password", confirmPassword: "old-password" }, "different from your current"],
  ])("rejects %s", async (_n, input, message) => {
    const r = await changePasswordAction(null, fd(input));
    expect(r && "error" in r && r.error).toContain(message);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses while locked out, without checking the password", async () => {
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(9);
    expect(await changePasswordAction(null, fd(valid))).toEqual({ error: "Too many failed attempts. Try again in 9 minutes." });
    vi.mocked(loginRetryAfterMinutes).mockResolvedValue(1);
    expect(await changePasswordAction(null, fd(valid))).toEqual({ error: "Too many failed attempts. Try again in 1 minute." });
    expect(loginRetryAfterMinutes).toHaveBeenCalledWith("sam@x.co", "1.2.3.4");
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password and counts it as a failed attempt", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect(await changePasswordAction(null, fd(valid))).toEqual({ error: "Your current password is incorrect." });
    expect(bcrypt.compare).toHaveBeenCalledWith("old-password", "OLDHASH");
    expect(recordFailedLogin).toHaveBeenCalledWith("sam@x.co", "1.2.3.4");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("stores a hash of the new password", async () => {
    expect(await changePasswordAction(null, fd(valid))).toEqual({ ok: true });
    expect(bcrypt.hash).toHaveBeenCalledWith("new-password-1", 12);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "NEWHASH" } });
  });
});
