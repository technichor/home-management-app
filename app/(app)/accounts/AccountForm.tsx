"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import type { AccountKind, AccountStatus } from "@prisma/client";
import type { AssigneeOption } from "@/lib/calendarItem";
import { ACCOUNT_KINDS, ACCOUNT_STATUSES, KIND_LABELS, MAX_FIELD, MAX_LAST_FOUR, MAX_NOTES, MAX_URL, STATUS_LABELS } from "@/lib/accounts";
import { createAccountRecordAction, updateAccountRecordAction } from "./actions";

export type AccountFormRecord = {
  id: string;
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  institution: string | null;
  lastFour: string | null;
  ownerContactId: string | null;
  /** The owner's name, kept even after they are removed from the household. */
  ownerName: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
};

const EVERYONE = "";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
        {label}
      </Typography.Text>
      {children}
    </div>
  );
}

/** Add an account (no `record`) or edit one. */
export default function AccountForm({ record, owners }: { record?: AccountFormRecord; owners: AssigneeOption[] }) {
  const router = useRouter();
  const [name, setName] = useState(record?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(record?.kind ?? "BANK");
  const [status, setStatus] = useState<AccountStatus>(record?.status ?? "ACTIVE");
  const [institution, setInstitution] = useState(record?.institution ?? "");
  const [lastFour, setLastFour] = useState(record?.lastFour ?? "");
  const [owner, setOwner] = useState(record?.ownerContactId ?? EVERYONE);
  const [website, setWebsite] = useState(record?.website ?? "");
  const [phone, setPhone] = useState(record?.phone ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // An owner who has since been removed can stay on a record, but isn't offered for anything new.
  const ownerOptions = [
    { value: EVERYONE, label: "Whole household" },
    ...owners.map((o) => ({ value: o.id, label: o.name })),
    ...(record?.ownerContactId && !owners.some((o) => o.id === record.ownerContactId)
      ? [{ value: record.ownerContactId, label: `${record.ownerName ?? "Former member"} (removed)` }]
      : []),
  ];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields = { name, kind, status, institution, lastFour, ownerContactId: owner === EVERYONE ? null : owner, website, phone, notes };
      if (record) {
        const result = await updateAccountRecordAction(record.id, fields);
        if (!result.ok) return setError(result.error);
        router.push(`/accounts/${record.id}`);
      } else {
        const result = await createAccountRecordAction(fields);
        if (!result.ok) return setError(result.error);
        router.push(`/accounts/${result.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {record ? "Edit account" : "Add account"}
      </Typography.Title>
      <Alert type="info" showIcon title="Never enter a password, a balance or a full account number here. This is only a list of what exists." />
      {error && <Alert type="error" showIcon title={error} />}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Corey's HSA" aria-label="Name" autoFocus />
      </Field>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Kind">
          <Select<AccountKind> value={kind} onChange={setKind} aria-label="Kind" style={{ width: 220 }} options={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
        </Field>
        <Field label="Status">
          <Select<AccountStatus> value={status} onChange={setStatus} aria-label="Status" style={{ width: 240 }} options={ACCOUNT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        </Field>
      </Space>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Institution">
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Fidelity" aria-label="Institution" style={{ width: 260 }} />
        </Field>
        <Field label="Last 4 of the account number">
          <Input value={lastFour} onChange={(e) => setLastFour(e.target.value)} maxLength={MAX_LAST_FOUR} aria-label="Last 4" style={{ width: 120 }} />
        </Field>
      </Space>
      <Field label="Whose account">
        <Select value={owner} onChange={setOwner} options={ownerOptions} aria-label="Whose account" style={{ width: "100%" }} />
      </Field>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Website">
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={MAX_URL} placeholder="https://" aria-label="Website" style={{ width: 320 }} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={MAX_FIELD} aria-label="Phone" style={{ width: 200 }} />
        </Field>
      </Space>
      <Field label="Notes">
        <Input.TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 20 }}
          maxLength={MAX_NOTES}
          showCount
          placeholder="e.g. Old employer plan. Roll into the IRA."
          aria-label="Notes"
        />
      </Field>
      <Space>
        <Button type="primary" loading={busy} disabled={!name.trim()} onClick={save}>
          {record ? "Save" : "Add account"}
        </Button>
        <Link href={record ? `/accounts/${record.id}` : "/accounts"}>
          <Button>Cancel</Button>
        </Link>
      </Space>
    </Space>
  );
}
