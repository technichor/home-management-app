import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ContactCategory, ActivityAction } from "@prisma/client";

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  FAMILY_FRIEND: "Family & Friend",
  SERVICE_PROVIDER: "Service Provider",
  MEDICAL_SCHOOL: "Medical / School",
  HOUSEHOLD_ADMIN: "Household Admin",
};

const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
  RESTORED: "Restored",
};

function Field({
  label,
  value,
  note,
}: {
  label: string;
  value?: string | null;
  note?: string;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
        {note && <span className="ml-1 normal-case text-gray-400">({note})</span>}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      household: {
        select: {
          id: true,
          displayName: true,
          mailingAddress: true,
          urlSlug: true,
        },
      },
    },
  });

  if (!contact) notFound();

  const activityLog = await prisma.activityLogEntry.findMany({
    where: { entityId: contact.id, entityType: "CONTACT" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const isDeleted = !!contact.deletedAt;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/${slug}/contacts`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Contacts
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            {contact.firstName} {contact.lastName}
            {contact.nickname && (
              <span className="ml-2 text-base font-normal text-gray-400">
                ({contact.nickname})
              </span>
            )}
            {contact.favorite && (
              <span className="ml-2 text-yellow-500" title="Favorite">
                ★
              </span>
            )}
          </h1>
          {isDeleted && (
            <span className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
              Removed
            </span>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" value={CATEGORY_LABELS[contact.category]} />

          {/* Address — inherited from household for FAMILY_FRIEND */}
          {contact.category === "FAMILY_FRIEND" ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Address{" "}
                <span className="normal-case text-gray-400">
                  (from household)
                </span>
              </dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {contact.household?.mailingAddress ? (
                  <>
                    {contact.household.mailingAddress}
                    {contact.household.urlSlug && (
                      <span className="ml-1 text-gray-400">
                        —{" "}
                        <Link
                          href={`/${slug}/households/${contact.household.id}`}
                          className="hover:underline"
                        >
                          {contact.household.displayName}
                        </Link>
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">
                    No address on household record
                    {contact.household && (
                      <>
                        {" — "}
                        <Link
                          href={`/${slug}/households/${contact.household.id}`}
                          className="hover:underline"
                        >
                          {contact.household.displayName}
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </dd>
            </div>
          ) : (
            <Field label="Address" value={contact.address} />
          )}

          {contact.household && contact.category !== "FAMILY_FRIEND" && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Household
              </dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                <Link
                  href={`/${slug}/households/${contact.household.id}`}
                  className="hover:underline"
                >
                  {contact.household.displayName}
                </Link>
              </dd>
            </div>
          )}

          <Field label="Mobile" value={contact.phoneMobile} />
          <Field label="Home phone" value={contact.phoneHome} />
          <Field label="Work phone" value={contact.phoneWork} />
          <Field label="Primary email" value={contact.emailPrimary} />
          <Field label="Secondary email" value={contact.emailSecondary} />
          <Field label="Linked family member" value={contact.linkedFamilyMember} />

          {contact.importantDate1 && (
            <Field
              label={contact.importantDate1Label ?? "Important date 1"}
              value={contact.importantDate1}
            />
          )}
          {contact.importantDate2 && (
            <Field
              label={contact.importantDate2Label ?? "Important date 2"}
              value={contact.importantDate2}
            />
          )}
        </dl>

        {contact.tags.length > 0 && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Tags
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {contact.tags.map((tag) => (
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

        {contact.relationshipNotes && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Relationship notes
            </dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              {contact.relationshipNotes}
            </dd>
          </div>
        )}

        {contact.notes && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">
              {contact.notes}
            </dd>
          </div>
        )}
      </div>

      {/* Activity log */}
      {activityLog.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">
            Activity log
          </h2>
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
                    <td className="px-4 py-2">{ACTION_LABELS[entry.action]}</td>
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
