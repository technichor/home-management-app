import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import CompareClient from "./CompareClient";
import { pageHouseholdId } from "@/lib/auth";
import { recordComparisonAction } from "../../actions";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionHouseholdId = await pageHouseholdId();

  const list = await prisma.list.findUnique({
    where: { id },
    include: { items: { where: { checked: false }, orderBy: { position: "asc" } } },
  });
  if (!list || list.householdId !== sessionHouseholdId || list.kind !== "STANDARD") notFound();
  if (list.sortMode !== "PAIRWISE") redirect(`/lists/${id}`);

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href="/lists">Lists</Link> },
          { title: <Link href={`/lists/${list.id}`}>{list.name}</Link> },
          { title: "Prioritize" },
        ]}
      />
      <CompareClient
        backHref={`/lists/${list.id}`}
        compare={recordComparisonAction.bind(null, list.id)}
        items={list.items.map((i) => ({
          id: i.id,
          text: i.text,
          detail: i.quantity,
          rating: i.rating,
          comparisonCount: i.comparisonCount,
        }))}
      />
    </div>
  );
}
