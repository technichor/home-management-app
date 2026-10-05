import { prisma } from "@/lib/db";
import { formatCalendarDate, dateToString } from "@/lib/dates";
import { previewText, unreadCounts } from "@/lib/messaging";

export type AttentionItem = { key: string; title: string; support: string; href: string };

/** At most this many channels with unread messages are listed; the rest are counted. */
export const MAX_UNREAD_CHANNELS = 4;

/**
 * Things on the home page that are waiting for this person: unread messages (by channel), people asking to join the
 * household (owners only), and sync invites this household sent that haven't been answered yet.
 */
export async function loadAttention(user: { id: string; role: string; householdId: string }): Promise<AttentionItem[]> {
  const unread = await unreadCounts(user.id);
  const isOwner = user.role === "OWNER";

  const [channels, requests, invites] = await Promise.all([
    unread.size
      ? prisma.conversation.findMany({
          where: { id: { in: [...unread.keys()] } },
          select: {
            id: true,
            name: true,
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { text: true, createdAt: true, sender: { select: { firstName: true } } },
            },
          },
        })
      : Promise.resolve([]),
    isOwner
      ? prisma.joinRequest.findMany({
          where: { householdId: user.householdId, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
    prisma.sync.findMany({
      where: { initiatingHouseholdId: user.householdId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, counterpartEmail: true, createdAt: true, relatedContactId: true },
    }),
  ]);

  const items: AttentionItem[] = [];

  // Most recently active channel first.
  const byRecent = [...channels].sort((a, b) => (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0));
  for (const c of byRecent.slice(0, MAX_UNREAD_CHANNELS)) {
    const n = unread.get(c.id) ?? 0;
    const last = c.messages[0];
    items.push({
      key: `channel-${c.id}`,
      title: `${c.name} has ${n === 1 ? "1 unread message" : `${n} unread messages`}`,
      support: last ? `In Messages, the latest is from ${last.sender?.firstName ?? "a former member"}: “${previewText(last.text, 70)}”` : "In Messages.",
      href: `/messages/${c.id}`,
    });
  }
  if (byRecent.length > MAX_UNREAD_CHANNELS) {
    const more = byRecent.length - MAX_UNREAD_CHANNELS;
    items.push({
      key: "channels-more",
      title: `${more} more ${more === 1 ? "channel has" : "channels have"} unread messages`,
      support: "In Messages.",
      href: "/messages",
    });
  }

  for (const r of requests) {
    items.push({
      key: `join-${r.id}`,
      title: `${r.user.firstName} ${r.user.lastName} asked to join your household`,
      support: "On the Household page, approve or decline the request.",
      href: "/household",
    });
  }

  for (const s of invites) {
    items.push({
      key: `sync-${s.id}`,
      title: `Your sync invite to ${s.counterpartEmail} hasn't been answered`,
      support: `On the contact's page, sent ${formatCalendarDate(dateToString(s.createdAt))}.`,
      href: `/contacts/${s.relatedContactId}`,
    });
  }
  return items;
}
