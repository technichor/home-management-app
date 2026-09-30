import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ContactCategory, ActivityAction } from "@prisma/client";
import {
  Descriptions,
  Tag,
  Space,
  Typography,
  Table,
  Breadcrumb,
} from "antd";
import type { ColumnsType } from "antd/es/table";

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
};

const CATEGORY_COLORS: Record<ContactCategory, string> = {
  FAMILY_FRIEND: "blue",
  SERVICE_PROVIDER: "green",
  MEDICAL_SCHOOL: "purple",
  HOUSEHOLD_ADMIN: "orange",
};

const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
  RESTORED: "Restored",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      household: {
        select: {
          id: true,
          displayName: true,
          mailingAddress: true,
          urlSlug: true,
        },
      },
    },
  });

  if (!contact) notFound();

  const activityLog = await prisma.activityLogEntry.findMany({
    where: { entityId: contact.id, entityType: "CONTACT" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const isDeleted = !!contact.deletedAt;

  // Build address display
  let addressValue: string | null = null;
  let addressLabel = "Address";
  let addressExtra: React.ReactNode = null;

  if (contact.category === "FAMILY_FRIEND") {
    addressLabel = "Address (from household)";
    if (contact.household?.mailingAddress) {
      addressValue = contact.household.mailingAddress;
      if (contact.household.urlSlug) {
        addressExtra = (
          <Link href={`/${slug}/contacts/households/${contact.household.id}`}>
            {contact.household.displayName}
          </Link>
        );
      }
    }
  } else {
    addressValue = contact.address;
  }

  const descItems = [
    {
      key: "category",
      label: "Category",
      children: (
        <Tag color={CATEGORY_COLORS[contact.category]} bordered={false}>
          {CATEGORY_LABELS[contact.category]}
        </Tag>
      ),
    },
    ...(contact.category === "FAMILY_FRIEND"
      ? [
          {
            key: "address",
            label: "Address (from household)",
            children: addressValue ? (
              <span>
                {addressValue}
                {addressExtra && <span style={{ marginLeft: 8, color: "#999" }}>— {addressExtra}</span>}
              </span>
            ) : (
              <Typography.Text type="secondary">
                No address on household record
                {contact.household && (
                  <>
                    {" — "}
                    <Link href={`/${slug}/contacts/households/${contact.household.id}`}>
                      {contact.household.displayName}
                    </Link>
                  </>
                )}
              </Typography.Text>
            ),
          },
        ]
      : [
          ...(contact.address
            ? [{ key: "address", label: "Address", children: contact.address }]
            : []),
          ...(contact.household
            ? [
                {
                  key: "household",
                  label: "Household",
                  children: (
                    <Link href={`/${slug}/contacts/households/${contact.household.id}`}>
                      {contact.household.displayName}
                    </Link>
                  ),
                },
              ]
            : []),
        ]),
    ...(contact.phoneMobile ? [{ key: "mobile", label: "Mobile", children: contact.phoneMobile }] : []),
    ...(contact.phoneHome ? [{ key: "homePhone", label: "Home phone", children: contact.phoneHome }] : []),
    ...(contact.phoneWork ? [{ key: "workPhone", label: "Work phone", children: contact.phoneWork }] : []),
    ...(contact.emailPrimary ? [{ key: "email1", label: "Primary email", children: contact.emailPrimary }] : []),
    ...(contact.emailSecondary ? [{ key: "email2", label: "Secondary email", children: contact.emailSecondary }] : []),
    ...(contact.linkedFamilyMember
      ? [{ key: "linkedMember", label: "Linked family member", children: contact.linkedFamilyMember }]
      : []),
    ...(contact.importantDate1
      ? [{ key: "date1", label: contact.importantDate1Label ?? "Important date 1", children: contact.importantDate1 }]
      : []),
    ...(contact.importantDate2
      ? [{ key: "date2", label: contact.importantDate2Label ?? "Important date 2", children: contact.importantDate2 }]
      : []),
    ...(contact.tags.length > 0
      ? [
          {
            key: "tags",
            label: "Tags",
            children: (
              <Space wrap size={4}>
                {contact.tags.map((tag) => (
                  <Tag key={tag} bordered={false}>
                    {tag}
                  </Tag>
                ))}
              </Space>
            ),
          },
        ]
      : []),
    ...(contact.relationshipNotes
      ? [{ key: "relNotes", label: "Relationship notes", children: contact.relationshipNotes, span: 3 }]
      : []),
    ...(contact.notes
      ? [{ key: "notes", label: "Notes", children: <span style={{ whiteSpace: "pre-wrap" }}>{contact.notes}</span>, span: 3 }]
      : []),
  ];

  type LogRow = { key: string; when: string; action: string; source: string };
  const logColumns: ColumnsType<LogRow> = [
    { title: "When", dataIndex: "when", key: "when" },
    { title: "Action", dataIndex: "action", key: "action" },
    { title: "Source", dataIndex: "source", key: "source" },
  ];
  const logData: LogRow[] = activityLog.map((e) => ({
    key: e.id,
    when: e.timestamp.toLocaleString(),
    action: ACTION_LABELS[e.action],
    source: e.source === "CSV_IMPORT" ? "CSV import" : "Manual",
  }));

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Breadcrumb
        items={[
          { title: <Link href={`/${slug}/contacts`}>Contacts</Link> },
          { title: `${contact.firstName} ${contact.lastName}` },
        ]}
      />

      <div>
        <Space align="baseline" size="small">
          <Typography.Title level={3} style={{ margin: 0 }}>
            {contact.favorite && (
              <span style={{ color: "#faad14", marginRight: 8 }}>★</span>
            )}
            {contact.firstName} {contact.lastName}
            {contact.nickname && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: 16, fontWeight: 400, marginLeft: 8 }}
              >
                ({contact.nickname})
              </Typography.Text>
            )}
          </Typography.Title>
          {isDeleted && <Tag color="error">Removed</Tag>}
        </Space>
      </div>

      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={descItems}
      />

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
