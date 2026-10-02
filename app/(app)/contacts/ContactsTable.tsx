"use client";

import { Table, Tag, Space, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import Link from "next/link";
import type { ColumnsType } from "antd/es/table";

const CATEGORY_LABELS: Record<string, string> = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
};

const CATEGORY_COLORS: Record<string, string> = {
  FAMILY_FRIEND: "blue",
  SERVICE_PROVIDER: "green",
  MEDICAL_SCHOOL: "purple",
  HOUSEHOLD_ADMIN: "orange",
};

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  favorite: boolean;
  category: string;
  tags: string[];
  household: { displayName: string } | null;
  phoneMobile: string | null;
  phoneHome: string | null;
  phoneWork: string | null;
  emailPrimary: string | null;
}

interface ContactsTableProps {
  contacts: ContactRow[];
}

export default function ContactsTable({ contacts }: ContactsTableProps) {
  const columns: ColumnsType<ContactRow> = [
    {
      title: "Name",
      key: "name",
      render: (_, c) => (
        <Space orientation="vertical" size={2}>
          <Link href={`/contacts/${c.id}`} style={{ fontWeight: 500 }}>
            {c.favorite && (
              <StarFilled style={{ color: "#faad14", marginRight: 4, fontSize: 12 }} />
            )}
            {c.firstName} {c.lastName}
            {c.nickname && (
              <Typography.Text type="secondary" style={{ marginLeft: 4, fontWeight: 400 }}>
                ({c.nickname})
              </Typography.Text>
            )}
          </Link>
          {/* On a phone the other columns are hidden, so say who this is here. */}
          <Typography.Text type="secondary" className="mobile-only" style={{ fontSize: 12 }}>
            {[CATEGORY_LABELS[c.category], c.household?.displayName, c.phoneMobile ?? c.phoneHome ?? c.phoneWork]
              .filter(Boolean)
              .join(" · ")}
          </Typography.Text>
          {c.tags.length > 0 && (
            <Space wrap size={2}>
              {c.tags.map((tag) => (
                <Tag key={tag} variant="filled" style={{ fontSize: 11 }}>
                  {tag}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: "Category",
      key: "category",
      responsive: ["sm"],
      render: (_, c) => (
        <Tag color={CATEGORY_COLORS[c.category]} variant="filled">
          {CATEGORY_LABELS[c.category]}
        </Tag>
      ),
    },
    {
      title: "Household",
      key: "household",
      responsive: ["md"],
      render: (_, c) => c.household?.displayName ?? "—",
    },
    {
      title: "Phone",
      key: "phone",
      responsive: ["lg"],
      render: (_, c) => c.phoneMobile ?? c.phoneHome ?? c.phoneWork ?? "—",
    },
    {
      title: "Email",
      key: "email",
      responsive: ["lg"],
      render: (_, c) => c.emailPrimary ?? "—",
    },
  ];

  return (
    <Table
      dataSource={contacts}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={false}
      locale={{ emptyText: "No contacts match those filters." }}
    />
  );
}
