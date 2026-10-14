import { BRAND_NAME } from "@/lib/brand";
import { LOGO_ART } from "./logoArt";

export type LogoVariant = keyof typeof LOGO_ART;

/**
 * The Domata logo (docs/brand/identity.md), drawn inline so it follows the scheme: the cells and wordmark in ink on
 * light, white on dark (the reversed logo); the door always logo green. Minimum widths: the mark 24px, the horizontal
 * lockup 96px. `decorative` hides it from screen readers when the name is written next to it.
 */
export default function Logo({ variant = "horizontal", width, decorative = false }: { variant?: LogoVariant; width: number; decorative?: boolean }) {
  const art = LOGO_ART[variant];
  return (
    <svg
      className="logo"
      viewBox={art.viewBox}
      width={width}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": BRAND_NAME })}
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}
