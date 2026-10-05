"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "People", segment: "" },
  { label: "Households", segment: "households" },
  { label: "Import", segment: "import" },
  { label: "Removed", segment: "removed" },
];

export default function ContactsNav() {
  const pathname = usePathname();

  function href(segment: string) {
    return segment ? `/contacts/${segment}` : "/contacts";
  }

  function isActive(segment: string) {
    if (segment === "") {
      return (
        pathname === "/contacts" ||
        (pathname.startsWith("/contacts/") &&
          !["households", "import", "removed"].some((s) =>
            pathname.startsWith(`/contacts/${s}`)
          ))
      );
    }
    return pathname === href(segment) || pathname.startsWith(href(segment) + "/");
  }

  return (
    <nav className="subnav" aria-label="Section">
      {LINKS.map((link) => (
        <Link key={link.segment || "people"} href={href(link.segment)} aria-current={isActive(link.segment) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
