"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Popconfirm, Select, Space, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { GroceryCategory } from "@prisma/client";
import { DEFAULT_GROCERY_CATEGORY, GROCERY_CATEGORIES, GROCERY_CATEGORY_LABELS } from "@/lib/groceryCategories";
import { groupShopping, uncheckedCount, type ShoppingItem } from "@/lib/shoppingGroups";
import { deleteItemAction, toggleItemAction, updateItemAction } from "../../lists/actions";
import { addShoppingItemAction, removeCheckedItemsAction, setItemCategoryAction } from "./actions";

/** How often the list checks for changes made by someone else (and also whenever the window regains focus). */
export const SHOPPING_POLL_MS = 12000;

const TEMP = "tmp-";

/**
 * The household's shopping list, grouped by store section. `variant="page"` is the full-page view built for use in
 * a store on a phone (big tap targets); "panel" is the compact one in the planner's slide-over. Changes show at
 * once and are saved in the background; one that fails is put back and offers a retry.
 */
export default function ShoppingList({ items: serverItems, variant }: { items: ShoppingItem[]; variant: "page" | "panel" }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [items, setItems] = useState(serverItems);
  const [failed, setFailed] = useState<Record<string, () => void>>({});
  const [collapsed, setCollapsed] = useState<Set<GroceryCategory>>(new Set());
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [draft, setDraft] = useState("");
  const [section, setSection] = useState<GroceryCategory>(DEFAULT_GROCERY_CATEGORY);
  const itemsRef = useRef(items);
  const pending = useRef(0);
  const tempSeq = useRef(0);
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);

  const apply = (next: ShoppingItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  // Take what the server sends, unless a change of ours is still being saved (it would flicker back).
  useEffect(() => {
    if (pending.current === 0) apply(serverItems);
  }, [serverItems]);

  // Near-real-time: look again every few seconds while the tab is visible, and when the window regains focus.
  useEffect(() => {
    const check = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(check, SHOPPING_POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  function setFailure(id: string, retry: (() => void) | null) {
    setFailed((cur) => {
      const next = { ...cur };
      if (retry) next[id] = retry;
      else delete next[id];
      return next;
    });
  }

  /** Show `next` for the item at once (null removes it), save with `call`, and put it back if saving fails. */
  async function change(id: string, next: ShoppingItem | null, call: () => Promise<unknown>) {
    const before = itemsRef.current.find((i) => i.id === id) as ShoppingItem;
    apply(next ? itemsRef.current.map((i) => (i.id === id ? next : i)) : itemsRef.current.filter((i) => i.id !== id));
    setFailure(id, null);
    pending.current++;
    try {
      await call();
      router.refresh();
    } catch {
      apply(next ? itemsRef.current.map((i) => (i.id === id ? before : i)) : [...itemsRef.current, before]);
      setFailure(id, () => void change(id, next, call));
    } finally {
      pending.current--;
    }
  }

  const toggle = (item: ShoppingItem, checked: boolean) => change(item.id, { ...item, checked }, () => toggleItemAction(item.id, checked));
  const move = (item: ShoppingItem, category: GroceryCategory) =>
    change(item.id, { ...item, category }, async () => {
      const result = await setItemCategoryAction(item.id, category);
      if (!result.ok) throw new Error(result.error);
    });

  async function add() {
    const text = draft.trim();
    if (!text) return;
    if (itemsRef.current.some((i) => !i.checked && i.text.toLowerCase() === text.toLowerCase())) {
      message.warning(`"${text}" is already on the list`);
    }
    const tempId = `${TEMP}${++tempSeq.current}`;
    apply([...itemsRef.current, { id: tempId, text, quantity: null, notes: null, checked: false, category: section }]);
    setDraft("");
    inputRef.current?.focus();
    pending.current++;
    try {
      const result = await addShoppingItemAction(text, section);
      if (result.ok) {
        apply(itemsRef.current.map((i) => (i.id === tempId ? { ...i, id: result.id } : i)));
        router.refresh();
      } else {
        apply(itemsRef.current.filter((i) => i.id !== tempId));
        message.error(result.error);
      }
    } finally {
      pending.current--;
    }
  }

  async function removeChecked() {
    const result = await removeCheckedItemsAction();
    if (!result.ok) return message.error(result.error);
    apply(itemsRef.current.filter((i) => !i.checked));
    router.refresh();
  }

  const groups = groupShopping(items);
  const checkedTotal = items.length - uncheckedCount(items);
  const toggleSection = (category: GroceryCategory) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(category)) next.add(category);
      return next;
    });

  return (
    <div className={`shop shop-${variant}`}>
      {variant === "page" && (
        <Typography.Title level={4} style={{ margin: 0 }}>
          Shopping list ({uncheckedCount(items)})
        </Typography.Title>
      )}

      <div className="shop-add">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={add}
          placeholder="Add an item and press Enter"
          aria-label="Add an item"
          enterKeyHint="done"
          maxLength={200}
          autoFocus={variant === "page"}
        />
        <Select<GroceryCategory>
          aria-label="Section"
          value={section}
          onChange={setSection}
          className="shop-section-select"
          listHeight={340}
          options={GROCERY_CATEGORIES.map((c) => ({ value: c, label: GROCERY_CATEGORY_LABELS[c] }))}
        />
        <Button type="primary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {groups.length === 0 && <Empty description="Nothing on the list. Add what you need above." style={{ padding: "24px 0" }} />}

      {groups.map((group) => {
        const closed = collapsed.has(group.category);
        return (
          <section key={group.category} className="shop-group">
            <button type="button" className="shop-section-head" aria-expanded={!closed} onClick={() => toggleSection(group.category)}>
              {closed ? <RightOutlined aria-hidden /> : <DownOutlined aria-hidden />}
              <span className="shop-section-name">{group.label}</span>
              <span className="shop-count">{group.unchecked}</span>
            </button>
            {!closed &&
              group.items.map((item) => {
                const saving = item.id.startsWith(TEMP);
                return (
                  <div key={item.id} className="shop-row" data-checked={item.checked || undefined}>
                    <Checkbox checked={item.checked} disabled={saving} onChange={(e) => toggle(item, e.target.checked)} aria-label={`${item.text}`} />
                    <button type="button" className="shop-text" disabled={saving} onClick={() => setEditing(item)}>
                      <span className="shop-name">{item.text}</span>
                      {item.quantity && <span className="shop-qty">{item.quantity}</span>}
                      {item.notes && <span className="shop-notes">{item.notes}</span>}
                    </button>
                    {failed[item.id] ? (
                      <Button size="small" danger onClick={failed[item.id]}>
                        Couldn&apos;t save. Retry
                      </Button>
                    ) : (
                      <Dropdown
                        trigger={["click"]}
                        disabled={saving}
                        menu={{
                          selectedKeys: [item.category],
                          items: GROCERY_CATEGORIES.map((c) => ({ key: c, label: GROCERY_CATEGORY_LABELS[c] })),
                          onClick: ({ key }) => move(item, key as GroceryCategory),
                        }}
                      >
                        <button type="button" className="shop-cat" aria-label={`Section for ${item.text}: ${GROCERY_CATEGORY_LABELS[item.category]}`}>
                          {GROCERY_CATEGORY_LABELS[item.category]}
                        </button>
                      </Dropdown>
                    )}
                  </div>
                );
              })}
          </section>
        );
      })}

      {checkedTotal > 0 && (
        <Popconfirm
          title={`Remove ${checkedTotal === 1 ? "1 checked item" : `${checkedTotal} checked items`}?`}
          description="They will be deleted from the list."
          okText="Remove"
          onConfirm={removeChecked}
        >
          <Button style={{ alignSelf: "flex-start" }}>Remove checked items ({checkedTotal})</Button>
        </Popconfirm>
      )}

      <Modal title={editing?.text ?? ""} open={editing !== null} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing && (
          <EditBody
            key={editing.id}
            item={editing}
            onSave={(quantity, notes) => {
              void change(editing.id, { ...editing, quantity, notes }, () => updateItemAction(editing.id, { quantity, notes }));
              setEditing(null);
            }}
            onDelete={() => {
              void change(editing.id, null, () => deleteItemAction(editing.id));
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function EditBody({
  item,
  onSave,
  onDelete,
  onCancel,
}: {
  item: ShoppingItem;
  onSave: (quantity: string | null, notes: string | null) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity, e.g. 2 gallons" aria-label="Quantity" maxLength={100} />
      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" autoSize={{ minRows: 2, maxRows: 6 }} maxLength={500} />
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Popconfirm title="Delete this item?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={onDelete}>
          <Button danger>Delete</Button>
        </Popconfirm>
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" onClick={() => onSave(quantity.trim() || null, notes.trim() || null)}>
            Save
          </Button>
        </Space>
      </Space>
    </Space>
  );
}
