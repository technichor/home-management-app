"use client";

import { useState } from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { MemberOption } from "@/lib/householdMembers";
import { ItemFormDialog, type FormTarget } from "@/app/(app)/calendar/ItemDialogs";

/** A small "+" beside Today's "Open calendar": the calendar's own New event form, on today. */
export default function HomeNewEvent({
  today,
  assignees,
  googleCalendarName,
}: {
  today: string;
  assignees: MemberOption[];
  googleCalendarName: string | null;
}) {
  const [form, setForm] = useState<FormTarget | null>(null);
  return (
    <>
      <Tooltip title="New event">
        <Button type="primary" size="small" icon={<PlusOutlined aria-hidden />} aria-label="New event" onClick={() => setForm({ mode: "create", date: today })} />
      </Tooltip>
      <ItemFormDialog target={form} assignees={assignees} googleCalendarName={googleCalendarName} onClose={() => setForm(null)} />
    </>
  );
}
