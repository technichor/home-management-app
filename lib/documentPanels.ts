import { prisma } from "@/lib/db";
import { DOCUMENT_TYPES } from "@/lib/documentCatalog";
import { addLinkFor, DOCUMENT_INCLUDE, suggestionSlots, toDocumentView } from "@/lib/documents";

// The Documents panel on a Maintenance item's, an Account's and a household member's page (docs/domains/documents.md,
// "Panels on other pages"): the documents pointing at that record, an Add document link that pre-fills the form and
// comes back, and (for a vehicle or a member) the suggested documents it doesn't have yet.

export type DocumentsPanelAbout =
  | { kind: "item"; id: string; name: string; isVehicle: boolean }
  | { kind: "account"; id: string }
  | { kind: "contact"; id: string; name: string };

const FIELD = { item: "maintenanceItemId", account: "accountRecordId", contact: "ownerContactId" } as const;
const PARAM = { item: "item", account: "account", contact: "contact" } as const;
const PAGE = { item: "/maintenance", account: "/accounts", contact: "/contacts" } as const;

export async function documentsPanel(householdId: string, about: DocumentsPanelAbout) {
  const returnTo = `${PAGE[about.kind]}/${about.id}`;
  const [documents, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { householdId, [FIELD[about.kind]]: about.id }, include: DOCUMENT_INCLUDE, orderBy: { title: "asc" } }),
    about.kind === "account" || (about.kind === "item" && !about.isVehicle)
      ? Promise.resolve([])
      : prisma.documentDismissal.findMany({ where: { householdId }, select: { typeKey: true, subjectKey: true } }),
  ]);
  // Only the suggestions for this person or vehicle: the household's own are on /documents.
  const subject = { id: about.id, name: about.kind === "account" ? "" : about.name };
  const slots =
    about.kind === "contact"
      ? suggestionSlots(DOCUMENT_TYPES.filter((t) => t.scope === "PERSON"), [subject], [], documents, dismissals)
      : about.kind === "item" && about.isVehicle
        ? suggestionSlots(DOCUMENT_TYPES.filter((t) => t.scope === "VEHICLE"), [], [subject], documents, dismissals)
        : [];
  return {
    documents: documents.map(toDocumentView),
    openSlots: slots.filter((s) => s.state === "open").map((s) => ({ key: s.type.key, label: s.type.label, href: addLinkFor(s, returnTo) })),
    addHref: `/documents/new?${new URLSearchParams({ [PARAM[about.kind]]: about.id, returnTo })}`,
  };
}

export type DocumentsPanelData = Awaited<ReturnType<typeof documentsPanel>>;
