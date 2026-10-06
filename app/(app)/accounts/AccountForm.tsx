"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FormField from "@/components/FormField";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import type { AccountKind, AccountStatus } from "@prisma/client";
import type { MemberOption } from "@/lib/householdMembers";
import { ACCOUNT_KINDS, ACCOUNT_STATUSES, type AccountView, KIND_LABELS, MAX_FIELD, MAX_LAST_FOUR, MAX_NOTES, MAX_URL, STATUS_LABELS } from "@/lib/accounts";
import { createAccountRecordAction, updateAccountRecordAction } from "./actions";

export type AccountFormRecord = AccountView;

const EVERYONE = "";

/** Add an account (no `record`) or edit one. */
export default function AccountForm({ record, owners }: { record?: AccountFormRecord; owners: MemberOption[] }) {
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
      <FormField label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Corey's HSA" aria-label="Name" autoFocus />
      </FormField>
      <Space wrap style={{ width: "100%" }} align="start">
        <FormField label="Kind">
          <Select<AccountKind> value={kind} onChange={setKind} aria-label="Kind" style={{ width: 220 }} options={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
        </FormField>
        <FormField label="Status">
          <Select<AccountStatus> value={status} onChange={setStatus} aria-label="Status" style={{ width: 240 }} options={ACCOUNT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        </FormField>
      </Space>
      <Space wrap style={{ width: "100%" }} align="start">
        <FormField label="Institution">
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Fidelity" aria-label="Institution" style={{ width: 260 }} />
        </FormField>
        <FormField label="Last 4 of the account number">
          <Input value={lastFour} onChange={(e) => setLastFour(e.target.value)} maxLength={MAX_LAST_FOUR} aria-label="Last 4" style={{ width: 120 }} />
        </FormField>
      </Space>
      <FormField label="Whose account">
        <Select value={owner} onChange={setOwner} options={ownerOptions} aria-label="Whose account" style={{ width: "100%" }} />
      </FormField>
      <Space wrap style={{ width: "100%" }} align="start">
        <FormField label="Website">
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={MAX_URL} placeholder="https://" aria-label="Website" style={{ width: 320 }} />
        </FormField>
        <FormField label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={MAX_FIELD} aria-label="Phone" style={{ width: 200 }} />
        </FormField>
      </Space>
      <FormField label="Notes">
        <Input.TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 20 }}
          maxLength={MAX_NOTES}
          showCount
          placeholder="e.g. Old employer plan. Roll into the IRA."
          aria-label="Notes"
        />
      </FormField>
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
