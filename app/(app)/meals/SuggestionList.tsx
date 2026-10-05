"use client";

import { Button } from "antd";
import { formatCalendarDate } from "@/lib/dates";
import type { SuggestionMeal } from "@/lib/suggestions";

/** What a suggestion tells you: when the meal was last made and how often. */
export function madeSummary(m: SuggestionMeal): string {
  const times = m.timesMade === 1 ? "1 time" : `${m.timesMade} times`;
  return m.lastMade ? `Last made ${formatCalendarDate(m.lastMade)} · ${times}` : "Never made";
}

/** A titled list of suggested meals, each added with one tap. Renders nothing when there are none. */
export default function SuggestionList({
  title,
  meals,
  onAdd,
  busy,
}: {
  title: string;
  meals: SuggestionMeal[];
  onAdd: (meal: SuggestionMeal) => void;
  busy: boolean;
}) {
  if (meals.length === 0) return null;
  return (
    <div className="suggest-list">
      <div className="suggest-title">{title}</div>
      {meals.map((m) => (
        <div key={m.id} className="suggest-row">
          <div style={{ minWidth: 0 }}>
            <div className="suggest-name">{m.name}</div>
            <div className="suggest-meta">{madeSummary(m)}</div>
          </div>
          <Button size="small" disabled={busy} onClick={() => onAdd(m)} aria-label={`Add ${m.name}`}>
            Add
          </Button>
        </div>
      ))}
    </div>
  );
}
