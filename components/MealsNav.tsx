"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "Planner", href: "/meals" },
  { label: "Library", href: "/meals/library" },
];

export default function MealsNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/meals" ? pathname === "/meals" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav className="subnav" aria-label="Section">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
