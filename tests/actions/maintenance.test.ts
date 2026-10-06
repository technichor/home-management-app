import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: { maintenanceItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createMaintenanceItemAction,
  deleteMaintenanceItemAction,
  markServicedAction,
  updateMaintenanceItemAction,
} from "@/app/(app)/maintenance/actions";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const fields = { name: "Furnace", category: "HVAC" as const };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue({ id: "m1", householdId: "h1" } as any);
  vi.mocked(prisma.maintenanceItem.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.maintenanceItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.maintenanceItem.delete).mockResolvedValue({} as any);
});

describe("authentication", () => {
  it.each([
    ["create", () => createMaintenanceItemAction(fields)],
    ["update", () => updateMaintenanceItemAction("m1", fields)],
    ["delete", () => deleteMaintenanceItemAction("m1")],
    ["mark serviced", () => markServicedAction("m1", "2026-10-05")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.maintenanceItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.maintenanceItem.create).not.toHaveBeenCalled();
    expect(prisma.maintenanceItem.update).not.toHaveBeenCalled();
    expect(prisma.maintenanceItem.delete).not.toHaveBeenCalled();
  });
});

describe("createMaintenanceItemAction", () => {
  it("adds an item to the session's household, with dates stored as dates", async () => {
    const result = await createMaintenanceItemAction({
      ...fields, name: " Furnace ", brand: "Carrier", installedYear: 2004, warrantyUntil: "2030-01-02", serviceEveryMonths: 12, lastServicedOn: "2026-01-03", manualUrl: "https://x.test/m",
    });
    expect(result).toEqual({ ok: true, id: "new1" });
    expect(prisma.maintenanceItem.create).toHaveBeenCalledWith({
      data: {
        householdId: "h1", name: "Furnace", category: "HVAC", location: null, brand: "Carrier", modelNumber: null, serialNumber: null,
        installedYear: 2004, warrantyUntil: day("2030-01-02"), serviceEveryMonths: 12, lastServicedOn: day("2026-01-03"), manualUrl: "https://x.test/m", notes: null,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/maintenance");
  });

  it("stores no dates when none are given", async () => {
    await createMaintenanceItemAction(fields);
    expect(vi.mocked(prisma.maintenanceItem.create).mock.calls[0][0].data).toMatchObject({ warrantyUntil: null, lastServicedOn: null });
  });

  it("reports the first problem and writes nothing", async () => {
    expect(await createMaintenanceItemAction({ ...fields, name: " " })).toEqual({ ok: false, error: "Give it a name" });
    expect(await createMaintenanceItemAction({ ...fields, manualUrl: "javascript:alert(1)" })).toEqual({ ok: false, error: "The manual link must start with http:// or https://" });
    expect(prisma.maintenanceItem.create).not.toHaveBeenCalled();
  });
});

describe("updateMaintenanceItemAction", () => {
  it("finds the item only through the session's household, then replaces its fields", async () => {
    expect(await updateMaintenanceItemAction("m1", { ...fields, name: "Furnace (up)", lastServicedOn: "2026-02-03" })).toEqual({ ok: true });
    expect(prisma.maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: "m1", householdId: "h1" } });
    expect(vi.mocked(prisma.maintenanceItem.update).mock.calls[0][0]).toMatchObject({ where: { id: "m1" }, data: { name: "Furnace (up)", lastServicedOn: day("2026-02-03") } });
    expect(revalidatePath).toHaveBeenCalledWith("/maintenance/m1");
  });

  it("treats another household's item as gone, and bad fields as an error", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await updateMaintenanceItemAction("theirs", fields)).toEqual({ ok: false, error: "That item isn't in your inventory any more" });
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue({ id: "m1" } as any);
    expect(await updateMaintenanceItemAction("m1", { ...fields, installedYear: 1 })).toEqual({ ok: false, error: "The year can't be before 1900" });
    expect(prisma.maintenanceItem.update).not.toHaveBeenCalled();
  });
});

describe("deleteMaintenanceItemAction", () => {
  it("deletes the household's own item", async () => {
    expect(await deleteMaintenanceItemAction("m1")).toEqual({ ok: true });
    expect(prisma.maintenanceItem.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
  it("leaves another household's item alone", async () => {
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await deleteMaintenanceItemAction("theirs")).toEqual({ ok: false, error: "That item isn't in your inventory any more" });
    expect(prisma.maintenanceItem.delete).not.toHaveBeenCalled();
  });
});

describe("markServicedAction", () => {
  it("records the date given (the browser's today)", async () => {
    expect(await markServicedAction("m1", "2026-10-05")).toEqual({ ok: true });
    expect(prisma.maintenanceItem.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { lastServicedOn: day("2026-10-05") } });
  });
  it("refuses a bad date, and another household's item", async () => {
    expect(await markServicedAction("m1", "nope")).toEqual({ ok: false, error: "Choose a valid date" });
    vi.mocked(prisma.maintenanceItem.findFirst).mockResolvedValue(null);
    expect(await markServicedAction("theirs", "2026-10-05")).toEqual({ ok: false, error: "That item isn't in your inventory any more" });
    expect(prisma.maintenanceItem.update).not.toHaveBeenCalled();
  });
});
