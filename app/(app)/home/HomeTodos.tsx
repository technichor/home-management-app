"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Checkbox } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { dueLabel, type TodoItem } from "@/lib/todo";
import { setTodoDoneAction } from "@/app/(app)/todo/actions";
import { localDateString } from "@/lib/dates";

/** How many to-dos the home page lists before "+N more on the list" (a phone shows the first PHONE_SHOWN, then a toggle). */
export const HOME_TODOS_SHOWN = 8;
export const PHONE_SHOWN = 3;

/**
 * The home page's To-do column: the user's and Anyone's open to-dos (due ones first), each checkable right here. On a
 * wide screen it is a column beside the brief's lists; on a phone it shows the first three with "Show N more".
 */
export default function HomeTodos({ items, today }: { items: TodoItem[]; today: string }) {
  const router = useRouter();
  const { message } = App.useApp();
  // Checked off here, ahead of the server (they leave the list at once).
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const open = items.filter((i) => !finished.has(i.id));
  const shown = open.slice(0, HOME_TODOS_SHOWN);
  const hiddenOnPhone = shown.length - PHONE_SHOWN;

  async function finish(item: TodoItem) {
    setFinished((cur) => new Set(cur).add(item.id));
    const result = await setTodoDoneAction(item.id, true, localDateString());
    if (!result.ok) {
      setFinished((cur) => {
        const next = new Set(cur);
        next.delete(item.id);
        return next;
      });
      message.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="home-todos" aria-label="To-do" data-expanded={expanded || undefined}>
      <div className="home-todos-head">
        <h2 className="brief-section">To-do</h2>
        <Link href="/todo" className="home-todos-open">
          Open list
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className="brief-row brief-row-plain">
          <div>
            <div className="brief-title">Nothing on your list</div>
            <div className="brief-support">To-dos for you, or for anyone, show up here.</div>
          </div>
        </div>
      ) : (
        <div className="home-todo-list">
          {shown.map((item) => {
            const due = item.dueDate ? dueLabel(item.dueDate, today) : null;
            return (
              <div key={item.id} className="brief-row home-todo-row" data-overdue={due?.tone === "overdue" || undefined}>
                <Checkbox onChange={() => finish(item)} aria-label={`Done: ${item.text}`} className="home-todo-check" />
                <Link href="/todo" className="home-todo-body">
                  <div className="brief-title">
                    {item.maintenance && <ToolOutlined className="todo-maintenance" aria-hidden />}
                    {item.text}
                  </div>
                  <div className="brief-support">
                    {due && (
                      <span className="todo-due" data-tone={due.tone}>
                        {due.text}
                      </span>
                    )}
                    {due && " · "}
                    {item.assigneeName ?? "Anyone"}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
      {hiddenOnPhone > 0 && (
        <button type="button" className="home-todos-toggle" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `Show ${hiddenOnPhone} more`}
        </button>
      )}
      {open.length > HOME_TODOS_SHOWN && (
        <Link href="/todo" className="brief-more home-todos-more">
          +{open.length - HOME_TODOS_SHOWN} more on the list
        </Link>
      )}
    </section>
  );
}
