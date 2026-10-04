import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

export const NOT_CONNECTED_ERROR = "Everyone in a channel must be in households that are connected to each other.";

/** The households this one is actively synced with (whichever side started the sync). */
export async function connectedHouseholdIds(householdId: string): Promise<string[]> {
  const syncs = await prisma.sync.findMany({
    where: { status: "ACTIVE", OR: [{ initiatingHouseholdId: householdId }, { counterpartHouseholdId: householdId }] },
    select: { initiatingHouseholdId: true, counterpartHouseholdId: true },
  });
  const others = syncs.map((s) => (s.initiatingHouseholdId === householdId ? s.counterpartHouseholdId : s.initiatingHouseholdId));
  return [...new Set(others.filter((id): id is string => !!id))];
}

export type Candidate = { id: string; name: string; householdId: string; householdName: string; mine: boolean };

/** Everyone this user may put in a channel: their own household, plus the connected households. */
export async function candidatesFor(user: { id: string; householdId: string }): Promise<Candidate[]> {
  const householdIds = [user.householdId, ...(await connectedHouseholdIds(user.householdId))];
  const users = await prisma.user.findMany({
    where: { householdId: { in: householdIds }, id: { not: user.id }, household: { deletedAt: null } },
    select: { id: true, firstName: true, lastName: true, householdId: true, household: { select: { displayName: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    householdId: u.householdId as string,
    householdName: u.household?.displayName ?? "",
    mine: u.householdId === user.householdId,
  }));
}

/** True when every pair of the given households is the same household or actively synced. */
export async function allConnected(householdIds: string[]): Promise<boolean> {
  const ids = [...new Set(householdIds)];
  if (ids.length <= 1) return true;
  const syncs = await prisma.sync.findMany({
    where: { status: "ACTIVE", initiatingHouseholdId: { in: ids }, counterpartHouseholdId: { in: ids } },
    select: { initiatingHouseholdId: true, counterpartHouseholdId: true },
  });
  const linked = new Set(syncs.map((s) => [s.initiatingHouseholdId, s.counterpartHouseholdId].sort().join("|")));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!linked.has([ids[i], ids[j]].sort().join("|"))) return false;
    }
  }
  return true;
}

export type MemberCheck = { ok: true; userIds: string[] } | { ok: false; error: string };

/**
 * May this person put these users in a channel? Each must be in the actor's own household or one
 * actively synced with it, and every household in the channel (including the ones already in it)
 * must be connected to every other, so adding someone never exposes one household to another it
 * isn't synced with.
 */
export async function checkChannelMembers(
  actor: { id: string; householdId: string },
  userIds: string[],
  existingHouseholdIds: string[] = []
): Promise<MemberCheck> {
  const wanted = [...new Set(userIds)].filter((id) => id !== actor.id);
  if (wanted.length === 0) return { ok: true, userIds: [] };

  const [users, reachable] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: wanted }, household: { deletedAt: null } },
      select: { id: true, householdId: true },
    }),
    connectedHouseholdIds(actor.householdId),
  ]);
  const allowedHouseholds = new Set([actor.householdId, ...reachable]);
  if (users.length !== wanted.length || users.some((u) => !u.householdId || !allowedHouseholds.has(u.householdId))) {
    return { ok: false, error: "You can only add people from your household or a household you're synced with." };
  }
  const households = [actor.householdId, ...existingHouseholdIds, ...users.map((u) => u.householdId as string)];
  if (!(await allConnected(households))) return { ok: false, error: NOT_CONNECTED_ERROR };
  return { ok: true, userIds: users.map((u) => u.id) };
}

/** A household's automatic General channel, made (with everyone in the household) if it doesn't exist yet. */
export async function ensureGeneral(tx: Tx, householdId: string): Promise<string> {
  const existing = await tx.conversation.findFirst({ where: { kind: "GENERAL", householdId }, select: { id: true } });
  if (existing) return existing.id;
  const members = await tx.user.findMany({ where: { householdId }, select: { id: true } });
  const created = await tx.conversation.create({
    data: { kind: "GENERAL", householdId, name: "General", members: { create: members.map((m) => ({ userId: m.id })) } },
  });
  return created.id;
}

/** Put a user in their household's General channel (they join it when they join the household). */
export async function addToGeneral(tx: Tx, userId: string, householdId: string): Promise<void> {
  const conversationId = await ensureGeneral(tx, householdId);
  await tx.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId },
    update: {},
  });
}

/**
 * Take a user out of a channel. If that leaves a channel with no manager, the longest-standing member
 * takes over; if it leaves nobody, the channel is archived. (General has no managers and stays.)
 */
export async function leaveChannelTx(tx: Tx, conversationId: string, userId: string, kind: "CHANNEL" | "GENERAL"): Promise<void> {
  await tx.conversationMember.deleteMany({ where: { conversationId, userId } });
  if (kind === "GENERAL") return;
  const remaining = await tx.conversationMember.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  if (remaining.length === 0) {
    await tx.conversation.update({ where: { id: conversationId }, data: { archivedAt: new Date() } });
  } else if (!remaining.some((m) => m.role === "MANAGER")) {
    await tx.conversationMember.update({ where: { id: remaining[0].id }, data: { role: "MANAGER" } });
  }
}

/** A user who leaves (or is removed from) their household leaves every channel. */
export async function removeUserFromAllChannels(tx: Tx, userId: string): Promise<void> {
  const memberships = await tx.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true, conversation: { select: { kind: true } } },
  });
  for (const m of memberships) await leaveChannelTx(tx, m.conversationId, userId, m.conversation.kind);
}
