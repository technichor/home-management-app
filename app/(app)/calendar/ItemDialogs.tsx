"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Checkbox, Input, Modal, Popconfirm, Segmented, Select, Space, Typography } from "antd";
import type { CalendarKind } from "@prisma/client";
import { formatCalendarDate } from "@/lib/dates";
import { timeLabel } from "@/lib/calendarView";
import type { AssigneeOption } from "@/lib/calendarItem";
import type { AgendaItemEntry } from "@/lib/agendaOrder";
import { createCalendarItemAction, deleteCalendarItemAction, updateCalendarItemAction } from "./actions";

const EVERYONE = "";

/** One item: what it is, with edit, delete and (for a task) check/uncheck. Notes are plain text, never HTML. */
export function ItemDetailDialog({
  item,
  completed,
  onToggle,
  onEdit,
  onClose,
}: {
  item: AgendaItemEntry | null;
  completed: boolean;
  onToggle: (item: AgendaItemEntry, completed: boolean) => void;
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
            {item.kind === "TASK" ? "Task" : when ? "Event" : "Reminder"} · {formatCalendarDate(item.date)}
            {when && ` · ${when}`}
            {item.assigneeName ? ` · ${item.assigneeName}` : " · Whole household"}
          </Typography.Text>
          {item.kind === "TASK" && (
            <Checkbox checked={completed} onChange={(e) => onToggle(item, e.target.checked)}>
              {completed ? "Done" : "Mark done"}
            </Checkbox>
          )}
          {item.notes && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{item.notes}</div>}
          <Space>
            <Button onClick={() => onEdit(item)}>Edit</Button>
            <Popconfirm title="Delete this item?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(item.id)}>
              <Button danger>Delete</Button>
            </Popconfirm>
          </Space>
        </Space>
      )}
    </Modal>
  );
}

export type FormTarget = { mode: "create"; date: string } | { mode: "edit"; item: AgendaItemEntry };

/** The full form, for creating (with a chosen kind) and editing (the kind is fixed). */
export function ItemFormDialog({
  target,
  assignees,
  onClose,
}: {
  target: FormTarget | null;
  assignees: AssigneeOption[];
  onClose: () => void;
}) {
  return (
    <Modal title={target?.mode === "edit" ? "Edit item" : "New item"} open={target !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {/* Keyed so each opening starts from its own item or date. */}
      {target && <FormBody key={target.mode === "edit" ? target.item.id : `new-${target.date}`} target={target} assignees={assignees} onClose={onClose} />}
    </Modal>
  );
}

function FormBody({ target, assignees, onClose }: { target: FormTarget; assignees: AssigneeOption[]; onClose: () => void }) {
  const router = useRouter();
  const editing = target.mode === "edit" ? target.item : null;
  const [kind, setKind] = useState<CalendarKind>(editing?.kind ?? "EVENT");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(target.mode === "edit" ? target.item.date : target.date);
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
        startTime: kind === "EVENT" ? startTime : "",
        endTime: kind === "EVENT" ? endTime : "",
        assigneeContactId: assignee === EVERYONE ? null : assignee,
      };
      const result = editing ? await updateCalendarItemAction(editing.id, fields) : await createCalendarItemAction(kind, fields);
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
      {editing ? (
        <Typography.Text type="secondary">{kind === "TASK" ? "Task" : "Event or reminder"}</Typography.Text>
      ) : (
        <Segmented<CalendarKind>
          value={kind}
          onChange={setKind}
          options={[{ value: "EVENT", label: "Event / reminder" }, { value: "TASK", label: "Task" }]}
          aria-label="Kind"
        />
      )}
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" maxLength={200} autoFocus />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      {kind === "EVENT" && (
        <Space wrap>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Start time" />
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="End time" disabled={!startTime} />
        </Space>
      )}
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
