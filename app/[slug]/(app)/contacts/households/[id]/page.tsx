import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Link from "next/link";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const myHouseholdId = session.householdId;

  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { deletedAt: null, category: "FAMILY_FRIEND" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
  });

  if (!household) notFound();

  const isOurs = household.id === myHouseholdId;
  const isDeleted = !!household.deletedAt;

  const activityLog = await prisma.activityLogEntry.findMany({
    where: { entityId: household.id, entityType: "HOUSEHOLD" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${slug}/contacts/households`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Households
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{household.displayName}</h1>
          {isOurs && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              Our household
            </span>
          )}
          {isDeleted && (
            <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
              Removed
            </span>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {household.mailingAddress && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Mailing address
              </dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {household.mailingAddress}
              </dd>
            </div>
          )}
          {household.tags.length > 0 && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Tags
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {household.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {household.notes && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">
              {household.notes}
            </dd>
          </div>
        )}
      </div>

      {/* Family & Friend members */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-700">
          Family &amp; Friend contacts ({household.contacts.length})
        </h2>
        {household.contacts.length === 0 ? (
          <p className="text-sm text-gray-400">No contacts linked to this household.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Name</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Phone</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {household.contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${slug}/contacts/${c.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {c.favorite && (
                          <span className="mr-1 text-yellow-500">★</span>
                        )}
                        {c.firstName} {c.lastName}
                        {c.nickname && (
                          <span className="ml-1 text-gray-400">
                            ({c.nickname})
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                      {c.phoneMobile ?? c.phoneHome ?? c.phoneWork ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                      {c.emailPrimary ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity log */}
      {activityLog.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Activity log</h2>
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2 text-gray-500">
                      {entry.timestamp.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      {entry.action.toLowerCase()}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {entry.source === "CSV_IMPORT" ? "CSV import" : "Manual"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
