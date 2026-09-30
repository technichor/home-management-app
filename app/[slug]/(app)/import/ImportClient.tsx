"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  validateImportAction,
  applyImportAction,
  ValidateImportResult,
  ValidateSuccess,
} from "./actions";
import { ImportDiff, ParseError, ParsedHousehold, ParsedContact } from "@/lib/csv";

type Step = "upload" | "diff" | "success";

export default function ImportClient({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [validated, setValidated] = useState<ValidateSuccess | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result: ValidateImportResult = await validateImportAction(formData);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setValidated(result);
      setStep("diff");
    });
  }

  function handleConfirm() {
    if (!validated) return;
    startTransition(async () => {
      const result = await applyImportAction(slug, {
        parsedHouseholds: validated.parsedHouseholds,
        parsedContacts: validated.parsedContacts,
        householdsCSV: validated.householdsCSV,
        contactsCSV: validated.contactsCSV,
      });
      if (!result.ok) {
        setApplyError(result.error ?? "Unknown error.");
        return;
      }
      setStep("success");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Import CSV</h1>
        <div className="flex gap-2 text-sm">
          <a
            href={`/${slug}/api/export?file=households`}
            className="text-gray-500 hover:text-gray-700"
          >
            Download households.csv ↓
          </a>
          <span className="text-gray-300">|</span>
          <a
            href={`/${slug}/api/export?file=contacts`}
            className="text-gray-500 hover:text-gray-700"
          >
            Download contacts.csv ↓
          </a>
        </div>
      </div>

      {step === "upload" && (
        <UploadStep
          onSubmit={handleUpload}
          errors={errors}
          isPending={isPending}
        />
      )}

      {step === "diff" && validated && (
        <DiffStep
          diff={validated.diff}
          onConfirm={handleConfirm}
          onBack={() => {
            setStep("upload");
            setValidated(null);
          }}
          applyError={applyError}
          isPending={isPending}
        />
      )}

      {step === "success" && (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
            Import applied successfully.
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("upload");
                setValidated(null);
                setErrors([]);
                setApplyError(null);
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Import again
            </button>
            <button
              onClick={() => router.push(`/${slug}/contacts`)}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              View contacts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function UploadStep({
  onSubmit,
  errors,
  isPending,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  errors: ParseError[];
  isPending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium">How importing works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Export your current data, edit in a spreadsheet, then upload both
            files here.
          </li>
          <li>
            Rows with an <code className="font-mono">id</code> update the
            matching record. Rows without an id (or with an unknown id) are
            added as new.
          </li>
          <li>
            Active records in the database that aren&apos;t in the uploaded files
            will be soft-deleted.
          </li>
          <li>
            You&apos;ll see a full diff before anything is committed.
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            households.csv <span className="text-red-500">*</span>
          </label>
          <input
            name="householdsFile"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:px-3 file:py-1.5 file:text-sm file:text-gray-700 hover:file:border-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            contacts.csv <span className="text-red-500">*</span>
          </label>
          <input
            name="contactsFile"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:px-3 file:py-1.5 file:text-sm file:text-gray-700 hover:file:border-gray-400"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-medium text-red-800">
            {errors.length} error{errors.length > 1 ? "s" : ""} found — fix
            these before importing:
          </p>
          <ul className="space-y-1 text-sm text-red-700">
            {errors.map((e, i) => (
              <li key={i}>
                {e.row > 0 ? `Row ${e.row}, ` : ""}
                <span className="font-mono">{e.column}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isPending ? "Validating…" : "Validate and preview changes"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function DiffStep({
  diff,
  onConfirm,
  onBack,
  applyError,
  isPending,
}: {
  diff: ImportDiff;
  onConfirm: () => void;
  onBack: () => void;
  applyError: string | null;
  isPending: boolean;
}) {
  const totalChanges =
    diff.households.added.length +
    diff.households.updated.length +
    diff.households.removed.length +
    diff.contacts.added.length +
    diff.contacts.updated.length +
    diff.contacts.removed.length;

  const warningHouseholds = diff.households.removed.filter(
    (h) => h.hasFamilyFriendContacts
  );

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-800">
          {totalChanges === 0
            ? "No changes detected. Nothing will be committed."
            : `${totalChanges} change${totalChanges > 1 ? "s" : ""} to apply:`}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat
            label="Households added"
            value={diff.households.added.length}
          />
          <Stat
            label="Households updated"
            value={diff.households.updated.length}
          />
          <Stat
            label="Households removed"
            value={diff.households.removed.length}
            warn={diff.households.removed.length > 0}
          />
          <Stat
            label="Households unchanged"
            value={diff.households.unchanged}
          />
          <Stat label="Contacts added" value={diff.contacts.added.length} />
          <Stat
            label="Contacts updated"
            value={diff.contacts.updated.length}
          />
          <Stat
            label="Contacts removed"
            value={diff.contacts.removed.length}
            warn={diff.contacts.removed.length > 0}
          />
          <Stat label="Contacts unchanged" value={diff.contacts.unchanged} />
        </div>
      </div>

      {warningHouseholds.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">
            Warning: removing households that have Family &amp; Friend contacts
          </p>
          <ul className="mt-2 list-disc pl-5">
            {warningHouseholds.map((h) => (
              <li key={h.id}>
                <strong>{h.displayName}</strong> — its Family &amp; Friend
                contacts will lose their inherited address.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detail sections */}
      <DiffSection
        title="Households added"
        items={diff.households.added.map((h) => h.displayName)}
        color="green"
      />
      <DiffSection
        title="Households updated"
        items={diff.households.updated.map(
          ({ before, after }) =>
            `${before.displayName}${before.displayName !== after.displayName ? ` → ${after.displayName}` : ""}`
        )}
        color="blue"
      />
      <DiffSection
        title="Households removed (will be soft-deleted)"
        items={diff.households.removed.map(
          (h) =>
            `${h.displayName}${h.hasFamilyFriendContacts ? " ⚠ has Family & Friend contacts" : ""}`
        )}
        color="red"
      />
      <DiffSection
        title="Contacts added"
        items={diff.contacts.added.map(
          (c) => `${c.firstName} ${c.lastName} (${c.category})`
        )}
        color="green"
      />
      <DiffSection
        title="Contacts updated"
        items={diff.contacts.updated.map(
          ({ before }) => `${before.firstName} ${before.lastName}`
        )}
        color="blue"
      />
      <DiffSection
        title="Contacts removed (will be soft-deleted)"
        items={diff.contacts.removed.map((c) => c.name)}
        color="red"
      />

      {applyError && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {applyError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isPending}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          ← Back
        </button>
        {totalChanges > 0 && (
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending ? "Applying…" : `Apply ${totalChanges} change${totalChanges > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={`text-lg font-semibold ${
          warn && value > 0 ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DiffSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "green" | "blue" | "red";
}) {
  if (items.length === 0) return null;
  const colorClasses = {
    green: "border-green-200 bg-green-50 text-green-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-md border p-4 ${colorClasses[color]}`}>
      <p className="text-sm font-medium">
        {title} ({items.length})
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
