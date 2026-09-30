import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Link from "next/link";
import { ContactCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
};

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

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const householdId = session.householdId;

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

  const contacts = await prisma.contact.findMany({
    where,
    include: { household: { select: { displayName: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Collect all tags for the filter dropdown
  const allContacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: { tags: true },
  });
  const allTags = [...new Set(allContacts.flatMap((c) => c.tags))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Contacts{contacts.length > 0 ? ` (${contacts.length})` : ""}
        </h1>
        <Link
          href={`/${slug}/import`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Import CSV →
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={filters.q}
          type="search"
          placeholder="Search by name…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <select
          name="category"
          defaultValue={filters.category ?? ""}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select
            name="tag"
            defaultValue={filters.tag ?? ""}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            name="favorites"
            value="1"
            defaultChecked={filters.favorites === "1"}
          />
          Favorites only
        </label>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Filter
        </button>
        {(filters.q || filters.category || filters.tag || filters.favorites) && (
          <Link
            href={`/${slug}/contacts`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {filters.q || filters.category || filters.tag || filters.favorites
            ? "No contacts match those filters."
            : "No contacts yet. Use Import CSV to add contacts."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="hidden px-4 py-2 sm:table-cell">Category</th>
                <th className="hidden px-4 py-2 md:table-cell">Household</th>
                <th className="hidden px-4 py-2 lg:table-cell">Phone</th>
                <th className="hidden px-4 py-2 lg:table-cell">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${slug}/contacts/${c.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {c.favorite && (
                        <span className="mr-1 text-yellow-500" title="Favorite">
                          ★
                        </span>
                      )}
                      {c.firstName} {c.lastName}
                      {c.nickname && (
                        <span className="ml-1 text-gray-400">
                          ({c.nickname})
                        </span>
                      )}
                    </Link>
                    {c.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                    {CATEGORY_LABELS[c.category]}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                    {c.household?.displayName ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                    {c.phoneMobile ?? c.phoneHome ?? c.phoneWork ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                    {c.emailPrimary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
