import { z } from "zod";
import type { DocumentCategory } from "@prisma/client";
import { isHttpUrl, optionalId, optionalNotes, optionalText, trimToNull } from "@/lib/formFields";
import { DOCUMENT_CATEGORIES, typeByKey, type DocumentType } from "@/lib/documentCatalog";
import { calendarName } from "@/lib/contactDates";

// The Documents module's rules (docs/domains/documents.md): what a document's form accepts, its default title, the
// warning for things that look like ID or account numbers, and the suggestion slots (which documents a family should
// have, and which of them it has), and how a stored document is shown. Pure: no database here.

export const MAX_TITLE = 200;
export const MAX_LINKS = 5;
export const MAX_URL = 2000;
export const MAX_LINK_LABEL = 50;
export const MAX_ORIGINAL_LOCATION = 200;
export const MAX_NOTES = 5000;

const CATEGORY_KEYS = DOCUMENT_CATEGORIES.map((c) => c.key) as [DocumentCategory, ...DocumentCategory[]];

const linkSchema = z.object({
  url: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, "Add the link")
    .refine((v) => v.length <= MAX_URL, `A link can be at most ${MAX_URL.toLocaleString("en-US")} characters`)
    .refine(isHttpUrl, "A link must start with http:// or https://"),
  label: optionalText("A link's label", MAX_LINK_LABEL),
});

/**
 * A document as the form sends it. With a type, the category is the type's (whatever the browser sent); a custom
 * document (no type) needs its category. A type for each person needs whose it is, a type for each vehicle needs the
 * vehicle. (That the people, item and account belong to the household, and that the item is a vehicle, is checked by
 * the action, which can look them up.)
 */
export const documentSchema = z
  .object({
    title: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, "Give it a title")
      .refine((v) => v.length <= MAX_TITLE, `The title can be at most ${MAX_TITLE} characters`),
    typeKey: z
      .string()
      .nullish()
      .transform(trimToNull)
      .refine((v) => v === null || typeByKey(v) !== undefined, "Choose a type from the list"),
    category: z.enum(CATEGORY_KEYS).nullish(),
    ownerContactId: optionalId(),
    maintenanceItemId: optionalId(),
    accountRecordId: optionalId(),
    links: z.array(linkSchema).min(1, "Add a link to where the document is").max(MAX_LINKS, `A document can have at most ${MAX_LINKS} links`),
    originalLocation: optionalText("Where the original is", MAX_ORIGINAL_LOCATION),
    notes: optionalNotes(MAX_NOTES),
  })
  .superRefine((v, ctx) => {
    const type = typeByKey(v.typeKey);
    if (!type && !v.category) ctx.addIssue({ code: "custom", message: "Choose a category", path: ["category"] });
    if (type?.scope === "PERSON" && !v.ownerContactId) ctx.addIssue({ code: "custom", message: "Choose whose it is", path: ["ownerContactId"] });
    if (type?.scope === "VEHICLE" && !v.maintenanceItemId) ctx.addIssue({ code: "custom", message: "Choose the vehicle", path: ["maintenanceItemId"] });
  })
  .transform(({ category, ...v }) => ({ ...v, category: typeByKey(v.typeKey)?.category ?? category! }));

export type DocumentFields = z.input<typeof documentSchema>;
export type DocumentData = z.output<typeof documentSchema>;

/** The title a new document starts with: the type's label, then " – " and the person's first name or the vehicle. */
export function defaultTitle(type: DocumentType, subjectName?: string | null): string {
  return type.scope !== "HOUSEHOLD" && subjectName ? `${type.label} – ${subjectName}` : type.label;
}

const SSN = /\d{3}-?\d{2}-?\d{4}/;
const LONG_NUMBER = /\d{8,}/;

/**
 * Whether any of these texts (title, link labels, where the original is, notes: never the links, which are full of
 * digits) looks like an ID or account number. Only a warning: such numbers belong in the file, not in Domata.
 */
export function looksSensitive(texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && (SSN.test(t) || LONG_NUMBER.test(t)));
}

// ---- Suggestion slots ----

export type SlotSubject = { kind: "household" } | { kind: "contact"; id: string; name: string } | { kind: "item"; id: string; name: string };

