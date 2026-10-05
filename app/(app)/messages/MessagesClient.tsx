"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Badge, Button, Empty, Input, Modal, Space, Tag, Typography } from "antd";
import { shortWhen } from "@/lib/format";
import type { Candidate } from "@/lib/channels";
import { createChannelAction } from "./actions";
import MemberPicker from "./MemberPicker";

// How often the list checks for new messages.
export const LIST_POLL_INTERVAL_MS = 10000;

export type ChannelRow = {
  id: string;
  name: string;
  general: boolean;
  shared: boolean;
  memberCount: number;
  unread: number;
  preview: string | null;
  previewSender: string | null;
  lastActivity: string;
};

export default function MessagesClient({
  channels,
  candidates,
  showArchived,
}: {
  channels: ChannelRow[];
  candidates: Candidate[];
  showArchived: boolean;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // New messages arrive while the list is open: re-fetch it on a timer while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, LIST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  async function create() {
    setBusy(true);
    try {
      const result = await createChannelAction(name, members);
      if (result.ok) router.push(`/messages/${result.id}`);
      else message.error(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {showArchived ? "Archived channels" : "Messages"}
        </Typography.Title>
        <Space>
          <Link href={showArchived ? "/messages" : "/messages?archived=1"}>
            <Button>{showArchived ? "Back to messages" : "Archived"}</Button>
          </Link>
          {!showArchived && (
            <Button type="primary" onClick={() => setOpen(true)}>
              New channel
            </Button>
          )}
        </Space>
      </div>

      {channels.length === 0 ? (
        <Empty
          description={showArchived ? "No archived channels." : "No channels yet. Start one to begin."}
          style={{ padding: "48px 0" }}
        />
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
          {channels.map((c, i) => (
            <Link
              key={c.id}
              href={`/messages/${c.id}`}
              style={{ display: "block", padding: "12px 16px", borderTop: i > 0 ? "1px solid var(--border)" : undefined, color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: c.unread > 0 ? 700 : 500 }}>
                  {c.name}{" "}
                  {c.unread > 0 && <Badge count={c.unread} overflowCount={99} aria-label={`${c.unread} unread`} style={{ marginRight: 6 }} />}
                  {c.general && <Tag>Everyone</Tag>}
                  {c.shared && <Tag>Shared</Tag>}
                  <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>
                    {c.memberCount} {c.memberCount === 1 ? "person" : "people"}
                  </span>
                </span>
                <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }} suppressHydrationWarning>
                  {shortWhen(c.lastActivity)}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {c.preview ? `${c.previewSender}: ${c.preview}` : "No messages yet"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        title="New channel"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={create}
        okText="Create"
        okButtonProps={{ loading: busy, disabled: !name.trim() || members.length === 0 }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Input placeholder="Name, e.g. Weekend plans" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <MemberPicker candidates={candidates} value={members} onChange={setMembers} placeholder="Who is in it?" />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            You can add people from your household and from households you&apos;re synced with. Only the people you add can see
            this channel, and you manage it.
          </Typography.Text>
          {candidates.length === 0 && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              No one else is available yet. Invite someone to your household, or sync with another household first.
            </Typography.Text>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
