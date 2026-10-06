"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import type { MaintenanceCategory } from "@prisma/client";
import { CATEGORY_LABELS, MAINTENANCE_CATEGORIES, MAX_FIELD, MAX_NOTES, MAX_URL } from "@/lib/maintenance";
import { createMaintenanceItemAction, updateMaintenanceItemAction } from "./actions";

export type MaintenanceFormItem = {
  id: string;
  name: string;
  category: MaintenanceCategory;
  location: string | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  installedYear: number | null;
  warrantyUntil: string | null;
  serviceEveryMonths: number | null;
  lastServicedOn: string | null;
  manualUrl: string | null;
  notes: string | null;
};

const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

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

/** Add an item (no `item`) or edit one. */
export default function MaintenanceForm({ item }: { item?: MaintenanceFormItem }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<MaintenanceCategory>(item?.category ?? "OTHER");
  const [location, setLocation] = useState(item?.location ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [modelNumber, setModelNumber] = useState(item?.modelNumber ?? "");
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? "");
  const [installedYear, setInstalledYear] = useState(item?.installedYear?.toString() ?? "");
  const [warrantyUntil, setWarrantyUntil] = useState(item?.warrantyUntil ?? "");
  const [serviceEveryMonths, setServiceEveryMonths] = useState(item?.serviceEveryMonths?.toString() ?? "");
  const [lastServicedOn, setLastServicedOn] = useState(item?.lastServicedOn ?? "");
  const [manualUrl, setManualUrl] = useState(item?.manualUrl ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields = {
        name, category, location, brand, modelNumber, serialNumber,
        installedYear: toNumber(installedYear),
        warrantyUntil,
        serviceEveryMonths: toNumber(serviceEveryMonths),
        lastServicedOn,
        manualUrl,
        notes,
      };
      if (item) {
        const result = await updateMaintenanceItemAction(item.id, fields);
        if (!result.ok) return setError(result.error);
        router.push(`/maintenance/${item.id}`);
      } else {
        const result = await createMaintenanceItemAction(fields);
        if (!result.ok) return setError(result.error);
        router.push(`/maintenance/${result.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {item ? "Edit item" : "Add item"}
      </Typography.Title>
      {error && <Alert type="error" showIcon title={error} />}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Upstairs furnace" aria-label="Name" autoFocus />
      </Field>
      <Field label="Category">
        <Select<MaintenanceCategory>
          value={category}
          onChange={setCategory}
          aria-label="Category"
          style={{ width: "100%" }}
          options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
        />
      </Field>
      <Field label="Location">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={MAX_FIELD} placeholder="e.g. Basement" aria-label="Location" />
      </Field>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Brand">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={MAX_FIELD} aria-label="Brand" style={{ width: 220 }} />
        </Field>
        <Field label="Model number">
          <Input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} maxLength={MAX_FIELD} aria-label="Model number" style={{ width: 220 }} />
        </Field>
        <Field label="Serial number">
          <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} maxLength={MAX_FIELD} aria-label="Serial number" style={{ width: 220 }} />
        </Field>
      </Space>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Year installed">
          <Input type="number" value={installedYear} onChange={(e) => setInstalledYear(e.target.value)} placeholder="e.g. 2004" aria-label="Year installed" style={{ width: 160 }} />
        </Field>
        <Field label="Warranty until">
          <Input type="date" value={warrantyUntil} onChange={(e) => setWarrantyUntil(e.target.value)} aria-label="Warranty until" style={{ width: 180 }} />
        </Field>
      </Space>
      <Space wrap style={{ width: "100%" }} align="start">
        <Field label="Service every (months)">
          <Input type="number" min={1} value={serviceEveryMonths} onChange={(e) => setServiceEveryMonths(e.target.value)} placeholder="e.g. 3" aria-label="Service every (months)" style={{ width: 200 }} />
        </Field>
        <Field label="Last serviced">
          <Input type="date" value={lastServicedOn} onChange={(e) => setLastServicedOn(e.target.value)} aria-label="Last serviced" style={{ width: 180 }} />
        </Field>
      </Space>
      <Field label="Manual or product page (link)">
        <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} maxLength={MAX_URL} placeholder="https://" aria-label="Manual link" />
      </Field>
      <Field label="Notes">
        <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} autoSize={{ minRows: 4, maxRows: 20 }} maxLength={MAX_NOTES} showCount aria-label="Notes" />
      </Field>
      <Space>
        <Button type="primary" loading={busy} disabled={!name.trim()} onClick={save}>
          {item ? "Save" : "Add item"}
        </Button>
        <Link href={item ? `/maintenance/${item.id}` : "/maintenance"}>
          <Button>Cancel</Button>
        </Link>
      </Space>
    </Space>
  );
}
