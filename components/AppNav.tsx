"use client";

import { Button, Tag } from "antd";
import { usePathname, useRouter } from "next/navigation";

interface AppNavProps {
  householdName: string;
  isSuperuser?: boolean;
  logoutAction: () => Promise<void>;
}

const MODULES = [
  { key: "home", label: "Home", href: "/home", active: true },
  { key: "contacts", label: "Contacts", href: "/contacts", active: true },
  { key: "lists", label: "Lists", href: "/lists", active: true },
  { key: "messages", label: "Messages", href: "/messages", active: true },
  { key: "meals", label: "Meal Planning", href: undefined, active: false },
  { key: "maintenance", label: "Maintenance", href: undefined, active: false },
  { key: "schedules", label: "Schedules", href: undefined, active: false },
];

export default function AppNav({ householdName, isSuperuser, logoutAction }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const selectedKey =
    pathname === "/home"
      ? "home"
      : (MODULES.find((m) => m.key !== "home" && m.active && pathname.startsWith(`/${m.key}`))?.key ?? "");

  return (
    <div className="app-nav">
      <div className="app-nav-top">
        <span className="app-nav-title">Home Management</span>
        <div className="app-nav-links">
          <span className="app-nav-household">{householdName}</span>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => router.push("/account")}>
            Account
          </Button>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => router.push("/household")}>
            Household
          </Button>
          {isSuperuser && (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => router.push("/admin")}>
              Admin
            </Button>
          )}
          <form action={logoutAction} style={{ display: "inline" }}>
            <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
              Log out
            </Button>
          </form>
        </div>
      </div>

      <div className="tab-strip">
        {MODULES.map((mod) => {
          const isSelected = mod.active && selectedKey === mod.key;
          return (
            <button
              key={mod.key}
              className={mod.active ? undefined : "tab-soon"}
              onClick={mod.active && mod.href ? () => router.push(mod.href) : undefined}
              style={{
                padding: "8px 12px",
                background: "none",
                border: "none",
                borderBottom: isSelected ? "2px solid #111827" : "2px solid transparent",
                cursor: mod.active ? "pointer" : "default",
                fontSize: 14,
                color: !mod.active ? "rgba(0,0,0,.25)" : isSelected ? "#111827" : "rgba(0,0,0,.65)",
                fontWeight: isSelected ? 500 : 400,
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              {mod.label}
              {!mod.active && (
                <Tag variant="filled" style={{ fontSize: 10, lineHeight: "14px", padding: "0 4px" }}>
                  soon
                </Tag>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
