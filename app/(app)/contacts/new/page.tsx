import Link from "next/link";
import { Breadcrumb } from "antd";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import { householdsOf } from "@/lib/scope";
import ContactForm from "../ContactForm";

export default async function NewContactPage() {
  const householdId = await pageHouseholdId();
  const households = await prisma.household.findMany({
    where: { ...householdsOf(householdId), deletedAt: null },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link href="/contacts">Contacts</Link> }, { title: "Add contact" }]}
      />
      <ContactForm households={households} />
    </div>
  );
}
