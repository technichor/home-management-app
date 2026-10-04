import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/channels", () => ({ addToGeneral: vi.fn(), removeUserFromAllChannels: vi.fn() }));

import { addToGeneral, removeUserFromAllChannels } from "@/lib/channels";
import { joinHouseholdTx, detachUser, MembershipError, INVITE_TTL_MS } from "@/lib/membership";
import { generateJoinCode, normalizeJoinCode, JOIN_CODE_LENGTH } from "@/lib/joinCode";
import { safeNext } from "@/lib/redirect";

function makeTx(claimedCount = 1) {
  return {
    user: { updateMany: vi.fn().mockResolvedValue({ count: claimedCount }), update: vi.fn() },
    contact: { create: vi.fn().mockResolvedValue({ id: "c1" }) },
    activityLogEntry: { create: vi.fn() },
  } as any;
}

describe("joinHouseholdTx", () => {
  const user = { id: "u1", firstName: "Sam", lastName: "Smith" };

  it("claims a household-less user, creates their contact, and links it", async () => {
    const tx = makeTx();
    await joinHouseholdTx(tx, user, "h1");
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", householdId: null },
      data: { householdId: "h1", role: "MEMBER" },
    });
    expect(tx.contact.create.mock.calls[0][0].data).toEqual({
      householdId: "h1",
      ownerHouseholdId: "h1",
      firstName: "Sam",
      lastName: "Smith",
      category: "FAMILY_FRIEND",
    });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { contactId: "c1" } });
    expect(tx.activityLogEntry.create).toHaveBeenCalled();
    expect(addToGeneral).toHaveBeenCalledWith(tx, "u1", "h1");
  });

  it("throws, creating nothing, when the user already has a household", async () => {
    const tx = makeTx(0);
    await expect(joinHouseholdTx(tx, user, "h1")).rejects.toBeInstanceOf(MembershipError);
    expect(tx.contact.create).not.toHaveBeenCalled();
  });
});

describe("detachUser", () => {
  it("clears household, role and contact link", async () => {
    const tx = makeTx();
    await detachUser(tx, "u1");
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { householdId: null, role: "MEMBER", contactId: null },
    });
    expect(removeUserFromAllChannels).toHaveBeenCalledWith(tx, "u1");
  });
});

it("invites last seven days", () => {
  expect(INVITE_TTL_MS).toBe(7 * 24 * 3600 * 1000);
});

describe("join codes", () => {
  it("are the right length and avoid look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(generateJoinCode()).toMatch(new RegExp(`^[A-HJKMNP-Z2-9]{${JOIN_CODE_LENGTH}}$`));
  });
  it("normalize case, spaces and hyphens", () => {
    expect(normalizeJoinCode(" ab-cd ef23 ")).toBe("ABCDEF23");
  });
});

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("//evil.example")).toBeUndefined();
    expect(safeNext("https://evil.example")).toBeUndefined();
    expect(safeNext("/\\evil")).toBeUndefined();
    expect(safeNext(null)).toBeUndefined();
    expect(safeNext(undefined)).toBeUndefined();
  });
});
