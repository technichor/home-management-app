import { notFound } from "next/navigation";
import { contactsOf } from "@/lib/scope";
import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import ListDetailClient from "./ListDetailClient";
import { pageHouseholdId } from "@/lib/auth";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  const { id } = await params;
  const { import: importParam } = await searchParams;
  const sessionHouseholdId = await pageHouseholdId();

  const list = await prisma.list.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  // The shopping list (kind GROCERY) has its own page under Meal Planning, not this one.
  if (!list || list.householdId !== sessionHouseholdId || list.kind !== "STANDARD") notFound();

  const contacts = await prisma.contact.findMany({
    where: { ...contactsOf(sessionHouseholdId), deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href="/lists">Lists</Link> },
          { title: list.name },
        ]}
      />
      <h3 style={{ marginTop: 0, fontSize: 20, fontWeight: 600 }}>{list.name}</h3>
      <ListDetailClient
        listId={list.id}
        listName={list.name}
        sortMode={list.sortMode}
        openImport={importParam === "1"}
        items={list.items.map((i) => ({
          id: i.id,
          text: i.text,
          quantity: i.quantity,
          notes: i.notes,
          checked: i.checked,
          assignedToContactId: i.assignedToContactId,
        }))}
        contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
      />
    </div>
  );
}
