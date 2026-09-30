"use client";

import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { label: "Active", segment: "" },
  { label: "Archived", segment: "archived" },
];

export default function ListsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function href(segment: string) {
    return segment ? `/${slug}/lists/${segment}` : `/${slug}/lists`;
  }

  function isActive(segment: string) {
    if (segment === "") {
      return (
        pathname === `/${slug}/lists` ||
        (pathname.startsWith(`/${slug}/lists/`) &&
          !pathname.startsWith(`/${slug}/lists/archived`))
      );
    }
    return pathname === href(segment) || pathname.startsWith(href(segment) + "/");
  }

  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid #f0f0f0" }}>
      {LINKS.map((link) => {
        const active = isActive(link.segment);
        return (
          <button
            key={link.segment || "active"}
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
