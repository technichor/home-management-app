import { notFound } from "next/navigation";
import { contactsOf } from "@/lib/scope";
import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import ListDetailClient from "./ListDetailClient";
import { pageMember } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { candidatesFor } from "@/lib/channels";
import { accessTo, canEditList, isShareable, publicListPath, visibilityOf } from "@/lib/listAccess";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  const { id } = await params;
  const { import: importParam } = await searchParams;
  const viewer = await pageMember();

  const list = await prisma.list.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      shares: { include: { user: { select: { firstName: true, lastName: true, household: { select: { displayName: true } } } } }, orderBy: { createdAt: "asc" } },
      owner: { select: { firstName: true, lastName: true } },
      household: { select: { displayName: true } },
    },
  });
  // Only ordinary and Gift lists live here (the shopping list has its own page under Meal Planning), and only for
  // someone who can see them (lib/listAccess.ts); anyone else is told there's no such list.
  const access = list && isShareable(list.kind) ? accessTo(list, viewer) : null;
  if (!list || !access) notFound();
  const inHousehold = list.householdId === viewer.householdId;

  // Items can be assigned to people in the list's own household's directory, by its own household.
  const contacts = inHousehold
    ? await prisma.contact.findMany({
        where: { ...contactsOf(viewer.householdId), deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      })
    : [];

  const sharing =
    access === "manage"
      ? {
          householdName: list.household.displayName,
          sharedWithHousehold: list.sharedWithHousehold,
          shares: list.shares.map((s) => ({
            userId: s.userId,
            name: `${s.user.firstName} ${s.user.lastName}`,
            householdName: s.user.household?.displayName ?? "No household",
            canEdit: s.canEdit,
          })),
          candidates: (await candidatesFor({ id: viewer.id, householdId: list.householdId }))
            .filter((c) => c.id !== list.ownerUserId)
            .map((c) => ({ id: c.id, name: c.name, householdName: c.householdName })),
          publicUrl: list.publicToken ? `${appUrl()}${publicListPath(list.publicToken)}` : null,
        }
      : null;

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <Link href="/lists">Lists</Link> }, { title: list.name }]} />
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>{list.name}</h3>
      <ListDetailClient
        listId={list.id}
        listName={list.name}
        kind={list.kind === "GIFT" ? "GIFT" : "STANDARD"}
        sortMode={list.sortMode}
        openImport={importParam === "1"}
        canEdit={canEditList(access)}
        visibility={visibilityOf({ sharedWithHousehold: list.sharedWithHousehold, publicToken: list.publicToken, shareCount: list.shares.length })}
        ownerName={list.ownerUserId !== viewer.id && list.owner ? `${list.owner.firstName} ${list.owner.lastName}` : null}
        sharing={sharing}
        items={list.items.map((i) => ({
          id: i.id,
          text: i.text,
          quantity: i.quantity,
          notes: i.notes,
          url: i.url,
          checked: i.checked,
          assignedToContactId: i.assignedToContactId,
        }))}
        contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
      />
    </div>
  );
}
