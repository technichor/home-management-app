"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Descriptions, Popconfirm, Space, Typography } from "antd";
import { formatCalendarDate, localDateString } from "@/lib/dates";
import { ageLabel, ageYears, CATEGORY_LABELS, serviceStatus } from "@/lib/maintenance";
import { deleteMaintenanceItemAction, markServicedAction } from "../actions";
import type { MaintenanceFormItem } from "../MaintenanceForm";

export default function MaintenanceDetailClient({ item, today }: { item: MaintenanceFormItem; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const result = await deleteMaintenanceItemAction(item.id);
    if (!result.ok) return setError(result.error);
    router.push("/maintenance");
  }

  async function serviced() {
    setError(null);
    // The device's date at the moment of the click: the page's `today` can still be the server's (UTC) date for an
    // instant after loading, and in the evening that is already tomorrow.
    const result = await markServicedAction(item.id, localDateString());
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const status = serviceStatus(item, today);
  const age = ageLabel(ageYears(item.installedYear, today));
  const rows: [string, React.ReactNode][] = [
    ["Category", CATEGORY_LABELS[item.category]],
    ["Location", item.location],
    ["Brand", item.brand],
    ["Model number", item.modelNumber],
    ["Serial number", item.serialNumber],
    ["Installed", age === null ? null : `${item.installedYear} (${age.toLowerCase()})`],
    ["Warranty until", item.warrantyUntil ? formatCalendarDate(item.warrantyUntil) : null],
    ["Service every", item.serviceEveryMonths === null ? null : item.serviceEveryMonths === 1 ? "1 month" : `${item.serviceEveryMonths} months`],
    ["Last serviced", item.lastServicedOn ? formatCalendarDate(item.lastServicedOn) : null],
    // Rendered only as a link to an http(s) address (checked when it was saved), opening in a new tab.
    ["Manual", item.manualUrl ? <a key="m" href={item.manualUrl} target="_blank" rel="noopener noreferrer">{item.manualUrl}</a> : null],
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <div>
        <Link href="/maintenance" style={{ fontSize: 13 }}>
          &larr; Maintenance
        </Link>
        <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
          {item.name}
        </Typography.Title>
        {status && (
          <Typography.Text type={status.overdue ? "danger" : "secondary"}>{status.text}</Typography.Text>
        )}
      </div>

      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      <Space wrap>
        {item.serviceEveryMonths !== null && <Button onClick={serviced}>Serviced today</Button>}
        <Link href={`/maintenance/${item.id}/edit`}>
          <Button>Edit</Button>
        </Link>
        <Popconfirm title={`Delete "${item.name}"?`} description="This can't be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
          <Button danger>Delete</Button>
        </Popconfirm>
      </Space>

      <Descriptions column={1} size="small" bordered items={rows.filter(([, v]) => v !== null && v !== "").map(([label, children]) => ({ key: label, label, children }))} />

      {item.notes && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{item.notes}</div>}
    </Space>
  );
}
