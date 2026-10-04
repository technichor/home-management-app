"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Space, Tag, Typography, Popconfirm } from "antd";
import {
  createInviteAction,
  decideJoinRequestAction,
  endSyncAction,
  leaveHouseholdAction,
  promoteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  setJoinCodeAction,
  type HouseholdActionResult,
} from "./actions";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "OWNER" | "MEMBER";
}

interface Props {
  householdName: string;
  currentUserId: string;
  isOwner: boolean;
  joinCode: string | null;
  members: Member[];
  syncs: { id: string; householdName: string }[];
  invites: { id: string; createdAt: string; expiresAt: string }[];
  requests: { id: string; name: string; email: string }[];
}

const dateOnly = (iso: string) => iso.slice(0, 10);

export default function HouseholdClient({ householdName, currentUserId, isOwner, joinCode, members, syncs, invites, requests }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<HouseholdActionResult>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  async function createInvite() {
    setBusy(true);
    setError(null);
    const result = await createInviteAction();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNewLink(`${window.location.origin}${result.invitePath}`);
    router.refresh();
  }

  async function toggleJoinCode(enable: boolean) {
    setBusy(true);
    setError(null);
    const result = await setJoinCodeAction(enable);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {householdName}
      </Typography.Title>
      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      <Card title="Members">
        <Space orientation="vertical" style={{ width: "100%" }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>
                {m.firstName} {m.lastName} <Typography.Text type="secondary">{m.email}</Typography.Text>{" "}
                {m.role === "OWNER" && <Tag>Owner</Tag>}
                {m.id === currentUserId && <Tag>You</Tag>}
              </span>
              {isOwner && m.id !== currentUserId && (
                <Space>
                  {m.role === "MEMBER" && (
                    <Button size="small" disabled={busy} onClick={() => run(() => promoteMemberAction(m.id))}>
                      Make owner
                    </Button>
                  )}
                  <Popconfirm
                    title={`Remove ${m.firstName} from the household?`}
                    okText="Remove"
                    onConfirm={() => run(() => removeMemberAction(m.id))}
                  >
                    <Button size="small" danger disabled={busy}>
                      Remove
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>
          ))}
          <Popconfirm
            title="Leave this household?"
            okText="Leave"
            onConfirm={() => run(() => leaveHouseholdAction())}
          >
            <Button disabled={busy}>Leave household</Button>
          </Popconfirm>
        </Space>
      </Card>

      <Card title="Synced households">
        <Space orientation="vertical" style={{ width: "100%" }}>
          {syncs.length === 0 && (
            <Typography.Text type="secondary">
              Not synced with any household. Request a sync from a contact&apos;s page to put their people in your channels.
            </Typography.Text>
          )}
          {syncs.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{s.householdName}</span>
              {isOwner && (
                <Popconfirm
                  title={`End the sync with ${s.householdName}?`}
                  description="Neither household can add the other's people to channels. In channels that have both, the people from the household that didn't create the channel are removed. Messages stay."
                  okText="End sync"
                  onConfirm={() => run(() => endSyncAction(s.id))}
                >
                  <Button size="small" danger disabled={busy}>
                    End sync
                  </Button>
                </Popconfirm>
              )}
            </div>
          ))}
        </Space>
      </Card>

      {isOwner && (
        <>
          <Card title="Invite someone">
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Typography.Text type="secondary">
                Make a one-time link and send it to the person yourself. It works once and expires in 7 days.
              </Typography.Text>
              <Button type="primary" disabled={busy} onClick={createInvite} style={{ alignSelf: "flex-start" }}>
                Create invite link
              </Button>
              {newLink && (
                <Alert
                  type="success"
                  showIcon
                  title="Copy this link now. It is shown only once."
                  description={
                    <Space.Compact style={{ width: "100%" }}>
                      <Input readOnly value={newLink} />
                      <Button onClick={() => navigator.clipboard.writeText(newLink)}>Copy</Button>
                    </Space.Compact>
                  }
                />
              )}
              {invites.map((i) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    Pending invite from {dateOnly(i.createdAt)} (expires {dateOnly(i.expiresAt)})
                  </span>
                  <Button size="small" disabled={busy} onClick={() => run(() => revokeInviteAction(i.id))}>
                    Revoke
                  </Button>
                </div>
              ))}
            </Space>
          </Card>

          <Card title="Join requests">
            <Space orientation="vertical" style={{ width: "100%" }}>
              {joinCode ? (
                <>
                  <Typography.Text>
                    People who enter this code ask to join; you approve them here. Code:{" "}
                    <Typography.Text code copyable>
                      {joinCode}
                    </Typography.Text>
                  </Typography.Text>
                  <Space>
                    <Button size="small" disabled={busy} onClick={() => toggleJoinCode(true)}>
                      New code
                    </Button>
                    <Button size="small" disabled={busy} onClick={() => toggleJoinCode(false)}>
                      Turn off
                    </Button>
                  </Space>
                </>
              ) : (
                <>
                  <Typography.Text type="secondary">
                    Join requests are off. Turn them on to get a code people can use to ask to join.
                  </Typography.Text>
                  <Button disabled={busy} onClick={() => toggleJoinCode(true)} style={{ alignSelf: "flex-start" }}>
                    Turn on join requests
                  </Button>
                </>
              )}
              {requests.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>
                    {r.name} <Typography.Text type="secondary">{r.email}</Typography.Text>
                  </span>
                  <Space>
                    <Button size="small" type="primary" disabled={busy} onClick={() => run(() => decideJoinRequestAction(r.id, "approve"))}>
                      Approve
                    </Button>
                    <Button size="small" disabled={busy} onClick={() => run(() => decideJoinRequestAction(r.id, "decline"))}>
                      Decline
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        </>
      )}
    </Space>
  );
}
