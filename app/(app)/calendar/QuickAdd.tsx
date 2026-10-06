"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input } from "antd";
import { createCalendarItemAction } from "./actions";

export type QuickAddPrefill = { date: string; nonce: number } | null;

/**
 * One line to add an event or reminder: a title, a date and an optional start time. Enter adds it and
 * keeps the cursor in the box, so several can go in a row. Opening it from a day's "+" fills in that day's date.
 */
export default function QuickAdd({ defaultDate, focusOnMount }: { defaultDate: string; focusOnMount: boolean }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof Input>>(null);
  const root = useRef<HTMLDivElement>(null);

  // Opened from a day's "+": bring the box into view and put the cursor in it. (The parent re-keys this component
  // whenever the viewed day or the "+" changes, so the date above is already the right one.)
  useEffect(() => {
    if (!focusOnMount) return;
    root.current?.scrollIntoView({ block: "nearest" });
    input.current?.focus();
  }, [focusOnMount]);

  async function add() {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await createCalendarItemAction({ title: text, date, startTime });
      if (!result.ok) return message.error(result.error);
      setTitle("");
      setStartTime("");
      router.refresh();
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="cal-quickadd">
      <Input
        ref={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onPressEnter={add}
        placeholder="Add an event or reminder and press Enter"
        aria-label="Title"
        maxLength={200}
        enterKeyHint="done"
      />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="cal-quickadd-date" />
      <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Start time" className="cal-quickadd-time" />
      <Button type="primary" onClick={add} loading={busy} disabled={!title.trim()}>
        Add
      </Button>
    </div>
  );
}
