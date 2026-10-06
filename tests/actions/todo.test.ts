import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    list: { findFirst: vi.fn(), create: vi.fn() },
    listItem: { findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    contact: { findMany: vi.fn() },
  };
  prisma.$transaction = (arg: unknown) => (typeof arg === "function" ? (arg as (tx: any) => unknown)(prisma) : Promise.all(arg as unknown[]));
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  addTodoAction,
  clearDoneTodosAction,
  deleteTodoAction,
  recordTodoComparisonAction,
  reorderTodosAction,
  setTodoDoneAction,
  updateTodoAction,
} from "@/app/(app)/todo/actions";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const list = { id: "t1", householdId: "h1", kind: "TODO" };
const item = (over: Record<string, unknown> = {}) => ({ id: "i1", listId: "t1", assignedToContactId: null, rating: 1500, position: 0, checked: false, ...over });
const members = [{ id: "m1", firstName: "Sam", lastName: "Doe", nickname: null }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.list.findFirst).mockResolvedValue(list as any);
  vi.mocked(prisma.listItem.findFirst).mockResolvedValue(item() as any);
  vi.mocked(prisma.listItem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: 4 } } as any);
  vi.mocked(prisma.listItem.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.listItem.update).mockResolvedValue({} as any);
  vi.mocked(prisma.contact.findMany).mockResolvedValue(members as any);
});

describe("authentication", () => {
  it.each([
    ["add", () => addTodoAction({ text: "Mow" })],
    ["update", () => updateTodoAction("i1", { text: "Mow" })],
    ["done", () => setTodoDoneAction("i1", true)],
    ["delete", () => deleteTodoAction("i1")],
    ["clear done", () => clearDoneTodosAction()],
    ["reorder", () => reorderTodosAction(["i1"])],
    ["compare", () => recordTodoComparisonAction("i1", "i2", "A")],
  ])("%s refuses a caller with no session, touching nothing", async (_n, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.listItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.listItem.create).not.toHaveBeenCalled();
    expect(prisma.listItem.update).not.toHaveBeenCalled();
    expect(prisma.listItem.delete).not.toHaveBeenCalled();
    expect(prisma.listItem.deleteMany).not.toHaveBeenCalled();
  });
});

describe("addTodoAction", () => {
  it("adds to the bottom of the household's to-do list, rated just below the last open item", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(item({ rating: 1400 }) as any);
    expect(await addTodoAction({ text: " Mow ", assigneeContactId: "m1", dueDate: "2026-10-09", notes: "front only" })).toEqual({ ok: true, id: "new1" });
    expect(prisma.listItem.create).toHaveBeenCalledWith({
      data: { listId: "t1", text: "Mow", notes: "front only", assignedToContactId: "m1", dueDate: day("2026-10-09"), position: 5, rating: 1376 },
    });
    expect(vi.mocked(prisma.listItem.findFirst).mock.calls[0][0]).toEqual({ where: { listId: "t1", checked: false }, orderBy: { position: "desc" } });
    expect(revalidatePath).toHaveBeenCalledWith("/todo");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("starts the first item at the default rating, for anyone, with no date", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.listItem.aggregate).mockResolvedValue({ _max: { position: null } } as any);
    await addTodoAction({ text: "Mow" });
    expect(vi.mocked(prisma.listItem.create).mock.calls[0][0].data).toEqual({ listId: "t1", text: "Mow", notes: null, assignedToContactId: null, dueDate: null, position: 0 });
  });

  it("refuses blank text, a bad date, and someone who isn't a member, writing nothing", async () => {
    expect(await addTodoAction({ text: " " })).toEqual({ ok: false, error: "Type what needs doing" });
    expect(await addTodoAction({ text: "Mow", dueDate: "soon" })).toEqual({ ok: false, error: "Choose a valid due date" });
    expect(await addTodoAction({ text: "Mow", assigneeContactId: "someone-elses" })).toEqual({ ok: false, error: "Choose one of your household's members" });
    expect(prisma.listItem.create).not.toHaveBeenCalled();
  });
});

