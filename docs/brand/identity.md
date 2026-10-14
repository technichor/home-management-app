# Domata brand identity (final)

> **Where things live in this repo** (moved from the delivered `domata-brand/` kit):
> - **Served to visitors** (`public/`):
>   - the favicons and app icons;
>   - `site.webmanifest`;
>   - `og-image.png`;
>   - the 12 logo SVGs, in `public/brand/`.
> - **Reference** (`docs/brand/`):
>   - this file and the kit's `README.md`;
>   - `preview.png`;
>   - `tokens.css` and `head-snippet.html`;
>   - `source/`, the regeneration scripts. Their output still has the kit's layout (`logo/`, `favicon/`, `social/`); copy the results into `public/` as above.
>
> **How the app uses it:**
> - **Colours:** the UI tokens below are in `lib/palette.ts`, the app's single colour source, which feeds both the CSS variables and Ant Design. The names differ:
>   - `--primary` is `--accent`;
>   - `--primary-tint` is `--accent-soft`;
>   - `--on-primary-tint` is `--on-accent-soft`;
>   - `--text-muted` is `--muted`.
>
>   `tokens.css` itself is not imported.
> - **Logo:** `components/Logo.tsx` draws the logo inline. Its ink follows the theme (ink on light, white on dark, as in the reversed files), and the door stays logo green.
> - **Head tags:** the favicon, manifest, theme colour and social tags are set through Next metadata in `app/layout.tsx`.
> - **Font:** Outfit 600 comes from `next/font` (self-hosted at build time) and is used for headings.
> - **Tailwind:** none. The app uses Ant Design, so the kit's Tailwind notes don't apply.

Domain: domata.app. Logo direction chosen: **04 "Pigeonholes"**.

## The mark
A stepped house built from rounded cubbie squares (pyramid of 1, 3, 5, 5 cells), with one green "door" cell at the bottom center. Lowercase wordmark "domata" in **Outfit 600** (SIL OFL), converted to outlines in all logo SVGs.

Lockups: mark only, horizontal (mark left, wordmark right), stacked (mark above wordmark; gap between mark and word was cut ~50% from the first draft). Each comes in color, reversed (dark ground), mono-dark, mono-white.

## Colors
- Ink `#26262B`, Ground `#F3F1EE`, White `#FFFFFF`
- **Logo green `#0F9246`**: the only green in the logo, identical in light and dark. Contrast 3.6 on ground, 4.0 on white, 3.7 on ink. Logo use only, not for buttons with white text (below 4.5:1).
- Orange was dropped because it was too close to Home Depot's orange (#F96302).
- Competitor palettes only partly confirmed (HomeZada teal ~#007a86, FamilyWall blue ~#2d89ef, from page metadata). Not a full collision check.

## UI tokens (separate from the logo green, tuned for accessibility)

| Token | Light | Dark |
|---|---|---|
| bg | `#F3F1EE` | `#26262B` |
| surface | `#FFFFFF` | `#302F36` |
| text | `#26262B` (13.4) | `#F3F1EE` |
| muted | `#55555C` (6.6) | `#B8B6B2` |
| border | `#D8D5D0` (decorative only) | |
| border-strong | `#8A8A92` (form controls, 3.0+) | `#8E8C93` |
| primary | `#0F7A3D` (5.4 with white text) | `#3DDC84` (8.4) |
| hover | `#0C6732` | `#5FE59B` |
| on-primary | | `#26262B` |
| tint / text on tint | `#E4F4EA` / `#0B5A2C` | `#1E3D2A` / `#9AF0BD` |
| danger | `#B42318` | `#FF8A80` |

Full CSS with light/dark switching (OS preference, `data-theme` override) is in the kit's `tokens.css`.

## Assets in the kit (domata-brand.zip)
- `logo/` 12 SVGs (mark, horizontal, stacked × 4 variants)
- `favicon/`: `favicon.svg` (simplified 3×3 mark, adapts to dark mode), `favicon.ico` (16/32/48), 16/32 PNG, `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`
- `social/og-image.png` (1200×630)
- `tokens.css`, `site.webmanifest`, `head-snippet.html`, `README.md`, `preview.png`, `source/` (regeneration scripts)

## Usage rules
Clear space ≈ one cell width. Minimum width: mark 24px, horizontal lockup 96px; below that use the simplified favicon mark. Don't recolor the door, change the green, stretch, add effects, or retype the wordmark. Self-host Outfit (`next/font` or `@fontsource/outfit`).

## Open items before public launch
- USPTO trademark search for "Domata" (classes 9 and 42); attorney review optional
- Reverse image search (Google Lens / TinEye) of the mark
- Confirm competitor icon colors via app store listings
