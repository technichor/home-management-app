"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Space, Typography } from "antd";
import { MAX_MEAL_DESCRIPTION, MAX_RECIPE_URL } from "@/lib/validations";
import { SLOT_LABELS } from "@/lib/mealPlan";
import { formatDayHeading } from "@/lib/dates";
import type { MealSlot } from "@prisma/client";
import { createMealAction, updateMealAction } from "../actions";

/**
 * Create a meal (no `meal`) or edit one. A new meal with `addTo` (opened from the planner) is also put on that date
 * and slot, and saving or cancelling returns to the planner's week.
 */
export default function MealForm({
  meal,
  addTo,
  initialName,
}: {
  meal?: { id: string; name: string; description: string | null; recipeUrl: string | null };
  addTo?: { date: string; slot: MealSlot };
  initialName?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(meal?.name ?? initialName ?? "");
  const [description, setDescription] = useState(meal?.description ?? "");
  const [recipeUrl, setRecipeUrl] = useState(meal?.recipeUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Opened from the planner: where to go back to.
  const plannerWeek = addTo ? `/meals?week=${addTo.date}` : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (meal) {
        const result = await updateMealAction(meal.id, name, description, recipeUrl);
        if (!result.ok) return setError(result.error);
        router.push(`/meals/library/${meal.id}`);
      } else {
        const result = await createMealAction(name, description, recipeUrl, addTo ?? null);
        if (!result.ok) return setError(result.error);
        router.push(plannerWeek ?? `/meals/library/${result.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {meal ? "Edit meal" : "New meal"}
        </Typography.Title>
        {addTo && (
          <Typography.Text type="secondary">
            It will be added to your library and to {SLOT_LABELS[addTo.slot]}, {formatDayHeading(addTo.date).weekday}{" "}
            {formatDayHeading(addTo.date).monthDay}.
          </Typography.Text>
        )}
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      <div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
          Name
        </Typography.Text>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Chicken tikka masala" aria-label="Name" autoFocus />
      </div>
      <div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
          Recipe link
        </Typography.Text>
        <Input
          value={recipeUrl}
          onChange={(e) => setRecipeUrl(e.target.value)}
          maxLength={MAX_RECIPE_URL}
          placeholder="Optional. e.g. https://www.allrecipes.com/recipe/..."
          aria-label="Recipe link"
          inputMode="url"
        />
      </div>
      <div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
          Description
        </Typography.Text>
        <Input.TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoSize={{ minRows: 8, maxRows: 30 }}
          maxLength={MAX_MEAL_DESCRIPTION}
          showCount
          placeholder="Optional. Paste the whole recipe here if you like."
          aria-label="Description"
        />
      </div>
      <Space>
        <Button type="primary" loading={busy} disabled={!name.trim()} onClick={save}>
          {meal ? "Save" : "Add meal"}
        </Button>
        <Link href={meal ? `/meals/library/${meal.id}` : (plannerWeek ?? "/meals/library")}>
          <Button>Cancel</Button>
        </Link>
      </Space>
    </Space>
  );
}
