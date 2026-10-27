import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { OWNER_NAME, toAccountView } from "@/lib/accounts";
import AccountDetailClient from "./AccountDetailClient";
import DocumentsPanel from "@/components/DocumentsPanel";
import { documentsPanel } from "@/lib/documentPanels";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const record = await prisma.accountRecord.findFirst({ where: { id, householdId }, include: OWNER_NAME });
  if (!record) notFound();
  const panel = await documentsPanel(householdId, { kind: "account", id: record.id });
  return (
    <>
      <AccountDetailClient record={toAccountView(record)} />
      <div style={{ marginTop: 24 }}>
        <DocumentsPanel panel={panel} />
      </div>
    </>
  );
}
