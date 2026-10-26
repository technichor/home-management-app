import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BRAND_NAME } from "@/lib/brand";
import Logo from "@/components/Logo";
import LinkButton from "@/components/LinkButton";

// A public list (docs/domains/lists.md, Sharing): anyone with its link sees it, signed in or not. Read only, and only
// what's still to get (checked items are left off, so "already got it" isn't given away). Nothing else about the
// household is shown, and search engines are asked not to list it.

async function publicList(token: string) {
  return prisma.list.findUnique({
    where: { publicToken: token },
    select: {
      name: true,
      kind: true,
      archivedAt: true,
      owner: { select: { firstName: true } },
      items: { where: { checked: false }, orderBy: { position: "asc" }, select: { id: true, text: true, quantity: true, notes: true, url: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const list = await publicList((await params).token);
  return { title: list ? `${list.name} · ${BRAND_NAME}` : BRAND_NAME, robots: { index: false, follow: false } };
}

export default async function PublicListPage({ params }: { params: Promise<{ token: string }> }) {
  const list = await publicList((await params).token);
  if (!list || list.archivedAt) notFound();
  const gift = list.kind === "GIFT";

  return (
    <div className="public-list">
      <main className="public-list-main">
        {gift && <div className="public-list-eyebrow">Gift ideas</div>}
        <h1 className="public-list-title">{list.name}</h1>
        {list.owner && <p className="public-list-from">From {list.owner.firstName}</p>}
        {list.items.length === 0 ? (
          <p className="public-list-empty">Nothing on this list right now.</p>
        ) : (
          <ul className="public-list-items">
            {list.items.map((item) => (
              <li key={item.id}>
                <div className="public-list-text">
                  <strong>{item.text}</strong>
                  {item.quantity && <span className="public-list-muted"> · {item.quantity}</span>}
                  {item.notes && <p className="public-list-notes">{item.notes}</p>}
                </div>
                {item.url && <LinkButton url={item.url} name={item.text} />}
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="public-list-footer">
        <Link href="/" aria-label={`Made with ${BRAND_NAME}`}>
          <span>Made with</span>
          <Logo width={84} decorative />
        </Link>
      </footer>
    </div>
  );
}
