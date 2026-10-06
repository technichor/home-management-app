import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { list: { findFirst: vi.fn(), create: vi.fn() }, listItem: { deleteMany: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import {
  DONE_KEEP_DAYS,
  dueLabel,
  dueTodos,
  getOrCreateTodoList,
  loadTodo,
  moveInOrder,
  RANK_GAP,
  ratingsInOrder,
  todoFieldsSchema,
  todoVisible,
} from "@/lib/todo";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const list = { id: "t1", householdId: "h1", kind: "TODO" };
const row = (over: Record<string, unknown> = {}) => ({
  id: "i1", text: "Mow", notes: null, assignedToContactId: null, assignedToContact: null, dueDate: null, checked: false, rating: 1500, comparisonCount: 0, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.list.findFirst).mockResolvedValue(list as any);
  vi.mocked(prisma.listItem.findMany).mockResolvedValue([]);
});

describe("todoFieldsSchema", () => {
  it("needs text, trims it, and turns blank extras into nothing", () => {
    expect(todoFieldsSchema.parse({ text: "  Mow ", notes: " ", assigneeContactId: "", dueDate: "" })).toEqual({ text: "Mow", notes: null, assigneeContactId: null, dueDate: null });
    expect(todoFieldsSchema.safeParse({ text: " " }).error?.issues[0].message).toBe("Type what needs doing");
    expect(todoFieldsSchema.safeParse({ text: "a".repeat(301) }).error?.issues[0].message).toBe("A to-do can be at most 300 characters");
    expect(todoFieldsSchema.safeParse({ text: "Mow", dueDate: "2026-02-30" }).error?.issues[0].message).toBe("Choose a valid due date");
  });
});

describe("getOrCreateTodoList", () => {
  it("returns the household's oldest to-do list", async () => {
    expect(await getOrCreateTodoList("h1")).toBe(list);
    expect(prisma.list.findFirst).toHaveBeenCalledWith({ where: { householdId: "h1", kind: "TODO" }, orderBy: { createdAt: "asc" } });
    expect(prisma.list.create).not.toHaveBeenCalled();
  });

  it("creates it the first time, then returns the oldest (so a race settles on one)", async () => {
    vi.mocked(prisma.list.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(list as any);
    expect(await getOrCreateTodoList("h1")).toBe(list);
    expect(prisma.list.create).toHaveBeenCalledWith({ data: { householdId: "h1", kind: "TODO", name: "To-do list", tags: [] } });
  });
});

describe("loadTodo", () => {
  it("clears done items older than the keep period, then returns open (by priority) and done (newest first)", async () => {
    const now = new Date("2026-10-31T12:00:00Z");
    vi.mocked(prisma.listItem.findMany)
      .mockResolvedValueOnce([row({ id: "o", assignedToContactId: "c1", assignedToContact: { firstName: "Elizabeth", nickname: "Ellie" }, dueDate: day("2026-11-02") })] as any)
      .mockResolvedValueOnce([row({ id: "d", checked: true })] as any);
    const result = await loadTodo("h1", now);
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({
      where: { listId: "t1", checked: true, checkedAt: { lt: new Date(now.getTime() - DONE_KEEP_DAYS * 86_400_000) } },
    });
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]).toMatchObject({ where: { listId: "t1", checked: false }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[1][0]).toMatchObject({ where: { listId: "t1", checked: true }, orderBy: [{ checkedAt: "desc" }] });
    expect(result).toEqual({
      listId: "t1",
      open: [{ id: "o", text: "Mow", notes: null, assigneeContactId: "c1", assigneeName: "Ellie", dueDate: "2026-11-02", done: false, rating: 1500, comparisonCount: 0 }],
      done: [{ id: "d", text: "Mow", notes: null, assigneeContactId: null, assigneeName: null, dueDate: null, done: true, rating: 1500, comparisonCount: 0 }],
    });
  });

  it("uses the current time by default", async () => {
    await loadTodo("h1");
    expect(prisma.listItem.deleteMany).toHaveBeenCalled();
  });
});

describe("dueTodos", () => {
  it("finds open to-dos due by today for the member or anyone, in the household's to-do list, most overdue first", async () => {
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([row({ dueDate: day("2026-10-01") })] as any);
    const items = await dueTodos("h1", "c1", "2026-10-07");
    expect(items.map((i) => i.dueDate)).toEqual(["2026-10-01"]);
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]).toMatchObject({
      where: {
        list: { householdId: "h1", kind: "TODO" },
        checked: false,
        dueDate: { lte: day("2026-10-07") },
        OR: [{ assignedToContactId: null }, { assignedToContactId: "c1" }],
      },
      orderBy: [{ dueDate: "asc" }, { position: "asc" }],
    });
  });

  it("only finds anyone's for a user who doesn't act as a contact", async () => {
    await dueTodos("h1", null, "2026-10-07");
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]!.where).toMatchObject({ OR: [{ assignedToContactId: null }] });
  });
});

