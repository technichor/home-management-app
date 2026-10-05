"use client";

import { Button, Checkbox } from "antd";
import { formatCalendarDate } from "@/lib/dates";
import type { AgendaItemEntry } from "@/lib/agendaOrder";

/**
 * Open tasks that are past their date. They stay here, rolling forward, until they are completed or deleted. Each can
 * be checked off or moved to today.
 */
export default function OverdueStrip({
  tasks,
  failed,
  onToggle,
  onMoveToday,
  onOpen,
}: {
  tasks: AgendaItemEntry[];
  failed: Record<string, () => void>;
  onToggle: (task: AgendaItemEntry, completed: boolean) => void;
  onMoveToday: (task: AgendaItemEntry) => void;
  onOpen: (task: AgendaItemEntry) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="cal-overdue" aria-label="Overdue">
      <h2 className="cal-overdue-title">Overdue ({tasks.length})</h2>
      {tasks.map((t) => (
        <div key={t.id} className="cal-overdue-row">
          <Checkbox checked={false} onChange={(e) => onToggle(t, e.target.checked)} aria-label={`Complete ${t.title}`} />
          <button type="button" className="cal-overdue-text" onClick={() => onOpen(t)}>
            <span>{t.title}</span>
            <span className="cal-muted">due {formatCalendarDate(t.date)}</span>
            {t.assigneeName && <span className="cal-muted">{t.assigneeName}</span>}
          </button>
          {failed[t.id] ? (
            <Button size="small" danger onClick={failed[t.id]}>
              Couldn&apos;t save. Retry
            </Button>
          ) : (
            <Button size="small" onClick={() => onMoveToday(t)}>
              Move to today
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
