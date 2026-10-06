"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Drawer } from "antd";
import { EllipsisOutlined, LogoutOutlined, SafetyCertificateOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { BRAND_NAME } from "@/lib/brand";
import { MODULES, TAB_BAR_COUNT } from "./navModules";

interface AppNavProps {
  householdName: string;
  isSuperuser?: boolean;
  unreadMessages?: number;
  logoutAction: () => Promise<void>;
}

const isActive = (pathname: string, href: string) =>
  href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`);

/**
 * Navigation: a sidebar on a wide screen, and on a phone a slim top bar plus a bottom tab bar (the
 * pattern a native app would use). Both are always in the page and the stylesheet shows one of them.
 */
/** The More sheet's height: its title and padding, plus a row per link. */
const MORE_SHEET_CHROME = 96;
const MORE_ROW = 48;

export default function AppNav({ householdName, isSuperuser, unreadMessages = 0, logoutAction }: AppNavProps) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const unreadLabel = `${unreadMessages} unread messages`;
  const badge = (key: string) =>
    key === "messages" && unreadMessages > 0 ? (
      <Badge className="nav-badge" count={unreadMessages} overflowCount={99} color="var(--accent)" aria-label={unreadLabel} />
    ) : null;

  const account = [
    { href: "/household", label: "Household", icon: <TeamOutlined aria-hidden /> },
    { href: "/account", label: "Account", icon: <SettingOutlined aria-hidden /> },
    ...(isSuperuser ? [{ href: "/admin", label: "Admin", icon: <SafetyCertificateOutlined aria-hidden /> }] : []),
  ];

  const tabModules = MODULES.slice(0, TAB_BAR_COUNT);
  const moreModules = MODULES.slice(TAB_BAR_COUNT);
  const moreActive = [...moreModules, ...account].some((m) => isActive(pathname, m.href));

  const logout = (
    <form action={logoutAction} className="nav-form">
      <button type="submit" className="nav-item">
        <LogoutOutlined aria-hidden />
        Log out
      </button>
    </form>
  );

  return (
    <>
      <aside className="sidebar">
        <Link href="/home" className="brand">
          <span className="brand-mark">D</span>
          <span className="brand-text">
            <span className="brand-name">{BRAND_NAME}</span>
            <span className="brand-household">{householdName}</span>
          </span>
        </Link>

        <nav className="nav-group" aria-label="Modules">
          {MODULES.map((m) => (
            <Link key={m.key} href={m.href} className="nav-item" aria-current={isActive(pathname, m.href) ? "page" : undefined}>
              {m.icon}
              {m.label}
              {badge(m.key)}
            </Link>
          ))}
        </nav>

        <div className="nav-spacer" />

        <nav className="nav-group" aria-label="Account">
          {account.map((a) => (
            <Link key={a.href} href={a.href} className="nav-item" aria-current={isActive(pathname, a.href) ? "page" : undefined}>
              {a.icon}
              {a.label}
            </Link>
          ))}
          {logout}
        </nav>
      </aside>

      <header className="mobile-top">
        <Link href="/home" className="brand">
          <span className="brand-mark">D</span>
          <span className="brand-text">
            <span className="brand-name">{BRAND_NAME}</span>
          </span>
        </Link>
      </header>

      <nav className="tabbar" aria-label="Main">
        {tabModules.map((m) => (
          <Link key={m.key} href={m.href} className="tabbar-item" aria-current={isActive(pathname, m.href) ? "page" : undefined}>
            {m.key === "messages" && unreadMessages > 0 ? (
              <Badge count={unreadMessages} overflowCount={99} size="small" color="var(--accent)" aria-label={unreadLabel}>
                {m.icon}
              </Badge>
            ) : (
              m.icon
            )}
            {m.label}
          </Link>
        ))}
        <button type="button" className="tabbar-item" aria-current={moreActive ? "page" : undefined} onClick={() => setMore(true)}>
          <EllipsisOutlined aria-hidden />
          More
        </button>
      </nav>

      <Drawer
        placement="bottom"
        // Tall enough for every row (title, rows of 48px, padding), so nothing in it needs scrolling.
        size={MORE_SHEET_CHROME + MORE_ROW * (moreModules.length + account.length + 1)}
        open={more}
        onClose={() => setMore(false)}
        title={householdName}
        destroyOnHidden
      >
        <div className="more-sheet" onClick={() => setMore(false)}>
          {[...moreModules, ...account].map((a) => (
            <Link key={a.href} href={a.href} className="nav-item" aria-current={isActive(pathname, a.href) ? "page" : undefined}>
              {a.icon}
              {a.label}
            </Link>
          ))}
          {/* Not closed by this click: closing would remove the form before it submits. Logging out leaves the page anyway. */}
          <div onClick={(e) => e.stopPropagation()}>{logout}</div>
        </div>
      </Drawer>
    </>
  );
}
