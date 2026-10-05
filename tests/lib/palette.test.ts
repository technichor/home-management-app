import { describe, it, expect } from "vitest";
import { PALETTE, SCHEME_SCRIPT, paletteCss } from "@/lib/palette";

describe("palette", () => {
  it("gives light and dark the same set of colors", () => {
    expect(Object.keys(PALETTE.dark).sort()).toEqual(Object.keys(PALETTE.light).sort());
  });

  it("writes every color as a kebab-case CSS variable, light on :root and dark under data-theme", () => {
    const css = paletteCss();
    expect(css).toContain(":root{color-scheme:light;");
    expect(css).toContain(':root[data-theme="dark"]{color-scheme:dark;');
    expect(css).toContain("--border-strong:#d9d9de;");
    expect(css).toContain("--accent-soft:rgba(45, 212, 191, 0.14);");
    expect(css).toContain("--on-accent:#042f2e;");
  });

  it("sets the scheme before paint from the system preference", () => {
    expect(SCHEME_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(SCHEME_SCRIPT).toContain("dataset.theme");
  });

  it("marks the page pending only when it changes the scheme the server rendered", () => {
    const run = (system: "dark" | "light", server: string) => {
      const root: { dataset: Record<string, string> } = { dataset: { theme: server } };
      const fn = new Function("document", "matchMedia", SCHEME_SCRIPT);
      fn({ documentElement: root }, () => ({ matches: system === "dark" }));
      return root.dataset;
    };
    expect(run("dark", "light")).toEqual({ theme: "dark", pending: "1" });
    expect(run("light", "dark")).toEqual({ theme: "light", pending: "1" });
    expect(run("dark", "dark")).toEqual({ theme: "dark" });
    expect(run("light", "light")).toEqual({ theme: "light" });
  });

  it("never throws if the browser can't answer", () => {
    expect(() => new Function("document", "matchMedia", SCHEME_SCRIPT)({ documentElement: { dataset: {} } }, () => { throw new Error("no"); })).not.toThrow();
  });
});
