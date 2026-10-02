import type { Prisma } from "@prisma/client";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Thrown inside a transaction to roll it back with a message the caller can show.
export class MembershipError extends Error {}

type Tx = Prisma.TransactionClient;

/**
 * Put a user into a household as a MEMBER and give them a Contact to act as. Fails (rolling the
 * surrounding transaction back) if they already belong to a household, so two concurrent joins
 * can't both succeed.
 */
export async function joinHouseholdTx(
  tx: Tx,
  user: { id: string; firstName: string; lastName: string },
  householdId: string
): Promise<void> {
  const claimed = await tx.user.updateMany({
    where: { id: user.id, householdId: null },
    data: { householdId, role: "MEMBER" },
  });
  if (claimed.count === 0) throw new MembershipError("That person already belongs to a household.");

  const contact = await tx.contact.create({
    data: { householdId, ownerHouseholdId: householdId, firstName: user.firstName, lastName: user.lastName, category: "FAMILY_FRIEND" },
  });
  await tx.user.update({ where: { id: user.id }, data: { contactId: contact.id } });
  await tx.activityLogEntry.create({
    data: { entityType: "CONTACT", entityId: contact.id, action: "CREATED", source: "MANUAL" },
  });
}

/** Take a user out of their household. Their Contact stays in the household's directory. */
export function detachUser(tx: Tx, userId: string) {
  return tx.user.update({ where: { id: userId }, data: { householdId: null, role: "MEMBER", contactId: null } });
}
