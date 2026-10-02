import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import HouseholdClient from "./HouseholdClient";

export default async function HouseholdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.household || user.household.urlSlug !== slug) notFound();

  const householdId = user.household.id;
  const isOwner = user.role === "OWNER";
  const [members, household, invites, requests] = await Promise.all([
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
  ]);

  return (
    <HouseholdClient
      householdName={user.household.displayName}
      currentUserId={user.id}
      isOwner={isOwner}
      joinCode={isOwner ? (household?.joinCode ?? null) : null}
      members={members}
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
