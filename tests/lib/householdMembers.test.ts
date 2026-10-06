import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { contact: { findMany: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { assertMemberChoice, memberOptionsOf } from "@/lib/householdMembers";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.contact.findMany).mockResolvedValue([
    { id: "a", firstName: "Elizabeth", lastName: "Doe", nickname: "Ellie" },
    { id: "b", firstName: "Sam", lastName: "Doe", nickname: null },
  ] as any);
});

describe("memberOptionsOf", () => {
  it("lists the household's own members (Family & Friend in its household), by nickname, not removed contacts", async () => {
    expect(await memberOptionsOf("h1")).toEqual([
      { id: "a", name: "Ellie", fullName: "Elizabeth Doe" },
      { id: "b", name: "Sam", fullName: "Sam Doe" },
    ]);
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]).toMatchObject({
      where: { ownerHouseholdId: "h1", householdId: "h1", category: "FAMILY_FRIEND", deletedAt: null },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
  });
});

describe("assertMemberChoice", () => {
  it("allows nobody (the whole household) and the current member without looking anything up", async () => {
    await expect(assertMemberChoice("h1", null)).resolves.toBeUndefined();
    await expect(assertMemberChoice("h1", "gone", "gone")).resolves.toBeUndefined();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("allows one of the household's members, and refuses anyone else", async () => {
    await expect(assertMemberChoice("h1", "b")).resolves.toBeUndefined();
    await expect(assertMemberChoice("h1", "someone-elses", "b")).rejects.toThrow("Choose one of your household's members");
  });
});
