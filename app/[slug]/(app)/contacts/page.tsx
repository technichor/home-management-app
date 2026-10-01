import { prisma } from "@/lib/db";
import { ContactCategory } from "@prisma/client";
import { Space } from "antd";
import ContactsFilter from "./ContactsFilter";
import ContactsTable from "./ContactsTable";

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    tag?: string;
    favorites?: string;
  }>;
}) {
  const [{ slug }, filters] = await Promise.all([params, searchParams]);

  const where = {
    deletedAt: null,
    ...(filters.q
      ? {
          OR: [
            { firstName: { contains: filters.q, mode: "insensitive" as const } },
            { lastName: { contains: filters.q, mode: "insensitive" as const } },
            { nickname: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.category ? { category: filters.category as ContactCategory } : {}),
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
    ...(filters.favorites === "1" ? { favorite: true } : {}),
  };

  const [contacts, allContacts] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { household: { select: { displayName: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.contact.findMany({
      where: { deletedAt: null },
      select: { tags: true },
    }),
  ]);

  const allTags = [...new Set(allContacts.flatMap((c) => c.tags))].sort();

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        Contacts{contacts.length > 0 ? ` (${contacts.length})` : ""}
      </h4>

      <ContactsFilter slug={slug} allTags={allTags} defaults={filters} />

      <ContactsTable contacts={contacts} slug={slug} />
    </Space>
  );
}
