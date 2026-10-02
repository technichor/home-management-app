import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import { conversationsVisibleTo, previewText } from "@/lib/messaging";
import MessagesClient from "./MessagesClient";

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const [{ slug }, { archived }] = await Promise.all([params, searchParams]);
  const showArchived = archived === "1";
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const householdId = session.householdId!;

  const [conversations, outsiders, activeSyncs] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        AND: [conversationsVisibleTo(householdId), { archivedAt: showArchived ? { not: null } : null }],
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, createdAt: true, sender: { select: { firstName: true } } },
        },
      },
    }),
    // Contacts outside our household: the people a private note thread can be about.
    prisma.contact.findMany({
      where: { deletedAt: null, OR: [{ householdId: null }, { householdId: { not: householdId } }] },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.sync.findMany({
      where: { initiatingHouseholdId: householdId, status: "ACTIVE" },
      select: { relatedContactId: true },
    }),
  ]);

  const syncedContactIds = new Set(activeSyncs.map((s) => s.relatedContactId));

  const rows = conversations
    .map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        name: c.name,
        kind: c.scope === "SYNCED" ? ("synced" as const) : c.relatedContactId ? ("private" as const) : ("group" as const),
        preview: last ? previewText(last.text) : null,
        previewSender: last ? last.sender.firstName : null,
        lastActivity: (last ? last.createdAt : c.createdAt).toISOString(),
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return (
    <MessagesClient
      slug={slug}
      conversations={rows}
      showArchived={showArchived}
      contacts={outsiders
        .filter((c) => !syncedContactIds.has(c.id))
        .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
    />
  );
}
