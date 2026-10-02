import { prisma } from "@/lib/db";
import AccountClient from "./AccountClient";
import { pageHouseholdId } from "@/lib/auth";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sessionHouseholdId = await pageHouseholdId();
  const householdId = sessionHouseholdId;

  const [household, members] = await Promise.all([
    prisma.household.findUnique({
      where: { id: householdId },
      select: { accountContact: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.contact.findMany({
      where: { householdId, deletedAt: null, category: "FAMILY_FRIEND" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const current = household?.accountContact;

  return (
    <AccountClient
      slug={slug}
      current={current ? { id: current.id, name: `${current.firstName} ${current.lastName}` } : null}
      members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
    />
  );
}
