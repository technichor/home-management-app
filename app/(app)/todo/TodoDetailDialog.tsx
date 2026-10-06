"use client";

import { useState } from "react";
import { Alert, Button, Input, Modal, Popconfirm, Select, Space } from "antd";
import type { MemberOption } from "@/lib/householdMembers";
import { MAX_TODO_NOTES, MAX_TODO_TEXT, type TodoItem } from "@/lib/todo";
import FormField from "@/components/FormField";
import { deleteTodoAction, updateTodoAction } from "./actions";
import { assigneeOptions, ANYONE } from "./assignees";

/** Everything about one to-do, one click in from its row: text, notes, due date, who; and delete. */
export default function TodoDetailDialog({
  item,
  members,
  onClose,
  onSaved,
}: {
  item: TodoItem | null;
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal title="To-do" open={item !== null} onCancel={onClose} footer={null} destroyOnHidden>
      {/* Keyed so each opening starts from its own item. */}
      {item && <Body key={item.id} item={item} members={members} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function Body({ item, members, onClose, onSaved }: { item: TodoItem; members: MemberOption[]; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(item.text);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [assignee, setAssignee] = useState(item.assigneeContactId ?? ANYONE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) return setError(result.error);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => updateTodoAction(item.id, { text, notes, dueDate, assigneeContactId: assignee === ANYONE ? null : assignee }));

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon title={error} />}
      <FormField label="To-do">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TODO_TEXT} aria-label="To-do" onPressEnter={save} />
      </FormField>
      <Space wrap align="start">
        <FormField label="Who">
          <Select value={assignee} onChange={setAssignee} aria-label="Who" style={{ width: 200 }} options={assigneeOptions(members, item)} />
        </FormField>
        <FormField label="Due">
          <Space.Compact>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" style={{ width: 170 }} />
            {dueDate && <Button onClick={() => setDueDate("")}>No date</Button>}
          </Space.Compact>
        </FormField>
      </Space>
      <FormField label="Notes">
        <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} autoSize={{ minRows: 3, maxRows: 12 }} maxLength={MAX_TODO_NOTES} aria-label="Notes" />
      </FormField>
      <Space wrap>
        <Button type="primary" loading={busy} disabled={!text.trim()} onClick={save}>
          Save
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Popconfirm title="Delete this to-do?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => run(() => deleteTodoAction(item.id))}>
          <Button danger>Delete</Button>
        </Popconfirm>
      </Space>
    </Space>
  );
}
