import { randomBytes } from "node:crypto";
import type { ListKind, Prisma } from "@prisma/client";

// Who can see and change a list (docs/domains/lists.md, Sharing). The one place this is decided: every list page and
// action asks accessTo (or filters with visibleListsWhere), and anyone without access is told the list isn't there.
//
// An ordinary list (or a Gift ideas list) has an owner, who manages it. It is shared with the household by default
// (everyone in it can view and edit), and with any people the owner adds, each able to view or to edit. The shopping
// and to-do lists are the household's: everyone in it edits them, nobody else sees them. Public lists are seen through
// their link (lib/listAccess's publicToken) by anyone, without any of this.

export type ListAccess = "manage" | "edit" | "view";

/** The kinds of list that have an owner and can be shared (the shopping and to-do lists can't). */
export const SHAREABLE_KINDS: readonly ListKind[] = ["STANDARD", "GIFT"];
export const isShareable = (kind: ListKind) => SHAREABLE_KINDS.includes(kind);

export type ListViewer = { id: string; householdId: string; role: string };
export type ListForAccess = {
  householdId: string;
  kind: ListKind;
  ownerUserId: string | null;
  sharedWithHousehold: boolean;
  shares: { userId: string; canEdit: boolean }[];
};

/**
 * What the viewer may do with the list: manage (its owner: sharing, renaming, archiving, deleting), edit (its items),
 * view, or nothing (null). A list without an owner (one whose owner's account is gone) is the household's: everyone in
 * it edits it and the household's owners manage it.
 */
export function accessTo(list: ListForAccess, viewer: ListViewer): ListAccess | null {
  const inHousehold = viewer.householdId === list.householdId;
  if (!isShareable(list.kind)) return inHousehold ? "edit" : null;
  if (list.ownerUserId === viewer.id) return "manage";
  if (inHousehold && list.ownerUserId === null) return viewer.role === "OWNER" ? "manage" : "edit";
  if (inHousehold && list.sharedWithHousehold) return "edit";
  const share = list.shares.find((s) => s.userId === viewer.id);
  if (share) return share.canEdit ? "edit" : "view";
  return null;
}

export const canEditList = (access: ListAccess | null) => access === "manage" || access === "edit";

/** The ordinary lists the viewer can see (any of the ways accessTo allows), as a Prisma filter. */
export function visibleListsWhere(viewer: ListViewer): Prisma.ListWhereInput {
  return {
    kind: { in: [...SHAREABLE_KINDS] },
    OR: [
      { ownerUserId: viewer.id },
      { householdId: viewer.householdId, ownerUserId: null },
      { householdId: viewer.householdId, sharedWithHousehold: true },
      { shares: { some: { userId: viewer.id } } },
    ],
  };
}

/** Who can see a list besides its owner, in a word: Personal, Household, Shared or Public (the widest that applies). */
export type ListVisibility = "PERSONAL" | "HOUSEHOLD" | "SHARED" | "PUBLIC";

export function visibilityOf(list: { sharedWithHousehold: boolean; publicToken: string | null; shareCount: number }): ListVisibility {
  if (list.publicToken) return "PUBLIC";
  if (list.shareCount > 0) return "SHARED";
  if (list.sharedWithHousehold) return "HOUSEHOLD";
  return "PERSONAL";
}

export const VISIBILITY_LABELS: Record<ListVisibility, string> = {
  PERSONAL: "Personal",
  HOUSEHOLD: "Household",
  SHARED: "Shared",
  PUBLIC: "Public",
};

/** A new public link's secret part: long and random, so it can't be guessed (it is the only key to a public list). */
export const newPublicToken = () => randomBytes(24).toString("base64url");

/** The public address of a list. */
export const publicListPath = (token: string) => `/l/${token}`;
