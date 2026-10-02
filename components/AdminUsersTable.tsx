"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { formatWhen } from "@/lib/format";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  householdName: string | null;
  isSuperuser: boolean;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
};

export default function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q
    ? users.filter((u) => [u.email, u.name, u.householdName ?? ""].some((v) => v.toLowerCase().includes(q)))
    : users;

  const columns: ColumnsType<AdminUserRow> = [
    {
      title: "User",
      key: "user",
      render: (_, u) => (
        <div>
          <Link href={`/admin/users/${u.id}`} style={{ fontWeight: 500, wordBreak: "break-all" }}>
            {u.email}
          </Link>
          {u.isSuperuser && (
            <Tag color="red" style={{ marginLeft: 6 }}>
              Superuser
            </Tag>
          )}
          {!u.verified && (
            <Tag color="warning" style={{ marginLeft: 6 }}>
              Unconfirmed
            </Tag>
          )}
          <div style={{ color: "rgba(0,0,0,.45)", fontSize: 12 }}>
            {u.name}
            {u.householdName ? ` · ${u.householdName}` : " · no household"}
          </div>
          {/* On a phone the other columns are hidden, so say when they were last around here. */}
          <Typography.Text type="secondary" className="mobile-only" style={{ fontSize: 12 }}>
            Last seen {formatWhen(u.lastSeenAt)}
          </Typography.Text>
        </div>
      ),
    },
    { title: "Household", key: "household", responsive: ["lg"], render: (_, u) => u.householdName ?? "—" },
    { title: "Created", key: "created", responsive: ["md"], render: (_, u) => formatWhen(u.createdAt) },
    { title: "Last login", key: "login", responsive: ["md"], render: (_, u) => formatWhen(u.lastLoginAt) },
    { title: "Last seen", key: "seen", responsive: ["sm"], render: (_, u) => formatWhen(u.lastSeenAt) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input.Search
        allowClear
        placeholder="Search by email, name or household"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="fill-on-mobile"
        style={{ maxWidth: 360 }}
      />
      <Table
        rowKey="id"
        dataSource={rows}
        columns={columns}
        size="small"
        pagination={rows.length > 25 ? { pageSize: 25 } : false}
        locale={{ emptyText: "No users match." }}
      />
    </div>
  );
}
