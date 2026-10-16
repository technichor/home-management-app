import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { householdsOf } from "@/lib/scope";
import ContactForm from "../ContactForm";

/** Add a contact. `?household=` (from a household's page) starts a Family & Friend in that household. */
export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ household?: string }> }) {
  const householdId = await pageHouseholdId();
  const { household: from } = await searchParams;
  const households = await prisma.household.findMany({
    where: { ...householdsOf(householdId), deletedAt: null },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  // Only a household in this directory (and not removed) is taken from the address.
  const inHousehold = households.find((h) => h.id === from);

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={
          inHousehold
            ? [
                { title: <Link href="/contacts/households">Households</Link> },
                { title: <Link href={`/contacts/households/${inHousehold.id}`}>{inHousehold.displayName}</Link> },
                { title: "Add person" },
              ]
            : [{ title: <Link href="/contacts">Contacts</Link> }, { title: "Add contact" }]
        }
      />
      <ContactForm households={households} householdId={inHousehold?.id} />
    </div>
  );
}
