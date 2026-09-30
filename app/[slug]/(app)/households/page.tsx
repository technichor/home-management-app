import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { sessionOptions, SessionData } from "@/lib/session";
import Link from "next/link";

export default async function HouseholdsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  const myHouseholdId = session.householdId;

  const households = await prisma.household.findMany({
    where: { deletedAt: null },
    include: {
      contacts: {
        where: { deletedAt: null, category: "FAMILY_FRIEND" },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
    orderBy: { displayName: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Households ({households.length})
        </h1>
        <Link
          href={`/${slug}/import`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Import CSV →
        </Link>
      </div>

      {households.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No households yet. Use Import CSV to add households.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {households.map((h) => {
            const isOurs = h.id === myHouseholdId;
            return (
              <Link
                key={h.id}
                href={`/${slug}/households/${h.id}`}
                className="block rounded-md border border-gray-200 bg-white p-4 hover:border-gray-400"
              >
                <div className="flex items-start justify-between">
                  <span className="font-medium text-gray-900">
                    {h.displayName}
                  </span>
                  {isOurs && (
                    <span className="ml-2 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                      Our household
                    </span>
                  )}
                </div>
                {h.mailingAddress && (
                  <p className="mt-1 text-sm text-gray-500">{h.mailingAddress}</p>
                )}
                {h.contacts.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    {h.contacts
                      .map((c) => `${c.firstName} ${c.lastName}`)
                      .join(", ")}
                  </p>
                )}
                {h.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {h.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
