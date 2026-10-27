"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AutoComplete, Button, Input, Select, Space, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { DocumentCategory } from "@prisma/client";
import FormField from "@/components/FormField";
import { DOCUMENT_CATEGORIES, typeByKey, typesInCategory } from "@/lib/documentCatalog";
import { defaultTitle, looksSensitive, MAX_LINK_LABEL, MAX_LINKS, MAX_NOTES, MAX_ORIGINAL_LOCATION, MAX_TITLE, MAX_URL, type DocumentView } from "@/lib/documents";
import type { DocumentFormOptions } from "./formOptions";
import { createDocumentAction, updateDocumentAction } from "./actions";

const CUSTOM = "custom";
const HOUSEHOLD = "";
const ORIGINAL_PLACES = ["Fireproof safe", "Safe deposit box", "Filing cabinet", "Attorney's office"].map((value) => ({ value }));

export const SHARING_LINE =
  "Domata saves the link, not the file. Who can open it is set where the file lives; for anything sensitive, share with specific people, not 'anyone with the link'.";
export const SENSITIVE_WARNING = "This looks like an ID or account number. Keep those in the file, not in Domata.";

type LinkRow = { key: number; url: string; label: string };
let nextKey = 0;
const row = (url = "", label = ""): LinkRow => ({ key: nextKey++, url, label });
export type DocumentPrefill = { typeKey: string | null; ownerContactId: string | null; maintenanceItemId: string | null; accountRecordId: string | null };

/**
 * Add a document (no `record`, perhaps pre-filled) or edit one. Saving goes back to `returnTo` (a same-site path, checked
 * by the page), or else to the document's page.
 */
