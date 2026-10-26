"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal, Popconfirm, Select, Space, Switch, Typography } from "antd";
import { CopyOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  newPublicLinkAction,
  setPublicAction,
  setShareEditAction,
  setSharedWithHouseholdAction,
  shareListAction,
  unshareListAction,
} from "../actions";

export type ShareRow = { userId: string; name: string; householdName: string; canEdit: boolean };
export type ShareCandidate = { id: string; name: string; householdName: string };

const PERMISSIONS = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
];

/**
 * Who can see a list (its owner's): everyone in the household, particular people (each can view or edit), and a public
 * link anyone can open without signing in. All off is a personal list.
 */
export default function ListSharingModal({
  open,
  onClose,
  listId,
  householdName,
  sharedWithHousehold,
  shares,
  candidates,
  publicUrl,
}: {
  open: boolean;
  onClose: () => void;
  listId: string;
  householdName: string;
  sharedWithHousehold: boolean;
  shares: ShareRow[];
  candidates: ShareCandidate[];
  publicUrl: string | null;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [adding, setAdding] = useState<string[]>([]);
  const [addAs, setAddAs] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const available = candidates.filter((c) => !shares.some((s) => s.userId === c.id));

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) return message.error(result.error);
      done?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl!);
      message.success("Link copied");
    } catch {
      message.error("Couldn't copy: select the link and copy it");
    }
  }

  return (
    <Modal title="Share this list" open={open} onCancel={onClose} footer={<Button onClick={onClose}>Done</Button>} destroyOnHidden>
      <div className="list-sharing">
        <section aria-label="Household">
          <label className="list-sharing-row">
            <span>
              <strong>Everyone in {householdName}</strong>
              <span className="list-sharing-hint">Can see and change it</span>
            </span>
            <Switch checked={sharedWithHousehold} disabled={busy} aria-label="Share with the household" onChange={(on) => run(() => setSharedWithHouseholdAction(listId, on))} />
          </label>
        </section>

        <section aria-label="People">
          <strong>People</strong>
          {shares.length === 0 ? (
            <p className="list-sharing-hint">Not shared with anyone else yet.</p>
          ) : (
            <ul className="list-sharing-people">
              {shares.map((s) => (
                <li key={s.userId}>
                  <span>
                    {s.name}
                    <span className="list-sharing-hint"> · {s.householdName}</span>
                  </span>
                  <Select
                    size="small"
                    value={s.canEdit ? "edit" : "view"}
                    options={PERMISSIONS}
                    aria-label={`What ${s.name} can do`}
                    disabled={busy}
                    onChange={(v) => run(() => setShareEditAction(listId, s.userId, v === "edit"))}
                  />
                  <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Stop sharing with ${s.name}`} disabled={busy} onClick={() => run(() => unshareListAction(listId, s.userId))} />
                </li>
              ))}
            </ul>
          )}
          {available.length > 0 ? (
            <Space.Compact style={{ width: "100%", marginTop: 8 }}>
              <Select
                mode="multiple"
                placeholder="Add people"
                aria-label="Add people"
                value={adding}
                onChange={setAdding}
                optionFilterProp="label"
                style={{ flex: 1, minWidth: 0 }}
                options={available.map((c) => ({ value: c.id, label: `${c.name} (${c.householdName})` }))}
              />
              <Select value={addAs} onChange={setAddAs} options={PERMISSIONS} aria-label="New people can" style={{ width: 110 }} />
              <Button type="primary" disabled={adding.length === 0 || busy} onClick={() => run(() => shareListAction(listId, adding, addAs === "edit"), () => setAdding([]))}>
                Add
              </Button>
            </Space.Compact>
          ) : (
            <p className="list-sharing-hint">
              You can share with people in your household and in households you&apos;re synced with. Anyone else can use the public link.
            </p>
          )}
        </section>

        <section aria-label="Public link">
          <label className="list-sharing-row">
            <span>
              <strong>Public link</strong>
              <span className="list-sharing-hint">Anyone with the link can see the items still to get, without signing in</span>
            </span>
            <Switch checked={publicUrl !== null} disabled={busy} aria-label="Public link" onChange={(on) => run(() => setPublicAction(listId, on))} />
          </label>
          {publicUrl && (
            <>
              <Space.Compact style={{ width: "100%", marginTop: 8 }}>
                <Input readOnly value={publicUrl} aria-label="The public link" onFocus={(e) => e.target.select()} />
                <Button icon={<CopyOutlined />} onClick={copy}>
                  Copy
                </Button>
              </Space.Compact>
              <Popconfirm title="Make a new link?" description="The old link stops working." okText="New link" onConfirm={() => run(() => newPublicLinkAction(listId))}>
                <Typography.Link className="list-sharing-new-link">Make a new link</Typography.Link>
              </Popconfirm>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