describe("updateTodoAction", () => {
  it("finds the item only on the session household's to-do list", async () => {
    await updateTodoAction("i1", { text: "Mow" });
    expect(prisma.listItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", list: { householdId: "h1", kind: "TODO" } } });
  });

  it("changes only the fields given", async () => {
    await updateTodoAction("i1", { assigneeContactId: "m1" });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { assignedToContactId: "m1" } });
    await updateTodoAction("i1", { text: "Mow back", notes: "", dueDate: "2026-10-10" });
    expect(vi.mocked(prisma.listItem.update).mock.calls[1][0]).toEqual({ where: { id: "i1" }, data: { text: "Mow back", notes: null, dueDate: day("2026-10-10") } });
  });

  it("clears the date and the assignee", async () => {
    await updateTodoAction("i1", { dueDate: "", assigneeContactId: null });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { assignedToContactId: null, dueDate: null } });
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("keeps an assignee who has since been removed, but won't pick a new non-member", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(item({ assignedToContactId: "gone" }) as any);
    expect(await updateTodoAction("i1", { assigneeContactId: "gone" })).toEqual({ ok: true });
    expect(await updateTodoAction("i1", { assigneeContactId: "other" })).toEqual({ ok: false, error: "Choose one of your household's members" });
  });

  it("treats an item that isn't on the household's to-do list as gone, and blank text as an error", async () => {
    expect(await updateTodoAction("i1", { text: "" })).toEqual({ ok: false, error: "Type what needs doing" });
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    expect(await updateTodoAction("theirs", { text: "Mow" })).toEqual({ ok: false, error: "That to-do isn't on the list any more" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });
});

describe("setTodoDoneAction", () => {
  it("marks done with the time, and undone without one", async () => {
    await setTodoDoneAction("i1", true);
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { checked: true, checkedAt: expect.any(Date) } });
    await setTodoDoneAction("i1", false);
    expect(prisma.listItem.update).toHaveBeenLastCalledWith({ where: { id: "i1" }, data: { checked: false, checkedAt: null } });
  });

  it("leaves another household's item alone", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    expect(await setTodoDoneAction("theirs", true)).toEqual({ ok: false, error: "That to-do isn't on the list any more" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });
});

describe("deleteTodoAction", () => {
  it("deletes the household's own item", async () => {
    expect(await deleteTodoAction("i1")).toEqual({ ok: true });
    expect(prisma.listItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });
  it("leaves another household's item alone", async () => {
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    expect(await deleteTodoAction("theirs")).toEqual({ ok: false, error: "That to-do isn't on the list any more" });
    expect(prisma.listItem.delete).not.toHaveBeenCalled();
  });
});

describe("clearDoneTodosAction", () => {
  it("removes every done item of the household's to-do list", async () => {
    expect(await clearDoneTodosAction()).toEqual({ ok: true });
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { listId: "t1", checked: true } });
  });
});

describe("reorderTodosAction", () => {
  beforeEach(() => vi.mocked(prisma.listItem.findMany).mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }] as any));

  it("writes the new order and ratings that follow it", async () => {
    expect(await reorderTodosAction(["c", "a", "b"])).toEqual({ ok: true });
    expect(vi.mocked(prisma.listItem.findMany).mock.calls[0][0]).toEqual({ where: { listId: "t1", checked: false }, select: { id: true } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { position: 0, rating: 1548 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 1, rating: 1524 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 2, rating: 1500 } });
  });

  it.each([
    ["one missing", ["a", "b"]],
    ["a stranger", ["a", "b", "x"]],
    ["a duplicate", ["a", "a", "b"]],
  ])("refuses an order with %s (the list changed meanwhile), writing nothing", async (_n, ids) => {
    expect(await reorderTodosAction(ids)).toEqual({ ok: false, error: "The list changed while you were moving things. Try again." });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });
});

describe("recordTodoComparisonAction", () => {
  beforeEach(() => {
    vi.mocked(prisma.listItem.findFirst).mockImplementation((async ({ where }: any) => item({ id: where.id, rating: 1500 })) as any);
  });

  it("updates both ratings and re-sorts the open to-dos by rating, ties keeping their order", async () => {
    vi.mocked(prisma.listItem.findMany).mockResolvedValue([
      { id: "b", rating: 1484, position: 0 },
      { id: "a", rating: 1516, position: 1 },
      { id: "c", rating: 1484, position: 2 },
    ] as any);
    const result = await recordTodoComparisonAction("a", "b", "A");
    expect(result).toMatchObject({ ok: true, a: 1516, b: 1484 });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { rating: 1516, comparisonCount: { increment: 1 } } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { rating: 1484, comparisonCount: { increment: 1 } } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 0 } });
    expect(prisma.listItem.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 1 } });
    expect(prisma.listItem.update).not.toHaveBeenCalledWith({ where: { id: "c" }, data: { position: 2 } });
  });

  it("refuses the same item twice, an unknown answer, and another household's item", async () => {
    expect(await recordTodoComparisonAction("a", "a", "A")).toEqual({ ok: false, error: "Pick two different to-dos" });
    expect(await recordTodoComparisonAction("a", "b", "C" as any)).toEqual({ ok: false, error: "Invalid answer" });
    vi.mocked(prisma.listItem.findFirst).mockResolvedValue(null);
    expect(await recordTodoComparisonAction("a", "b", "A")).toEqual({ ok: false, error: "That to-do isn't on the list any more" });
    expect(prisma.listItem.update).not.toHaveBeenCalled();
  });
});
