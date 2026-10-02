"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { createGroupConversationAction, startContactThreadAction } from "./actions";

export type ConversationRow = {
  id: string;
  name: string;
  kind: "group" | "private" | "synced";
  preview: string | null;
  previewSender: string | null;
  lastActivity: string;
};

const KIND_LABEL = { group: "Group", private: "Private note", synced: "Synced" } as const;
const KIND_COLOR = { group: "default", private: "gold", synced: "green" } as const;

export default function MessagesClient({
  slug,
  conversations,
  contacts,
  showArchived,
}: {
  slug: string;
  conversations: ConversationRow[];
  contacts: { id: string; name: string }[];
  showArchived: boolean;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteContact, setNoteContact] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(fn: () => Promise<{ id: string }>) {
    setBusy(true);
    try {
      const { id } = await fn();
      router.push(`/${slug}/messages/${id}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {showArchived ? "Archived conversations" : "Messages"}
        </Typography.Title>
        <Space>
          <Link href={showArchived ? `/${slug}/messages` : `/${slug}/messages?archived=1`}>
            <Button>{showArchived ? "Back to messages" : "Archived"}</Button>
          </Link>
          {!showArchived && (
            <>
              <Button onClick={() => setNoteOpen(true)}>Note about a contact</Button>
              <Button type="primary" onClick={() => setGroupOpen(true)}>
                New group chat
              </Button>
            </>
          )}
        </Space>
      </div>

      {conversations.length === 0 ? (
        <Empty
          description={showArchived ? "No archived conversations." : "No conversations yet. Start a group chat to begin."}
          style={{ padding: "48px 0" }}
        />
      ) : (
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
          {conversations.map((c, i) => (
            <Link
              key={c.id}
              href={`/${slug}/messages/${c.id}`}
              style={{
                display: "block",
                padding: "12px 16px",
                borderTop: i > 0 ? "1px solid #f0f0f0" : undefined,
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 500 }}>
                  {c.name} <Tag color={KIND_COLOR[c.kind]}>{KIND_LABEL[c.kind]}</Tag>
                </span>
                <span style={{ color: "rgba(0,0,0,.45)", fontSize: 12, whiteSpace: "nowrap" }} suppressHydrationWarning>
                  {new Date(c.lastActivity).toLocaleString()}
                </span>
              </div>
              <div style={{ color: "rgba(0,0,0,.55)", fontSize: 13 }}>
                {c.preview ? `${c.previewSender}: ${c.preview}` : "No messages yet"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        title="New group chat"
        open={groupOpen}
        onCancel={() => setGroupOpen(false)}
        onOk={() => open(() => createGroupConversationAction(slug, groupName))}
        okText="Create"
        okButtonProps={{ loading: busy, disabled: !groupName.trim() }}
      >
        <Input
          placeholder="Name, e.g. Weekend plans"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          autoFocus
        />
      </Modal>

      <Modal
        title="Note about a contact"
        open={noteOpen}
        onCancel={() => setNoteOpen(false)}
        onOk={() => open(() => startContactThreadAction(slug, noteContact as string))}
        okText="Open"
        okButtonProps={{ loading: busy, disabled: !noteContact }}
      >
        <Typography.Paragraph type="secondary">
          A private thread only your household can see, for keeping notes about someone you are not
          synced with.
        </Typography.Paragraph>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Choose a contact"
          value={noteContact}
          onChange={setNoteContact}
          options={contacts.map((c) => ({ value: c.id, label: c.name }))}
          style={{ width: "100%" }}
        />
      </Modal>
    </Space>
  );
}
