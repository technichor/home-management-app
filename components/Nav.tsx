"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavProps {
  slug: string;
  householdName: string;
  logoutAction: () => Promise<void>;
}

export default function Nav({ slug, householdName, logoutAction }: NavProps) {
  const pathname = usePathname();

  const links = [
    { href: `/${slug}/contacts`, label: "Contacts" },
    { href: `/${slug}/households`, label: "Households" },
    { href: `/${slug}/import`, label: "Import" },
    { href: `/${slug}/removed`, label: "Removed" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900">{householdName}</span>
          <nav className="hidden gap-4 sm:flex">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm ${
                    active
                      ? "font-medium text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Log out
          </button>
        </form>
      </div>

      {/* Mobile nav */}
      <nav className="flex gap-4 overflow-x-auto border-t border-gray-100 px-4 py-2 sm:hidden">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 text-sm ${
                active
                  ? "font-medium text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
