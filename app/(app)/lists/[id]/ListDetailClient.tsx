"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input, Modal, Segmented, Select, Tag, Empty, App } from "antd";
import { DeleteOutlined, EditOutlined, HolderOutlined, ShareAltOutlined, SwapOutlined, UploadOutlined } from "@ant-design/icons";
import Link from "next/link";
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
  setSortModeAction,
} from "../actions";
import ImportItemsModal from "../ImportItemsModal";
import ListSharingModal, { type ShareCandidate, type ShareRow } from "./ListSharingModal";
import LinkButton from "@/components/LinkButton";
import { isHttpUrl } from "@/lib/formFields";
import { VISIBILITY_LABELS, type ListVisibility } from "@/lib/listAccess";

type Item = {
  id: string;
  text: string;
  quantity: string | null;
  notes: string | null;
  url: string | null;
  checked: boolean;
  assignedToContactId: string | null;
};

/** Blank, or a link we accept (http or https). */
const urlOk = (url: string) => !url.trim() || isHttpUrl(url.trim());
type ContactOption = { id: string; name: string };

function ItemRow({
  item,
  assignee,
  sortable,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Item;
  assignee?: string;
  sortable: boolean;
  canEdit: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled: !sortable,
  });
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
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {sortable && (
        <span {...attributes} {...listeners} style={{ cursor: "grab", color: "var(--faint)", touchAction: "none", padding: "10px 6px", margin: "-10px -2px", display: "flex" }} aria-label="Drag to reorder">
          <HolderOutlined />
        </span>
      )}
      <Checkbox checked={item.checked} disabled={!canEdit} onChange={(e) => onToggle(e.target.checked)} aria-label={`Done: ${item.text}`} />
      <div style={{ flex: 1, minWidth: 0, opacity: item.checked ? 0.5 : 1 }}>
        <span style={{ textDecoration: item.checked ? "line-through" : undefined }}>{item.text}</span>
        {item.quantity && <span style={{ color: "var(--muted)" }}> · {item.quantity}</span>}
        {assignee && <Tag style={{ marginLeft: 8 }}>{assignee}</Tag>}
        {item.notes && <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.notes}</div>}
      </div>
      {item.url && <LinkButton url={item.url} name={item.text} />}
      {canEdit && (
        <>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} aria-label="Edit item" />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label="Delete item" />
        </>
      )}
    </div>
  );
}