describe("todoVisible", () => {
  const anyone = { assigneeContactId: null };
  const mine = { assigneeContactId: "me" };
  const sams = { assigneeContactId: "sam" };

  it("shows everyone's, with Anyone's only when included", () => {
    expect([mine, sams, anyone].map((i) => todoVisible(i, { who: "everyone", includeAnyone: true }, "me"))).toEqual([true, true, true]);
    expect([mine, sams, anyone].map((i) => todoVisible(i, { who: "everyone", includeAnyone: false }, "me"))).toEqual([true, true, false]);
  });

  it("shows only mine, or one member's, plus Anyone's when included", () => {
    expect([mine, sams, anyone].map((i) => todoVisible(i, { who: "mine", includeAnyone: true }, "me"))).toEqual([true, false, true]);
    expect([mine, sams, anyone].map((i) => todoVisible(i, { who: "sam", includeAnyone: false }, "me"))).toEqual([false, true, false]);
  });

  it("shows no assigned items as 'mine' for someone who isn't a contact", () => {
    expect(todoVisible(mine, { who: "mine", includeAnyone: true }, null)).toBe(false);
  });
});

describe("dueLabel", () => {
  const today = "2026-10-07"; // a Wednesday
  it("reads relative to today", () => {
    expect(dueLabel("2026-10-03", today)).toEqual({ text: "Overdue · Oct 3", tone: "overdue" });
    expect(dueLabel("2025-12-30", today)).toEqual({ text: "Overdue · Dec 30, 2025", tone: "overdue" });
    expect(dueLabel(today, today)).toEqual({ text: "Today", tone: "today" });
    expect(dueLabel("2026-10-08", today)).toEqual({ text: "Tomorrow", tone: "soon" });
    expect(dueLabel("2026-10-09", today)).toEqual({ text: "Fri", tone: "soon" });
    expect(dueLabel("2026-10-14", today)).toEqual({ text: "Oct 14", tone: "later" });
    expect(dueLabel("2027-01-04", today)).toEqual({ text: "Jan 4, 2027", tone: "later" });
  });
});

describe("ratingsInOrder", () => {
  it("counts down from the top, RANK_GAP apart, ending at the default", () => {
    expect(ratingsInOrder(3)).toEqual([1500 + 2 * RANK_GAP, 1500 + RANK_GAP, 1500]);
    expect(ratingsInOrder(0)).toEqual([]);
  });
});

describe("moveInOrder", () => {
  const order = ["a", "b", "c", "d"];
  it("puts the dragged item where it was dropped, up or down, keeping the rest in order", () => {
    expect(moveInOrder(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveInOrder(order, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });
  it("keeps hidden items in place between the visible ones (a drag from b to d in a filtered view)", () => {
    expect(moveInOrder(order, "b", "d")).toEqual(["a", "c", "d", "b"]);
  });
  it("leaves the order alone for a drop on itself or an unknown item", () => {
    expect(moveInOrder(order, "b", "b")).toBe(order);
    expect(moveInOrder(order, "x", "b")).toBe(order);
    expect(moveInOrder(order, "b", "x")).toBe(order);
  });
});
