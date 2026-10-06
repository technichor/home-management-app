"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Checkbox, Input, Select, Typography } from "antd";
import { CalendarOutlined, HolderOutlined } from "@ant-design/icons";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MemberOption } from "@/lib/householdMembers";
import { DEFAULT_TODO_FILTER, dueLabel, MAX_TODO_TEXT, moveInOrder, todoVisible, type TodoFilter, type TodoItem } from "@/lib/todo";
import { addTodoAction, clearDoneTodosAction, reorderTodosAction, setTodoDoneAction, updateTodoAction } from "./actions";
import { ANYONE, assigneeOptions } from "./assignees";
import TodoDetailDialog from "./TodoDetailDialog";

/** Look again this often while the tab is visible (someone else may have changed the list). */
export const TODO_POLL_MS = 30_000;
const FILTER_KEY = "todo.filter";
const ADD_ASSIGNEE_KEY = "todo.addAssignee";

// Browser storage is a convenience (it remembers the filter and who you last added for); it may be unavailable.
function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved; the choice still applies until the page is left.
  }
}

function TodoRow({
  item,
  today,
  members,
  sortable,
  onDone,
  onAssign,
  onOpen,
}: {
  item: TodoItem;
  today: string;
  members: MemberOption[];
  sortable: boolean;
  onDone: (done: boolean) => void;
  /** Absent for a done item, which just names who it was for. */
  onAssign?: (contactId: string | null) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: !sortable });
  const due = item.dueDate ? dueLabel(item.dueDate, today) : null;
  return (
    <div ref={setNodeRef} className="todo-row" data-done={item.done || undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {sortable && (
        <span {...attributes} {...listeners} className="todo-handle" aria-label={`Drag to reorder ${item.text}`}>
          <HolderOutlined />
        </span>
      )}
      <Checkbox checked={item.done} onChange={(e) => onDone(e.target.checked)} aria-label={`Done: ${item.text}`} />
      <button type="button" className="todo-text" onClick={onOpen}>
        {item.text}
        {item.notes && <span className="todo-has-notes" aria-label="has notes"> ¶</span>}
      </button>
      <div className="todo-meta">
        {due && (
          <span className="todo-due" data-tone={due.tone}>
            {due.text}
          </span>
        )}
        {onAssign ? (
          <Select
            size="small"
            variant="borderless"
            popupMatchSelectWidth={false}
            value={item.assigneeContactId ?? ANYONE}
            onChange={(v) => onAssign(v === ANYONE ? null : v)}
            options={assigneeOptions(members, item)}
            aria-label={`Who: ${item.text}`}
            className="todo-who"
          />
        ) : (
          <span className="todo-who-text">{item.assigneeName ?? "Anyone"}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The household's to-do list. Built for four things, each one step: add (type, Enter), reorder (drag), assign (the
 * name on the row) and finish (the checkbox). Everything else (notes, due date changes, delete) is one click in, on
 * the item. Changes show at once and are put back with a message if saving fails.
 */
export default function TodoClient({
  open: serverOpen,
  done: serverDone,
  members,
  myContactId,
  today,
}: {
  open: TodoItem[];
  done: TodoItem[];
  members: MemberOption[];
  myContactId: string | null;
  today: string;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [open, setOpen] = useState(serverOpen);
  const [done, setDone] = useState(serverDone);
  // New data from the server replaces local changes (adjusted during render, not in an effect).
  const [prev, setPrev] = useState({ open: serverOpen, done: serverDone });
  if (prev.open !== serverOpen || prev.done !== serverDone) {
    setPrev({ open: serverOpen, done: serverDone });
    setOpen(serverOpen);
    setDone(serverDone);
  }

  const [filter, setFilter] = useState<TodoFilter>(DEFAULT_TODO_FILTER);
  const [text, setText] = useState("");
  const [addAssignee, setAddAssignee] = useState<string>(ANYONE);
  const [addDue, setAddDue] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof Input>>(null);

  // Remembered choices, read after the first render (the server has no browser storage).
  useEffect(() => {
    const stored = readStored<TodoFilter>(FILTER_KEY, DEFAULT_TODO_FILTER);
    const storedAssignee = readStored<string>(ADD_ASSIGNEE_KEY, ANYONE);
    const known = (id: string) => id === ANYONE || members.some((m) => m.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage only exists after mount
    setFilter({
      who: stored.who === "everyone" || (stored.who === "mine" && myContactId) || members.some((m) => m.id === stored.who) ? stored.who : "everyone",
      includeAnyone: stored.includeAnyone !== false,
    });
    setAddAssignee(known(storedAssignee) ? storedAssignee : ANYONE);
  }, [members, myContactId]);

  // Near-real-time: look again every 30 seconds while the tab is visible, and when the window regains focus.
  useEffect(() => {
    const check = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(check, TODO_POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const changeFilter = (next: TodoFilter) => {
    setFilter(next);
    store(FILTER_KEY, next);
  };

  /** Show a change at once; if saving fails, put things back and say why. */
  async function optimistic(apply: () => void, undo: () => void, save: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    apply();
    const result = await save();
    if (!result.ok) {
      undo();
      message.error(result.error);
      return;
    }
    router.refresh();
  }

  async function add() {
    const value = text.trim();
    if (!value) return;
    const fields = { text: value, assigneeContactId: addAssignee === ANYONE ? null : addAssignee, dueDate: addDue || null };
    setText("");
    setAddDue("");
    setShowDue(false);
    input.current?.focus();
    const result = await addTodoAction(fields);
    if (!result.ok) {
      setText(value);
      message.error(result.error);
      return;
    }
    if (!todoVisible({ assigneeContactId: fields.assigneeContactId }, filter, myContactId)) {
      message.info("Added. It's hidden by the filter you're using.");
    }
    router.refresh();
  }

  function setItemDone(item: TodoItem, isDone: boolean) {
    const before = { open, done };
    const changed = { ...item, done: isDone };
    optimistic(
      () => {
        if (isDone) {
          setOpen((cur) => cur.filter((i) => i.id !== item.id));
          setDone((cur) => [changed, ...cur]);
        } else {
          setDone((cur) => cur.filter((i) => i.id !== item.id));
          setOpen((cur) => [...cur, changed]);
        }
      },
      () => {
        setOpen(before.open);
        setDone(before.done);
      },
      () => setTodoDoneAction(item.id, isDone),
    );
  }

  function assign(item: TodoItem, contactId: string | null) {
    const before = open;
    const name = members.find((m) => m.id === contactId)?.name ?? null;
    optimistic(
      () => setOpen((cur) => cur.map((i) => (i.id === item.id ? { ...i, assigneeContactId: contactId, assigneeName: name } : i))),
      () => setOpen(before),
      () => updateTodoAction(item.id, { assigneeContactId: contactId }),
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const before = open;
    const order = moveInOrder(
      open.map((i) => i.id),
      String(e.active.id),
      String(e.over.id),
    );
    const byId = new Map(open.map((i) => [i.id, i]));
    optimistic(
      () => setOpen(order.map((id) => byId.get(id)!)),
      () => setOpen(before),
      () => reorderTodosAction(order),
    );
  }

  async function clearDone() {
    const result = await clearDoneTodosAction();
    if (!result.ok) return message.error(result.error);
    setDone([]);
    router.refresh();
  }

  const visible = open.filter((i) => todoVisible(i, filter, myContactId));
  const visibleDone = done.filter((i) => todoVisible(i, filter, myContactId));
  const openItem = [...open, ...done].find((i) => i.id === openId) ?? null;
  const whoOptions = [
    { value: "everyone", label: "Everyone's" },
    ...(myContactId ? [{ value: "mine", label: "Mine" }] : []),
    ...members.filter((m) => m.id !== myContactId).map((m) => ({ value: m.id, label: `${m.name}'s` })),
  ];

  return (
    <div className="todo">
      <div className="todo-head">
        <Typography.Title level={4} style={{ margin: 0 }}>
          To-do
        </Typography.Title>
        {open.length > 1 && (
          <Link href="/todo/prioritize">
            <Button size="small">Prioritize</Button>
          </Link>
        )}
      </div>

      <div className="todo-add">
        <Input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={add}
          placeholder="Add a to-do and press Enter"
          aria-label="Add a to-do"
          maxLength={MAX_TODO_TEXT}
          enterKeyHint="done"
          autoFocus
        />
        <Select
          value={addAssignee}
          onChange={(v) => {
            setAddAssignee(v);
            store(ADD_ASSIGNEE_KEY, v);
          }}
          options={assigneeOptions(members)}
          aria-label="New to-dos are for"
          popupMatchSelectWidth={false}
          className="todo-add-who"
        />
        {showDue || addDue ? (
          <Input type="date" value={addDue} onChange={(e) => setAddDue(e.target.value)} aria-label="Due date for the new to-do" className="todo-add-due" />
        ) : (
          <Button icon={<CalendarOutlined aria-hidden />} onClick={() => setShowDue(true)} aria-label="Add a due date" />
        )}
        <Button type="primary" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>

      <div className="todo-filter">
        <Select
          value={filter.who}
          onChange={(who) => changeFilter({ ...filter, who })}
          options={whoOptions}
          aria-label="Show"
          size="small"
          popupMatchSelectWidth={false}
        />
        <Checkbox checked={filter.includeAnyone} onChange={(e) => changeFilter({ ...filter, includeAnyone: e.target.checked })}>
          Include Anyone
        </Checkbox>
      </div>

      {open.length === 0 ? (
        <Typography.Text type="secondary" className="todo-empty">
          Nothing to do. Add something above.
        </Typography.Text>
      ) : visible.length === 0 ? (
        <Typography.Text type="secondary" className="todo-empty">
          Nothing to do for this filter.
        </Typography.Text>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="todo-list" aria-label="To-dos">
              {visible.map((item) => (
                <TodoRow
                  key={item.id}
                  item={item}
                  today={today}
                  members={members}
                  sortable
                  onDone={(d) => setItemDone(item, d)}
                  onAssign={(c) => assign(item, c)}
                  onOpen={() => setOpenId(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {done.length > 0 && (
        <div className="todo-done">
          <div className="todo-done-head">
            <Button type="link" size="small" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
              {showDone ? "Hide done" : `Done (${visibleDone.length})`}
            </Button>
            {showDone && (
              <Button type="link" size="small" onClick={clearDone}>
                Clear done
              </Button>
            )}
          </div>
          {showDone && (
            <div className="todo-list" aria-label="Done">
              {visibleDone.map((item) => (
                <TodoRow
                  key={item.id}
                  item={item}
                  today={today}
                  members={members}
                  sortable={false}
                  onDone={(d) => setItemDone(item, d)}
                  onOpen={() => setOpenId(item.id)}
                />
              ))}
              <Typography.Text type="secondary" className="todo-empty">
                Done to-dos are cleared after 30 days.
              </Typography.Text>
            </div>
          )}
        </div>
      )}

      <TodoDetailDialog
        item={openItem}
        members={members}
        onClose={() => setOpenId(null)}
        onSaved={() => {
          setOpenId(null);
          router.refresh();
        }}
      />
    </div>
  );
}
