import { notFound } from "next/navigation";
import { contactIsIn } from "@/lib/scope";
import { prisma } from "@/lib/db";
import SyncCard from "./SyncCard";
import Link from "next/link";
import { ContactCategory, ActivityAction } from "@prisma/client";
import {
  Button,
  Descriptions,
  Tag,
  Space,
  Table,
  Breadcrumb,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { pageHouseholdId } from "@/lib/auth";

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sessionHouseholdId = await pageHouseholdId();

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      household: {
        select: {
          id: true,
          displayName: true,
          mailingAddress: true,
        },
      },
    },
  });

  if (!contact || !contactIsIn(contact, sessionHouseholdId)) notFound();

  // People in our own household can already message each other; sync is for everyone else.
  const canSync = contact.householdId !== sessionHouseholdId;
  const latestSync = canSync
    ? await prisma.sync.findFirst({
        where: { relatedContactId: contact.id, initiatingHouseholdId: sessionHouseholdId },
        orderBy: { createdAt: "desc" },
        include: { counterpartHousehold: { select: { displayName: true } } },
      })
    : null;

  const activityLog = await prisma.activityLogEntry.findMany({
    where: { entityId: contact.id, entityType: "CONTACT" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const isDeleted = !!contact.deletedAt;

  // Build address display
  let addressValue: string | null = null;
  let addressExtra: React.ReactNode = null;

  if (contact.category === "FAMILY_FRIEND") {
    if (contact.household?.mailingAddress) {
      addressValue = contact.household.mailingAddress;
      addressExtra = (
        <Link href={`/contacts/households/${contact.household.id}`}>
          {contact.household.displayName}
        </Link>
      );
    }
  } else {
    addressValue = contact.address;
  }

  const descItems = [
    {
      key: "category",
      label: "Category",
      children: (
        <Tag variant="filled">
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
                {addressExtra && <span style={{ marginLeft: 8, color: "var(--faint)" }}>— {addressExtra}</span>}
              </span>
            ) : (
              <span style={{ color: "var(--muted)" }}>
                No address on household record
                {contact.household && (
                  <>
                    {" — "}
                    <Link href={`/contacts/households/${contact.household.id}`}>
                      {contact.household.displayName}
                    </Link>
                  </>
                )}
              </span>
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
                    <Link href={`/contacts/households/${contact.household.id}`}>
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
                  <Tag key={tag} variant="filled">
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
    <Space orientation="vertical" style={{ width: "100%" }} size="large">
      <Breadcrumb
        items={[
          { title: <Link href="/contacts">Contacts</Link> },
          { title: `${contact.firstName} ${contact.lastName}` },
        ]}
      />

      <div>
        <Space align="baseline" size="small">
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "inline" }}>
            {contact.favorite && (
              <span style={{ color: "var(--warning)", marginRight: 8 }}>★</span>
            )}
            {contact.firstName} {contact.lastName}
            {contact.nickname && (
              <span style={{ fontSize: 16, fontWeight: 400, marginLeft: 8, color: "var(--muted)" }}>
                ({contact.nickname})
              </span>
            )}
          </h3>
          {isDeleted && <Tag color="error">Removed</Tag>}
        </Space>
        {!isDeleted && (
          <div style={{ marginTop: 8 }}>
            <Link href={`/contacts/${contact.id}/edit`}>
              <Button size="small">Edit</Button>
            </Link>
          </div>
        )}
      </div>

      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={descItems}
      />

      {canSync && (
        <SyncCard
          contactId={contact.id}
          defaultEmail={latestSync?.counterpartEmail ?? contact.emailPrimary ?? ""}
          sync={
            latestSync
              ? {
                  id: latestSync.id,
                  status: latestSync.status,
                  counterpartEmail: latestSync.counterpartEmail,
                  counterpartHouseholdName: latestSync.counterpartHousehold?.displayName ?? null,
                }
              : null
          }
        />
      )}

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
