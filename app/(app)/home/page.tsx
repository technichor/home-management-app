import Link from "next/link";
import { Button, Card } from "antd";
import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { inDays, upcomingDates } from "@/lib/home";
import { channelsFor, previewText } from "@/lib/messaging";
import { contactsOf, householdsOf } from "@/lib/scope";

const muted = { color: "var(--muted)", fontSize: 13 } as const;
const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" } as const;
const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } as const;

export default async function HomePage() {
  const me = await pageMember();
  const householdId = me.householdId;
  const isOwner = me.role === "OWNER";

  const [conversations, lists, dated, favorites, contactCount, householdCount] = await Promise.all([
    prisma.conversation.findMany({
      where: { AND: [channelsFor(me.id), { archivedAt: null }] },
      orderBy: { updatedAt: "desc" },
      take: 3,
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, sender: { select: { firstName: true } } },
        },
      },
    }),
    prisma.list.findMany({
      where: { householdId, archivedAt: null, kind: "STANDARD" },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { items: { select: { checked: true } } },
    }),
    prisma.contact.findMany({
      where: {
        ...contactsOf(householdId),
        deletedAt: null,
        OR: [{ importantDate1: { not: null } }, { importantDate2: { not: null } }],
      },
      select: {
        id: true, firstName: true, lastName: true,
        importantDate1: true, importantDate1Label: true, importantDate2: true, importantDate2Label: true,
      },
    }),
    prisma.contact.findMany({
      where: { ...contactsOf(householdId), deletedAt: null, favorite: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 5,
    }),
    prisma.contact.count({ where: { ...contactsOf(householdId), deletedAt: null } }),
    prisma.household.count({ where: { ...householdsOf(householdId), deletedAt: null } }),
  ]);

  const upcoming = upcomingDates(dated, new Date()).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Welcome back, {me.firstName}</h3>
        <span style={muted}>{me.household.displayName}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link href="/contacts/new">
          <Button type="primary">Add contact</Button>
        </Link>
        {isOwner && (
          <Link href="/household">
            <Button>Invite someone</Button>
          </Link>
        )}
      </div>

      <div className="home-grid">
        <Card size="small" title="Messages" extra={<Link href="/messages">View all</Link>}>
          {conversations.length === 0 ? (
            <span style={muted}>No channels yet.</span>
          ) : (
            conversations.map((c) => {
              const last = c.messages[0];
              return (
                <Link key={c.id} href={`/messages/${c.id}`} style={{ display: "block", color: "inherit" }}>
                  <div style={{ ...row, flexDirection: "column", alignItems: "stretch", gap: 2 }}>
                    <strong style={clip}>{c.name}</strong>
                    <span style={{ ...muted, ...clip }}>
                      {last ? `${last.sender?.firstName ?? "Former member"}: ${previewText(last.text, 60)}` : "No messages yet"}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </Card>

        <Card size="small" title="Lists" extra={<Link href="/lists">View all</Link>}>
          {lists.length === 0 ? (
            <span style={muted}>No lists yet.</span>
          ) : (
            lists.map((l) => (
              <Link key={l.id} href={`/lists/${l.id}`} style={{ display: "block", color: "inherit" }}>
                <div style={row}>
                  <span style={clip}>{l.name}</span>
                  <span style={{ ...muted, flexShrink: 0 }}>
                    {l.items.filter((i) => i.checked).length} / {l.items.length}
                  </span>
                </div>
              </Link>
            ))
          )}
        </Card>

        <Card size="small" title="Coming up" extra={<span style={muted}>next 30 days</span>}>
          {upcoming.length === 0 ? (
            <span style={muted}>Nothing coming up. Add birthdays and anniversaries to contacts to see them here.</span>
          ) : (
            upcoming.map((d) => (
              <Link key={`${d.contactId}-${d.label}`} href={`/contacts/${d.contactId}`} style={{ display: "block", color: "inherit" }}>
                <div style={row}>
                  <span style={clip}>
                    {d.name} <span style={muted}>· {d.label}</span>
                  </span>
                  <span style={{ ...muted, flexShrink: 0 }}>{inDays(d.daysUntil)}</span>
                </div>
              </Link>
            ))
          )}
        </Card>

        <Card size="small" title="Contacts" extra={<Link href="/contacts">View all</Link>}>
          <div style={{ ...muted, marginBottom: 8 }}>
            {contactCount} {contactCount === 1 ? "person" : "people"} in {householdCount} {householdCount === 1 ? "household" : "households"}
          </div>
          {favorites.length === 0 ? (
            <span style={muted}>Star a contact to keep them handy here.</span>
          ) : (
            favorites.map((f) => (
              <Link key={f.id} href={`/contacts/${f.id}`} style={{ display: "block", color: "inherit" }}>
                <div style={row}>
                  <span style={clip}>
                    <span style={{ color: "var(--warning)", marginRight: 6 }}>★</span>
                    {f.firstName} {f.lastName}
                  </span>
                </div>
              </Link>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
