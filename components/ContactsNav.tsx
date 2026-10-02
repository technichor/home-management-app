"use client";

import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { label: "People", segment: "" },
  { label: "Households", segment: "households" },
  { label: "Import", segment: "import" },
  { label: "Removed", segment: "removed" },
];

export default function ContactsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function href(segment: string) {
    return segment ? `/${slug}/contacts/${segment}` : `/${slug}/contacts`;
  }

  function isActive(segment: string) {
    if (segment === "") {
      return (
        pathname === `/${slug}/contacts` ||
        (pathname.startsWith(`/${slug}/contacts/`) &&
          !["households", "import", "removed"].some((s) =>
            pathname.startsWith(`/${slug}/contacts/${s}`)
          ))
      );
    }
    return pathname === href(segment) || pathname.startsWith(href(segment) + "/");
  }

  return (
    <div className="tab-strip sub-nav">
      {LINKS.map((link) => {
        const active = isActive(link.segment);
        return (
          <button
            key={link.segment || "people"}
            onClick={() => router.push(href(link.segment))}
            style={{
              padding: "8px 12px",
              background: "none",
              border: "none",
              borderBottom: active ? "2px solid #111827" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 14,
              color: active ? "#111827" : "rgba(0,0,0,.65)",
              fontWeight: active ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {link.label}
          </button>
        );
      })}
    </div>
  );
}
