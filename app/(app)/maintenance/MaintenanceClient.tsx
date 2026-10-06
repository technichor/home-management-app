"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Empty, Input, Select, Typography } from "antd";
import type { MaintenanceCategory } from "@prisma/client";
import { ageLabel, ageYears, CATEGORY_LABELS, MAINTENANCE_CATEGORIES, serviceStatus } from "@/lib/maintenance";

export type InventoryRow = {
  id: string;
  name: string;
  category: MaintenanceCategory;
  location: string | null;
  brand: string | null;
  modelNumber: string | null;
  installedYear: number | null;
  serviceEveryMonths: number | null;
  lastServicedOn: string | null;
};

type Sort = "name" | "oldest";

const byName = (a: InventoryRow, b: InventoryRow) => a.name.localeCompare(b.name);

// Oldest first; items with no known year go last.
const SORTS: Record<Sort, (a: InventoryRow, b: InventoryRow) => number> = {
  name: byName,
  oldest: (a, b) => (a.installedYear ?? 9999) - (b.installedYear ?? 9999) || byName(a, b),
};

export default function MaintenanceClient({ items, today }: { items: InventoryRow[]; today: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MaintenanceCategory | "">("");
  const [sort, setSort] = useState<Sort>("name");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (category === "" || i.category === category) && [i.name, i.brand, i.modelNumber, i.location].some((v) => v?.toLowerCase().includes(q)))
      .sort(SORTS[sort]);
  }, [items, query, category, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Maintenance ({items.length})
        </Typography.Title>
        <Link href="/maintenance/new">
          <Button type="primary">Add item</Button>
        </Link>
      </div>

      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search
            allowClear
            placeholder="Search name, brand, model, location"
            aria-label="Search maintenance items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="fill-on-mobile"
            style={{ width: 300 }}
          />
          <Select<MaintenanceCategory | "">
            aria-label="Category"
            value={category}
            onChange={setCategory}
            className="fill-on-mobile"
            style={{ width: 200 }}
            options={[{ value: "", label: "All categories" }, ...MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
          />
          <Select<Sort>
            aria-label="Sort by"
            value={sort}
            onChange={setSort}
            className="fill-on-mobile"
            style={{ width: 160 }}
            options={[{ value: "name", label: "Sort by name" }, { value: "oldest", label: "Sort by oldest" }]}
          />
        </div>
      )}

      {items.length === 0 ? (
        <Empty description="Nothing here yet. Add the things your home needs looked after: the furnace, the water heater, the refrigerator, the air filters." style={{ padding: "48px 0" }} />
      ) : shown.length === 0 ? (
        <Typography.Text type="secondary">Nothing matches.</Typography.Text>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {shown.map((i, n) => {
            const status = serviceStatus(i, today);
            const details = [
              CATEGORY_LABELS[i.category],
              [i.brand, i.modelNumber].filter(Boolean).join(" ") || null,
              i.location,
              ageLabel(ageYears(i.installedYear, today)),
            ].filter(Boolean);
            return (
              <Link
                key={i.id}
                href={`/maintenance/${i.id}`}
                style={{ display: "block", padding: "10px 16px", borderTop: n > 0 ? "1px solid var(--border)" : undefined, color: "inherit" }}
              >
                <div style={{ fontWeight: 500 }}>{i.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{details.join(" · ")}</div>
                {status && (
                  <div style={{ fontSize: 13, color: status.overdue ? "var(--danger)" : "var(--muted)" }} data-overdue={status.overdue || undefined}>
                    {status.text}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
