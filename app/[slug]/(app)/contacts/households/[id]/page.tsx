import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  Descriptions,
  Tag,
  Space,
  Table,
  Breadcrumb,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { pageHouseholdId } from "@/lib/auth";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const sessionHouseholdId = await pageHouseholdId();
  const myHouseholdId = sessionHouseholdId;

  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { deletedAt: null, category: "FAMILY_FRIEND" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
  });

  if (!household) notFound();

  const isOurs = household.id === myHouseholdId;
  const isDeleted = !!household.deletedAt;

  const activityLog = await prisma.activityLogEntry.findMany({
    where: { entityId: household.id, entityType: "HOUSEHOLD" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const descItems = [
    ...(household.mailingAddress
      ? [{ key: "address", label: "Mailing address", children: household.mailingAddress }]
      : []),
    ...(household.tags.length > 0
      ? [
          {
            key: "tags",
            label: "Tags",
            children: (
              <Space wrap size={4}>
                {household.tags.map((tag) => (
                  <Tag key={tag} variant="filled">
                    {tag}
                  </Tag>
                ))}
              </Space>
            ),
          },
        ]
      : []),
    ...(household.notes
      ? [
          {
            key: "notes",
            label: "Notes",
            children: <span style={{ whiteSpace: "pre-wrap" }}>{household.notes}</span>,
            span: 2,
          },
        ]
      : []),
  ];

  type MemberRow = {
    key: string;
    name: React.ReactNode;
    phone: string;
    email: string;
  };

  const memberColumns: ColumnsType<MemberRow> = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Phone", dataIndex: "phone", key: "phone", responsive: ["sm"] },
    { title: "Email", dataIndex: "email", key: "email", responsive: ["sm"] },
  ];

  const memberData: MemberRow[] = household.contacts.map((c) => ({
    key: c.id,
    name: (
      <Link href={`/${slug}/contacts/${c.id}`} style={{ fontWeight: 500 }}>
        {c.favorite && <span style={{ color: "#faad14", marginRight: 4 }}>★</span>}
        {c.firstName} {c.lastName}
        {c.nickname && (
          <span style={{ fontWeight: 400, marginLeft: 4, color: "rgba(0,0,0,.45)" }}>
            ({c.nickname})
          </span>
        )}
      </Link>
    ),
    phone: c.phoneMobile ?? c.phoneHome ?? c.phoneWork ?? "—",
    email: c.emailPrimary ?? "—",
  }));

  type LogRow = { key: string; when: string; action: string; source: string };
  const logColumns: ColumnsType<LogRow> = [
    { title: "When", dataIndex: "when", key: "when" },
    { title: "Action", dataIndex: "action", key: "action" },
    { title: "Source", dataIndex: "source", key: "source" },
  ];
  const logData: LogRow[] = activityLog.map((e) => ({
    key: e.id,
    when: e.timestamp.toLocaleString(),
    action: e.action.charAt(0) + e.action.slice(1).toLowerCase(),
    source: e.source === "CSV_IMPORT" ? "CSV import" : "Manual",
  }));

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="large">
      <Breadcrumb
        items={[
          { title: <Link href={`/${slug}/contacts/households`}>Households</Link> },
          { title: household.displayName },
        ]}
      />

      <Space align="baseline" size="small">
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          {household.displayName}
        </h3>
        {isOurs && <Tag color="blue">Our household</Tag>}
        {isDeleted && <Tag color="error">Removed</Tag>}
      </Space>

      {descItems.length > 0 && (
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={descItems} />
      )}

      <div>
        <h5 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          Family &amp; Friend contacts ({household.contacts.length})
        </h5>
        <Table
          dataSource={memberData}
          columns={memberColumns}
          size="small"
          pagination={false}
          locale={{ emptyText: "No contacts linked to this household." }}
        />
      </div>

      {activityLog.length > 0 && (
        <div>
          <h5 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
            Activity log
          </h5>
          <Table
            dataSource={logData}
            columns={logColumns}
            size="small"
            pagination={false}
          />
        </div>
      )}
    </Space>
  );
}
