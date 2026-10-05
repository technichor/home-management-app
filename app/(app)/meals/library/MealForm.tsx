"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Space, Typography } from "antd";
import { MAX_MEAL_DESCRIPTION } from "@/lib/validations";
import { createMealAction, updateMealAction } from "../actions";

/** Create a meal (no `meal`) or edit one. */
export default function MealForm({ meal }: { meal?: { id: string; name: string; description: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(meal?.name ?? "");
  const [description, setDescription] = useState(meal?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (meal) {
        const result = await updateMealAction(meal.id, name, description);
        if (!result.ok) return setError(result.error);
        router.push(`/meals/library/${meal.id}`);
      } else {
        const result = await createMealAction(name, description);
        if (!result.ok) return setError(result.error);
        router.push(`/meals/library/${result.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {meal ? "Edit meal" : "New meal"}
      </Typography.Title>
      {error && <Alert type="error" showIcon title={error} />}
      <div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
          Name
        </Typography.Text>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Chicken tikka masala" aria-label="Name" autoFocus />
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
        <Link href={meal ? `/meals/library/${meal.id}` : "/meals/library"}>
          <Button>Cancel</Button>
        </Link>
      </Space>
    </Space>
  );
}
