"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal } from "antd";
import { SLOT_LABELS } from "@/lib/mealPlan";
import { formatDayHeading } from "@/lib/dates";
import { mealKey } from "@/lib/mealKey";
import { addOneOffEntryAction, addPlanEntryAction, createMealAndAddAction } from "./actions";
import type { MealSlot } from "@prisma/client";

export type Cell = { date: string; slot: MealSlot };
export type LibraryOption = { id: string; name: string };

const MAX_MATCHES = 8;

const optionStyle = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  border: 0,
  background: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
} as const;

/**
 * Add something to a cell: one box that searches the library. Pick a meal, create a new one from what was typed
 * ("Create 'x' and add"), or add the text as a one-off that isn't saved. A typed name that matches a library
 * meal (ignoring case) offers that meal instead of a duplicate.
 */
export default function AddEntryDialog({ cell, meals, onClose }: { cell: Cell | null; meals: LibraryOption[]; onClose: () => void }) {
  const title = cell ? `${SLOT_LABELS[cell.slot]}, ${formatDayHeading(cell.date).weekday} ${formatDayHeading(cell.date).monthDay}` : "";
  return (
    <Modal title={`Add to ${title}`} open={cell !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {/* Keyed by cell, so what was typed for one cell isn't carried to the next. */}
      {cell && <AddBody key={`${cell.date}-${cell.slot}`} cell={cell} meals={meals} onClose={onClose} />}
    </Modal>
  );
}

function AddBody({ cell, meals, onClose }: { cell: Cell; meals: LibraryOption[]; onClose: () => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const typed = text.trim();
  const key = mealKey(typed);
  const matches = meals.filter((m) => mealKey(m.name).includes(key));
  const exact = meals.find((m) => mealKey(m.name) === key);
  const shown = matches.slice(0, MAX_MATCHES);

  async function run(call: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    try {
      const result = await call();
      if (!result.ok) return message.error(result.error);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const pick = (m: LibraryOption) => run(() => addPlanEntryAction(cell.date, cell.slot, m.id));
  const create = () => run(() => createMealAndAddAction(cell.date, cell.slot, typed));
  const oneOff = () => run(() => addOneOffEntryAction(cell.date, cell.slot, typed));

  function onEnter() {
    if (!typed || busy) return;
    if (exact) pick(exact);
    else create();
  }

  return (
    <>
      <Input
        autoFocus
        allowClear
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPressEnter={onEnter}
        placeholder="Search your meals, or type a new one"
        aria-label="Meal"
        disabled={busy}
      />
      <div className="option-list" style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
        {shown.map((m) => (
          <button key={m.id} type="button" disabled={busy} onClick={() => pick(m)} style={optionStyle}>
            {m.name}
          </button>
        ))}
        {typed && !exact && (
          <button type="button" disabled={busy} onClick={create} style={{ ...optionStyle, fontWeight: 500 }}>
            Create &ldquo;{typed}&rdquo; and add
          </button>
        )}
        {typed && (
          <button type="button" disabled={busy} onClick={oneOff} style={{ ...optionStyle, color: "var(--muted)" }}>
            Add as one-off (not saved to library)
          </button>
        )}
        {!typed && meals.length === 0 && (
          <div style={{ padding: "12px", color: "var(--muted)" }}>Your library is empty. Type a meal name to add it.</div>
        )}
      </div>
      {!typed && meals.length > MAX_MATCHES && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>Showing {MAX_MATCHES} of {meals.length}. Type to narrow it down.</div>
      )}
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </>
  );
}
