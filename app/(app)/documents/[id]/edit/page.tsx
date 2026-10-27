import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { DOCUMENT_INCLUDE, toDocumentView } from "@/lib/documents";
import { documentFormOptions } from "../../formOptions";
import DocumentForm from "../../DocumentForm";

export default async function EditDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const [{ id }, { returnTo }] = await Promise.all([params, searchParams]);
  const householdId = await pageHouseholdId();
  const [doc, options] = await Promise.all([prisma.document.findFirst({ where: { id, householdId }, include: DOCUMENT_INCLUDE }), documentFormOptions(householdId)]);
  if (!doc) notFound();
  return <DocumentForm options={options} record={toDocumentView(doc)} returnTo={safeNext(returnTo)} />;
}
