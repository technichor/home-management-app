"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, App, Badge, Button, Modal, Select, Switch, Tag, Tooltip, Typography } from "antd";
import { LeftOutlined, PlusOutlined, RightOutlined, SettingOutlined } from "@ant-design/icons";
import { CALENDAR_VIEWS, type CalendarView, type WeekStart } from "@/lib/dates";
import { CALENDAR_POLL_MS, calendarHref, defaultNewEventDate, rangeTitle } from "@/lib/calendarView";
import type { MemberOption } from "@/lib/householdMembers";
import type { AgendaEntry, AgendaItemEntry } from "@/lib/agendaOrder";
import { setShowMealsAction, setWeekStartAction } from "./actions";
import { DayView, MonthView, WeekView, type EntryContext } from "./CalendarViews";
import { ItemDetailDialog, ItemFormDialog, type FormTarget } from "./ItemDialogs";

const VIEW_LABELS: Record<CalendarView, string> = { day: "Day", week: "Week", month: "Month" };

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
  googleProblems = [],
  googleCalendarName = null,
}: {
  view: CalendarView;
  anchor: string;
  dates: string[];
  prev: string;
  next: string;
  today: string;
  weekStartsOn: WeekStart;
  showMeals: boolean;
  assignees: MemberOption[];
  assigneeFilter: string | null;
  entries: AgendaEntry[];
  /** Shared Google calendars that couldn't be read just now (the rest are shown). */
  googleProblems?: string[];
  /** The household's Google calendar, when Domata's events go to one. */
  googleCalendarName?: string | null;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const hrefFor = (v: CalendarView, date?: string) => calendarHref({ view: v, date, who: assigneeFilter });
  const ctx: EntryContext = {
    today,
    onOpen: (item) => setOpenId(item.id),
    onAdd: (date) => setForm({ mode: "create", date }),
    onAddAt: (date, startTime) => setForm({ mode: "create", date, startTime }),
    hrefFor: (v, date) => hrefFor(v, date),
  };

  const range = { start: dates[0], end: dates[dates.length - 1] };
  // Switching view keeps today when it is on screen (the week's Day view opens on today, not the week's first day),
  // otherwise the period being looked at.
  const switchDate = today >= range.start && today <= range.end ? today : anchor;
  const filteredTo = assignees.find((a) => a.id === assigneeFilter) ?? null;
  const showFor = (who: string | null) => router.push(calendarHref({ view, date: anchor, who }));
  const open = entries.find((e): e is AgendaItemEntry => e.source === "item" && e.id === openId) ?? null;

  async function save(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    const result = await action();
    if (!result.ok) return message.error(result.error);
    router.refresh();
  }

  return (
    <div className="cal">
      <div className="cal-header">
        <div className="cal-nav">
          <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => setForm({ mode: "create", date: defaultNewEventDate(view, anchor, range, today) })}>
            New event
          </Button>
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
          {/* The member filter lives in the settings, so say when it is on, with a way back to everyone. */}
          {filteredTo && (
            <Tag closable onClose={(e) => (e.preventDefault(), showFor(null))} closeIcon={<span aria-label="Show everyone">×</span>}>
              Only {filteredTo.name}
            </Tag>
          )}
        </div>
        <div className="cal-tools">
          <nav className="subnav" aria-label="View">
            {CALENDAR_VIEWS.map((v) => (
              <Link key={v} href={hrefFor(v, switchDate)} aria-current={v === view ? "page" : undefined}>
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </nav>
          <Tooltip title="Calendar settings">
            <Badge dot={filteredTo !== null} offset={[-4, 4]}>
              <Button icon={<SettingOutlined aria-hidden />} aria-label="Calendar settings" onClick={() => setSettingsOpen(true)} />
            </Badge>
          </Tooltip>
        </div>
      </div>

      <Modal title="Calendar settings" open={settingsOpen} destroyOnHidden onCancel={() => setSettingsOpen(false)} footer={<Button onClick={() => setSettingsOpen(false)}>Done</Button>}>
        <div className="cal-settings">
          <label>
            <span>Show items for</span>
            <Select<string>
              aria-label="Show items for"
              value={assigneeFilter ?? ""}
              onChange={(v) => showFor(v || null)}
              options={[{ value: "", label: "Everyone" }, ...assignees.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </label>
          <label>
            <span>Week starts on</span>
            <Select<WeekStart>
              aria-label="Week starts on"
              value={weekStartsOn}
              onChange={(v) => save(() => setWeekStartAction(v))}
              options={[{ value: "SUNDAY", label: "Sunday" }, { value: "MONDAY", label: "Monday" }]}
            />
          </label>
          <label className="cal-switch">
            <Switch size="small" checked={showMeals} onChange={(v) => save(() => setShowMealsAction(v))} aria-label="Show meals" />
            <span>Show planned meals (on the week and day views)</span>
          </label>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The week&apos;s first day is shared with the meal planner, and both settings apply to the whole household.
          </Typography.Text>
        </div>
      </Modal>

      {googleProblems.length > 0 && (
        <Alert type="warning" showIcon title={`Couldn't read from Google just now: ${googleProblems.join(", ")}. The rest of the calendar is up to date.`} />
      )}

      {view === "week" && <WeekView dates={dates} entries={entries} ctx={ctx} />}
      {view === "day" && <DayView date={anchor} entries={entries} ctx={ctx} />}
      {view === "month" && <MonthView dates={dates} anchor={anchor} entries={entries} ctx={ctx} />}

      <ItemDetailDialog
        item={open}
        googleCalendarName={googleCalendarName}
        onEdit={(item) => {
          setOpenId(null);
          setForm({ mode: "edit", item });
        }}
        onClose={() => setOpenId(null)}
      />
      <ItemFormDialog target={form} assignees={assignees} googleCalendarName={googleCalendarName} onClose={() => setForm(null)} />
    </div>
  );
}
