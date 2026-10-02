import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  household: { urlSlug: string | null; deletedAt: Date | null } | null;
};

// Where a signed-in user belongs: a user with no (active) household can't use any feature yet,
// so they go to onboarding.
export function homePathFor(user: SignedInUser): string {
  const household = user.household;
  return household && !household.deletedAt && household.urlSlug ? `/${household.urlSlug}/contacts` : "/onboarding";
}

export async function startSession(user: { id: string }): Promise<void> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.userId = user.id;
  await session.save();
}

/** The caller's active household id, or null (for callers that report errors as values). */
export async function getHouseholdId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.householdId && user.household && !user.household.deletedAt ? user.householdId : null;
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

/** The caller's active household id, for server actions (public endpoints: always call this). */
export async function requireHouseholdId(): Promise<string> {
  return (await requireMember()).householdId;
}

/** The same for pages: a signed-out visitor is sent to log in, a household-less user to onboarding. */
export async function pageHouseholdId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId || !user.household || user.household.deletedAt) redirect("/onboarding");
  return user.householdId;
}
