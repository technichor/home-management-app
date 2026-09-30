import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import ListsClient from "./ListsClient";

export default async function ListsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  const lists = await prisma.list.findMany({
    where: { householdId: session.householdId!, archivedAt: null },
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
