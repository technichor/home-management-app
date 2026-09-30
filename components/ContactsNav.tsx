"use client";

import { Menu } from "antd";
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
    const target = href(segment);
    if (segment === "") {
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

  const selectedKey =
    LINKS.find((l) => l.segment !== "" && isActive(l.segment))?.segment ??
    (isActive("") ? "people" : "");

  const items = LINKS.map((link) => ({
    key: link.segment === "" ? "people" : link.segment,
    label: link.label,
    onClick: () => router.push(href(link.segment)),
  }));

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[selectedKey]}
      items={items}
      style={{ marginBottom: 24, borderBottom: "1px solid #f0f0f0" }}
    />
  );
}
