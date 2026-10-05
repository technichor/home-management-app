"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Empty, Input, Select, Typography } from "antd";
import { formatCalendarDate } from "@/lib/dates";

export type LibraryMeal = { id: string; name: string; lastMade: string | null; timesMade: number };

type Sort = "name" | "lastMade" | "timesMade";

const byName = (a: LibraryMeal, b: LibraryMeal) => a.name.localeCompare(b.name);

const SORTS: Record<Sort, (a: LibraryMeal, b: LibraryMeal) => number> = {
  name: byName,
  // Most recently made first; meals never made go last.
  lastMade: (a, b) => (b.lastMade ?? "").localeCompare(a.lastMade ?? "") || byName(a, b),
  timesMade: (a, b) => b.timesMade - a.timesMade || byName(a, b),
};

export default function LibraryClient({ meals }: { meals: LibraryMeal[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meals.filter((m) => m.name.toLowerCase().includes(q)).sort(SORTS[sort]);
  }, [meals, query, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Meal library ({meals.length})
        </Typography.Title>
        <Link href="/meals/library/new">
          <Button type="primary">New meal</Button>
        </Link>
      </div>

      {meals.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search
            allowClear
            placeholder="Search meals"
            aria-label="Search meals"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="fill-on-mobile"
            style={{ width: 260 }}
          />
          <Select<Sort>
            aria-label="Sort by"
            value={sort}
            onChange={setSort}
            className="fill-on-mobile"
            style={{ width: 180 }}
            options={[
              { value: "name", label: "Sort by name" },
              { value: "lastMade", label: "Sort by last made" },
              { value: "timesMade", label: "Sort by most made" },
            ]}
          />
        </div>
      )}

      {meals.length === 0 ? (
        <Empty description="No meals yet. Add the ones your family eats, then plan them on the calendar." style={{ padding: "48px 0" }} />
      ) : shown.length === 0 ? (
        <Typography.Text type="secondary">No meal matches &ldquo;{query.trim()}&rdquo;.</Typography.Text>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {shown.map((m, i) => (
            <Link
              key={m.id}
              href={`/meals/library/${m.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                padding: "10px 16px",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                color: "inherit",
              }}
            >
              <span style={{ fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
              <span style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}>
                {m.lastMade ? `Last made ${formatCalendarDate(m.lastMade)}` : "Never made"}
                {" · "}
                {m.timesMade === 1 ? "1 time" : `${m.timesMade} times`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