/** How a slot's subject is stored on a dismissal: "household", "contact:<id>" or "item:<id>". */
export function subjectKeyOf(subject: SlotSubject): string {
  return subject.kind === "household" ? "household" : `${subject.kind}:${subject.id}`;
}

export type SlotState = "added" | "dismissed" | "open";

export type Slot = {
  type: DocumentType;
  subject: SlotSubject;
  subjectKey: string;
  state: SlotState;
  /** The documents that fill it (none unless added). */
  documentIds: string[];
};

export type SlotDocument = { id: string; typeKey: string | null; ownerContactId: string | null; maintenanceItemId: string | null };

/**
 * Every suggestion slot and its state, for the given catalog: one per suggested HOUSEHOLD type, one per suggested
 * PERSON type for each current member, one per suggested VEHICLE type for each vehicle. A slot is added when a
 * document of its type is for its subject (any document of the type, for a household slot), else dismissed if the
 * household said it doesn't apply, else open. Adding wins over a dismissal. Custom documents (no type) never fill a
 * slot, and members who have left and items that aren't vehicles get no slots.
 */
export function suggestionSlots(
  catalog: readonly DocumentType[],
  members: { id: string; name: string }[],
  vehicles: { id: string; name: string }[],
  documents: SlotDocument[],
  dismissals: { typeKey: string; subjectKey: string }[],
): Slot[] {
  const dismissed = new Set(dismissals.map((d) => `${d.typeKey}|${d.subjectKey}`));
  const slots: Slot[] = [];
  for (const type of catalog) {
    if (!type.suggested) continue;
    const ofType = documents.filter((d) => d.typeKey === type.key);
    const subjects: { subject: SlotSubject; fills: (d: SlotDocument) => boolean }[] =
      type.scope === "HOUSEHOLD"
        ? [{ subject: { kind: "household" }, fills: () => true }]
        : type.scope === "PERSON"
          ? members.map((m) => ({ subject: { kind: "contact", id: m.id, name: m.name }, fills: (d) => d.ownerContactId === m.id }))
          : vehicles.map((v) => ({ subject: { kind: "item", id: v.id, name: v.name }, fills: (d) => d.maintenanceItemId === v.id }));
    for (const { subject, fills } of subjects) {
      const subjectKey = subjectKeyOf(subject);
      const documentIds = ofType.filter(fills).map((d) => d.id);
      const state: SlotState = documentIds.length > 0 ? "added" : dismissed.has(`${type.key}|${subjectKey}`) ? "dismissed" : "open";
      slots.push({ type, subject, subjectKey, state, documentIds });
    }
  }
  return slots;
}

/** "Added of suggested", leaving dismissed slots out of both. */
export function slotCounts(slots: Slot[]): { added: number; suggested: number } {
  const counted = slots.filter((s) => s.state !== "dismissed");
  return { added: counted.filter((s) => s.state === "added").length, suggested: counted.length };
}

// ---- A stored document, as the pages hand it to the browser ----

/** Include this when loading a document, so toDocumentView can name whose it is, its item and account, and its links. */
export const DOCUMENT_INCLUDE = {
  owner: { select: { firstName: true, nickname: true } },
  maintenanceItem: { select: { name: true } },
  accountRecord: { select: { name: true } },
  links: { orderBy: { position: "asc" }, select: { url: true, label: true } },
} as const;

type StoredDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  typeKey: string | null;
  ownerContactId: string | null;
  maintenanceItemId: string | null;
  accountRecordId: string | null;
  originalLocation: string | null;
  notes: string | null;
  owner: { firstName: string; nickname: string | null } | null;
  maintenanceItem: { name: string } | null;
  accountRecord: { name: string } | null;
  links: { url: string; label: string | null }[];
};

export function toDocumentView(doc: StoredDocument) {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    typeKey: doc.typeKey,
    ownerContactId: doc.ownerContactId,
    /** Kept even after the member is removed from the household. */
    ownerName: doc.owner ? calendarName(doc.owner) : null,
    maintenanceItemId: doc.maintenanceItemId,
    itemName: doc.maintenanceItem?.name ?? null,
    accountRecordId: doc.accountRecordId,
    accountName: doc.accountRecord?.name ?? null,
    links: doc.links.map((l) => ({ url: l.url, label: l.label })),
    originalLocation: doc.originalLocation,
    notes: doc.notes,
  };
}

export type DocumentView = ReturnType<typeof toDocumentView>;
