"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input, Modal, Select, Tag, Empty, App } from "antd";
import { DeleteOutlined, EditOutlined, HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addItemsAction,
  toggleItemAction,
  updateItemAction,
  deleteItemAction,
  reorderItemsAction,
} from "../actions";

type Item = {
  id: string;
  text: string;
  quantity: string | null;
  notes: string | null;
  checked: boolean;
  assignedToContactId: string | null;
};
type ContactOption = { id: string; name: string };

function ItemRow({
  item,
  assignee,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Item;
  assignee?: string;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 4px",
        borderBottom: "1px solid rgba(0,0,0,.06)",
        background: "#fff",
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: "grab", color: "rgba(0,0,0,.35)" }} aria-label="Drag to reorder">
        <HolderOutlined />
      </span>
      <Checkbox checked={item.checked} onChange={(e) => onToggle(e.target.checked)} />
      <div style={{ flex: 1, minWidth: 0, opacity: item.checked ? 0.5 : 1 }}>
        <span style={{ textDecoration: item.checked ? "line-through" : undefined }}>{item.text}</span>
        {item.quantity && <span style={{ color: "rgba(0,0,0,.45)" }}> · {item.quantity}</span>}
        {assignee && <Tag style={{ marginLeft: 8 }}>{assignee}</Tag>}
        {item.notes && <div style={{ fontSize: 12, color: "rgba(0,0,0,.45)" }}>{item.notes}</div>}
      </div>
      <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} aria-label="Edit item" />
      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label="Delete item" />
    </div>
  );
}

export default function ListDetailClient({
  slug,
  listId,
  items: serverItems,
  contacts,
}: {
  slug: string;
  listId: string;
  items: Item[];
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [items, setItems] = useState(serverItems);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({
    text: "",
    quantity: "",
    notes: "",
    assignedToContactId: null as string | null,
  });

  useEffect(() => setItems(serverItems), [serverItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));

  // Checked items display at the bottom; the saved order (position) is unaffected by that.
  const display = [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)];

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    }
    router.refresh();
  }

  async function handleAdd() {
    // Pasting several lines adds one item per line.
    const lines = draft.split("\n");
    if (!lines.some((l) => l.trim())) return;
    setDraft("");
    await run(() => addItemsAction(listId, slug, lines));
  }

  function handleToggle(item: Item, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)));
    run(() => toggleItemAction(item.id, slug, checked));
  }

  function handleDelete(item: Item) {
    modal.confirm({
      title: `Delete "${item.text}"?`,
      content: "This can not be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => run(() => deleteItemAction(item.id, slug)),
    });
  }

  function openEdit(item: Item) {
    setEditing(item);
    setEditForm({
      text: item.text,
      quantity: item.quantity ?? "",
      notes: item.notes ?? "",
      assignedToContactId: item.assignedToContactId,
    });
  }

  async function saveEdit() {
    if (!editing || !editForm.text.trim()) return;
    const id = editing.id;
    setEditing(null);
    await run(() =>
      updateItemAction(id, slug, {
        text: editForm.text,
        quantity: editForm.quantity,
        notes: editForm.notes,
        assignedToContactId: editForm.assignedToContactId,
      })
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = display.findIndex((i) => i.id === active.id);
    const newIndex = display.findIndex((i) => i.id === over.id);
    const next = arrayMove(display, oldIndex, newIndex);
    setItems(next);
    run(() =>
      reorderItemsAction(
        listId,
        slug,
        next.map((i) => i.id)
      )
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Input.TextArea
        autoSize={{ minRows: 1, maxRows: 6 }}
        placeholder="Add an item and press Enter (paste several lines to add several)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={(e) => {
          if (e.shiftKey) return;
          e.preventDefault();
          handleAdd();
        }}
        style={{ marginBottom: 16 }}
      />
      {display.length === 0 ? (
        <Empty description="No items yet." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={display.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {display.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                assignee={item.assignedToContactId ? contactName.get(item.assignedToContactId) : undefined}
                onToggle={(c) => handleToggle(item, c)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <Modal
        title="Edit item"
        open={!!editing}
        onOk={saveEdit}
        onCancel={() => setEditing(null)}
        okText="Save"
        okButtonProps={{ disabled: !editForm.text.trim() }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            placeholder="Item"
            value={editForm.text}
            onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
          />
          <Input
            placeholder="Quantity (e.g. 2 gallons)"
            value={editForm.quantity}
            onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Assign to a contact"
            value={editForm.assignedToContactId}
            onChange={(v) => setEditForm({ ...editForm, assignedToContactId: v ?? null })}
            options={contacts.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input.TextArea
            rows={3}
            placeholder="Notes"
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
