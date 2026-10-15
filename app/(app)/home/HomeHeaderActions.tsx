"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Popover } from "antd";
import { BellOutlined, PlusOutlined } from "@ant-design/icons";
import type { MemberOption } from "@/lib/householdMembers";
import type { AttentionItem } from "@/lib/homeAttention";
import { ItemFormDialog, type FormTarget } from "@/app/(app)/calendar/ItemDialogs";

/** How often the home page looks again (so "now" and what's past stay right while it is left open), and on focus. */
export const HOME_REFRESH_MS = 5 * 60_000;

/**
 * The home page's header buttons: New event (the calendar's own form, on today) and the bell, which counts what needs
 * attention and lists it. Also keeps the page fresh while it is open.
 */
export default function HomeHeaderActions({
  today,
  assignees,
  googleCalendarName,
  attention,
}: {
  today: string;
  assignees: MemberOption[];
  googleCalendarName: string | null;
  attention: AttentionItem[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormTarget | null>(null);

  useEffect(() => {
    const check = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(check, HOME_REFRESH_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  const list = (
    <div className="home-bell-list">
      {attention.length === 0 ? (
        <p className="home-muted">Nothing needs attention.</p>
      ) : (
        attention.map((a) => (
          <Link key={a.key} href={a.href} className="home-bell-item">
            <strong>{a.title}</strong>
            <span>{a.support}</span>
          </Link>
        ))
      )}
    </div>
  );

  return (
    <div className="home-actions">
      <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => setForm({ mode: "create", date: today })}>
        New event
      </Button>
      <Popover content={list} title="Needs attention" trigger="click" placement="bottomRight">
        <Badge count={attention.length} size="small" offset={[-4, 4]}>
          <Button icon={<BellOutlined aria-hidden />} aria-label={`Needs attention, ${attention.length} ${attention.length === 1 ? "item" : "items"}`} />
        </Badge>
      </Popover>
      <ItemFormDialog target={form} assignees={assignees} googleCalendarName={googleCalendarName} onClose={() => setForm(null)} />
    </div>
  );
}
