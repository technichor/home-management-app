"use client";

import { Select } from "antd";
import type { Candidate } from "@/lib/channels";

/** Choose people, grouped by household ("Your household" first, then each connected household). */
export default function MemberPicker({
  candidates,
  value,
  onChange,
  placeholder = "Choose people",
}: {
  candidates: Candidate[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const groups = new Map<string, { label: string; mine: boolean; options: { value: string; label: string }[] }>();
  for (const c of candidates) {
    const group = groups.get(c.householdId) ?? { label: c.mine ? "Your household" : c.householdName, mine: c.mine, options: [] };
    group.options.push({ value: c.id, label: c.name });
    groups.set(c.householdId, group);
  }
  const options = [...groups.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.label.localeCompare(b.label));

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch={{ optionFilterProp: "label" }}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      options={options}
      style={{ width: "100%" }}
      aria-label="People"
    />
  );
}
