// Slugs name a household's routes until the /[slug] routes are replaced; these collide with
// top-level pages, so a household can't use them.
export const RESERVED_SLUGS = ["login", "signup", "onboarding", "forgot-password", "reset-password", "verify-email", "setup", "invite", "api"];

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length >= 2 ? base : "household";
}

// The first of base, base-2, base-3... that is neither taken nor reserved.
export function pickSlug(base: string, taken: string[]): string {
  const unavailable = new Set([...taken, ...RESERVED_SLUGS]);
  if (!unavailable.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!unavailable.has(candidate)) return candidate;
  }
}
