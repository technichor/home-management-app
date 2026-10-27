import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { document: { findMany: vi.fn() }, documentDismissal: { findMany: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { documentsPanel } from "@/lib/documentPanels";

const stored = (over: Record<string, unknown> = {}) => ({
  id: "d1", title: "Title – Pacifica", category: "VEHICLES", typeKey: "vehicle-title", ownerContactId: null, maintenanceItemId: "v1", accountRecordId: null,
  originalLocation: null, notes: null, owner: null, maintenanceItem: { name: "Pacifica" }, accountRecord: null, links: [{ url: "https://x.test", label: null }], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.document.findMany).mockResolvedValue([]);
  vi.mocked(prisma.documentDismissal.findMany).mockResolvedValue([]);
});

describe("documentsPanel", () => {
  it("a vehicle: its documents, the vehicle documents it doesn't have (not dismissed ones), all coming back to its page", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([stored()] as any);
    vi.mocked(prisma.documentDismissal.findMany).mockResolvedValue([{ typeKey: "vehicle-loan-or-lease", subjectKey: "item:v1" }] as any);
    const panel = await documentsPanel("h1", { kind: "item", id: "v1", name: "Pacifica", isVehicle: true });
    expect(vi.mocked(prisma.document.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", maintenanceItemId: "v1" });
    expect(vi.mocked(prisma.documentDismissal.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(panel.documents.map((d) => d.id)).toEqual(["d1"]);
    expect(panel.openSlots).toEqual([
      { key: "vehicle-registration", label: "Registration", href: "/documents/new?type=vehicle-registration&item=v1&returnTo=%2Fmaintenance%2Fv1" },
      { key: "vehicle-insurance-card", label: "Insurance card", href: "/documents/new?type=vehicle-insurance-card&item=v1&returnTo=%2Fmaintenance%2Fv1" },
    ]);
    expect(panel.addHref).toBe("/documents/new?item=v1&returnTo=%2Fmaintenance%2Fv1");
  });

  it("any other item: its documents, with nothing suggested", async () => {
    const panel = await documentsPanel("h1", { kind: "item", id: "i1", name: "Dishwasher", isVehicle: false });
    expect(panel.openSlots).toEqual([]);
    expect(prisma.documentDismissal.findMany).not.toHaveBeenCalled();
    expect(panel.addHref).toBe("/documents/new?item=i1&returnTo=%2Fmaintenance%2Fi1");
  });

  it("an account: the documents about it", async () => {
    const panel = await documentsPanel("h1", { kind: "account", id: "a1" });
    expect(vi.mocked(prisma.document.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", accountRecordId: "a1" });
    expect(panel).toEqual({ documents: [], openSlots: [], addHref: "/documents/new?account=a1&returnTo=%2Faccounts%2Fa1" });
  });

  it("a member: their documents and the person documents they don't have", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([stored({ id: "p", typeKey: "passport", category: "IDENTITY", ownerContactId: "c1", maintenanceItemId: null })] as any);
    const panel = await documentsPanel("h1", { kind: "contact", id: "c1", name: "Ellie" });
    expect(vi.mocked(prisma.document.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", ownerContactId: "c1" });
    expect(panel.openSlots.map((s) => s.label)).toEqual(["Birth certificate", "Social Security card", "Driver's license or state ID", "Immunization records"]);
    expect(panel.openSlots[0].href).toBe("/documents/new?type=birth-certificate&contact=c1&returnTo=%2Fcontacts%2Fc1");
    expect(panel.addHref).toBe("/documents/new?contact=c1&returnTo=%2Fcontacts%2Fc1");
  });
});
