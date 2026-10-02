import { prisma } from "@/lib/db";
import ArchivedListsClient from "./ArchivedListsClient";
import { pageHouseholdId } from "@/lib/auth";

export default async function ArchivedListsPage() {

  const sessionHouseholdId = await pageHouseholdId();

  const lists = await prisma.list.findMany({
    where: { householdId: sessionHouseholdId, archivedAt: { not: null } },
    include: { items: { select: { id: true, checked: true } } },
    orderBy: { archivedAt: "desc" },
  });

  const listsData = lists.map((l) => ({
    id: l.id,
    name: l.name,
    tags: l.tags,
    totalItems: l.items.length,
    checkedItems: l.items.filter((i) => i.checked).length,
    archivedAt: l.archivedAt!.toLocaleDateString(),
  }));

  return <ArchivedListsClient lists={listsData} />;
}
