"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal, Popconfirm, Select, Space, Typography } from "antd";
import { SLOTS, SLOT_LABELS } from "@/lib/mealPlan";
import { formatCalendarDate, formatDayHeading, isDateString } from "@/lib/dates";
import { moveEntryAction, removeEntryAction } from "./actions";
import type { MealSlot } from "@prisma/client";

export type DetailEntry = {
  id: string;
  date: string;
  slot: MealSlot;
  mealId: string | null;
  label: string;
  description: string | null;
};

/** One planned entry: the meal's details (or the one-off's text), and actions to move or remove it. */
export default function EntryDetailDialog({
  entry,
  stats,
  onClose,
}: {
  entry: DetailEntry | null;
  stats: { lastMade: string | null; timesMade: number } | null;
  onClose: () => void;
}) {
  return (
    <Modal title={entry?.label ?? ""} open={entry !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {/* Keyed by entry, so a date or slot typed for one entry is never carried to the next. */}
      {entry && <EntryBody key={entry.id} entry={entry} stats={stats} onClose={onClose} />}
    </Modal>
  );
}

function EntryBody({
  entry,
  stats,
  onClose,
}: {
  entry: DetailEntry;
  stats: { lastMade: string | null; timesMade: number } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [date, setDate] = useState(entry.date);
  const [slot, setSlot] = useState<MealSlot>(entry.slot);
  const [busy, setBusy] = useState(false);

  const changed = date !== entry.date || slot !== entry.slot;

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

  const { weekday, monthDay } = formatDayHeading(entry.date);

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        {SLOT_LABELS[entry.slot]}, {weekday} {monthDay}
        {entry.mealId && stats && (
          <>
            {" \u00b7 "}
            {stats.lastMade ? `Last made ${formatCalendarDate(stats.lastMade)}` : "Never made"}
            {" \u00b7 "}
            {stats.timesMade === 1 ? "1 time" : `${stats.timesMade} times`}
          </>
        )}
        {!entry.mealId && " \u00b7 One-off, not in your library"}
      </Typography.Text>

      {entry.description && (
        // Plain text with its whitespace, never HTML.
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6, maxHeight: 280, overflowY: "auto" }}>{entry.description}</div>
      )}

      <Space wrap>
        <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <Select<MealSlot>
          aria-label="Meal of the day"
          value={slot}
          onChange={setSlot}
          style={{ width: 130 }}
          options={SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }))}
        />
        <Button disabled={!changed || !isDateString(date) || busy} onClick={() => run(() => moveEntryAction(entry.id, date, slot))}>
          Move
        </Button>
      </Space>

      <Space wrap>
        <Popconfirm title="Remove this from the plan?" okText="Remove" onConfirm={() => run(() => removeEntryAction(entry.id))}>
          <Button danger disabled={busy}>
            Remove from plan
          </Button>
        </Popconfirm>
        {entry.mealId && (
          <Link href={`/meals/library/${entry.mealId}/edit`}>
            <Button>Edit meal</Button>
          </Link>
        )}
      </Space>
    </Space>
  );
}
