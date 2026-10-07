import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    maintenanceItem: { findMany: vi.fn() },
    list: { findFirst: vi.fn(), create: vi.fn() },
    listItem: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { MAINTENANCE_LEAD_DAYS, maintenanceTodoText, syncMaintenanceTodos } from "@/lib/maintenanceTodos";

const TODAY = "2026-10-07";
const day = (d: string) => new Date(`${d}T00:00:00Z`);
// Every 3 months; last serviced on `last` (so due 3 months later).
const machine = (id: string, last: string, over: Record<string, unknown> = {}) => ({ id, name: `Item ${id}`, serviceEveryMonths: 3, lastServicedOn: day(last), ...over });
const linked = (over: Record<string, unknown>) => ({ id: "t1", maintenanceItemId: "m1", serviceDueOn: day("2026-10-10"), checked: false, assignedToContactId: null, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.listItem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.list.findFirst).mockResolvedValue({ id: "list1" } as any);
  vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 4 } } as any);
});

const created = () => vi.mocked(prisma.listItem.createMany).mock.calls[0]?.[0];

describe("syncMaintenanceTodos", () => {
  it("reads only the household's scheduled, serviced items and its maintenance to-dos", async () => {
    await syncMaintenanceTodos("h1", TODAY);
    expect(vi.mocked(prisma.maintenanceItem.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", serviceEveryMonths: { not: null }, lastServicedOn: { not: null } });
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]!.where).toEqual({ list: { householdId: "h1", kind: "TODO" }, maintenanceItemId: { not: null } });
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it(`makes a to-do for a service due within ${MAINTENANCE_LEAD_DAYS} days, or overdue, at the bottom of the list`, async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([
      machine("soon", "2026-07-14"), // due Oct 14: exactly 7 days out
      machine("late", "2026-06-01"), // due Sep 1: overdue
      machine("later", "2026-07-15"), // due Oct 15: too far out
    ] as any);
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue({ rating: 1400 } as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect(created()).toEqual({
      skipDuplicates: true,
      data: [
        { listId: "list1", text: "Maintenance: Item soon", maintenanceItemId: "soon", serviceDueOn: day("2026-10-14"), dueDate: day("2026-10-14"), assignedToContactId: null, position: 5, rating: 1376 },
        { listId: "list1", text: "Maintenance: Item late", maintenanceItemId: "late", serviceDueOn: day("2026-09-01"), dueDate: day("2026-09-01"), assignedToContactId: null, position: 6, rating: 1352 },
      ],
    });
    expect(vi.mocked(prisma.listItem.findFirst).mock.calls[0][0]).toEqual({ where: { listId: "list1", checked: false }, orderBy: { position: "desc" } });
  });

  it("starts at the default rating and the first position on an empty list", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([machine("m1", "2026-07-01")] as any);
    vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: null } } as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect(created()!.data).toEqual([expect.not.objectContaining({ rating: expect.anything() })]);
    expect((created()!.data as any[])[0].position).toBe(0);
  });

  it("gives a new one to whoever had the item's last one", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([machine("m1", "2026-07-01")] as any);
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([linked({ checked: true, serviceDueOn: day("2026-07-01"), assignedToContactId: "sam" })] as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect((created()!.data as any[])[0]).toMatchObject({ maintenanceItemId: "m1", assignedToContactId: "sam" });
  });

  it("makes none while one is open, or once that service date was checked off or skipped", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([machine("m1", "2026-07-10"), machine("m2", "2026-07-10")] as any);
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([
      linked({ id: "t1", maintenanceItemId: "m1", serviceDueOn: day("2026-10-10") }),
      linked({ id: "t2", maintenanceItemId: "m2", serviceDueOn: day("2026-10-10"), checked: true }),
    ] as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
    expect(prisma.listItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.listItem.deleteMany).not.toHaveBeenCalled();
  });

  it("moves an open one to its item's new due date", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([machine("m1", "2026-07-08")] as any); // now due Oct 8
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([linked({ serviceDueOn: day("2026-10-10") })] as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect(prisma.listItem.updateMany).toHaveBeenCalledWith({ where: { id: "t1" }, data: { serviceDueOn: day("2026-10-08"), dueDate: day("2026-10-08") } });
    expect(prisma.listItem.createMany).not.toHaveBeenCalled();
  });

  it("removes an open one whose item no longer needs service soon (serviced, unscheduled or deleted)", async () => {
    vi.mocked(prisma.maintenanceItem.findMany).mockResolvedValue([machine("m1", "2026-10-01")] as any); // next due Jan 2027
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([
      linked({ id: "t1", maintenanceItemId: "m1" }),
      linked({ id: "t2", maintenanceItemId: "unscheduled-or-gone" }),
    ] as any);
    await syncMaintenanceTodos("h1", TODAY);
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { id: "t2" } });
  });

  it("names the to-do after the item", () => {
    expect(maintenanceTodoText("Air filters")).toBe("Maintenance: Air filters");
  });
});
