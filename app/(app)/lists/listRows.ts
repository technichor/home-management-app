import { prisma } from "@/lib/db";
import { accessTo, visibilityOf, visibleListsWhere, type ListAccess, type ListViewer, type ListVisibility } from "@/lib/listAccess";

/** A list as the Lists and Archived pages show it. */
export type ListRow = {
  id: string;
  name: string;
  tags: string[];
  kind: "STANDARD" | "GIFT";
  totalItems: number;
  checkedItems: number;
  access: ListAccess;
  visibility: ListVisibility;
  /** Shared with the viewer from outside their own household, or only to them: who shared it ("Ann Ray"). */
  sharedBy: string | null;
  archivedAt: string | null;
};

/** The ordinary and Gift lists the viewer can see (lib/listAccess.ts), archived or not. */
export async function listRowsFor(viewer: ListViewer, archived: boolean): Promise<ListRow[]> {
  const lists = await prisma.list.findMany({
    where: { ...visibleListsWhere(viewer), archivedAt: archived ? { not: null } : null },
    include: {
      items: { select: { checked: true } },
      shares: { select: { userId: true, canEdit: true } },
      owner: { select: { firstName: true, lastName: true } },
    },
    orderBy: archived ? { archivedAt: "desc" } : { createdAt: "desc" },
  });
  return lists.map((l) => {
    const access = accessTo(l, viewer)!;
    // Reached through a share (not as owner, nor as the household's): it's someone else's, shared with the viewer.
    const viaShare = l.ownerUserId !== viewer.id && !(l.householdId === viewer.householdId && (l.sharedWithHousehold || l.ownerUserId === null));
    return {
      id: l.id,
      name: l.name,
      tags: l.tags,
      kind: l.kind === "GIFT" ? "GIFT" : "STANDARD",
      totalItems: l.items.length,
      checkedItems: l.items.filter((i) => i.checked).length,
      access,
      visibility: visibilityOf({ sharedWithHousehold: l.sharedWithHousehold, publicToken: l.publicToken, shareCount: l.shares.length }),
      sharedBy: viaShare && l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : null,
      archivedAt: l.archivedAt ? l.archivedAt.toLocaleDateString() : null,
    };
  });
}
