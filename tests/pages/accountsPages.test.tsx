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
vi.mock("@/lib/db", () => ({ prisma: { accountRecord: { findMany: vi.fn(), findFirst: vi.fn() }, contact: { findMany: vi.fn() } } }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/accounts/AccountsClient", () => ({ default: (p: any) => ((seen.list = p), <div>list</div>) }));
vi.mock("@/app/(app)/accounts/AccountForm", () => ({ default: (p: any) => ((seen.form = p), <div>form</div>) }));
vi.mock("@/app/(app)/accounts/[id]/AccountDetailClient", () => ({ default: (p: any) => ((seen.detail = p), <div>detail</div>) }));

import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import AccountsPage from "@/app/(app)/accounts/page";
import NewAccountPage from "@/app/(app)/accounts/new/page";
import AccountPage from "@/app/(app)/accounts/[id]/page";
import EditAccountPage from "@/app/(app)/accounts/[id]/edit/page";

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", householdId: "h1", name: "HSA", kind: "HEALTH_SAVINGS", status: "ACTIVE", institution: "Fidelity", lastFour: "1234", ownerContactId: "m1",
  owner: { firstName: "Samuel", nickname: "Sam" }, website: "https://f.test", phone: "555", notes: "n", ...over,
});
const idParams = Promise.resolve({ id: "a1" });
const members = [{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.accountRecord.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contact.findMany).mockResolvedValue(members as any);
});

describe("AccountsPage", () => {
  it("lists only this household's records, with the owner's calendar name", async () => {
    vi.mocked(prisma.accountRecord.findMany).mockResolvedValue([row(), row({ id: "a2", owner: null, ownerContactId: null })] as any);
    render(await AccountsPage());
    expect(vi.mocked(prisma.accountRecord.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.list.accounts[0]).toMatchObject({ id: "a1", name: "HSA", ownerName: "Sam", lastFour: "1234" });
    expect(seen.list.accounts[1]).toMatchObject({ id: "a2", ownerName: null });
  });
  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(AccountsPage()).rejects.toThrow();
  });
});

describe("NewAccountPage", () => {
  it("offers the household's members as owners", async () => {
    render(await NewAccountPage());
    expect(seen.form.owners).toEqual([{ id: "m1", name: "Sam", fullName: "Sam Doe" }]);
    expect(seen.form.record).toBeUndefined();
  });
  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(NewAccountPage()).rejects.toThrow();
  });
});

describe("AccountPage", () => {
  it("finds the record only through the household", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(row() as any);
    render(await AccountPage({ params: idParams }));
    expect(vi.mocked(prisma.accountRecord.findFirst).mock.calls[0][0]!.where).toEqual({ id: "a1", householdId: "h1" });
    expect(seen.detail.record).toMatchObject({ id: "a1", ownerName: "Sam", website: "https://f.test" });
  });
  it("handles a record owned by the whole household", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(row({ owner: null, ownerContactId: null }) as any);
    render(await AccountPage({ params: idParams }));
    expect(seen.detail.record).toMatchObject({ ownerName: null, ownerContactId: null });
  });
  it("is a 404 for a record that isn't this household's", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(null);
    await expect(AccountPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});

describe("EditAccountPage", () => {
  it("fills the form from the household's record, with the member list", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(row() as any);
    render(await EditAccountPage({ params: idParams }));
    expect(seen.form.record).toMatchObject({ id: "a1", name: "HSA", ownerName: "Sam" });
    expect(seen.form.owners).toHaveLength(1);
  });
  it("handles a record owned by the whole household", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(row({ owner: null, ownerContactId: null }) as any);
    render(await EditAccountPage({ params: idParams }));
    expect(seen.form.record.ownerName).toBeNull();
  });
  it("is a 404 for a record that isn't this household's", async () => {
    vi.mocked(prisma.accountRecord.findFirst).mockResolvedValue(null);
    await expect(EditAccountPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});
