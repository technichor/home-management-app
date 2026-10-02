"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Input, Space, Tag, Typography } from "antd";
import { sendMessageAction, archiveConversationAction, unarchiveConversationAction } from "../actions";

export type MessageView = {
  id: string;
  text: string;
  createdAt: string;
  senderName: string;
  householdName: string | null;
  mine: boolean;
};

// How often to check for new messages. Polling is plenty at household scale.
export const POLL_INTERVAL_MS = 5000;

export default function ConversationClient({
  conversation,
  messages,
  canSend,
}: {
  conversation: { id: string; name: string; synced: boolean; archived: boolean };
  messages: MessageView[];
  canSend: boolean;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
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

  return (
    <Space orientation="vertical" style={{ width: "100%", maxWidth: 760 }} size="middle">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Space>
          <Link href="/messages">
            <Button>Back</Button>
          </Link>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {conversation.name}
          </Typography.Title>
          {conversation.synced && <Tag color="green">Synced</Tag>}
          {conversation.archived && <Tag>Archived</Tag>}
        </Space>
        <Button
          onClick={() =>
            run(() =>
              conversation.archived
                ? unarchiveConversationAction(conversation.id)
                : archiveConversationAction(conversation.id)
            )
          }
        >
          {conversation.archived ? "Unarchive" : "Archive"}
        </Button>
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
            <div
              key={m.id}
              style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginBottom: 10 }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  background: m.mine ? "#e6f4ff" : "#f5f5f5",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(0,0,0,.55)" }}>
                  <strong>{m.senderName}</strong>
                  {conversation.synced && m.householdName && <span> · {m.householdName}</span>}
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

      {!canSend && (
        <Alert
          type="warning"
          showIcon
          title="Your account is not linked to a contact yet."
          description={
            <span>
              Messages are sent as the contact your household login acts as.{" "}
              <Link href="/account">Choose one on the Account page.</Link>
            </span>
          }
        />
      )}
      {conversation.archived && <Alert type="info" showIcon title="Unarchive this conversation to send messages." />}

      <Space.Compact style={{ width: "100%" }}>
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          value={draft}
          disabled={!canSend || conversation.archived}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            if (e.shiftKey) return;
            e.preventDefault();
            send();
          }}
        />
        <Button
          type="primary"
          loading={sending}
          disabled={!canSend || conversation.archived || !draft.trim()}
          onClick={send}
          style={{ height: "auto" }}
        >
          Send
        </Button>
      </Space.Compact>
    </Space>
  );
}
