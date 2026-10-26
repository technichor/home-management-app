import type { Prisma } from "@prisma/client";
import { SHAREABLE_KINDS } from "@/lib/listAccess";

// Keeping list sharing right when people and households part ways (docs/domains/lists.md, Sharing). Both run inside the
// transaction that makes the change, as Messaging's channel clean-up does.

type Tx = Prisma.TransactionClient;

/**
 * Someone leaves (or is removed from) a household: the lists shared with them stop being theirs, and the household's
 * lists they owned pass to its longest-standing other owner (or to the household, with no owner, if there is none).
 */
export async function removeUserFromLists(tx: Tx, userId: string, householdId: string): Promise<void> {
  await tx.listShare.deleteMany({ where: { userId } });
  const heir = await tx.user.findFirst({
    where: { householdId, role: "OWNER", id: { not: userId } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  await tx.list.updateMany({
    where: { householdId, ownerUserId: userId, kind: { in: [...SHAREABLE_KINDS] } },
    data: { ownerUserId: heir?.id ?? null },
  });
}

/** A sync between two households ends: each household's lists stop being shared with the other's people. */
export async function dropListSharesBetween(tx: Tx, householdA: string, householdB: string): Promise<void> {
  await tx.listShare.deleteMany({
    where: {
      OR: [
        { list: { householdId: householdA }, user: { householdId: householdB } },
        { list: { householdId: householdB }, user: { householdId: householdA } },
      ],
    },
  });
}
