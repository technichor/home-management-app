import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { channelsFor } from "@/lib/messaging";
import { candidatesFor } from "@/lib/channels";
import ConversationClient from "./ConversationClient";
import { pageMember } from "@/lib/auth";

// How many of the most recent messages to show.
const MESSAGE_WINDOW = 200;

const person = { firstName: true, lastName: true, householdId: true, household: { select: { displayName: true } } } as const;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageMember();

  const conversation = await prisma.conversation.findFirst({
    where: { id, ...channelsFor(user.id) },
    include: {
      members: { orderBy: { createdAt: "asc" }, select: { userId: true, role: true, user: { select: person } } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: MESSAGE_WINDOW,
        include: { sender: { select: person } },
      },
    },
  });
  if (!conversation) notFound();

  const canManage =
    conversation.kind === "CHANNEL" && conversation.members.some((m) => m.userId === user.id && m.role === "MANAGER");
  const memberIds = new Set(conversation.members.map((m) => m.userId));
  const candidates = canManage ? (await candidatesFor(user)).filter((c) => !memberIds.has(c.id)) : [];
  const shared = new Set(conversation.members.map((m) => m.user.householdId)).size > 1;

  return (
    <ConversationClient
      conversation={{
        id: conversation.id,
        name: conversation.name,
        general: conversation.kind === "GENERAL",
        archived: !!conversation.archivedAt,
        shared,
      }}
      members={conversation.members.map((m) => ({
        userId: m.userId,
        name: `${m.user.firstName} ${m.user.lastName}`,
        householdName: m.user.household?.displayName ?? null,
        manager: m.role === "MANAGER",
        mine: m.userId === user.id,
      }))}
      canManage={canManage}
      candidates={candidates}
      messages={[...conversation.messages].reverse().map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        senderName: m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : "Former member",
        householdName: m.sender?.household?.displayName ?? null,
        mine: m.senderUserId === user.id,
      }))}
    />
  );
}
