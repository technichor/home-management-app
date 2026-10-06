"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Input, Modal, Popconfirm, Select, Space, Typography } from "antd";
import type { RepeatUnit } from "@prisma/client";
import { formatCalendarDate } from "@/lib/dates";
import { timeLabel } from "@/lib/calendarView";
import { describeRepeat } from "@/lib/recurrence";
import type { MemberOption } from "@/lib/householdMembers";
import type { AgendaItemEntry } from "@/lib/agendaOrder";
import { createCalendarItemAction, deleteCalendarItemAction, updateCalendarItemAction } from "./actions";

const EVERYONE = "";

/** One event: what it is, with edit and delete. Notes are plain text, never HTML. */
export function ItemDetailDialog({
  item,
  onEdit,
  onClose,
}: {
  item: AgendaItemEntry | null;
  onEdit: (item: AgendaItemEntry) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();

  async function remove(id: string) {
    const result = await deleteCalendarItemAction(id);
    if (!result.ok) return message.error(result.error);
    onClose();
    router.refresh();
  }

  const when = item ? timeLabel(item.startTime, item.endTime) : "";
  return (
    <Modal title={item?.title ?? ""} open={item !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {item && (
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            {when ? "Event" : "Reminder"} · {formatCalendarDate(item.date)}
            {when && ` · ${when}`}
            {item.assigneeName ? ` · ${item.assigneeName}` : " · Whole household"}
          </Typography.Text>
          {item.repeat && <Typography.Text type="secondary">{describeRepeat(item.repeat.unit, item.repeat.every, item.repeat.until)} (editing or deleting changes every occurrence)</Typography.Text>}
          {item.notes && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{item.notes}</div>}
          <Space>
            <Button onClick={() => onEdit(item)}>Edit</Button>
            <Popconfirm title="Delete this item?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(item.itemId)}>
              <Button danger>Delete</Button>
            </Popconfirm>
          </Space>
        </Space>
      )}
    </Modal>
  );
}

export type FormTarget = { mode: "create"; date: string } | { mode: "edit"; item: AgendaItemEntry };

/** The full form, for creating and editing an event. */
export function ItemFormDialog({
  target,
  assignees,
  onClose,
}: {
  target: FormTarget | null;
  assignees: MemberOption[];
  onClose: () => void;
}) {
  return (
    <Modal title={target?.mode === "edit" ? "Edit event" : "New event"} open={target !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {/* Keyed so each opening starts from its own item or date. */}
      {target && <FormBody key={target.mode === "edit" ? target.item.id : `new-${target.date}`} target={target} assignees={assignees} onClose={onClose} />}
    </Modal>
  );
}

function FormBody({ target, assignees, onClose }: { target: FormTarget; assignees: MemberOption[]; onClose: () => void }) {
  const router = useRouter();
  const editing = target.mode === "edit" ? target.item : null;
  const [title, setTitle] = useState(editing?.title ?? "");
  // Editing a repeating event edits the series, so the date is where the series starts, not the occurrence opened.
  const [date, setDate] = useState(target.mode === "edit" ? (target.item.repeat?.start ?? target.item.date) : target.date);
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit | "">(editing?.repeat?.unit ?? "");
  const [repeatEvery, setRepeatEvery] = useState(editing?.repeat?.every ?? 1);
  const [repeatUntil, setRepeatUntil] = useState(editing?.repeat?.until ?? "");
  const [startTime, setStartTime] = useState(editing?.startTime ?? "");
  const [endTime, setEndTime] = useState(editing?.endTime ?? "");
  const [assignee, setAssignee] = useState(editing?.assigneeContactId ?? EVERYONE);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // An assignee who has since been removed can stay on an item, but isn't offered for anything new.
  const options = [
    { value: EVERYONE, label: "Whole household" },
    ...assignees.map((a) => ({ value: a.id, label: a.name })),
    ...(editing?.assigneeContactId && !assignees.some((a) => a.id === editing.assigneeContactId)
      ? [{ value: editing.assigneeContactId, label: `${editing.assigneeName ?? "Former member"} (removed)` }]
      : []),
  ];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields = {
        title,
        date,
        notes,
        startTime,
        endTime,
        assigneeContactId: assignee === EVERYONE ? null : assignee,
        repeatUnit: repeatUnit || null,
        repeatEvery,
        repeatUntil: repeatUnit ? repeatUntil : "",
      };
      const result = editing ? await updateCalendarItemAction(editing.itemId, fields) : await createCalendarItemAction(fields);
      if (!result.ok) return setError(result.error);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon title={error} />}
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" maxLength={200} autoFocus />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <Space wrap>
        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Start time" />
        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="End time" disabled={!startTime} />
      </Space>
      <Space wrap>
        <Select<RepeatUnit | "">
          value={repeatUnit}
          onChange={setRepeatUnit}
          aria-label="Repeats"
          style={{ width: 160 }}
          options={[
            { value: "", label: "Doesn't repeat" },
            { value: "DAY", label: "Repeats daily" },
            { value: "WEEK", label: "Repeats weekly" },
            { value: "MONTH", label: "Repeats monthly" },
            { value: "YEAR", label: "Repeats yearly" },
          ]}
        />
        {repeatUnit && (
          <>
            <Input type="number" min={1} max={99} value={repeatEvery} onChange={(e) => setRepeatEvery(Number(e.target.value))} aria-label="Repeat every" addonBefore="Every" addonAfter={`${repeatUnit.toLowerCase()}${repeatEvery === 1 ? "" : "s"}`} style={{ width: 190 }} />
            <Input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} aria-label="Repeat until" addonBefore="Until" style={{ width: 200 }} />
          </>
        )}
      </Space>
      <Select value={assignee} onChange={setAssignee} options={options} aria-label="Assigned to" style={{ width: "100%" }} />
      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" autoSize={{ minRows: 3, maxRows: 8 }} maxLength={5000} />
      <Space>
        <Button type="primary" loading={busy} disabled={!title.trim()} onClick={save}>
          {editing ? "Save" : "Add"}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Space>
    </Space>
  );
}
