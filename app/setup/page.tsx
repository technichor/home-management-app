"use client";

import { useActionState } from "react";
import { createHouseholdAction, SetupState } from "./actions";

export default function SetupPage() {
  const [state, formAction, isPending] = useActionState<SetupState, FormData>(
    createHouseholdAction,
    null
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Set up your household account</h1>
          <p className="mt-1 text-sm text-gray-600">
            This creates a login for your household. You can add contacts and
            other households via CSV import after setup.
          </p>
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700"
            >
              Household display name <span className="text-red-500">*</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              placeholder="e.g. The Reynolds Family"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="urlSlug"
              className="block text-sm font-medium text-gray-700"
            >
              URL slug <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                /
              </span>
              <input
                id="urlSlug"
                name="urlSlug"
                type="text"
                required
                pattern="[a-z0-9-]+"
                placeholder="reynolds-family"
                className="block w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Anyone with this password can read and write all household data.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create household account"}
          </button>
        </form>
      </div>
    </div>
  );
}
