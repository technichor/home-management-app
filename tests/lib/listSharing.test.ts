import { describe, it, expect, vi } from "vitest";
import { dropListSharesBetween, removeUserFromLists } from "@/lib/listSharing";

const makeTx = (heir: { id: string } | null) =>
  ({
    listShare: { deleteMany: vi.fn() },
    user: { findFirst: vi.fn().mockResolvedValue(heir) },
    list: { updateMany: vi.fn() },
  }) as any;

describe("removeUserFromLists", () => {
  it("drops every share with them, and passes the household's lists they owned to its longest-standing other owner", async () => {
    const tx = makeTx({ id: "o2" });
    await removeUserFromLists(tx, "u1", "h1");
    expect(tx.listShare.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: { householdId: "h1", role: "OWNER", id: { not: "u1" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
    expect(tx.list.updateMany).toHaveBeenCalledWith({
      where: { householdId: "h1", ownerUserId: "u1", kind: { in: ["STANDARD", "GIFT"] } },
      data: { ownerUserId: "o2" },
    });
  });

  it("leaves the lists to the household (no owner) when no other owner is left", async () => {
    const tx = makeTx(null);
    await removeUserFromLists(tx, "u1", "h1");
    expect(tx.list.updateMany.mock.calls[0][0].data).toEqual({ ownerUserId: null });
  });
});

describe("dropListSharesBetween", () => {
  it("stops each household's lists being shared with the other's people", async () => {
    const tx = makeTx(null);
    await dropListSharesBetween(tx, "h1", "h2");
    expect(tx.listShare.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { list: { householdId: "h1" }, user: { householdId: "h2" } },
          { list: { householdId: "h2" }, user: { householdId: "h1" } },
        ],
      },
    });
  });
});