export default function DocumentForm({
  options,
  record,
  initial,
  firstCategory,
  returnTo,
}: {
  options: DocumentFormOptions;
  record?: DocumentView;
  initial?: DocumentPrefill;
  /** The category whose types the picker lists first (from a vehicle, Vehicles; from an Add chip, its category). */
  firstCategory?: DocumentCategory;
  returnTo?: string;
}) {
  const router = useRouter();
  const start = record ?? initial;
  // The type picker's value: a catalog key, CUSTOM, or nothing chosen yet (a new document with no type pre-filled).
  const [typeChoice, setTypeChoice] = useState<string | undefined>(record ? (record.typeKey ?? CUSTOM) : (initial?.typeKey ?? undefined));
  const [category, setCategory] = useState<DocumentCategory | undefined>(record && !record.typeKey ? record.category : undefined);
  const [owner, setOwner] = useState(start?.ownerContactId ?? HOUSEHOLD);
  const [item, setItem] = useState<string | undefined>(start?.maintenanceItemId ?? undefined);
  const [account, setAccount] = useState<string | undefined>(start?.accountRecordId ?? undefined);
  const [links, setLinks] = useState<LinkRow[]>(() => (record?.links.length ? record.links.map((l) => row(l.url, l.label ?? "")) : [row()]));
  const [originalLocation, setOriginalLocation] = useState(record?.originalLocation ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  // The title follows the type and whose it is until someone types their own (an existing document's is its own).
  const [ownTitle, setOwnTitle] = useState<string | null>(record?.title ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = typeByKey(typeChoice === CUSTOM ? null : typeChoice);
  const subjectName =
    type?.scope === "PERSON" ? options.members.find((m) => m.id === owner)?.name : type?.scope === "VEHICLE" ? options.items.find((i) => i.id === item)?.name : null;
  const title = ownTitle ?? (type ? defaultTitle(type, subjectName) : "");

  function chooseType(value: string) {
    setTypeChoice(value);
    const next = typeByKey(value === CUSTOM ? null : value);
    // A vehicle's type can only be about a vehicle.
    if (next?.scope === "VEHICLE" && item && !options.items.find((i) => i.id === item)?.isVehicle) setItem(undefined);
  }

  const categories = [...DOCUMENT_CATEGORIES].sort((a, b) => Number(b.key === firstCategory) - Number(a.key === firstCategory));
  const typeOptions = [
    ...categories.map((c) => ({ label: c.label, title: c.label, options: typesInCategory(c.key).map((t) => ({ value: t.key, label: t.label })) })),
    { label: "Custom", title: "Custom", options: [{ value: CUSTOM, label: "Custom (no type)" }] },
  ];

  // Someone who has since left the household can stay on a document, but isn't offered for anything new.
  const ownerOptions = [
    ...(type?.scope === "PERSON" ? [] : [{ value: HOUSEHOLD, label: "Household" }]),
    ...options.members.map((m) => ({ value: m.id, label: m.name })),
    ...(record?.ownerContactId && !options.members.some((m) => m.id === record.ownerContactId)
      ? [{ value: record.ownerContactId, label: `${record.ownerName ?? "Former member"} (removed)` }]
      : []),
  ];
  const itemOptions = options.items.filter((i) => type?.scope !== "VEHICLE" || i.isVehicle).map((i) => ({ value: i.id, label: i.name }));

  const setLink = (key: number, change: Partial<LinkRow>) => setLinks((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const sensitive = looksSensitive([title, originalLocation, notes, ...links.map((l) => l.label)]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields = {
        title,
        typeKey: type?.key ?? null,
        category: type ? null : (category ?? null),
        ownerContactId: owner === HOUSEHOLD ? null : owner,
        maintenanceItemId: item ?? null,
        accountRecordId: account ?? null,
        links: links.map((l) => ({ url: l.url, label: l.label })),
        originalLocation,
        notes,
      };
      const result = record ? await updateDocumentAction(record.id, fields) : await createDocumentAction(fields);
      if (!result.ok) return setError(result.error);
      router.push(returnTo ?? `/documents/${"id" in result ? result.id : record!.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {record ? "Edit document" : "Add document"}
      </Typography.Title>
      <Alert type="info" showIcon title={SHARING_LINE} />
      {error && <Alert type="error" showIcon title={error} />}

      <FormField label="Type">
        <Select
          value={typeChoice}
          onChange={chooseType}
          options={typeOptions}
          showSearch={{ optionFilterProp: "label" }}
          placeholder="Choose a type, e.g. Passport"
          aria-label="Type"
          style={{ width: "100%" }}
          autoFocus={!record && !typeChoice}
        />
      </FormField>
      {typeChoice === CUSTOM && (
        <FormField label="Category">
          <Select<DocumentCategory>
            value={category}
            onChange={setCategory}
            options={DOCUMENT_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            placeholder="Choose a category"
            aria-label="Category"
            style={{ width: "100%" }}
          />
        </FormField>
      )}
      <FormField label="Title">
        <Input value={title} onChange={(e) => setOwnTitle(e.target.value)} maxLength={MAX_TITLE} placeholder="e.g. 2025 W-2 – Corey" aria-label="Title" />
      </FormField>
      <FormField label="Whose">
        <Select
          value={type?.scope === "PERSON" && owner === HOUSEHOLD ? undefined : owner}
          onChange={setOwner}
          options={ownerOptions}
          placeholder="Choose whose it is"
          aria-label="Whose"
          style={{ width: "100%" }}
        />
      </FormField>
      <FormField label={type?.scope === "VEHICLE" ? "Vehicle" : "Item (from Maintenance)"}>
        <Select
          value={item}
          onChange={setItem}
          allowClear
          options={itemOptions}
          showSearch={{ optionFilterProp: "label" }}
          placeholder={type?.scope === "VEHICLE" ? "Choose the vehicle" : "None"}
          notFoundContent={type?.scope === "VEHICLE" ? "Add the vehicle in Maintenance first (category Vehicle)" : "No items in Maintenance yet"}
          aria-label="Item"
          style={{ width: "100%" }}
        />
      </FormField>
      <FormField label="Account">
        <Select
          value={account}
          onChange={setAccount}
          allowClear
          options={options.accounts.map((a) => ({ value: a.id, label: a.name }))}
          showSearch={{ optionFilterProp: "label" }}
          placeholder="None"
          notFoundContent="No accounts yet"
          aria-label="Account"
          style={{ width: "100%" }}
        />
      </FormField>

      <FormField label={links.length > 1 ? "Links" : "Link"}>
        <Space orientation="vertical" style={{ width: "100%" }}>
          {links.map((l, i) => (
            <div key={l.key} className="document-link-row">
              <Input
                value={l.url}
                onChange={(e) => setLink(l.key, { url: e.target.value })}
                maxLength={MAX_URL}
                placeholder="https://drive.google.com/..."
                aria-label={`Link ${i + 1}`}
                className="document-link-url"
              />
              <Input
                value={l.label}
                onChange={(e) => setLink(l.key, { label: e.target.value })}
                maxLength={MAX_LINK_LABEL}
                placeholder="Label (optional), e.g. Front"
                aria-label={`Label for link ${i + 1}`}
                className="document-link-label"
              />
              {links.length > 1 && (
                <Button type="text" icon={<DeleteOutlined />} aria-label={`Remove link ${i + 1}`} onClick={() => setLinks((ls) => ls.filter((x) => x.key !== l.key))} />
              )}
            </div>
          ))}
          {links.length < MAX_LINKS && (
            <Button type="link" icon={<PlusOutlined />} style={{ paddingInline: 0 }} onClick={() => setLinks((ls) => [...ls, row()])}>
              Add another link
            </Button>
          )}
        </Space>
      </FormField>

      <FormField label="Where the original is">
        <AutoComplete
          value={originalLocation}
          onChange={setOriginalLocation}
          options={ORIGINAL_PLACES}
          maxLength={MAX_ORIGINAL_LOCATION}
          placeholder="e.g. Fireproof safe"
          aria-label="Where the original is"
          style={{ width: "100%" }}
        />
      </FormField>
      <FormField label="Notes">
        <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} autoSize={{ minRows: 3, maxRows: 20 }} maxLength={MAX_NOTES} showCount aria-label="Notes" />
      </FormField>

      {sensitive && <Alert type="warning" showIcon title={SENSITIVE_WARNING} />}

      <Space>
        <Button type="primary" loading={busy} disabled={!title.trim() || typeChoice === undefined} onClick={save}>
          {record ? "Save" : "Add document"}
        </Button>
        <Link href={returnTo ?? (record ? `/documents/${record.id}` : "/documents")}>
          <Button>Cancel</Button>
        </Link>
      </Space>
    </Space>
  );
}
