// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/todo", () => ({ loadTodo: vi.fn() }));
vi.mock("@/lib/maintenanceTodos", () => ({ syncMaintenanceTodos: vi.fn() }));
vi.mock("@/lib/householdMembers", () => ({ memberOptionsOf: vi.fn() }));
vi.mock("@/components/LocalToday", () => ({ default: () => <i data-testid="local-today" /> }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/todo/TodoClient", () => ({ default: (p: any) => ((seen.client = p), <div>todo client</div>) }));
vi.mock("@/app/(app)/lists/[id]/compare/CompareClient", () => ({ default: (p: any) => ((seen.compare = p), <div>compare</div>) }));
vi.mock("@/app/(app)/todo/actions", () => ({ recordTodoComparisonAction: vi.fn() }));

import { getIronSession } from "iron-session";
import { loadTodo } from "@/lib/todo";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import { memberOptionsOf } from "@/lib/householdMembers";
import { recordTodoComparisonAction } from "@/app/(app)/todo/actions";
import TodoPage from "@/app/(app)/todo/page";
import PrioritizeTodoPage from "@/app/(app)/todo/prioritize/page";

const todo = (over: Record<string, unknown> = {}) => ({
  id: "i1", text: "Mow", notes: null, assigneeContactId: null, assigneeName: null, dueDate: null, done: false, rating: 1500, comparisonCount: 0, maintenance: null, ...over,
});
const members = [{ id: "m1", name: "Sam", fullName: "Sam Doe" }];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1", contactId: "c-me" } as any);
  vi.mocked(loadTodo).mockResolvedValue({ listId: "t1", open: [todo()], done: [todo({ id: "d1", done: true })] } as any);
  vi.mocked(memberOptionsOf).mockResolvedValue(members);
});

describe("TodoPage", () => {
  it("loads the household's to-do list and members, with who the user is, and the browser's date", async () => {
    render(await TodoPage({ searchParams: Promise.resolve({ today: "2026-10-07" }) }));
    expect(syncMaintenanceTodos).toHaveBeenCalledWith("h1", "2026-10-07");
    expect(vi.mocked(syncMaintenanceTodos).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(loadTodo).mock.invocationCallOrder[0]);
    expect(loadTodo).toHaveBeenCalledWith("h1");
    expect(memberOptionsOf).toHaveBeenCalledWith("h1");
    expect(seen.client).toMatchObject({ open: [todo()], done: [todo({ id: "d1", done: true })], members, myContactId: "c-me", today: "2026-10-07" });
    expect(screen.getByTestId("local-today")).toBeInTheDocument();
  });

  it("uses the server's date until the browser's is known, and no contact for a user without one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
    render(await TodoPage({ searchParams: Promise.resolve({}) }));
    expect(seen.client).toMatchObject({ today: "2026-10-06", myContactId: null });
    vi.useRealTimers();
  });

  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(TodoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow();
  });
});

describe("PrioritizeTodoPage", () => {
  it("compares the open to-dos, naming whose each is, and goes back to the to-do list", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ listId: "t1", open: [todo(), todo({ id: "i2", text: "Paint", assigneeName: "Sam", rating: 1524, comparisonCount: 2 })], done: [] } as any);
    render(await PrioritizeTodoPage());
    expect(seen.compare).toEqual({
      backHref: "/todo",
      backLabel: "Back to the to-do list",
      compare: recordTodoComparisonAction,
      items: [
        { id: "i1", text: "Mow", detail: "Anyone", rating: 1500, comparisonCount: 0 },
        { id: "i2", text: "Paint", detail: "Sam", rating: 1524, comparisonCount: 2 },
      ],
    });
    expect(screen.getByRole("link", { name: "To-do" })).toHaveAttribute("href", "/todo");
  });

  it("needs a signed-in household", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(PrioritizeTodoPage()).rejects.toThrow();
  });
});
