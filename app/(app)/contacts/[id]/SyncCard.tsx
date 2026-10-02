"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Input, Popconfirm, Space, Tag, Typography } from "antd";
import { requestSyncAction, regenerateInviteAction, revokeInviteAction, SyncActionResult } from "./syncActions";

export type SyncInfo = {
  id: string;
  status: "PENDING" | "ACTIVE" | "DECLINED" | "REVOKED";
  counterpartEmail: string;
  counterpartHouseholdName: string | null;
};

export default function SyncCard({
  contactId,
  defaultEmail,
  sync,
}: {
  contactId: string;
  defaultEmail: string;
  sync: SyncInfo | null;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [email, setEmail] = useState(defaultEmail);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<SyncActionResult>) {
    setBusy(true);
    try {
      const result = await fn();
      if (result.ok) {
        setLink(`${window.location.origin}${result.invitePath}`);
        router.refresh();
      } else {
        message.error(result.error);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(syncId: string) {
    setBusy(true);
    try {
      const result = await revokeInviteAction(syncId);
      if (result.ok) {
        setLink(null);
        message.success("Invite revoked. Its link no longer works.");
        router.refresh();
      } else {
        message.error(result.error);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link as string);
      message.success("Link copied");
    } catch {
      message.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  const canRequest = !sync || sync.status === "DECLINED" || sync.status === "REVOKED";

  return (
    <Card size="small" title="Messaging sync">
      <Space orientation="vertical" style={{ width: "100%" }}>
        {sync?.status === "ACTIVE" && (
          <Tag color="green">
            Synced{sync.counterpartHouseholdName ? ` with ${sync.counterpartHouseholdName}` : ""}
          </Tag>
        )}
        {sync?.status === "PENDING" && (
          <Typography.Text>
            Invite for <strong>{sync.counterpartEmail}</strong> is waiting for their household to accept.
          </Typography.Text>
        )}
        {sync?.status === "DECLINED" && <Typography.Text type="secondary">They declined the last invite.</Typography.Text>}
        {sync?.status === "REVOKED" && <Typography.Text type="secondary">The last sync was revoked.</Typography.Text>}

        {canRequest && (
          <Space.Compact style={{ width: "100%" }}>
            <Input
              placeholder="Their email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <Button
              type="primary"
              loading={busy}
              disabled={!email.trim()}
              onClick={() => run(() => requestSyncAction(contactId, email))}
            >
              Request sync
            </Button>
          </Space.Compact>
        )}

        {sync?.status === "PENDING" && (
          <Space wrap>
            <Button loading={busy} onClick={() => run(() => regenerateInviteAction(sync.id))}>
              Get a new link
            </Button>
            <Popconfirm
              title="Revoke this invite?"
              description="Its link stops working. You can invite them again later."
              okText="Revoke"
              onConfirm={() => revoke(sync.id)}
            >
              <Button danger disabled={busy}>
                Revoke invite
              </Button>
            </Popconfirm>
          </Space>
        )}

        {link && (
          <Alert
            type="info"
            showIcon
            title="Send them this link"
            description={
              <Space orientation="vertical" style={{ width: "100%" }}>
                <Typography.Text type="secondary">
                  This app does not send email. Paste the link into your own message. It is shown only
                  once, and a new link replaces this one.
                </Typography.Text>
                <Space.Compact style={{ width: "100%" }}>
                  <Input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
                  <Button onClick={copy}>Copy</Button>
                </Space.Compact>
              </Space>
            }
          />
        )}
      </Space>
    </Card>
  );
}
