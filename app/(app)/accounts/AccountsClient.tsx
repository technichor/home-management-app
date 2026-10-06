"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Empty, Input, Select, Tag, Typography } from "antd";
import type { AccountKind, AccountStatus } from "@prisma/client";
import { accountSummary, ACCOUNT_KINDS, ACCOUNT_STATUSES, KIND_LABELS, STATUS_LABELS } from "@/lib/accounts";

export type AccountRow = {
  id: string;
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  institution: string | null;
  lastFour: string | null;
  ownerName: string | null;
};

/** "open" is everything not closed: the default view. */
type StatusFilter = AccountStatus | "open" | "all";

const byName = (a: AccountRow, b: AccountRow) => a.name.localeCompare(b.name);

export default function AccountsClient({ accounts }: { accounts: AccountRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AccountKind | "">("");
  const [status, setStatus] = useState<StatusFilter>("open");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => (status === "all" ? true : status === "open" ? a.status !== "CLOSED" : a.status === status))
      .filter((a) => kind === "" || a.kind === kind)
      .filter((a) => [a.name, a.institution, a.ownerName].some((v) => v?.toLowerCase().includes(q)))
      .sort(byName);
  }, [accounts, query, kind, status]);

  const toReview = accounts.filter((a) => a.status === "REVIEW").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Accounts ({accounts.filter((a) => a.status !== "CLOSED").length})
          </Typography.Title>
          {toReview > 0 && <Typography.Text type="warning">{toReview === 1 ? "1 account to review" : `${toReview} accounts to review`}</Typography.Text>}
        </div>
        <Link href="/accounts/new">
          <Button type="primary">Add account</Button>
        </Link>
      </div>

      <Typography.Text type="secondary">
        A list of what exists, so nothing is forgotten. No passwords, balances or full account numbers are kept here.
      </Typography.Text>

      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search
            allowClear
            placeholder="Search name, institution, owner"
            aria-label="Search accounts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="fill-on-mobile"
            style={{ width: 280 }}
          />
          <Select<AccountKind | "">
            aria-label="Kind"
            value={kind}
            onChange={setKind}
            className="fill-on-mobile"
            style={{ width: 180 }}
            options={[{ value: "", label: "All kinds" }, ...ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))]}
          />
          <Select<StatusFilter>
            aria-label="Status"
            value={status}
            onChange={setStatus}
            className="fill-on-mobile"
            style={{ width: 230 }}
            options={[
              { value: "open", label: "Open accounts" },
              ...ACCOUNT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
              { value: "all", label: "All, including closed" },
            ]}
          />
        </div>
      )}

      {accounts.length === 0 ? (
        <Empty description="No accounts yet. Add the banks, retirement and health accounts, insurance, utilities and subscriptions your household has." style={{ padding: "48px 0" }} />
      ) : shown.length === 0 ? (
        <Typography.Text type="secondary">No account matches.</Typography.Text>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {shown.map((a, n) => (
            <Link
              key={a.id}
              href={`/accounts/${a.id}`}
              style={{ display: "block", padding: "10px 16px", borderTop: n > 0 ? "1px solid var(--border)" : undefined, color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                {a.status !== "ACTIVE" && <Tag color={a.status === "REVIEW" ? "orange" : undefined}>{STATUS_LABELS[a.status]}</Tag>}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {[KIND_LABELS[a.kind], accountSummary(a) || null, a.ownerName ?? "Whole household"].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
