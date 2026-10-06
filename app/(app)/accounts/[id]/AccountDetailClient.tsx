"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Descriptions, Popconfirm, Space, Tag, Typography } from "antd";
import { KIND_LABELS, STATUS_LABELS } from "@/lib/accounts";
import { deleteAccountRecordAction } from "../actions";
import type { AccountFormRecord } from "../AccountForm";

export default function AccountDetailClient({ record }: { record: AccountFormRecord }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const result = await deleteAccountRecordAction(record.id);
    if (!result.ok) return setError(result.error);
    router.push("/accounts");
  }

  const rows: [string, React.ReactNode][] = [
    ["Kind", KIND_LABELS[record.kind]],
    ["Institution", record.institution],
    ["Account number", record.lastFour ? `····${record.lastFour}` : null],
    ["Whose", record.ownerName ?? "Whole household"],
    // Only ever a link to an http(s) address (checked when it was saved), opening in a new tab.
    ["Website", record.website ? <a key="w" href={record.website} target="_blank" rel="noopener noreferrer">{record.website}</a> : null],
    ["Phone", record.phone],
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <div>
        <Link href="/accounts" style={{ fontSize: 13 }}>
          &larr; Accounts
        </Link>
        <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
          {record.name}
        </Typography.Title>
        <Tag color={record.status === "REVIEW" ? "orange" : undefined}>{STATUS_LABELS[record.status]}</Tag>
      </div>

      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      <Space>
        <Link href={`/accounts/${record.id}/edit`}>
          <Button>Edit</Button>
        </Link>
        <Popconfirm title={`Delete "${record.name}"?`} description="This removes it from the list. To keep it on record, set its status to Closed instead." okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
          <Button danger>Delete</Button>
        </Popconfirm>
      </Space>

      <Descriptions column={1} size="small" bordered items={rows.filter(([, v]) => v !== null && v !== "").map(([label, children]) => ({ key: label, label, children }))} />

      {record.notes && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{record.notes}</div>}
    </Space>
  );
}
