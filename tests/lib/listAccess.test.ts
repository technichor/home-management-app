import { describe, it, expect } from "vitest";
import {
  accessTo,
  canEditList,
  isShareable,
  newPublicToken,
  publicListPath,
  visibilityOf,
  visibleListsWhere,
  VISIBILITY_LABELS,
  type ListForAccess,
} from "@/lib/listAccess";

const me = { id: "u1", householdId: "h1", role: "MEMBER" };
const list = (over: Partial<ListForAccess> = {}): ListForAccess => ({
  householdId: "h1",
  kind: "STANDARD",
  ownerUserId: "owner",
  sharedWithHousehold: true,
  shares: [],
  ...over,
});

describe("accessTo", () => {
  it("lets the owner manage their list, shared or not", () => {
    expect(accessTo(list({ ownerUserId: "u1", sharedWithHousehold: false }), me)).toBe("manage");
    expect(accessTo(list({ ownerUserId: "u1", kind: "GIFT" }), me)).toBe("manage");
  });

  it("lets the household edit a list shared with it, and keeps a personal one from it", () => {
    expect(accessTo(list(), me)).toBe("edit");
    expect(accessTo(list({ sharedWithHousehold: false }), me)).toBeNull();
    expect(accessTo(list({ sharedWithHousehold: false }), { ...me, role: "OWNER" })).toBeNull(); // not even its owners
  });

  it("lets someone it is shared with view it, or edit it if allowed, from any household", () => {
    expect(accessTo(list({ householdId: "h2", shares: [{ userId: "u1", canEdit: false }] }), me)).toBe("view");
    expect(accessTo(list({ householdId: "h2", shares: [{ userId: "u1", canEdit: true }] }), me)).toBe("edit");
    expect(accessTo(list({ sharedWithHousehold: false, shares: [{ userId: "u1", canEdit: false }] }), me)).toBe("view");
    // The household's own access wins over a view-only share.
    expect(accessTo(list({ shares: [{ userId: "u1", canEdit: false }] }), me)).toBe("edit");
  });

  it("keeps another household's list from everyone it isn't shared with", () => {
    expect(accessTo(list({ householdId: "h2" }), me)).toBeNull();
    expect(accessTo(list({ householdId: "h2", shares: [{ userId: "u9", canEdit: true }] }), me)).toBeNull();
  });

  it("makes a list whose owner is gone the household's: its owners manage it, everyone else in it edits", () => {
    const orphan = list({ ownerUserId: null, sharedWithHousehold: false });
    expect(accessTo(orphan, { ...me, role: "OWNER" })).toBe("manage");
    expect(accessTo(orphan, me)).toBe("edit");
    expect(accessTo(list({ ownerUserId: null, householdId: "h2" }), me)).toBeNull();
  });

  it("keeps the shopping and to-do lists the household's alone, whatever they say", () => {
    expect(accessTo(list({ kind: "GROCERY", ownerUserId: null }), me)).toBe("edit");
    expect(accessTo(list({ kind: "TODO", ownerUserId: "u1" }), me)).toBe("edit");
    expect(accessTo(list({ kind: "GROCERY", householdId: "h2", shares: [{ userId: "u1", canEdit: true }] }), me)).toBeNull();
  });
});

describe("helpers", () => {
  it("says which access can change items, and which lists can be shared", () => {
    expect([canEditList("manage"), canEditList("edit"), canEditList("view"), canEditList(null)]).toEqual([true, true, false, false]);
    expect([isShareable("STANDARD"), isShareable("GIFT"), isShareable("GROCERY"), isShareable("TODO")]).toEqual([true, true, false, false]);
  });

  it("asks the database for exactly the lists accessTo would allow", () => {
    expect(visibleListsWhere(me)).toEqual({
      kind: { in: ["STANDARD", "GIFT"] },
      OR: [
        { ownerUserId: "u1" },
        { householdId: "h1", ownerUserId: null },
        { householdId: "h1", sharedWithHousehold: true },
        { shares: { some: { userId: "u1" } } },
      ],
    });
  });

  it("names the widest way a list is seen", () => {
    expect(visibilityOf({ sharedWithHousehold: false, publicToken: null, shareCount: 0 })).toBe("PERSONAL");
    expect(visibilityOf({ sharedWithHousehold: true, publicToken: null, shareCount: 0 })).toBe("HOUSEHOLD");
    expect(visibilityOf({ sharedWithHousehold: true, publicToken: null, shareCount: 2 })).toBe("SHARED");
    expect(visibilityOf({ sharedWithHousehold: false, publicToken: "t", shareCount: 0 })).toBe("PUBLIC");
    expect(VISIBILITY_LABELS.PERSONAL).toBe("Personal");
  });

  it("makes long, unguessable, URL-safe public links, different every time", () => {
    const a = newPublicToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newPublicToken()).not.toBe(a);
    expect(publicListPath(a)).toBe(`/l/${a}`);
  });
});
