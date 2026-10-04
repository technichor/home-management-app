import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import HouseholdClient from "./HouseholdClient";

export default async function HouseholdPage() {
  const user = await pageMember();
  const householdId = user.householdId;
  const isOwner = user.role === "OWNER";
  const [members, household, invites, requests, syncRows] = await Promise.all([
    prisma.user.findMany({
      where: { householdId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.household.findUnique({ where: { id: householdId }, select: { joinCode: true } }),
    isOwner
      ? prisma.householdInvite.findMany({
          where: { householdId, status: "PENDING", expiresAt: { gt: new Date() } },
          select: { id: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [],
    isOwner
      ? prisma.joinRequest.findMany({
          where: { householdId, status: "PENDING" },
          select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    prisma.sync.findMany({
      where: { status: "ACTIVE", OR: [{ initiatingHouseholdId: householdId }, { counterpartHouseholdId: householdId }] },
      select: {
        id: true,
        initiatingHouseholdId: true,
        initiatingHousehold: { select: { displayName: true } },
        counterpartHousehold: { select: { displayName: true } },
      },
      orderBy: { respondedAt: "asc" },
    }),
  ]);
  const syncs = syncRows.map((s) => ({
    id: s.id,
    householdName: (s.initiatingHouseholdId === householdId ? s.counterpartHousehold : s.initiatingHousehold)?.displayName ?? "Another household",
  }));

  return (
    <HouseholdClient
      householdName={user.household.displayName}
      currentUserId={user.id}
      isOwner={isOwner}
      joinCode={isOwner ? (household?.joinCode ?? null) : null}
      members={members}
      syncs={syncs}
      invites={invites.map((i) => ({
        id: i.id,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      }))}
      requests={requests.map((r) => ({
        id: r.id,
        name: `${r.user.firstName} ${r.user.lastName}`,
        email: r.user.email,
      }))}
    />
  );
}
