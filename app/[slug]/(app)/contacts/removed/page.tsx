import { prisma } from "@/lib/db";
import Link from "next/link";
import { restoreContactAction, restoreHouseholdAction } from "./actions";

export default async function RemovedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [deletedContacts, deletedHouseholds] = await Promise.all([
    prisma.contact.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.household.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Removed items</h1>
      <p className="text-sm text-gray-500">
        Items removed via CSV import or manually. Restore to make them active
        again.
      </p>

      {/* Deleted contacts */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">
          Contacts ({deletedContacts.length})
        </h2>
        {deletedContacts.length === 0 ? (
          <p className="text-sm text-gray-400">No removed contacts.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Name</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Category</th>
                  <th className="px-4 py-2">Removed</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deletedContacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/${slug}/contacts/${c.id}`}
                        className="font-medium text-gray-600 hover:underline"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">
                      {c.category}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {c.deletedAt?.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={restoreContactAction.bind(null, c.id, slug)}>
                        <button
                          type="submit"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Restore
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Deleted households */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">
          Households ({deletedHouseholds.length})
        </h2>
        {deletedHouseholds.length === 0 ? (
          <p className="text-sm text-gray-400">No removed households.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Household</th>
                  <th className="px-4 py-2">Removed</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deletedHouseholds.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/${slug}/contacts/households/${h.id}`}
                        className="font-medium text-gray-600 hover:underline"
                      >
                        {h.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {h.deletedAt?.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form
                        action={restoreHouseholdAction.bind(null, h.id, slug)}
                      >
                        <button
                          type="submit"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Restore
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
