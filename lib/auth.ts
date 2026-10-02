import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";

export async function getSessionUser() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.userId) return null;
  return prisma.user.findUnique({
    where: { id: session.userId },
    include: { household: { select: { id: true, displayName: true, urlSlug: true, deletedAt: true } } },
  });
}

type SignedInUser = {
  id: string;
  household: { id: string; urlSlug: string | null; deletedAt: Date | null } | null;
};

// Where a signed-in user belongs: a user with no (active) household can't use any feature yet,
// so they go to onboarding. (Until the /[slug] routes are replaced, the household's slug is the route.)
export function homePathFor(user: SignedInUser): string {
  const household = user.household;
  return household && !household.deletedAt && household.urlSlug ? `/${household.urlSlug}/contacts` : "/onboarding";
}

export async function startSession(user: SignedInUser): Promise<void> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.userId = user.id;
  const household = user.household;
  if (household && !household.deletedAt && household.urlSlug) {
    session.householdId = household.id;
    session.householdSlug = household.urlSlug;
  }
  await session.save();
}

/**
 * The signed-in user, who must belong to an active household. Server actions are public
 * endpoints, so each one calls this (or requireOwner) itself.
 */
export async function requireMember() {
  const user = await getSessionUser();
  if (!user || !user.householdId || !user.household || user.household.deletedAt) {
    throw new Error("Not authenticated");
  }
  return { ...user, householdId: user.householdId, household: user.household };
}

export async function requireOwner() {
  const user = await requireMember();
  if (user.role !== "OWNER") throw new Error("Only a household owner can do that.");
  return user;
}
