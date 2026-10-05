// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { theme } from "antd";
import ThemeProvider, { antdTheme } from "@/components/ThemeProvider";
import { PALETTE } from "@/lib/palette";

const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
  document.documentElement.removeAttribute("data-theme");
  delete document.documentElement.dataset.pending;
  document.cookie = "scheme=; path=/; max-age=0";
});

function systemPrefers(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    media: "",
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  return {
    change(next: boolean) {
      media.matches = next;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

describe("antdTheme", () => {
  it("uses the default algorithm and the light palette in light", () => {
    const t = antdTheme("light");
    expect(t.algorithm).toBe(theme.defaultAlgorithm);
    expect(t.token.colorPrimary).toBe(PALETTE.light.accent);
    expect(t.token.colorBorderSecondary).toBe(PALETTE.light.border);
    expect(t.components.Table.rowHoverBg).toBe(PALETTE.light.hover);
  });

  it("uses the dark algorithm and the dark palette in dark, with readable text on the accent", () => {
    const t = antdTheme("dark");
    expect(t.algorithm).toBe(theme.darkAlgorithm);
    expect(t.token.colorPrimary).toBe(PALETTE.dark.accent);
    expect(t.token.colorTextLightSolid).toBe(PALETTE.dark.onAccent);
    expect(t.token.boxShadowSecondary).toContain(".5)");
  });

  it("is flat: no shadows on buttons or cards", () => {
    const t = antdTheme("light");
    expect(t.components.Button.defaultShadow).toBe("none");
    expect(t.components.Card.boxShadowTertiary).toBe("none");
  });
});

describe("ThemeProvider", () => {
  it("renders its children", () => {
    systemPrefers(false);
    render(<ThemeProvider initial="light"><p>inside</p></ThemeProvider>);
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("follows the system: sets data-theme and remembers it in a cookie", () => {
    systemPrefers(true);
    render(<ThemeProvider initial="light"><p>x</p></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("scheme=dark");
  });

  it("shows a page that was held back once Ant Design matches the system", () => {
    systemPrefers(true);
    document.documentElement.dataset.pending = "1";
    render(<ThemeProvider initial="light"><p>x</p></ThemeProvider>);
    expect(document.documentElement.dataset.pending).toBeUndefined();
  });

  it("keeps the page held back through hydration until the client matches the system", async () => {
    // The server rendered light; the browser is dark. The first (hydrating) pass is still light and must not
    // reveal the page; the pass after it, in dark, does.
    const page = <ThemeProvider initial="light"><p>x</p></ThemeProvider>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(page);
    document.body.append(container);
    systemPrefers(true);
    document.documentElement.dataset.pending = "1";
    await act(async () => {
      hydrateRoot(container, page);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.pending).toBeUndefined();
    container.remove();
  });

  it("switches when the system changes, and stops listening when removed", () => {
    const system = systemPrefers(false);
    const { unmount } = render(<ThemeProvider initial="light"><p>x</p></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(system.listeners.size).toBe(1);
    act(() => system.change(true));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("scheme=dark");
    unmount();
    expect(system.listeners.size).toBe(0);
  });
});
