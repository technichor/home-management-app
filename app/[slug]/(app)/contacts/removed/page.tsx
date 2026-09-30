import { prisma } from "@/lib/db";
import Link from "next/link";
import { restoreContactAction, restoreHouseholdAction } from "./actions";
import { Table, Space, Button } from "antd";
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
    <Space orientation="vertical" style={{ width: "100%" }} size="large">
      <div>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Removed items
        </h4>
        <span style={{ fontSize: 13, color: "rgba(0,0,0,.45)" }}>
          Items removed via CSV import or manually. Restore to make them active again.
        </span>
      </div>

      <div>
        <h5 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          Contacts ({deletedContacts.length})
        </h5>
        <Table
          dataSource={contactData}
          columns={contactColumns}
          size="small"
          pagination={false}
          locale={{ emptyText: "No removed contacts." }}
        />
      </div>

      <div>
        <h5 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          Households ({deletedHouseholds.length})
        </h5>
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
