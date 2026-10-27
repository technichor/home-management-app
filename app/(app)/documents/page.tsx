import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { memberOptionsOf } from "@/lib/householdMembers";
import { DOCUMENT_INCLUDE, toDocumentView } from "@/lib/documents";
import DocumentsClient from "./DocumentsClient";

/** The household's documents, and the checklist of what it should have (computed in the browser, so it can filter). */
export default async function DocumentsPage() {
  const householdId = await pageHouseholdId();
  const [documents, members, vehicles, dismissals] = await Promise.all([
    prisma.document.findMany({ where: { householdId }, include: DOCUMENT_INCLUDE, orderBy: { title: "asc" } }),
    memberOptionsOf(householdId),
    prisma.maintenanceItem.findMany({ where: { householdId, category: "VEHICLE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.documentDismissal.findMany({ where: { householdId }, select: { typeKey: true, subjectKey: true } }),
  ]);
  return (
    <DocumentsClient
      documents={documents.map(toDocumentView)}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      vehicles={vehicles}
      dismissals={dismissals}
    />
  );
}
