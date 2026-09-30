"use client";

import { Layout, Menu, Space, Typography, Button, Tag } from "antd";
import { usePathname, useRouter } from "next/navigation";

const { Header } = Layout;
const { Text } = Typography;

interface AppNavProps {
  slug: string;
  householdName: string;
  logoutAction: () => Promise<void>;
}

const MODULES = [
  { key: "contacts", label: "Contacts", href: (slug: string) => `/${slug}/contacts`, active: true },
  { key: "lists", label: "Lists", active: false },
  { key: "meals", label: "Meal Planning", active: false },
  { key: "maintenance", label: "Maintenance", active: false },
  { key: "schedules", label: "Schedules", active: false },
];

export default function AppNav({ slug, householdName, logoutAction }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const selectedKey =
    MODULES.find((m) => m.active && pathname.startsWith(`/${slug}/${m.key}`))?.key ?? "";

  const menuItems = MODULES.map((mod) => ({
    key: mod.key,
    disabled: !mod.active,
    label: mod.active ? (
      mod.label
    ) : (
      <span>
        {mod.label}{" "}
        <Tag bordered={false} style={{ fontSize: 10, lineHeight: "14px", padding: "0 4px", marginLeft: 2 }}>
          soon
        </Tag>
      </span>
    ),
    onClick: mod.active && mod.href ? () => router.push(mod.href!(slug)) : undefined,
  }));

  return (
    <Header
      style={{
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        padding: "0 24px",
        height: "auto",
        lineHeight: "normal",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0 0",
        }}
      >
        <Text strong style={{ fontSize: 15 }}>
          Home Management
        </Text>
        <Space>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {householdName}
          </Text>
          <form action={logoutAction} style={{ display: "inline" }}>
            <Button type="link" htmlType="submit" size="small" style={{ padding: 0 }}>
              Log out
            </Button>
          </form>
        </Space>
      </div>
      <Menu
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={menuItems}
        style={{ borderBottom: "none", marginTop: 4 }}
      />
    </Header>
  );
}
