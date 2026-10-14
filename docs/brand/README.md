# Domata brand kit

The mark is a stepped house built from rounded cubbies, with one green door cell. The wordmark is "domata" in Outfit 600, converted to outlines so no font is needed to display it.

## What's in here

| Path | Use |
|---|---|
| `logo/domata-mark*.svg` | Mark only. Variants: color (default), `-reversed` (for dark grounds), `-mono-dark`, `-mono-white` |
| `logo/domata-lockup-horizontal*.svg` | Mark + wordmark side by side (headers, nav) |
| `logo/domata-lockup-stacked*.svg` | Mark above wordmark (login, splash, social, print) |
| `favicon/favicon.svg` | Simplified 3x3 mark, adapts to light/dark browser themes |
| `favicon/favicon.ico`, `favicon-16.png`, `favicon-32.png` | Fallbacks for older browsers (light rounded tile background) |
| `favicon/apple-touch-icon.png` | 180 px iOS home screen icon |
| `favicon/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | PWA icons (maskable keeps the mark inside the safe zone) |
| `social/og-image.png` | 1200x630 link-preview image |
| `tokens.css` | Brand colors plus light/dark semantic UI tokens with verified contrast |
| `site.webmanifest`, `head-snippet.html` | Drop-in web app setup (paths assume the site root) |
| `preview.png` | One-page contact sheet of the main assets |
| `source/` | Scripts that regenerate everything above |

## Colors

| Role | Value |
|---|---|
| Ink | `#26262B` |
| Ground | `#F3F1EE` |
| Logo green | `#0F9246` (the only green in the logo, same in light and dark) |

UI colors are different on purpose and live in `tokens.css`: buttons and links use a darker green on light backgrounds (`#0F7A3D`) and a brighter green on dark (`#3DDC84`) so text stays readable. Do not use the logo green for button backgrounds with white text (3.8:1, below the 4.5:1 minimum).

## Usage rules

- **Clear space:** keep at least one cell width (about 1/6 of the mark's width) free on all sides.
- **Minimum sizes:** full mark 24 px wide; horizontal lockup 96 px wide. Below that, use the simplified favicon mark.
- **Grounds:** color logo on `#F3F1EE` or white; reversed logo on `#26262B` or other dark grounds. If neither works, use a mono version.
- **Don't:** recolor the door, change the green, stretch or rotate the mark, add effects, retype the wordmark in another font, or put the lockup on busy images.

## Typeface

Outfit (SIL Open Font License), weight 600, for the wordmark and display headings. Self-host it (for example with `next/font` or `@fontsource/outfit`) rather than loading it from Google at runtime.

## Regenerating

`source/gen_assets.py` writes the SVGs and icon sources, `source/render.mjs` renders PNGs (needs `@resvg/resvg-js`), and `source/make_ico.py` builds `favicon.ico`. The script reads the Outfit 600 `.woff` from `@fontsource/outfit`.
