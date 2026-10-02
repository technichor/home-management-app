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
  prisma: { contact: { findUnique: vi.fn() }, household: { findMany: vi.fn() } },
}));
const seen: Record<string, any> = {};
vi.mock("@/app/[slug]/(app)/contacts/ContactForm", () => ({
  default: (p: any) => ((seen.form = p), <div>contact form</div>),
}));

import NewContactPage from "@/app/[slug]/(app)/contacts/new/page";
import EditContactPage from "@/app/[slug]/(app)/contacts/[id]/edit/page";
import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";

const stored = (over: object = {}) => ({
  id: "c1", ownerHouseholdId: "mine", deletedAt: null, householdId: "h1", firstName: "Jane", lastName: "Smith",
  nickname: null, category: "FAMILY_FRIEND", address: null, phoneMobile: "111", phoneHome: null, phoneWork: null,
  emailPrimary: null, emailSecondary: null, tags: ["a"], favorite: true, relationshipNotes: null,
  linkedFamilyMember: null, importantDate1: "2026-01-02", importantDate1Label: null, importantDate2: null,
  importantDate2Label: null, notes: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "mine" } as any);
  vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "h1", displayName: "The Smiths" }] as any);
});

describe("NewContactPage", () => {
  it("offers only the caller's own (non-removed) households", async () => {
    render(await NewContactPage({ params: Promise.resolve({ slug: "s" }) }));
    expect(screen.getByText("contact form")).toBeInTheDocument();
    expect(seen.form).toMatchObject({ slug: "s", households: [{ id: "h1", displayName: "The Smiths" }] });
    expect(seen.form.contact).toBeUndefined();
    expect(vi.mocked(prisma.household.findMany).mock.calls[0][0]!.where).toEqual({
      OR: [{ id: "mine" }, { ownerHouseholdId: "mine" }],
      deletedAt: null,
    });
  });
});

describe("EditContactPage", () => {
  const run = () => EditContactPage({ params: Promise.resolve({ slug: "s", id: "c1" }) });

  it.each([
    ["missing", null],
    ["in another directory", stored({ ownerHouseholdId: "other" })],
    ["removed", stored({ deletedAt: new Date() })],
  ])("404s for a contact that is %s", async (_n, value) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(value as any);
    await expect(run()).rejects.toThrow("NOT_FOUND");
  });

  it("prefills the form, turning empty columns into undefined", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(stored() as any);
    render(await run());
    expect(seen.form.contact.id).toBe("c1");
    expect(seen.form.contact.values).toMatchObject({
      firstName: "Jane", category: "FAMILY_FRIEND", householdId: "h1", phoneMobile: "111", tags: ["a"],
      favorite: true, importantDate1: "2026-01-02",
    });
    expect(seen.form.contact.values.nickname).toBeUndefined();
    expect(seen.form.contact.values.notes).toBeUndefined();
  });

  it("copes with a contact that has no phone or date", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(stored({ phoneMobile: null, importantDate1: null }) as any);
    render(await run());
    expect(seen.form.contact.values.phoneMobile).toBeUndefined();
    expect(seen.form.contact.values.importantDate1).toBeUndefined();
  });

  it("copes with a contact that has no household", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(stored({ householdId: null }) as any);
    render(await run());
    expect(seen.form.contact.values.householdId).toBeUndefined();
  });

  it("passes every column it has through", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(
      stored({
        nickname: "JJ", address: "9 Elm", phoneHome: "2", phoneWork: "3", emailPrimary: "a@b.co", emailSecondary: "c@d.co",
        relationshipNotes: "r", linkedFamilyMember: "Sam", importantDate1Label: "B", importantDate2: "2026-02-02",
        importantDate2Label: "A", notes: "n",
      }) as any
    );
    render(await run());
    expect(seen.form.contact.values).toMatchObject({
      nickname: "JJ", address: "9 Elm", phoneHome: "2", phoneWork: "3", emailPrimary: "a@b.co", emailSecondary: "c@d.co",
      relationshipNotes: "r", linkedFamilyMember: "Sam", importantDate1Label: "B", importantDate2: "2026-02-02",
      importantDate2Label: "A", notes: "n",
    });
  });
});
