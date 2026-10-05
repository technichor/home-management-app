"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ConfigProvider, theme } from "antd";
import { PALETTE, SCHEME_COOKIE, type Scheme } from "@/lib/palette";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Ant Design's theme for a scheme, built from the same palette as the CSS variables. */
export function antdTheme(scheme: Scheme) {
  const c = PALETTE[scheme];
  return {
    algorithm: scheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.accent,
      colorLink: c.accent,
      colorLinkHover: c.accentHover,
      colorTextLightSolid: c.onAccent,
      colorBgBase: c.bg,
      colorBgLayout: c.bg,
      colorBgContainer: c.surface,
      colorBgElevated: c.surface,
      colorBorder: c.borderStrong,
      colorBorderSecondary: c.border,
      colorSplit: c.border,
      colorText: c.text,
      colorTextSecondary: c.muted,
      colorTextTertiary: c.faint,
      colorTextQuaternary: c.faint,
      colorFillAlter: c.subtle,
      colorFillSecondary: c.hover,
      colorFillTertiary: c.hover,
      borderRadius: 6,
      fontSize: 14,
      controlHeight: 32,
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      boxShadow: "none",
      boxShadowSecondary: scheme === "dark" ? "0 8px 24px rgba(0,0,0,.5)" : "0 8px 24px rgba(0,0,0,.08)",
    },
    components: {
      Button: { defaultShadow: "none", primaryShadow: "none", dangerShadow: "none", fontWeight: 500 },
      Card: { boxShadowTertiary: "none", headerFontSize: 14, headerFontSizeSM: 14, headerHeight: 44, bodyPadding: 16 },
      Table: {
        headerBg: "transparent",
        headerColor: c.muted,
        headerSplitColor: "transparent",
        borderColor: c.border,
        rowHoverBg: c.hover,
        cellPaddingBlock: 10,
      },
      Tag: { defaultBg: c.hover, defaultColor: c.muted },
      Modal: { titleFontSize: 16 },
      Tabs: { horizontalMargin: "0 0 12px" },
    },
  };
}

/**
 * Light or dark, following the system. `initial` is what the server saw in the cookie, so the first
 * render already matches for return visitors; the cookie is refreshed whenever the system changes.
 */
export default function ThemeProvider({ initial, children }: { initial: Scheme; children: React.ReactNode }) {
  const scheme = useSyncExternalStore<Scheme>(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "dark" : "light"),
    () => initial
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    document.cookie = `${SCHEME_COOKIE}=${scheme}; path=/; max-age=31536000; samesite=lax`;
    // Components now match the system, so the page can be shown (see SCHEME_SCRIPT).
    if (scheme === (window.matchMedia(QUERY).matches ? "dark" : "light")) delete root.dataset.pending;
  }, [scheme]);

  return <ConfigProvider theme={antdTheme(scheme)}>{children}</ConfigProvider>;
}
