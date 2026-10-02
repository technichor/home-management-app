import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { contactIsIn, householdsOf } from "@/lib/scope";
import ContactForm from "../../ContactForm";

export default async function EditContactPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const householdId = await pageHouseholdId();

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact || !contactIsIn(contact, householdId) || contact.deletedAt) notFound();

  const households = await prisma.household.findMany({
    where: { ...householdsOf(householdId), deletedAt: null },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link href={`/${slug}/contacts`}>Contacts</Link> },
          { title: <Link href={`/${slug}/contacts/${id}`}>{`${contact.firstName} ${contact.lastName}`}</Link> },
          { title: "Edit" },
        ]}
      />
      <ContactForm
        slug={slug}
        households={households}
        contact={{
          id,
          values: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            nickname: contact.nickname ?? undefined,
            category: contact.category,
            householdId: contact.householdId ?? undefined,
            address: contact.address ?? undefined,
            phoneMobile: contact.phoneMobile ?? undefined,
            phoneHome: contact.phoneHome ?? undefined,
            phoneWork: contact.phoneWork ?? undefined,
            emailPrimary: contact.emailPrimary ?? undefined,
            emailSecondary: contact.emailSecondary ?? undefined,
            tags: contact.tags,
            favorite: contact.favorite,
            relationshipNotes: contact.relationshipNotes ?? undefined,
            linkedFamilyMember: contact.linkedFamilyMember ?? undefined,
            importantDate1: contact.importantDate1 ?? undefined,
            importantDate1Label: contact.importantDate1Label ?? undefined,
            importantDate2: contact.importantDate2 ?? undefined,
            importantDate2Label: contact.importantDate2Label ?? undefined,
            notes: contact.notes ?? undefined,
          },
        }}
      />
    </div>
  );
}
