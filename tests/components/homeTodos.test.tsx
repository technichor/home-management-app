// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/todo/actions", () => ({ setTodoDoneAction: vi.fn() }));

import HomeTodos, { HOME_TODOS_SHOWN, PHONE_SHOWN } from "@/app/(app)/home/HomeTodos";
import { setTodoDoneAction } from "@/app/(app)/todo/actions";
import type { TodoItem } from "@/lib/todo";

const TODAY = "2026-10-07";
let n = 0;
const todo = (over: Partial<TodoItem> = {}): TodoItem => ({
  id: `t${++n}`, text: `To-do ${n}`, notes: null, assigneeContactId: null, assigneeName: null, dueDate: null, done: false, rating: 1500, comparisonCount: 0, maintenance: null, ...over,
});
const setup = (items: TodoItem[]) =>
  render(
    <App>
      <HomeTodos items={items} today={TODAY} />
    </App>,
  );
const section = () => screen.getByRole("region", { name: "To-do" });
const rows = () => [...section().querySelectorAll(".home-todo-row")].map((r) => r.querySelector(".brief-title")!.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  n = 0;
  vi.mocked(setTodoDoneAction).mockResolvedValue({ ok: true });
});

describe("HomeTodos", () => {
  it("lists the to-dos with their due date and who they're for, linking to the to-do list", () => {
    setup([todo({ text: "Renew passport", dueDate: "2026-10-03", assigneeName: "Sam" }), todo({ text: "Mow", dueDate: TODAY }), todo({ text: "Rake" })]);
    expect(rows()).toEqual(["Renew passport", "Mow", "Rake"]);
    const first = within(section()).getByText("Renew passport").closest(".home-todo-row") as HTMLElement;
    expect(first).toHaveAttribute("data-overdue");
    expect(first).toHaveTextContent("Overdue · Oct 3 · Sam");
    expect(within(section()).getByText("Mow").closest(".home-todo-row")).not.toHaveAttribute("data-overdue");
    expect(within(section()).getByText("Rake").closest(".home-todo-row")).toHaveTextContent(/^RakeAnyone$/);
    expect(within(section()).getByText("Rake").closest("a")).toHaveAttribute("href", "/todo");
    expect(within(section()).getByRole("link", { name: "Open list" })).toHaveAttribute("href", "/todo");
  });

  it("marks a to-do made for a maintenance service", () => {
    setup([todo({ text: "Maintenance: Furnace", maintenance: { id: "m1", name: "Furnace" } }), todo({ text: "Rake" })]);
    expect(section().querySelectorAll(".todo-maintenance")).toHaveLength(1);
    expect(within(section()).getByText("Maintenance: Furnace").querySelector(".todo-maintenance")).not.toBeNull();
  });

  it("says when there is nothing for you", () => {
    setup([]);
    expect(screen.getByText("Nothing on your list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("checks a to-do off right here: it leaves at once, is saved, and the page refreshes", async () => {
    setup([todo({ id: "a", text: "Mow" }), todo({ text: "Rake" })]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Mow" }));
    expect(rows()).toEqual(["Rake"]);
    expect(setTodoDoneAction).toHaveBeenCalledWith("a", true, TODAY);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("brings it back and says why when saving fails", async () => {
    vi.mocked(setTodoDoneAction).mockResolvedValue({ ok: false, error: "That to-do isn't on the list any more" });
    setup([todo({ text: "Mow" }), todo({ text: "Rake" })]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Mow" }));
    expect(await screen.findByText("That to-do isn't on the list any more")).toBeInTheDocument();
    expect(rows()).toEqual(["Mow", "Rake"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows up to the cap, and counts the rest on the list", () => {
    setup(Array.from({ length: HOME_TODOS_SHOWN + 2 }, () => todo()));
    expect(rows()).toHaveLength(HOME_TODOS_SHOWN);
    expect(screen.getByRole("link", { name: "+2 more on the list" })).toHaveAttribute("href", "/todo");
  });

  it("offers a phone toggle for the rows past the first three, which marks the section expanded", async () => {
    setup(Array.from({ length: PHONE_SHOWN + 2 }, () => todo()));
    expect(screen.queryByRole("link", { name: /more on the list/ })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show 2 more" });
    expect(section()).not.toHaveAttribute("data-expanded");
    await userEvent.click(toggle);
    expect(section()).toHaveAttribute("data-expanded");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(section()).not.toHaveAttribute("data-expanded");
  });

  it("has no toggle with three or fewer", () => {
    setup(Array.from({ length: PHONE_SHOWN }, () => todo()));
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });
});
