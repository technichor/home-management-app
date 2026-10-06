import { z } from "zod";
import { isDateString } from "@/lib/dates";

// Zod building blocks for the optional fields that the household's own records share (calendar items, maintenance
// items, account records), so each rule and its wording lives in one place.

/** Blank (empty or only spaces) becomes null; anything else is kept exactly as typed. */
export const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);

/** Blank becomes null; anything else is trimmed. */
export const trimToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** A link someone can click: http or https only (never `javascript:` or the like). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** An optional one-line text: trimmed, blank = none. `label` starts the message, e.g. "The brand". */
export const optionalText = (label: string, max: number) =>
  z.string().max(max, `${label} can be at most ${max} characters`).nullish().transform(trimToNull);

/** Optional notes, kept exactly as typed (line breaks and all); only blank notes become none. */
export const optionalNotes = (max: number) =>
  z.string().max(max, `Notes can be at most ${max.toLocaleString("en-US")} characters`).nullish().transform(blankToNull);

/** An optional http(s) link, trimmed. */
export const optionalHttpUrl = (label: string, max: number) =>
  optionalText(label, max).refine((v) => v === null || isHttpUrl(v), `${label} must start with http:// or https://`);

/** An optional YYYY-MM-DD date; `what` finishes "Choose a valid ...". */
export const optionalDate = (what: string) =>
  z.string().nullish().transform(blankToNull).refine((v) => v === null || isDateString(v), `Choose a valid ${what}`);

/** An optional id from a picker: blank = none. */
export const optionalId = () => z.string().nullish().transform(blankToNull);
