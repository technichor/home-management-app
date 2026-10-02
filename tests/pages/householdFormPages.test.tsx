// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: { household: { findUnique: vi.fn() }, contact: { count: vi.fn() } },
}));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/contacts/households/HouseholdForm", () => ({
  default: (p: any) => ((seen.form = p), <div>household form</div>),
}));

import NewHouseholdPage from "@/app/(app)/contacts/households/new/page";
import EditHouseholdPage from "@/app/(app)/contacts/households/[id]/edit/page";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";

const stored = (over: object = {}) => ({
  id: "x1", ownerHouseholdId: "mine", deletedAt: null, displayName: "The Joneses", mailingAddress: "1 Main St",
  tags: ["a"], notes: "gate", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "mine" } as any);
  vi.mocked(prisma.contact.count).mockResolvedValue(3);
});

describe("NewHouseholdPage", () => {
  it("renders the empty form", async () => {
    render(await NewHouseholdPage());
    expect(screen.getByText("household form")).toBeInTheDocument();
    expect(seen.form).toEqual({ });
  });
});

describe("EditHouseholdPage", () => {
  const run = () => EditHouseholdPage({ params: Promise.resolve({ id: "x1" }) });

  it.each([
    ["missing", null],
    ["in another directory", stored({ ownerHouseholdId: "other" })],
    ["removed", stored({ deletedAt: new Date() })],
  ])("404s for a household that is %s", async (_n, value) => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(value as any);
    await expect(run()).rejects.toThrow("NOT_FOUND");
  });

  it("prefills the form and counts the Family & Friend contacts", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(stored() as any);
    render(await run());
    expect(seen.form.household).toEqual({
      id: "x1", isOurs: false, contactCount: 3,
      values: { displayName: "The Joneses", mailingAddress: "1 Main St", tags: ["a"], notes: "gate" },
    });
    expect(vi.mocked(prisma.contact.count).mock.calls[0][0]!.where).toEqual({
      householdId: "x1", category: "FAMILY_FRIEND", deletedAt: null,
    });
  });

  it("flags the caller's own household and turns empty columns into undefined", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(
      stored({ id: "mine", ownerHouseholdId: null, mailingAddress: null, notes: null }) as any
    );
    render(await EditHouseholdPage({ params: Promise.resolve({ id: "mine" }) }));
    expect(seen.form.household.isOurs).toBe(true);
    expect(seen.form.household.values.mailingAddress).toBeUndefined();
    expect(seen.form.household.values.notes).toBeUndefined();
  });
});
