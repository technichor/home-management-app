"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "People", segment: "" },         // /[slug]/contacts
  { label: "Households", segment: "households" },
  { label: "Import", segment: "import" },
  { label: "Removed", segment: "removed" },
];

export default function ContactsNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  function href(segment: string) {
    return segment ? `/${slug}/contacts/${segment}` : `/${slug}/contacts`;
  }

  function isActive(segment: string) {
    const target = href(segment);
    if (segment === "") {
      // "People" is active only on /contacts or /contacts/[id] (not on sub-pages)
      return (
        pathname === target ||
        (pathname.startsWith(`/${slug}/contacts/`) &&
          !["households", "import", "removed"].some((s) =>
            pathname.startsWith(`/${slug}/contacts/${s}`)
          ))
      );
    }
    return pathname === target || pathname.startsWith(target + "/");
  }

  return (
    <div className="mb-6 border-b border-gray-200">
      <nav className="mx-auto flex max-w-5xl items-center gap-0 overflow-x-auto">
        {LINKS.map((link) => (
          <Link
            key={link.segment}
            href={href(link.segment)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm transition-colors ${
              isActive(link.segment)
                ? "border-gray-900 font-medium text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
