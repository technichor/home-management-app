"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Input, Modal, Popconfirm, Space, Tag, Typography } from "antd";
import type { Candidate } from "@/lib/channels";
import {
  sendMessageAction,
  archiveChannelAction,
  unarchiveChannelAction,
  addChannelMembersAction,
  removeChannelMemberAction,
  leaveChannelAction,
  renameChannelAction,
  markChannelReadAction,
  type ActionResult,
} from "../actions";
import MemberPicker from "../MemberPicker";

export type MessageView = {
  id: string;
  text: string;
  createdAt: string;
  senderName: string;
  householdName: string | null;
  mine: boolean;
};

export type MemberView = {
  userId: string;
  name: string;
  householdName: string | null;
  manager: boolean;
  mine: boolean;
};

// How often to check for new messages. Polling is plenty at household scale.
export const POLL_INTERVAL_MS = 5000;

export default function ConversationClient({
  conversation,
  members,
  canManage,
  candidates,
  messages,
}: {
  conversation: { id: string; name: string; general: boolean; archived: boolean; shared: boolean };
  members: MemberView[];
  canManage: boolean;
  candidates: Candidate[];
  messages: MessageView[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState(false);
  const [adding, setAdding] = useState<string[]>([]);
  const [newName, setNewName] = useState(conversation.name);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Near-real-time delivery: re-fetch this page's data on a timer while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Opening the channel, or a new message arriving while it is open, marks it read up to the newest message
  // shown. (A tab in the background doesn't count as reading.)
  const newest = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  useEffect(() => {
    if (!newest || document.hidden) return;
    markChannelReadAction(conversation.id, newest).then(() => router.refresh());
  }, [conversation.id, newest, router]);

  async function run(fn: () => Promise<ActionResult>) {
    const result = await fn();
    if (!result.ok) {
      message.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const text = draft;
    const ok = await run(() => sendMessageAction(conversation.id, text));
    // Clear the box only if it still holds what was sent, not the next message already being typed.
    if (ok) setDraft((current) => (current === text ? "" : current));
    setSending(false);
  }

  async function leave() {
    const result = await leaveChannelAction(conversation.id);
    if (result.ok) router.push("/messages");
    else message.error(result.error);
  }

  return (
    <Space orientation="vertical" style={{ width: "100%", maxWidth: 760 }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Space wrap>
          <Link href="/messages">
            <Button>Back</Button>
          </Link>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {conversation.name}
          </Typography.Title>
          {conversation.general && <Tag color="blue">Everyone</Tag>}
          {conversation.shared && <Tag color="green">Shared</Tag>}
          {conversation.archived && <Tag>Archived</Tag>}
        </Space>
        <Button onClick={() => setPanel(true)}>People ({members.length})</Button>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: 12,
          minHeight: 240,
          maxHeight: "55vh",
          overflowY: "auto",
        }}
      >
        {messages.length === 0 ? (
          <Typography.Text type="secondary">No messages yet.</Typography.Text>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "80%", background: m.mine ? "#e6f4ff" : "#f5f5f5", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,.55)" }}>
                  <strong>{m.senderName}</strong>
                  {conversation.shared && m.householdName && <span> · {m.householdName}</span>}
                  <span style={{ marginLeft: 8 }} suppressHydrationWarning>
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {conversation.archived && <Alert type="info" showIcon title="Unarchive this channel to send messages." />}

      <Space.Compact style={{ width: "100%" }}>
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          value={draft}
          disabled={conversation.archived}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            if (e.shiftKey) return;
            e.preventDefault();
            send();
          }}
        />
        <Button type="primary" loading={sending} disabled={conversation.archived || !draft.trim()} onClick={send} style={{ height: "auto" }}>
          Send
        </Button>
      </Space.Compact>

      <Modal title={`People in ${conversation.name}`} open={panel} onCancel={() => setPanel(false)} footer={null} destroyOnHidden>
        <Space orientation="vertical" style={{ width: "100%" }} size="middle">
          <div>
            {members.map((m) => (
              <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span>
                  {m.name}
                  {m.mine && " (you)"} {m.manager && <Tag color="gold">Manager</Tag>}
                  {m.householdName && <span style={{ color: "rgba(0,0,0,.45)", fontSize: 12 }}> · {m.householdName}</span>}
                </span>
                {canManage && !m.mine && (
                  <Popconfirm title={`Remove ${m.name}?`} onConfirm={() => run(() => removeChannelMemberAction(conversation.id, m.userId))}>
                    <Button size="small" danger>
                      Remove
                    </Button>
                  </Popconfirm>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <>
              <Space.Compact style={{ width: "100%" }}>
                <MemberPicker candidates={candidates} value={adding} onChange={setAdding} placeholder="Add people" />
                <Button
                  disabled={adding.length === 0}
                  onClick={async () => {
                    if (await run(() => addChannelMembersAction(conversation.id, adding))) setAdding([]);
                  }}
                >
                  Add
                </Button>
              </Space.Compact>
              <Space.Compact style={{ width: "100%" }}>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Channel name" />
                <Button
                  disabled={!newName.trim() || newName.trim() === conversation.name}
                  onClick={() => run(() => renameChannelAction(conversation.id, newName))}
                >
                  Rename
                </Button>
              </Space.Compact>
              <Button
                onClick={async () => {
                  if (await run(() => (conversation.archived ? unarchiveChannelAction(conversation.id) : archiveChannelAction(conversation.id)))) {
                    setPanel(false);
                  }
                }}
              >
                {conversation.archived ? "Unarchive channel" : "Archive channel"}
              </Button>
            </>
          )}

          {conversation.general ? (
            <Typography.Text type="secondary">General always includes everyone in your household.</Typography.Text>
          ) : (
            <Popconfirm title="Leave this channel?" onConfirm={leave}>
              <Button danger>Leave channel</Button>
            </Popconfirm>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
