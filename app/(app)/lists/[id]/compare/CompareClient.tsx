"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Empty, App } from "antd";
import { pickPair, ComparisonOutcome } from "@/lib/elo";
import type { ActionResult } from "@/lib/actionResult";

type Item = {
  id: string;
  text: string;
  /** A second line under the text (a list item's quantity, a to-do's assignee). */
  detail: string | null;
  rating: number;
  comparisonCount: number;
};

/**
 * "Which matters more?": two items at a time; each answer is saved by `compare` (which re-sorts the list) and the next
 * pair is the most informative one left. Shared by Lists and the to-do list.
 */
export default function CompareClient({
  items: initialItems,
  compare,
  backHref,
  backLabel = "Back to the list",
}: {
  items: Item[];
  compare: (itemAId: string, itemBId: string, outcome: ComparisonOutcome) => Promise<ActionResult<{ a: number; b: number }>>;
  backHref: string;
  backLabel?: string;
}) {
  const { message } = App.useApp();
  const [items, setItems] = useState(initialItems);
  const [pair, setPair] = useState(() => pickPair(initialItems));
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  if (items.length < 2 || !pair) {
    return (
      <Empty description="Prioritizing needs at least two unchecked items.">
        <Link href={backHref}>
          <Button>{backLabel}</Button>
        </Link>
      </Empty>
    );
  }

  const [a, b] = pair;

  async function choose(outcome: ComparisonOutcome) {
    setBusy(true);
    try {
      const next = await compare(a.id, b.id, outcome);
      if (!next.ok) return message.error(next.error);
      const updated = items.map((i) =>
        i.id === a.id
          ? { ...i, rating: next.a, comparisonCount: i.comparisonCount + 1 }
          : i.id === b.id
            ? { ...i, rating: next.b, comparisonCount: i.comparisonCount + 1 }
            : i
      );
      setItems(updated);
      setPair(pickPair(updated, [a.id, b.id]));
      setDone((n) => n + 1);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not save that comparison");
    } finally {
      setBusy(false);
    }
  }

  const card = (item: Item, outcome: ComparisonOutcome) => (
    <button
      type="button"
      onClick={() => choose(outcome)}
      disabled={busy}
      style={{
        flex: "1 1 240px",
        minHeight: 120,
        padding: 16,
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        background: "var(--surface)",
        cursor: busy ? "wait" : "pointer",
        fontSize: 18,
        fontWeight: 500,
      }}
    >
      {item.text}
      {item.detail && <div style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)", marginTop: 4 }}>{item.detail}</div>}
    </button>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Which matters more?</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {card(a, "A")}
        {card(b, "B")}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={() => choose("EQUAL")} disabled={busy}>
          About equal
        </Button>
        <Button onClick={() => setPair(pickPair(items, [a.id, b.id]))} disabled={busy}>
          Skip this pair
        </Button>
        <span style={{ flex: 1 }} />
        <Link href={backHref}>
          <Button type="primary">Done</Button>
        </Link>
      </div>
      <Alert
        style={{ marginTop: 16 }}
        type="info"
        title={
          done === 0
            ? "You can stop at any time. The list is re-sorted after every answer."
            : `${done} comparison${done === 1 ? "" : "s"} made. The list is already re-sorted; keep going or press Done.`
        }
      />
    </div>
  );
}
