import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { conversationsVisibleTo } from "@/lib/messaging";
import ConversationClient from "./ConversationClient";
import { pageHouseholdId } from "@/lib/auth";

// How many of the most recent messages to show.
const MESSAGE_WINDOW = 200;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const sessionHouseholdId = await pageHouseholdId();
  const householdId = sessionHouseholdId;

  const [conversation, me] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id, ...conversationsVisibleTo(householdId) },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: MESSAGE_WINDOW,
          include: {
            sender: {
              select: {
                firstName: true,
                lastName: true,
                householdId: true,
                household: { select: { displayName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.household.findUnique({ where: { id: householdId }, select: { accountContactId: true } }),
  ]);
  if (!conversation) notFound();

  const messages = [...conversation.messages].reverse().map((m) => ({
    id: m.id,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    senderName: `${m.sender.firstName} ${m.sender.lastName}`,
    householdName: m.sender.household?.displayName ?? null,
    mine: m.sender.householdId === householdId,
  }));

  return (
    <ConversationClient
      slug={slug}
      conversation={{
        id: conversation.id,
        name: conversation.name,
        synced: conversation.scope === "SYNCED",
        archived: !!conversation.archivedAt,
      }}
      messages={messages}
      canSend={!!me?.accountContactId}
    />
  );
}
