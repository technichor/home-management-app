import { prisma } from "@/lib/db";
import Link from "next/link";
import { restoreContactAction, restoreHouseholdAction } from "./actions";
import { Table, Typography, Space, Button } from "antd";
import type { ColumnsType } from "antd/es/table";

export default async function RemovedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [deletedContacts, deletedHouseholds] = await Promise.all([
    prisma.contact.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.household.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  type ContactRow = {
    key: string;
    name: React.ReactNode;
    category: string;
    removed: string;
    action: React.ReactNode;
  };

  const contactColumns: ColumnsType<ContactRow> = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Category", dataIndex: "category", key: "category", responsive: ["sm"] },
    { title: "Removed", dataIndex: "removed", key: "removed" },
    { title: "", dataIndex: "action", key: "action", align: "right" },
  ];

  const contactData: ContactRow[] = deletedContacts.map((c) => ({
    key: c.id,
    name: (
      <Link href={`/${slug}/contacts/${c.id}`} style={{ color: "#595959" }}>
        {c.firstName} {c.lastName}
      </Link>
    ),
    category: c.category,
    removed: c.deletedAt?.toLocaleDateString() ?? "",
    action: (
      <form action={restoreContactAction.bind(null, c.id, slug)}>
        <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
          Restore
        </Button>
      </form>
    ),
  }));

  type HouseholdRow = {
    key: string;
    name: React.ReactNode;
    removed: string;
    action: React.ReactNode;
  };

  const householdColumns: ColumnsType<HouseholdRow> = [
    { title: "Household", dataIndex: "name", key: "name" },
    { title: "Removed", dataIndex: "removed", key: "removed" },
    { title: "", dataIndex: "action", key: "action", align: "right" },
  ];

  const householdData: HouseholdRow[] = deletedHouseholds.map((h) => ({
    key: h.id,
    name: (
      <Link href={`/${slug}/contacts/households/${h.id}`} style={{ color: "#595959" }}>
        {h.displayName}
      </Link>
    ),
    removed: h.deletedAt?.toLocaleDateString() ?? "",
    action: (
      <form action={restoreHouseholdAction.bind(null, h.id, slug)}>
        <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
          Restore
        </Button>
      </form>
    ),
  }));

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Removed items
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Items removed via CSV import or manually. Restore to make them active again.
        </Typography.Text>
      </div>

      <div>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          Contacts ({deletedContacts.length})
        </Typography.Title>
        <Table
          dataSource={contactData}
          columns={contactColumns}
          size="small"
          pagination={false}
          locale={{ emptyText: "No removed contacts." }}
        />
      </div>

      <div>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          Households ({deletedHouseholds.length})
        </Typography.Title>
        <Table
          dataSource={householdData}
          columns={householdColumns}
          size="small"
          pagination={false}
          locale={{ emptyText: "No removed households." }}
        />
      </div>
    </Space>
  );
}
