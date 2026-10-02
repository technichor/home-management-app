import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, Card, Descriptions, Tag } from "antd";
import { prisma } from "@/lib/db";
import { pageSuperuser } from "@/lib/auth";
import { AUDIT_LABELS, formatWhen } from "@/lib/format";
import AdminUserActions from "@/components/AdminUserActions";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageSuperuser(); // the layout checks too; a page must never rely on that alone
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      household: { select: { displayName: true, deletedAt: true, _count: { select: { members: true } } } },
      resetTokens: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true }, take: 1 },
    },
  });
  if (!user) notFound();

  const history = await prisma.adminAuditEntry.findMany({
    where: { OR: [{ targetUserId: id }, { actorId: id }] },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actor: { select: { email: true } }, targetUser: { select: { email: true } } },
  });

  const pendingReset = user.resetTokens[0];
  const items = [
    { key: "email", label: "Email", children: user.email },
    { key: "name", label: "Name", children: `${user.firstName} ${user.lastName}` },
    {
      key: "verified",
      label: "Email confirmed",
      children: user.emailVerifiedAt ? formatWhen(user.emailVerifiedAt) : <Tag color="warning">Not yet</Tag>,
    },
    { key: "created", label: "Account created", children: formatWhen(user.createdAt) },
    { key: "login", label: "Last login", children: formatWhen(user.lastLoginAt) },
    { key: "seen", label: "Last seen", children: formatWhen(user.lastSeenAt) },
    {
      key: "password",
      label: "Password last changed",
      children: user.passwordChangedAt ? formatWhen(user.passwordChangedAt) : "Never (still the one they signed up with)",
    },
    {
      key: "household",
      label: "Household",
      children: user.household
        ? `${user.household.displayName}${user.household.deletedAt ? " (removed)" : ""} · ${user.household._count.members} member${user.household._count.members === 1 ? "" : "s"}`
        : "None yet",
    },
    { key: "role", label: "Role in household", children: user.household ? (user.role === "OWNER" ? "Owner" : "Member") : "—" },
    {
      key: "super",
      label: "Superuser",
      children: user.isSuperuser ? <Tag color="red">Superuser</Tag> : "No",
    },
    {
      key: "reset",
      label: "Pending reset link",
      children: pendingReset ? `Yes, expires ${formatWhen(pendingReset.expiresAt)}` : "None",
    },
    { key: "id", label: "User ID", children: <code style={{ fontSize: 12 }}>{user.id}</code> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Breadcrumb items={[{ title: <Link href="/admin">Users</Link> }, { title: user.email }]} />
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
        {user.firstName} {user.lastName}
        {user.isSuperuser && (
          <Tag color="red" style={{ marginLeft: 8 }}>
            Superuser
          </Tag>
        )}
      </h3>

      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={items} />

      <AdminUserActions userId={user.id} email={user.email} isSelf={user.id === me.id} isSuperuser={user.isSuperuser} />

      <Card size="small" title="Admin activity involving this user">
        {history.length === 0 ? (
          <span style={{ color: "rgba(0,0,0,.45)", fontSize: 13 }}>Nothing yet.</span>
        ) : (
          history.map((a) => (
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
