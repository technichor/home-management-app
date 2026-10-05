/**
 * Domata's colors, light and dark. This is the single source: layout.tsx writes it out as CSS variables
 * (`var(--border)` and friends, used by the stylesheet and inline styles) and ThemeProvider feeds the same
 * values to Ant Design, so the two can't drift apart.
 */
export type Scheme = "light" | "dark";

export const PALETTE = {
  light: {
    bg: "#ffffff", // the page
    sidebar: "#f7f7f8",
    surface: "#ffffff", // cards, inputs
    subtle: "#fafafa", // table headers, quiet fills
    hover: "rgba(0, 0, 0, 0.045)",
    border: "#ececee",
    borderStrong: "#d9d9de",
    text: "#1c1c1f",
    muted: "#6b6b76",
    faint: "#9a9aa5",
    accent: "#0f766e",
    accentHover: "#115e59",
    accentSoft: "#e3f2ef",
    onAccent: "#ffffff",
    danger: "#cf1322",
    warning: "#b45309",
  },
  dark: {
    bg: "#111113",
    sidebar: "#0c0c0e",
    surface: "#18181b",
    subtle: "#151518",
    hover: "rgba(255, 255, 255, 0.07)",
    border: "#2a2a30",
    borderStrong: "#3a3a42",
    text: "#ececf0",
    muted: "#a0a0ab",
    faint: "#6f6f7a",
    accent: "#2dd4bf",
    accentHover: "#5eead4",
    accentSoft: "rgba(45, 212, 191, 0.14)",
    onAccent: "#042f2e",
    danger: "#ff6b6b",
    warning: "#f5a524",
  },
} as const;

const cssName = (key: string) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

function block(scheme: Scheme): string {
  return Object.entries(PALETTE[scheme])
    .map(([key, value]) => `${cssName(key)}:${value};`)
    .join("");
}

/** The :root variables for both schemes, as CSS text. */
export function paletteCss(): string {
  return `:root{color-scheme:light;${block("light")}}:root[data-theme="dark"]{color-scheme:dark;${block("dark")}}`;
}

/**
 * Runs before first paint. It sets the CSS-variable scheme from the system. When that differs from what the
 * server rendered Ant Design in (a first visit, or the system changed), it also marks the page "pending" so
 * the body stays hidden until ThemeProvider has switched Ant Design too, instead of flashing wrong-colored
 * components. (globals.css reveals it anyway after a second, in case scripts fail.)
 */
export const SCHEME_SCRIPT = `(function(){try{var d=document.documentElement,s=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(d.dataset.theme!==s){d.dataset.theme=s;d.dataset.pending="1"}}catch(e){}})()`;

export const SCHEME_COOKIE = "scheme";
