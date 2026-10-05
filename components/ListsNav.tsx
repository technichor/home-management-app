"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "Active", segment: "" },
  { label: "Archived", segment: "archived" },
];

export default function ListsNav() {
  const pathname = usePathname();

  function href(segment: string) {
    return segment ? `/lists/${segment}` : "/lists";
  }

  function isActive(segment: string) {
    if (segment === "") {
      return (
        pathname === "/lists" ||
        (pathname.startsWith("/lists/") &&
          !pathname.startsWith("/lists/archived"))
      );
    }
    return pathname === href(segment) || pathname.startsWith(href(segment) + "/");
  }

  return (
    <nav className="subnav" aria-label="Section">
      {LINKS.map((link) => (
        <Link key={link.segment || "active"} href={href(link.segment)} aria-current={isActive(link.segment) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
