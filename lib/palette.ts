/**
 * Domata's colors, light and dark. This is the single source: layout.tsx writes it out as CSS variables
 * (`var(--border)` and friends, used by the stylesheet and inline styles) and ThemeProvider feeds the same
 * values to Ant Design, so the two can't drift apart.
 */
export type Scheme = "light" | "dark";

export const PALETTE = {
  // The brand's UI tokens (docs/brand/identity.md; the brand's --primary is --accent here, its tint --accent-soft). The
  // rest (sidebar, subtle, hover, faint, warning) are the app's own, in the same warm neutrals.
  light: {
    bg: "#F3F1EE", // the page (brand ground)
    sidebar: "#EBE8E4",
    surface: "#FFFFFF", // cards, inputs
    subtle: "#F8F7F5", // table headers, quiet fills
    hover: "rgba(38, 38, 43, 0.05)",
    border: "#D8D5D0", // decorative dividers only
    borderStrong: "#8A8A92", // form controls (3.0:1 and up)
    text: "#26262B", // brand ink, 13.4:1 on bg
    muted: "#55555C", // 6.6:1 on bg
    faint: "#7C7C84",
    accent: "#0F7A3D", // buttons and links: 5.4:1 against white text
    accentHover: "#0C6732",
    accentSoft: "#E4F4EA", // chips, today, selected rows
    onAccent: "#FFFFFF",
    onAccentSoft: "#0B5A2C", // text on accentSoft, 7.3:1
    focusRing: "#0F7A3D",
    danger: "#B42318",
    warning: "#B45309",
    logoInk: "#26262B", // the logo's cells (the door is always logo green)
  },
  dark: {
    bg: "#26262B",
    sidebar: "#212125",
    surface: "#302F36",
    subtle: "#2B2A30",
    hover: "rgba(243, 241, 238, 0.07)",
    border: "#3F3E46",
    borderStrong: "#8E8C93", // form controls: 4.5:1 on bg
    text: "#F3F1EE",
    muted: "#B8B6B2",
    faint: "#8E8C93",
    accent: "#3DDC84", // 8.4:1 on bg
    accentHover: "#5FE59B",
    accentSoft: "#1E3D2A",
    onAccent: "#26262B",
    onAccentSoft: "#9AF0BD",
    focusRing: "#3DDC84",
    danger: "#FF8A80",
    warning: "#F5A524",
    logoInk: "#FFFFFF", // as in the reversed logo
  },
} as const;

/** The logo's door green: logo only (never a button colour), the same in both schemes. */
export const LOGO_GREEN = "#0F9246";

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
