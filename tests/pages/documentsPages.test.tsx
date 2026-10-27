// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn().mockResolvedValue({ householdId: "h1" }) }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: vi.fn(), findMany: vi.fn() },
    documentDismissal: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    maintenanceItem: { findMany: vi.fn() },
    accountRecord: { findMany: vi.fn() },
  },
}));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/documents/DocumentsClient", () => ({ default: (p: any) => ((seen.list = p), <div>list</div>) }));
vi.mock("@/app/(app)/documents/DocumentForm", () => ({ default: (p: any) => ((seen.form = p), <div>form</div>) }));
vi.mock("@/app/(app)/documents/[id]/DocumentDetailClient", () => ({ default: (p: any) => ((seen.detail = p), <div>detail</div>) }));

import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import DocumentsPage from "@/app/(app)/documents/page";
import NewDocumentPage from "@/app/(app)/documents/new/page";
import DocumentPage from "@/app/(app)/documents/[id]/page";
import EditDocumentPage from "@/app/(app)/documents/[id]/edit/page";

const doc = (over: Record<string, unknown> = {}) => ({
  id: "d1", householdId: "h1", title: "Passport – Sam", category: "IDENTITY", typeKey: "passport", ownerContactId: "m1", maintenanceItemId: null, accountRecordId: null,
  originalLocation: null, notes: null, owner: { firstName: "Sam", nickname: null }, maintenanceItem: null, accountRecord: null, links: [{ url: "https://drive.test/p", label: null }],
  ...over,
});
const idParams = Promise.resolve({ id: "d1" });
const query = (q: Record<string, string> = {}) => ({ searchParams: Promise.resolve(q) });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }] as any);
  vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([
    { id: "v1", name: "Pacifica", category: "VEHICLE" },
    { id: "i1", name: "Dishwasher", category: "APPLIANCE" },
  ] as any);
  vi.mocked(prisma.accountRecord.findMany).mockResolvedValue([{ id: "a1", name: "Car loan" }] as any);
});

describe("DocumentsPage", () => {
  it("hands over only this household's documents, members, vehicles and dismissals", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([doc()] as any);
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([{ id: "v1", name: "Pacifica" }] as any);
    vi.mocked(prisma.documentDismissal.findMany).mockResolvedValue([{ typeKey: "lease", subjectKey: "household" }] as any);
    render(await DocumentsPage());
    expect(vi.mocked(prisma.document.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(vi.mocked(prisma.maintenanceItem.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", category: "VEHICLE" });
    expect(vi.mocked(prisma.documentDismissal.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.list.documents).toEqual([expect.objectContaining({ id: "d1", ownerName: "Sam" })]);
    expect(seen.list.members).toEqual([{ id: "m1", name: "Sam" }]);
    expect(seen.list.vehicles).toEqual([{ id: "v1", name: "Pacifica" }]);
    expect(seen.list.dismissals).toEqual([{ typeKey: "lease", subjectKey: "household" }]);
  });
  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(DocumentsPage()).rejects.toThrow();
  });
});

describe("NewDocumentPage", () => {
  it("offers only the household's members, items and accounts", async () => {
    render(await NewDocumentPage(query()));
    expect(vi.mocked(prisma.maintenanceItem.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(vi.mocked(prisma.accountRecord.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.form.options).toEqual({
      members: [{ id: "m1", name: "Sam" }],
      items: [
        { id: "v1", name: "Pacifica", isVehicle: true },
        { id: "i1", name: "Dishwasher", isVehicle: false },
      ],
      accounts: [{ id: "a1", name: "Car loan" }],
    });
    expect(seen.form.initial).toEqual({ typeKey: null, ownerContactId: null, maintenanceItemId: null, accountRecordId: null });
    expect(seen.form.firstCategory).toBeUndefined();
    expect(seen.form.returnTo).toBeUndefined();
  });

  it("lists a chosen category's types first; one that isn't a category is ignored", async () => {
    render(await NewDocumentPage(query({ category: "WORK" })));
    expect(seen.form.firstCategory).toBe("WORK");
    render(await NewDocumentPage(query({ category: "NOPE" })));
    expect(seen.form.firstCategory).toBeUndefined();
  });

  it("pre-fills from the address, and comes back to a same-site path", async () => {
    render(await NewDocumentPage(query({ type: "passport", contact: "m1", account: "a1", returnTo: "/contacts/m1" })));
    expect(seen.form.initial).toEqual({ typeKey: "passport", ownerContactId: "m1", maintenanceItemId: null, accountRecordId: "a1" });
    expect(seen.form.returnTo).toBe("/contacts/m1");
  });

  it("leaves out a pre-fill that isn't the household's, and a return address elsewhere", async () => {
    render(await NewDocumentPage(query({ type: "nonsense", contact: "theirs", item: "theirs", account: "theirs", returnTo: "https://evil.test" })));
    expect(seen.form.initial).toEqual({ typeKey: null, ownerContactId: null, maintenanceItemId: null, accountRecordId: null });
    expect(seen.form.returnTo).toBeUndefined();
  });

  it("from a vehicle, starts with no type and the Vehicles types first; from another item, as a manual", async () => {
    render(await NewDocumentPage(query({ item: "v1" })));
    expect(seen.form.initial).toMatchObject({ typeKey: null, maintenanceItemId: "v1" });
    expect(seen.form.firstCategory).toBe("VEHICLES");
    render(await NewDocumentPage(query({ item: "i1" })));
    expect(seen.form.initial).toMatchObject({ typeKey: "manual", maintenanceItemId: "i1" });
    expect(seen.form.firstCategory).toBeUndefined();
    render(await NewDocumentPage(query({ item: "i1", type: "product-warranty" })));
    expect(seen.form.initial.typeKey).toBe("product-warranty");
  });

  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(NewDocumentPage(query())).rejects.toThrow();
  });
});

describe("DocumentPage", () => {
  it("finds the document only through the household", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(doc() as any);
    render(await DocumentPage({ params: idParams }));
    expect(vi.mocked(prisma.document.findFirst).mock.calls[0][0]!.where).toEqual({ id: "d1", householdId: "h1" });
    expect(seen.detail.doc).toMatchObject({ id: "d1", ownerName: "Sam", links: [{ url: "https://drive.test/p", label: null }] });
    expect(seen.detail.ownerRemoved).toBe(false);
  });
  it("says when whose it is has left the household", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(doc({ ownerContactId: "gone", owner: { firstName: "Old", nickname: null } }) as any);
    render(await DocumentPage({ params: idParams }));
    expect(seen.detail.ownerRemoved).toBe(true);
  });
  it("a household document has no one to have left", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(doc({ ownerContactId: null, owner: null }) as any);
    render(await DocumentPage({ params: idParams }));
    expect(seen.detail.ownerRemoved).toBe(false);
  });
  it("is a 404 for a document that isn't this household's", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
    await expect(DocumentPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});

describe("EditDocumentPage", () => {
  it("fills the form from the household's document, with the options", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(doc() as any);
    render(await EditDocumentPage({ params: idParams, ...query({ returnTo: "/maintenance/v1" }) }));
    expect(vi.mocked(prisma.document.findFirst).mock.calls[0][0]!.where).toEqual({ id: "d1", householdId: "h1" });
    expect(seen.form.record).toMatchObject({ id: "d1", title: "Passport – Sam" });
    expect(seen.form.options.members).toHaveLength(1);
    expect(seen.form.returnTo).toBe("/maintenance/v1");
  });
  it("is a 404 for a document that isn't this household's", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
    await expect(EditDocumentPage({ params: idParams, ...query() })).rejects.toThrow("NOT_FOUND");
  });
});
