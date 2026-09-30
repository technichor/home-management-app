"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AppNavProps {
  slug: string;
  householdName: string;
  logoutAction: () => Promise<void>;
}

const MODULES = [
  { key: "contacts", label: "Contacts", href: (slug: string) => `/${slug}/contacts`, active: true },
  { key: "lists", label: "Lists", href: null, active: false },
  { key: "meals", label: "Meal Planning", href: null, active: false },
  { key: "maintenance", label: "Maintenance", href: null, active: false },
  { key: "schedules", label: "Schedules", href: null, active: false },
];

export default function AppNav({ slug, householdName, logoutAction }: AppNavProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white">
      {/* Top bar */}
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <span className="text-base font-semibold tracking-tight text-gray-900">
          Home Management
        </span>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="hidden sm:inline">{householdName}</span>
          <span className="hidden text-gray-300 sm:inline">·</span>
          <form action={logoutAction}>
            <button type="submit" className="hover:text-gray-700">
              Log out
            </button>
          </form>
        </div>
      </div>

      {/* Module bar */}
      <div className="border-t border-gray-100">
        <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {MODULES.map((mod) => {
            const isCurrentModule =
              mod.active && pathname.startsWith(`/${slug}/${mod.key}`);

            if (mod.active && mod.href) {
              return (
                <Link
                  key={mod.key}
                  href={mod.href(slug)}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    isCurrentModule
                      ? "border-gray-900 font-medium text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {mod.label}
                </Link>
              );
            }

            return (
              <span
                key={mod.key}
                className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm text-gray-300 select-none"
                title="Coming soon"
              >
                {mod.label}
                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-400">
                  soon
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </header>
  );
}
