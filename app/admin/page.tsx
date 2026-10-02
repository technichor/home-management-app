import { Card } from "antd";
import { prisma } from "@/lib/db";
import { pageSuperuser } from "@/lib/auth";
import { AUDIT_LABELS, formatWhen } from "@/lib/format";
import AdminUsersTable from "@/components/AdminUsersTable";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminPage() {
  await pageSuperuser(); // the layout checks too; a page must never rely on that alone
  const [users, households, audit] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, isSuperuser: true,
        emailVerifiedAt: true, createdAt: true, lastLoginAt: true, lastSeenAt: true,
        household: { select: { displayName: true } },
      },
    }),
    prisma.household.count({ where: { deletedAt: null, members: { some: {} } } }),
    prisma.adminAuditEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { email: true } }, targetUser: { select: { email: true } } },
    }),
  ]);

  const weekAgo = new Date().getTime() - 7 * DAY_MS;
  const stats = [
    ["Users", users.length],
    ["Email confirmed", users.filter((u) => u.emailVerifiedAt).length],
    ["Active households", households],
    ["Seen in the last 7 days", users.filter((u) => u.lastSeenAt && u.lastSeenAt.getTime() >= weekAgo).length],
    ["Superusers", users.filter((u) => u.isSuperuser).length],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Users</h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {stats.map(([label, value]) => (
          <Card key={label} size="small">
            <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
            <div style={{ color: "rgba(0,0,0,.45)", fontSize: 13 }}>{label}</div>
          </Card>
        ))}
      </div>

      <AdminUsersTable
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          householdName: u.household?.displayName ?? null,
          isSuperuser: u.isSuperuser,
          verified: !!u.emailVerifiedAt,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        }))}
      />

      <Card size="small" title="Recent admin activity">
        {audit.length === 0 ? (
          <span style={{ color: "rgba(0,0,0,.45)", fontSize: 13 }}>Nothing yet.</span>
        ) : (
          audit.map((a) => (
            <div key={a.id} style={{ padding: "6px 0", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}>
              <span style={{ color: "rgba(0,0,0,.45)" }}>{formatWhen(a.createdAt)}</span>{" "}
              <strong>{a.actor?.email ?? "a deleted user"}</strong> {AUDIT_LABELS[a.action] ?? a.action}{" "}
              <strong>{a.targetUser?.email ?? "a deleted user"}</strong>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
