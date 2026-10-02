import { prisma } from "@/lib/db";
import AccountClient from "./AccountClient";
import { pageMember } from "@/lib/auth";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { id: userId, householdId } = await pageMember();

  const [me, members] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { contact: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.contact.findMany({
      where: { householdId, deletedAt: null, category: "FAMILY_FRIEND" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const current = me?.contact;

  return (
    <AccountClient
      slug={slug}
      current={current ? { id: current.id, name: `${current.firstName} ${current.lastName}` } : null}
      members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
    />
  );
}
