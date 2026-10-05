"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Popconfirm, Space, Typography } from "antd";
import { formatCalendarDate } from "@/lib/dates";
import { deleteMealAction } from "../../actions";

export default function MealDetailClient({
  meal,
  lastMade,
  timesMade,
  entryCount,
}: {
  meal: { id: string; name: string; description: string | null };
  lastMade: string | null;
  timesMade: number;
  entryCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const result = await deleteMealAction(meal.id);
    if (!result.ok) return setError(result.error);
    router.push("/meals/library");
  }

  const used =
    entryCount === 0
      ? "It isn't on any plan."
      : `${entryCount === 1 ? "1 planned entry uses" : `${entryCount} planned entries use`} this meal. ${
          entryCount === 1 ? "It" : "They"
        } will stay on the plan as ${entryCount === 1 ? "a one-off entry" : "one-off entries"} named "${meal.name}".`;

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <div>
        <Link href="/meals/library" style={{ fontSize: 13 }}>
          &larr; Meal library
        </Link>
        <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
          {meal.name}
        </Typography.Title>
        <Typography.Text type="secondary">
          {lastMade ? `Last made ${formatCalendarDate(lastMade)}` : "Never made"} · {timesMade === 1 ? "1 time" : `${timesMade} times`}
        </Typography.Text>
      </div>

      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      <Space>
        <Link href={`/meals/library/${meal.id}/edit`}>
          <Button>Edit</Button>
        </Link>
        <Popconfirm title={`Delete "${meal.name}"?`} description={used} okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
          <Button danger>Delete</Button>
        </Popconfirm>
      </Space>

      {meal.description ? (
        // Plain text, whitespace kept; React escapes it, so it can never be treated as HTML.
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>{meal.description}</div>
      ) : (
        <Typography.Text type="secondary">No description.</Typography.Text>
      )}
    </Space>
  );
}
