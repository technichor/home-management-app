import { prisma } from "@/lib/db";
import { channelsFor, previewText, unreadCounts } from "@/lib/messaging";
import { candidatesFor } from "@/lib/channels";
import { pageMember } from "@/lib/auth";
import MessagesClient from "./MessagesClient";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const user = await pageMember();

  const [channels, candidates, unread] = await Promise.all([
    prisma.conversation.findMany({
      where: { AND: [channelsFor(user.id), { archivedAt: showArchived ? { not: null } : null }] },
      include: {
        members: { select: { user: { select: { householdId: true } } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, createdAt: true, sender: { select: { firstName: true } } },
        },
      },
    }),
    candidatesFor(user),
    unreadCounts(user.id),
  ]);

  const rows = channels
    .map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        name: c.name,
        general: c.kind === "GENERAL",
        shared: new Set(c.members.map((m) => m.user.householdId)).size > 1,
        memberCount: c.members.length,
        unread: unread.get(c.id) ?? 0,
        preview: last ? previewText(last.text) : null,
        previewSender: last ? (last.sender?.firstName ?? "Former member") : null,
        lastActivity: (last ? last.createdAt : c.createdAt).toISOString(),
      };
    })
    // General first, then by latest activity.
    .sort((a, b) => Number(b.general) - Number(a.general) || b.lastActivity.localeCompare(a.lastActivity));

  return <MessagesClient channels={rows} candidates={candidates} showArchived={showArchived} />;
}