export default function ListDetailClient({
  listId,
  listName,
  kind = "STANDARD",
  sortMode,
  openImport,
  canEdit = true,
  visibility = "HOUSEHOLD",
  ownerName = null,
  sharing = null,
  items: serverItems,
  contacts,
}: {
  listId: string;
  listName: string;
  kind?: "STANDARD" | "GIFT";
  sortMode: "MANUAL" | "PAIRWISE";
  openImport: boolean;
  /** False for someone the list is shared with to view only: no adding, checking, editing or reordering. */
  canEdit?: boolean;
  visibility?: ListVisibility;
  /** Whose list it is, when it isn't the viewer's. */
  ownerName?: string | null;
  /** For the list's owner: who it is shared with (the Share dialog). */
  sharing?: {
    householdName: string;
    sharedWithHousehold: boolean;
    shares: ShareRow[];
    candidates: ShareCandidate[];
    publicUrl: string | null;
  } | null;
  items: Item[];
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [items, setItems] = useState(serverItems);
  const [draft, setDraft] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(openImport);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({
    text: "",
    quantity: "",
    notes: "",
    url: "",
    assignedToContactId: null as string | null,
  });

  // Re-sync local state when the server sends new items (adjust state during render, not in an effect).
  const [prevServerItems, setPrevServerItems] = useState(serverItems);
  if (serverItems !== prevServerItems) {
    setPrevServerItems(serverItems);
    setItems(serverItems);
  }

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
    // Pasting several lines adds one item per line; a link (gift lists) goes with a single item.
    const lines = draft.split("\n");
    if (!lines.some((l) => l.trim())) return;
    const url = draftUrl.trim();
    if (url && (!isHttpUrl(url) || lines.filter((l) => l.trim()).length > 1)) {
      message.error(isHttpUrl(url) ? "A link can only go with one item" : "A link must start with http:// or https://");
      return;
    }
    setDraft("");
    setDraftUrl("");
    await run(() => addItemsAction(listId, lines, undefined, url || null));
  }

  function handleToggle(item: Item, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)));
    run(() => toggleItemAction(item.id, checked));
  }

  function handleDelete(item: Item) {
    modal.confirm({
      title: `Delete "${item.text}"?`,
      content: "This can not be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => run(() => deleteItemAction(item.id)),
    });
  }

  function openEdit(item: Item) {
    setEditing(item);
    setEditForm({
      text: item.text,
      quantity: item.quantity ?? "",
      notes: item.notes ?? "",
      url: item.url ?? "",
      assignedToContactId: item.assignedToContactId,
    });
  }

  // Only reachable from the open edit modal, whose Save button is disabled while the text is blank.
  async function saveEdit(id: string) {
    setEditing(null);
    await run(() =>
      updateItemAction(id, {
        text: editForm.text,
        quantity: editForm.quantity,
        notes: editForm.notes,
        url: editForm.url,
        assignedToContactId: editForm.assignedToContactId,
      })
    );
  }

  function handleSortModeChange(mode: "MANUAL" | "PAIRWISE") {
    modal.confirm({
      title: mode === "PAIRWISE" ? "Switch to pairwise ranking?" : "Switch to manual sorting?",
      content:
        mode === "PAIRWISE"
          ? "The current order is kept, but every item's rating starts over at the default, so all items begin equal. Dragging is turned off; you rank items by comparing two at a time."
          : "The current order is kept. Dragging is turned on and comparisons are turned off. Ratings are discarded, and switching back to pairwise starts them over.",
      okText: "Switch",
      onOk: () => run(() => setSortModeAction(listId, mode)),
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    if (sortMode !== "MANUAL") return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = display.findIndex((i) => i.id === active.id);
    const newIndex = display.findIndex((i) => i.id === over.id);
    const next = arrayMove(display, oldIndex, newIndex);
    setItems(next);
    run(() =>
      reorderItemsAction(
        listId,
        next.map((i) => i.id)
      )
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="list-who">
        <Tag className="list-visibility" data-visibility={visibility}>
          {VISIBILITY_LABELS[visibility]}
        </Tag>
        {kind === "GIFT" && <span>Gift ideas</span>}
        {ownerName && <span>{ownerName}&apos;s list</span>}
        {!canEdit && <span>View only</span>}
        {sharing && (
          <Button size="small" icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>
            Share
          </Button>
        )}
      </div>
      {canEdit && (
      <>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Sort:</span>
        <Segmented
          size="small"
          value={sortMode}
          onChange={(v) => handleSortModeChange(v as "MANUAL" | "PAIRWISE")}
          options={[
            { label: "Manual", value: "MANUAL" },
            { label: "Pairwise", value: "PAIRWISE" },
          ]}
        />
        <span style={{ flex: 1 }} />
        {sortMode === "PAIRWISE" && items.filter((i) => !i.checked).length >= 2 && (
          <Link href={`/lists/${listId}/compare`}>
            <Button icon={<SwapOutlined />}>Prioritize</Button>
          </Link>
        )}
        <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
          Import CSV
        </Button>
      </div>
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
        style={{ marginBottom: kind === "GIFT" ? 8 : 16 }}
      />
      {kind === "GIFT" && (
        <Input
          placeholder="Link for it (optional), e.g. its page in a shop"
          aria-label="Link for the new item"
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onPressEnter={handleAdd}
          style={{ marginBottom: 16 }}
        />
      )}
      </>
      )}
      {display.length === 0 ? (
        <Empty description="No items yet." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={display.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {display.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                sortable={canEdit && sortMode === "MANUAL"}
                canEdit={canEdit}
                assignee={item.assignedToContactId ? contactName.get(item.assignedToContactId) : undefined}
                onToggle={(c) => handleToggle(item, c)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <ImportItemsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setImportOpen(false);
          router.replace(`/lists/${listId}`);
          router.refresh();
        }}
        listId={listId}
        listName={listName}
      />

      {sharing && <ListSharingModal open={shareOpen} onClose={() => setShareOpen(false)} listId={listId} {...sharing} />}

      <Modal
        title="Edit item"
        open={!!editing}
        onOk={() => saveEdit((editing as Item).id)}
        onCancel={() => setEditing(null)}
        okText="Save"
        okButtonProps={{ disabled: !editForm.text.trim() || !urlOk(editForm.url) }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            placeholder="Item"
            value={editForm.text}
            onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
          />
          <Input
            placeholder="Link (optional), e.g. https://..."
            aria-label="Link"
            value={editForm.url}
            status={urlOk(editForm.url) ? undefined : "error"}
            onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
          />
          {!urlOk(editForm.url) && <span style={{ color: "var(--danger)", fontSize: 12, marginTop: -8 }}>A link must start with http:// or https://</span>}
          <Input
            placeholder="Quantity (e.g. 2 gallons)"
            value={editForm.quantity}
            onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
          />
          {contacts.length > 0 && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Assign to a contact"
            value={editForm.assignedToContactId}
            onChange={(v) => setEditForm({ ...editForm, assignedToContactId: v ?? null })}
            options={contacts.map((c) => ({ value: c.id, label: c.name }))}
          />
          )}
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
