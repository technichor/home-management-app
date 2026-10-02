import { prisma } from "@/lib/db";
import ListsClient from "./ListsClient";
import { pageHouseholdId } from "@/lib/auth";

export default async function ListsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const sessionHouseholdId = await pageHouseholdId();

  const lists = await prisma.list.findMany({
    where: { householdId: sessionHouseholdId, archivedAt: null },
    include: { items: { select: { id: true, checked: true } } },
    orderBy: { createdAt: "desc" },
  });

  const listsData = lists.map((l) => ({
    id: l.id,
    name: l.name,
    tags: l.tags,
    totalItems: l.items.length,
    checkedItems: l.items.filter((i) => i.checked).length,
  }));

  return <ListsClient lists={listsData} slug={slug} />;
}
