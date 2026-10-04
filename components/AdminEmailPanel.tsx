"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { sendTestEmailAction } from "@/app/admin/actions";
import { formatWhen } from "@/lib/format";

export type EmailLogRow = {
  id: string;
  to: string;
  subject: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = { SENT: "green", FAILED: "red", NOT_SENT: "default" };
const STATUS_LABELS: Record<string, string> = { SENT: "Sent", FAILED: "Failed", NOT_SENT: "Not sent" };

export default function AdminEmailPanel({ entries }: { entries: EmailLogRow[] }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; to: string } | { ok: false; error: string } | null>(null);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    try {
      const r = await sendTestEmailAction(to);
      setResult(r.ok ? { ok: true, to } : r);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const columns: ColumnsType<EmailLogRow> = [
    {
      title: "Email",
      key: "email",
      render: (_, e) => (
        <div>
          <span style={{ wordBreak: "break-all" }}>{e.to}</span>{" "}
          <Tag color={STATUS_COLORS[e.status] ?? "default"}>{STATUS_LABELS[e.status] ?? e.status}</Tag>
          <div style={{ color: "rgba(0,0,0,.45)", fontSize: 12 }}>{e.subject}</div>
          {e.error && <div style={{ color: "#cf1322", fontSize: 12, wordBreak: "break-word" }}>{e.error}</div>}
          <Typography.Text type="secondary" className="mobile-only" style={{ fontSize: 12 }}>
            {formatWhen(e.createdAt)}
          </Typography.Text>
        </div>
      ),
    },
    { title: "When", key: "when", responsive: ["sm"], render: (_, e) => formatWhen(e.createdAt) },
    {
      title: "Provider id",
      key: "providerId",
      responsive: ["lg"],
      render: (_, e) => (e.providerId ? <code style={{ fontSize: 12 }}>{e.providerId}</code> : "—"),
    },
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="Send a test email">
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            Sends a plain message to any address and shows exactly what the email provider answered.
          </Typography.Text>
          <Space.Compact style={{ width: "100%", maxWidth: 440 }}>
            <Input
              type="email"
              placeholder="name@example.com"
              aria-label="Send the test to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onPressEnter={sendTest}
            />
            <Button type="primary" loading={busy} disabled={!to.trim()} onClick={sendTest}>
              Send test
            </Button>
          </Space.Compact>
          {result?.ok && <Alert type="success" showIcon title={`The provider accepted the test email for ${result.to}.`} />}
          {result && !result.ok && <Alert type="error" showIcon title="The email was not sent" description={result.error} />}
        </Space>
      </Card>

      <Card size="small" title="Recent email attempts">
        <Table
          rowKey="id"
          dataSource={entries}
          columns={columns}
          size="small"
          pagination={entries.length > 25 ? { pageSize: 25 } : false}
          locale={{ emptyText: "No email has been sent yet." }}
        />
      </Card>
    </Space>
  );
}
