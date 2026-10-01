import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import CompareClient from "./CompareClient";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  const list = await prisma.list.findUnique({
    where: { id },
    include: { items: { where: { checked: false }, orderBy: { position: "asc" } } },
  });
  if (!list || list.householdId !== session.householdId) notFound();
  if (list.sortMode !== "PAIRWISE") redirect(`/${slug}/lists/${id}`);

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href={`/${slug}/lists`}>Lists</Link> },
          { title: <Link href={`/${slug}/lists/${list.id}`}>{list.name}</Link> },
          { title: "Prioritize" },
        ]}
      />
      <CompareClient
        slug={slug}
        listId={list.id}
        items={list.items.map((i) => ({
          id: i.id,
          text: i.text,
          quantity: i.quantity,
          rating: i.rating,
          comparisonCount: i.comparisonCount,
        }))}
      />
    </div>
  );
}
