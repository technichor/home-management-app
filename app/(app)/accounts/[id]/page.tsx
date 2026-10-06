import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { calendarName } from "@/lib/contactDates";
import AccountDetailClient from "./AccountDetailClient";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const record = await prisma.accountRecord.findFirst({ where: { id, householdId }, include: { owner: { select: { firstName: true, nickname: true } } } });
  if (!record) notFound();
  return (
    <AccountDetailClient
      record={{
        id: record.id,
        name: record.name,
        kind: record.kind,
        status: record.status,
        institution: record.institution,
        lastFour: record.lastFour,
        ownerContactId: record.ownerContactId,
        ownerName: record.owner ? calendarName(record.owner) : null,
        website: record.website,
        phone: record.phone,
        notes: record.notes,
      }}
    />
  );
}
