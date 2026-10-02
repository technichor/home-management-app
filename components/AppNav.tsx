"use client";

import { Space, Typography, Button, Tag } from "antd";
import { usePathname, useRouter } from "next/navigation";

const { Text } = Typography;

interface AppNavProps {
  slug: string;
  householdName: string;
  logoutAction: () => Promise<void>;
}

const MODULES = [
  { key: "contacts", label: "Contacts", href: (slug: string) => `/${slug}/contacts`, active: true },
  { key: "lists", label: "Lists", href: (slug: string) => `/${slug}/lists`, active: true },
  { key: "messages", label: "Messages", href: (slug: string) => `/${slug}/messages`, active: true },
  { key: "meals", label: "Meal Planning", active: false },
  { key: "maintenance", label: "Maintenance", active: false },
  { key: "schedules", label: "Schedules", active: false },
];

export default function AppNav({ slug, householdName, logoutAction }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const selectedKey =
    MODULES.find((m) => m.active && pathname.startsWith(`/${slug}/${m.key}`))?.key ?? "";

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0 8px",
        }}
      >
        <Text strong style={{ fontSize: 15 }}>
          Home Management
        </Text>
        <Space>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {householdName}
          </Text>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => router.push(`/${slug}/account`)}
          >
            Account
          </Button>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => router.push(`/${slug}/household`)}
          >
            Household
          </Button>
          <form action={logoutAction} style={{ display: "inline" }}>
            <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
              Log out
            </Button>
          </form>
        </Space>
      </div>

      <div style={{ display: "flex", gap: 2 }}>
        {MODULES.map((mod) => {
          const isSelected = mod.active && selectedKey === mod.key;
          return (
            <button
              key={mod.key}
              onClick={mod.active && mod.href ? () => router.push(mod.href!(slug)) : undefined}
              style={{
                padding: "8px 12px",
                background: "none",
                border: "none",
                borderBottom: isSelected ? "2px solid #111827" : "2px solid transparent",
                cursor: mod.active ? "pointer" : "default",
                fontSize: 14,
                color: !mod.active
                  ? "rgba(0,0,0,.25)"
                  : isSelected
                  ? "#111827"
                  : "rgba(0,0,0,.65)",
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
