"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Select, Typography } from "antd";
import { formatDayHeading, weekDates } from "@/lib/dates";
import { SLOT_LABELS } from "@/lib/mealPlan";
import type { SuggestionMeal } from "@/lib/suggestions";
import type { MealSlot } from "@prisma/client";
import { addPlanEntryAction } from "./actions";
import SuggestionList from "./SuggestionList";
import { useSuggestions } from "./useSuggestions";

/**
 * Meal ideas for the week being viewed, with no AI: meals due for a repeat, and the family's staples. Choose the
 * day and meal they should go to, then add one with a single tap. Shuffle draws a fresh set.
 */
export default function SuggestionsPanel({
  meals,
  today,
  weekStart,
  weekMealIds,
  slots,
}: {
  meals: SuggestionMeal[];
  today: string;
  weekStart: string;
  weekMealIds: ReadonlySet<string>;
  slots: MealSlot[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const days = weekDates(weekStart);
  const [date, setDate] = useState(days.includes(today) ? today : days[0]);
  const [slot, setSlot] = useState<MealSlot>(slots.includes("DINNER") ? "DINNER" : slots[slots.length - 1]);
  const [busy, setBusy] = useState(false);
  const { due, staples, shuffle } = useSuggestions(meals, today, weekMealIds);

  // The chosen day belongs to the week that was showing; follow the user to another week.
  const targetDate = days.includes(date) ? date : days[0];
  const targetSlot = slots.includes(slot) ? slot : slots[slots.length - 1];

  async function add(meal: SuggestionMeal) {
    setBusy(true);
    try {
      const result = await addPlanEntryAction(targetDate, targetSlot, meal.id);
      if (!result.ok) return message.error(result.error);
      message.success(`Added ${meal.name}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const none = due.length === 0 && staples.length === 0;

  return (
    <div className="suggest-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Typography.Text strong>Ideas for this week</Typography.Text>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Typography.Text type="secondary">Add to</Typography.Text>
          <Select<string>
            size="small"
            aria-label="Day"
            value={targetDate}
            onChange={setDate}
            style={{ width: 110 }}
            options={days.map((d) => ({ value: d, label: `${formatDayHeading(d).weekday} ${formatDayHeading(d).monthDay}` }))}
          />
          <Select<MealSlot>
            size="small"
            aria-label="Meal"
            value={targetSlot}
            onChange={setSlot}
            style={{ width: 110 }}
            options={slots.map((s) => ({ value: s, label: SLOT_LABELS[s] }))}
          />
          <Button size="small" onClick={shuffle} disabled={none}>
            Shuffle
          </Button>
        </div>
      </div>

      {meals.length === 0 ? (
        <Typography.Text type="secondary">Add meals to your library and you&apos;ll get ideas here.</Typography.Text>
      ) : none ? (
        <Typography.Text type="secondary">Nothing to suggest right now. Everything is already planned this week or was made recently.</Typography.Text>
      ) : (
        <div className="suggest-columns">
          <SuggestionList title="Due for a repeat" meals={due} onAdd={add} busy={busy} />
          <SuggestionList title="Family staples" meals={staples} onAdd={add} busy={busy} />
        </div>
      )}
    </div>
  );
}
