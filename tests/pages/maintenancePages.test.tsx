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
vi.mock("@/lib/db", () => ({ prisma: { maintenanceItem: { findMany: vi.fn(), findFirst: vi.fn() } } }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));
const seen: Record<string, any> = {};
vi.mock("@/lib/documentPanels", () => ({ documentsPanel: vi.fn(async () => ({ documents: [], openSlots: [], addHref: "/documents/new" })) }));
vi.mock("@/components/DocumentsPanel", () => ({ default: (p: any) => ((seen.panel = p.panel), <div>documents panel</div>) }));
vi.mock("@/app/(app)/maintenance/MaintenanceClient", () => ({ default: (p: any) => ((seen.list = p), <div>list client</div>) }));
vi.mock("@/app/(app)/maintenance/MaintenanceForm", () => ({ default: (p: any) => ((seen.form = p), <div>form</div>) }));
vi.mock("@/app/(app)/maintenance/[id]/MaintenanceDetailClient", () => ({ default: (p: any) => ((seen.detail = p), <div>detail</div>) }));

const clock = vi.hoisted(() => ({ today: null as string | null }));
vi.mock("@/lib/today", async () => {
  const { utcDateString } = await import("@/lib/dates");
  return { pageToday: async () => clock.today, pageTodayOrUtc: async () => clock.today ?? utcDateString() };
});
import { prisma } from "@/lib/db";
import { documentsPanel } from "@/lib/documentPanels";
import { getIronSession } from "iron-session";
import MaintenancePage from "@/app/(app)/maintenance/page";
import NewMaintenanceItemPage from "@/app/(app)/maintenance/new/page";
import MaintenanceItemPage from "@/app/(app)/maintenance/[id]/page";
import EditMaintenanceItemPage from "@/app/(app)/maintenance/[id]/edit/page";

const row = (over: Record<string, unknown> = {}) => ({
  id: "m1", householdId: "h1", name: "Furnace", category: "HVAC", location: "Basement", brand: "Carrier", modelNumber: "X1", serialNumber: "S1",
  installedYear: 2004, warrantyUntil: new Date("2030-01-02T00:00:00Z"), serviceEveryMonths: 12, lastServicedOn: new Date("2026-01-03T00:00:00Z"),
  manualUrl: "https://x.test", notes: "n", ...over,
});
const idParams = Promise.resolve({ id: "m1" });

beforeEach(() => {
  clock.today = null;
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([]);
});

describe("MaintenancePage", () => {
  it("lists this household's items, with dates as plain strings, and asks the browser for today", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([row(), row({ id: "m2", lastServicedOn: null, installedYear: null })] as any);
    clock.today = "2026-10-05";
    const { getByTestId } = render(await MaintenancePage());
    expect(getByTestId("local-today")).toBeInTheDocument();
    expect(vi.mocked(prisma.maintenanceItem.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1" });
    expect(seen.list.today).toBe("2026-10-05");
    expect(seen.list.items[0]).toMatchObject({ id: "m1", name: "Furnace", lastServicedOn: "2026-01-03", installedYear: 2004 });
    expect(seen.list.items[1]).toMatchObject({ id: "m2", lastServicedOn: null, installedYear: null });
  });

  it("falls back to the server's date before the browser has said", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    render(await MaintenancePage());
    expect(seen.list.today).toBe("2026-10-06");
    vi.useRealTimers();
  });

  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(MaintenancePage()).rejects.toThrow();
  });
});

describe("NewMaintenanceItemPage", () => {
  it("shows the empty form for a signed-in household", async () => {
    render(await NewMaintenanceItemPage());
    expect(seen.form).toEqual({});
  });
  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(NewMaintenanceItemPage()).rejects.toThrow();
  });
});

describe("MaintenanceItemPage", () => {
  it("finds the item only through the household and passes it on", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(row() as any);
    clock.today = "2026-10-05";
    render(await MaintenanceItemPage({ params: idParams,  }));
    expect(prisma.maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
    expect(seen.detail.today).toBe("2026-10-05");
    expect(seen.detail.item).toMatchObject({ id: "m1", warrantyUntil: "2030-01-02", lastServicedOn: "2026-01-03", manualUrl: "https://x.test" });
    expect(documentsPanel).toHaveBeenCalledWith("h1", { kind: "item", id: "m1", name: "Furnace", isVehicle: false });
    expect(seen.panel).toEqual({ documents: [], openSlots: [], addHref: "/documents/new" });
  });
  it("a vehicle's Documents section suggests what a vehicle needs", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(row({ name: "Pacifica", category: "VEHICLE" }) as any);
    render(await MaintenanceItemPage({ params: idParams }));
    expect(documentsPanel).toHaveBeenCalledWith("h1", { kind: "item", id: "m1", name: "Pacifica", isVehicle: true });
  });
  it("handles an item with no dates", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(row({ warrantyUntil: null, lastServicedOn: null }) as any);
    render(await MaintenanceItemPage({ params: idParams }));
    expect(seen.detail.item).toMatchObject({ warrantyUntil: null, lastServicedOn: null });
  });
  it("is a 404 for an item that isn't this household's", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    await expect(MaintenanceItemPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});

describe("EditMaintenanceItemPage", () => {
  it("fills the form from the household's item", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(row() as any);
    render(await EditMaintenanceItemPage({ params: idParams }));
    expect(seen.form.item).toMatchObject({ id: "m1", name: "Furnace", warrantyUntil: "2030-01-02", lastServicedOn: "2026-01-03" });
  });
  it("handles an item with no dates", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(row({ warrantyUntil: null, lastServicedOn: null }) as any);
    render(await EditMaintenanceItemPage({ params: idParams }));
    expect(seen.form.item).toMatchObject({ warrantyUntil: null, lastServicedOn: null });
  });
  it("is a 404 for an item that isn't this household's", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    await expect(EditMaintenanceItemPage({ params: idParams })).rejects.toThrow("NOT_FOUND");
  });
});
