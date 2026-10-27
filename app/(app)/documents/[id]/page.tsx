import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { memberOptionsOf } from "@/lib/householdMembers";
import { DOCUMENT_INCLUDE, toDocumentView } from "@/lib/documents";
import DocumentDetailClient from "./DocumentDetailClient";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const [doc, members] = await Promise.all([prisma.document.findFirst({ where: { id, householdId }, include: DOCUMENT_INCLUDE }), memberOptionsOf(householdId)]);
  if (!doc) notFound();
  const ownerRemoved = doc.ownerContactId !== null && !members.some((m) => m.id === doc.ownerContactId);
  return <DocumentDetailClient doc={toDocumentView(doc)} ownerRemoved={ownerRemoved} />;
}
