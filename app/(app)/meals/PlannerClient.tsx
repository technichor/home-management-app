"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Badge, Button, Drawer, Popover, Select, Typography } from "antd";
import SuggestionsPanel from "./SuggestionsPanel";
import { BulbOutlined, LeftOutlined, PlusOutlined, RightOutlined, SettingOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { addDays, formatDayHeading, formatWeekRange, weekDates, weekStartOf, type WeekStart } from "@/lib/dates";
import { SLOTS, SLOT_LABELS, visibleSlots, type PlanSettings } from "@/lib/mealPlan";
import { updateMealPlanSettingsAction } from "./actions";
import AddEntryDialog, { type Cell, type LibraryOption } from "./AddEntryDialog";
import EntryDetailDialog, { type DetailEntry } from "./EntryDetailDialog";
import ShoppingList from "./shopping/ShoppingList";
import { uncheckedCount, type ShoppingItem } from "@/lib/shoppingGroups";

/** Below this width the grid becomes a vertical list of days (see .planner in globals.css). */
export const LIST_LAYOUT_QUERY = "(max-width: 1100px)";

const SHOW_KEY = { BREAKFAST: "showBreakfast", LUNCH: "showLunch", DINNER: "showDinner" } as const;

export default function PlannerClient({
  weekStart,
  today,
  settings,
  entries,
  hiddenCount,
  meals,
  shoppingItems,
}: {
  weekStart: string;
  today: string;
  settings: PlanSettings;
  entries: DetailEntry[];
  hiddenCount: number;
  meals: LibraryOption[];
  shoppingItems: ShoppingItem[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [adding, setAdding] = useState<Cell | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);

  const days = weekDates(weekStart);
  const slots = visibleSlots(settings);
  const currentWeek = weekStart === weekStartOf(today, settings.weekStartsOn);
  const href = (week: string | null) => `/meals?${week ? `week=${week}&` : ""}today=${today}`;
  const open = entries.find((e) => e.id === openId) ?? null;
  const weekMealIds = new Set(entries.flatMap((e) => (e.mealId ? [e.mealId] : [])));
  const openMeal = open?.mealId ? (meals.find((m) => m.id === open.mealId) ?? null) : null;

  // On a narrow screen the current week is a list; bring today to the top of it.
  useEffect(() => {
    if (currentWeek && window.matchMedia(LIST_LAYOUT_QUERY).matches) todayRef.current?.scrollIntoView({ block: "start" });
  }, [currentWeek, weekStart]);

  async function change(patch: Parameters<typeof updateMealPlanSettingsAction>[0]) {
    const result = await updateMealPlanSettingsAction(patch);
    if (!result.ok) return message.error(result.error);
    router.refresh();
  }

  const settingsPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 200 }}>
      <Typography.Text type="secondary">Week starts on</Typography.Text>
      <Select<WeekStart>
        aria-label="Week starts on"
        value={settings.weekStartsOn}
        onChange={(v) => change({ weekStartsOn: v })}
        options={[
          { value: "SUNDAY", label: "Sunday" },
          { value: "MONDAY", label: "Monday" },
        ]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Settings are shared by your whole household.
      </Typography.Text>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href={href(addDays(weekStart, -7))} aria-label="Previous week">
            <Button icon={<LeftOutlined aria-hidden />} />
          </Link>
          <Link href={href(addDays(weekStart, 7))} aria-label="Next week">
            <Button icon={<RightOutlined aria-hidden />} />
          </Link>
          <Typography.Title level={4} style={{ margin: "0 4px" }}>
            {formatWeekRange(weekStart)}
          </Typography.Title>
          {!currentWeek && (
            <Link href={href(null)}>
              <Button>This week</Button>
            </Link>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {SLOTS.map((slot) => {
            const shown = settings[SHOW_KEY[slot]];
            // The only meal still on can't be switched off: show it as on, but pale and not clickable.
            const locked = shown && slots.length === 1;
            return (
              <Button
                key={slot}
                size="small"
                type={shown ? "primary" : "default"}
                className={locked ? "toggle-locked" : undefined}
                title={locked ? "At least one meal has to stay on" : undefined}
                aria-pressed={shown}
                disabled={locked}
                onClick={() => change({ [SHOW_KEY[slot]]: !shown })}
              >
                {SLOT_LABELS[slot]}
              </Button>
            );
          })}
          <Button size="small" icon={<BulbOutlined aria-hidden />} aria-pressed={ideasOpen} type={ideasOpen ? "primary" : "default"} onClick={() => setIdeasOpen((v) => !v)}>
            Ideas
          </Button>
          <Badge count={uncheckedCount(shoppingItems)} size="small" overflowCount={99} color="var(--accent)" offset={[-4, 4]}>
            <Button size="small" icon={<ShoppingCartOutlined aria-hidden />} onClick={() => setShopOpen(true)}>
              Shopping list
            </Button>
          </Badge>
          <Popover content={settingsPanel} trigger="click" placement="bottomRight">
            <Button size="small" icon={<SettingOutlined aria-hidden />} aria-label="Planner settings" />
          </Popover>
        </div>
      </div>

      {hiddenCount > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {hiddenCount === 1 ? "1 hidden entry" : `${hiddenCount} hidden entries`} this week (in a meal you&apos;ve turned off above).
        </Typography.Text>
      )}

      {ideasOpen && <SuggestionsPanel meals={meals} today={today} weekStart={weekStart} weekMealIds={weekMealIds} slots={slots} />}

      <div className="planner" style={{ ["--planner-rows" as string]: slots.length }}>
        <div className="planner-corner" />
        {slots.map((slot) => (
          <div key={slot} className="planner-label">
            {SLOT_LABELS[slot]}
          </div>
        ))}
        {days.map((date) => {
          const { weekday, monthDay } = formatDayHeading(date);
          const isToday = date === today;
          return (
            <Fragment key={date}>
              <div className="planner-day" data-today={isToday || undefined} ref={isToday ? todayRef : undefined}>
                <strong>{weekday}</strong> {monthDay}
                {isToday && <span className="planner-today"> · Today</span>}
              </div>
              {slots.map((slot) => {
                const here = entries.filter((e) => e.date === date && e.slot === slot);
                return (
                  <div key={slot} className="planner-cell" data-slot={slot}>
                    <div className="planner-slot-label">{SLOT_LABELS[slot]}</div>
                    {here.map((e) => (
                      <button key={e.id} type="button" className="plan-entry" onClick={() => setOpenId(e.id)}>
                        {e.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="plan-add"
                      aria-label={`Add to ${SLOT_LABELS[slot]} on ${weekday} ${monthDay}`}
                      onClick={() => setAdding({ date, slot })}
                    >
                      <PlusOutlined aria-hidden />
                    </button>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      <Drawer
        title="Shopping list"
        placement="right"
        size={440}
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        destroyOnHidden
        extra={<Link href="/meals/shopping">Open full page</Link>}
      >
        <ShoppingList items={shoppingItems} variant="panel" />
      </Drawer>

      <AddEntryDialog cell={adding} meals={meals} today={today} weekMealIds={weekMealIds} onClose={() => setAdding(null)} />
      <EntryDetailDialog entry={open} stats={openMeal ? { lastMade: openMeal.lastMade, timesMade: openMeal.timesMade } : null} onClose={() => setOpenId(null)} />
    </div>
  );
}
