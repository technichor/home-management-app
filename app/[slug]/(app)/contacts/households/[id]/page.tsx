import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Link from "next/link";
import {
  Descriptions,
  Tag,
  Space,
  Typography,
  Table,
  Breadcrumb,
} from "antd";
import type { ColumnsType } from "antd/es/table";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const myHouseholdId = session.householdId;

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
                  <Tag key={tag} bordered={false}>
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
          <Typography.Text type="secondary" style={{ fontWeight: 400, marginLeft: 4 }}>
            ({c.nickname})
          </Typography.Text>
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
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Breadcrumb
        items={[
          { title: <Link href={`/${slug}/contacts/households`}>Households</Link> },
          { title: household.displayName },
        ]}
      />

      <Space align="baseline" size="small">
        <Typography.Title level={3} style={{ margin: 0 }}>
          {household.displayName}
        </Typography.Title>
        {isOurs && <Tag color="blue">Our household</Tag>}
        {isDeleted && <Tag color="error">Removed</Tag>}
      </Space>

      {descItems.length > 0 && (
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={descItems} />
      )}

      <div>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          Family &amp; Friend contacts ({household.contacts.length})
        </Typography.Title>
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
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Activity log
          </Typography.Title>
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
