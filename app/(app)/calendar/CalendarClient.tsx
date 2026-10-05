"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Select, Switch, Typography } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { CALENDAR_VIEWS, type CalendarView, type WeekStart } from "@/lib/dates";
import { CALENDAR_POLL_MS, calendarHref, defaultQuickAddDate, rangeTitle } from "@/lib/calendarView";
import type { AssigneeOption } from "@/lib/calendarItem";
import type { AgendaEntry, AgendaItemEntry } from "@/lib/agendaOrder";
import { moveTaskToTodayAction, setShowMealsAction, setTaskCompletedAction, setWeekStartAction } from "./actions";
import { DayView, MonthView, WeekView, type EntryContext } from "./CalendarViews";
import { ItemDetailDialog, ItemFormDialog, type FormTarget } from "./ItemDialogs";
import OverdueStrip from "./OverdueStrip";
import QuickAdd, { type QuickAddPrefill } from "./QuickAdd";

const VIEW_LABELS: Record<CalendarView, string> = { day: "Day", week: "Week", month: "Month" };

type LocalState = { base: AgendaEntry[]; checks: Record<string, boolean>; moved: Set<string> };

export default function CalendarClient({
  view,
  anchor,
  dates,
  prev,
  next,
  today,
  weekStartsOn,
  showMeals,
  assignees,
  assigneeFilter,
  entries,
  overdue,
}: {
  view: CalendarView;
  anchor: string;
  dates: string[];
  prev: string;
  next: string;
  today: string;
  weekStartsOn: WeekStart;
  showMeals: boolean;
  assignees: AssigneeOption[];
  assigneeFilter: string | null;
  entries: AgendaEntry[];
  overdue: AgendaItemEntry[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [prefill, setPrefill] = useState<QuickAddPrefill>(null);
  // Tasks as the user last set them, ahead of the server, and ones moved to today (hidden from the strip meanwhile).
  // They belong to the data they were set against: when new data arrives from the server they are dropped.
  const [local, setLocal] = useState<LocalState>({ base: entries, checks: {}, moved: new Set() });
  const current: LocalState = local.base === entries ? local : { base: entries, checks: {}, moved: new Set() };
  const { checks, moved } = current;
  const [failed, setFailed] = useState<Record<string, () => void>>({});
  const update = (change: (s: LocalState) => Partial<LocalState>) =>
    setLocal((cur) => {
      const base: LocalState = cur.base === entries ? cur : { base: entries, checks: {}, moved: new Set() };
      return { ...base, ...change(base) };
    });

  // Near-real-time: look again every 30 seconds while the tab is visible, and when the window regains focus.
  useEffect(() => {
    const check = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(check, CALENDAR_POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  const completedOf = (task: AgendaItemEntry) => checks[task.id] ?? task.completed;
  const setFailure = (id: string, retry: (() => void) | null) =>
    setFailed((cur) => {
      const copy = { ...cur };
      if (retry) copy[id] = retry;
      else delete copy[id];
      return copy;
    });

  /** Show the change at once, save it in the background, and put it back with a retry if saving fails. */
  async function toggle(task: AgendaItemEntry, completed: boolean) {
    update((s) => ({ checks: { ...s.checks, [task.id]: completed } }));
    setFailure(task.id, null);
    const result = await setTaskCompletedAction(task.id, completed);
    if (result.ok) return router.refresh();
    update((s) => {
      const checks = { ...s.checks };
      delete checks[task.id];
      return { checks };
    });
    setFailure(task.id, () => void toggle(task, completed));
  }

  async function moveToToday(task: AgendaItemEntry) {
    update((s) => ({ moved: new Set(s.moved).add(task.id) }));
    setFailure(task.id, null);
    const result = await moveTaskToTodayAction(task.id, today);
    if (result.ok) return router.refresh();
    update((s) => {
      const copy = new Set(s.moved);
      copy.delete(task.id);
      return { moved: copy };
    });
    setFailure(task.id, () => void moveToToday(task));
  }

  const hrefFor = (v: CalendarView, date?: string) => calendarHref({ view: v, date, who: assigneeFilter, today });
  const ctx: EntryContext = {
    today,
    onOpen: (item) => setOpenId(item.id),
    onToggle: toggle,
    completedOf,
    failed,
    onAdd: (date) => setPrefill({ date, nonce: Date.now() }),
    hrefFor: (v, date) => hrefFor(v, date),
  };

  const range = { start: dates[0], end: dates[dates.length - 1] };
  const open = [...entries, ...overdue].find((e): e is AgendaItemEntry => e.source === "item" && e.id === openId) ?? null;
  const strip = overdue.filter((t) => !completedOf(t) && !moved.has(t.id));

  async function save(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    const result = await action();
    if (!result.ok) return message.error(result.error);
    router.refresh();
  }

  return (
    <div className="cal">
      <div className="cal-header">
        <div className="cal-header-row">
          <div className="cal-nav">
            <Link href={hrefFor(view, prev)} aria-label="Previous">
              <Button icon={<LeftOutlined aria-hidden />} />
            </Link>
            <Link href={hrefFor(view, next)} aria-label="Next">
              <Button icon={<RightOutlined aria-hidden />} />
            </Link>
            <Link href={hrefFor(view, today)}>
              <Button>Today</Button>
            </Link>
            <Typography.Title level={4} style={{ margin: "0 4px" }}>
              {rangeTitle(view, anchor)}
            </Typography.Title>
          </div>
          <nav className="subnav" aria-label="View">
            {CALENDAR_VIEWS.map((v) => (
              <Link key={v} href={hrefFor(v, anchor)} aria-current={v === view ? "page" : undefined}>
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="cal-header-row cal-filters">
          <Select<string>
            aria-label="Show items for"
            value={assigneeFilter ?? ""}
            style={{ minWidth: 150 }}
            onChange={(v) => router.push(calendarHref({ view, date: anchor, who: v || null, today }))}
            options={[{ value: "", label: "Everyone" }, ...assignees.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <Select<WeekStart>
            aria-label="Week starts on"
            value={weekStartsOn}
            style={{ width: 130 }}
            onChange={(v) => save(() => setWeekStartAction(v))}
            options={[{ value: "SUNDAY", label: "Starts Sunday" }, { value: "MONDAY", label: "Starts Monday" }]}
          />
          <label className="cal-switch">
            <Switch size="small" checked={showMeals && view !== "month"} disabled={view === "month"} onChange={(v) => save(() => setShowMealsAction(v))} aria-label="Show meals" />
            <span>Show meals{view === "month" ? " (week and day)" : ""}</span>
          </label>
          <Button onClick={() => setForm({ mode: "create", date: defaultQuickAddDate(view, anchor, range, today) })}>New item</Button>
        </div>
      </div>

      <QuickAdd
        key={`${prefill?.date ?? defaultQuickAddDate(view, anchor, range, today)}|${prefill?.nonce ?? 0}`}
        defaultDate={prefill?.date ?? defaultQuickAddDate(view, anchor, range, today)}
        focusOnMount={prefill !== null}
      />

      <OverdueStrip tasks={strip} failed={failed} onToggle={toggle} onMoveToday={moveToToday} onOpen={(t) => setOpenId(t.id)} />

      {view === "week" && <WeekView dates={dates} entries={entries} ctx={ctx} />}
      {view === "day" && <DayView date={anchor} entries={entries} ctx={ctx} />}
      {view === "month" && <MonthView dates={dates} anchor={anchor} entries={entries} ctx={ctx} />}

      <ItemDetailDialog
        item={open}
        completed={open ? completedOf(open) : false}
        onToggle={toggle}
        onEdit={(item) => {
          setOpenId(null);
          setForm({ mode: "edit", item });
        }}
        onClose={() => setOpenId(null)}
      />
      <ItemFormDialog target={form} assignees={assignees} onClose={() => setForm(null)} />
    </div>
  );
}
