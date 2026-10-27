"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Descriptions, Popconfirm, Space, Typography } from "antd";
import LinkButton from "@/components/LinkButton";
import { categoryLabel, typeByKey } from "@/lib/documentCatalog";
import type { DocumentView } from "@/lib/documents";
import { deleteDocumentAction } from "../actions";

export default function DocumentDetailClient({ doc, ownerRemoved }: { doc: DocumentView; ownerRemoved: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const result = await deleteDocumentAction(doc.id);
    if (!result.ok) return setError(result.error);
    router.push("/documents");
  }

  const type = typeByKey(doc.typeKey);
  const rows: [string, React.ReactNode][] = [
    ["Whose", doc.ownerName ? `${doc.ownerName}${ownerRemoved ? " (removed)" : ""}` : "Household"],
    ["Item", doc.maintenanceItemId && doc.itemName ? <Link key="i" href={`/maintenance/${doc.maintenanceItemId}`}>{doc.itemName}</Link> : null],
    ["Account", doc.accountRecordId && doc.accountName ? <Link key="a" href={`/accounts/${doc.accountRecordId}`}>{doc.accountName}</Link> : null],
    ["Where the original is", doc.originalLocation],
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <div>
        <Link href="/documents" style={{ fontSize: 13 }}>
          &larr; Documents
        </Link>
        <Typography.Title level={3} style={{ margin: "4px 0 0", wordBreak: "break-word" }}>
          {doc.title}
        </Typography.Title>
        <Typography.Text type="secondary">
          {categoryLabel(doc.category)}
          {type && ` · ${type.label}`}
        </Typography.Text>
      </div>

      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      {/* Only ever links to http(s) addresses (checked when they were saved), each opening in a new tab. */}
      <div className="document-links">
        {doc.links.map((l, i) => (
          <LinkButton key={i} url={l.url} label={l.label} name={l.label ? `${doc.title}: ${l.label}` : doc.title} />
        ))}
      </div>

      <Space>
        <Link href={`/documents/${doc.id}/edit`}>
          <Button>Edit</Button>
        </Link>
        <Popconfirm title={`Delete "${doc.title}"?`} description="The file itself isn't touched." okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
          <Button danger>Delete</Button>
        </Popconfirm>
      </Space>

      <Descriptions column={1} size="small" bordered items={rows.filter(([, v]) => v !== null && v !== "").map(([label, children]) => ({ key: label, label, children }))} />

      {doc.notes && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{doc.notes}</div>}
    </Space>
  );
}
