// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/todo/actions", () => ({
  addTodoAction: vi.fn(),
  updateTodoAction: vi.fn(),
  setTodoDoneAction: vi.fn(),
  deleteTodoAction: vi.fn(),
  clearDoneTodosAction: vi.fn(),
  reorderTodosAction: vi.fn(),
  skipMaintenanceTodoAction: vi.fn(),
}));
// jsdom can't perform a real drag, so capture onDragEnd and call it directly.
let onDragEnd: (e: any) => void = () => {};
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children, onDragEnd: handler }: any) => {
      onDragEnd = handler;
      return children;
    },
  };
});

import TodoClient, { TODO_POLL_MS } from "@/app/(app)/todo/TodoClient";
import { assigneeOptions } from "@/app/(app)/todo/assignees";
import {
  addTodoAction,
  clearDoneTodosAction,
  deleteTodoAction,
  reorderTodosAction,
  setTodoDoneAction,
  skipMaintenanceTodoAction,
  updateTodoAction,
} from "@/app/(app)/todo/actions";
import type { TodoItem } from "@/lib/todo";
import { localDateString } from "@/lib/dates";

const TODAY = "2026-10-07";
let n = 0;
const todo = (over: Partial<TodoItem> = {}): TodoItem => ({
  id: `t${++n}`, text: `To-do ${n}`, notes: null, assigneeContactId: null, assigneeName: null, dueDate: null, done: false, rating: 1500, comparisonCount: 0, maintenance: null, ...over,
});
const members = [{ id: "me", name: "Corey", fullName: "Corey B" }, { id: "sam", name: "Sam", fullName: "Sam B" }];

type Props = React.ComponentProps<typeof TodoClient>;
const props = (over: Partial<Props> = {}): Props => ({ open: [], done: [], members, myContactId: "me", today: TODAY, ...over });
const wrap = (p: Props) => (
  <App>
    <TodoClient {...p} />
  </App>
);
const setup = (over: Partial<Props> = {}) => render(wrap(props(over)));
const openTexts = () => [...(screen.queryByLabelText("To-dos")?.querySelectorAll(".todo-text") ?? [])].map((e) => e.firstChild!.textContent);
const choose = async (label: string | RegExp, title: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click((await screen.findAllByTitle(title)).at(-1)!);
};

beforeEach(() => {
  vi.resetAllMocks();
  n = 0;
  window.localStorage.clear();
  for (const fn of [updateTodoAction, setTodoDoneAction, deleteTodoAction, clearDoneTodosAction, reorderTodosAction, skipMaintenanceTodoAction]) vi.mocked(fn).mockResolvedValue({ ok: true } as any);
  vi.mocked(addTodoAction).mockResolvedValue({ ok: true, id: "new" });
});

describe("the list", () => {
  it("shows open to-dos in priority order with their due date and who they're for", () => {
    setup({
      open: [
        todo({ text: "Renew passport", dueDate: "2026-10-03", assigneeContactId: "sam", assigneeName: "Sam" }),
        todo({ text: "Call the vet", dueDate: TODAY, notes: "Ask about shots" }),
        todo({ text: "Mow" }),
      ],
    });
    expect(openTexts()).toEqual(["Renew passport", "Call the vet", "Mow"]);
    expect(screen.getByText("Overdue · Oct 3")).toHaveAttribute("data-tone", "overdue");
    expect(screen.getByText("Today")).toHaveAttribute("data-tone", "today");
    expect(screen.getByLabelText("has notes")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Who: Renew passport" }).closest(".ant-select")!).getByText("Sam")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Who: Mow" }).closest(".ant-select")!).getByText("Anyone")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prioritize" })).toHaveAttribute("href", "/todo/prioritize");
  });

  it("says when there is nothing to do, and offers no Prioritize for fewer than two", () => {
    setup();
    expect(screen.getByText("Nothing to do. Add something above.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Prioritize" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Add a to-do" })).toHaveFocus();
  });

  it("takes new data from the server when it arrives", () => {
    const { rerender } = setup({ open: [todo({ text: "Old" })] });
    rerender(wrap(props({ open: [todo({ text: "New" })] })));
    expect(openTexts()).toEqual(["New"]);
  });
});

describe("adding", () => {
  it("adds on Enter for Anyone with no date, clears the box, keeps the cursor there, and refreshes", async () => {
    setup();
    const box = screen.getByRole("textbox", { name: "Add a to-do" });
    await userEvent.type(box, "  Mow the lawn {Enter}");
    expect(addTodoAction).toHaveBeenCalledWith({ text: "Mow the lawn", assigneeContactId: null, dueDate: null });
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("adds with the button, which is off while the box is empty, and ignores a blank Enter", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "   {Enter}");
    expect(addTodoAction).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Mow");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addTodoAction).toHaveBeenCalledWith(expect.objectContaining({ text: "Mow" }));
  });

  it("adds for a chosen person, remembering the choice for next time", async () => {
    const { unmount } = setup();
    await choose("New to-dos are for", "Sam");
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Mow{Enter}");
    expect(addTodoAction).toHaveBeenCalledWith({ text: "Mow", assigneeContactId: "sam", dueDate: null });
    unmount();
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Rake{Enter}");
    expect(addTodoAction).toHaveBeenLastCalledWith({ text: "Rake", assigneeContactId: "sam", dueDate: null });
  });

  it("forgets a remembered person who is no longer a member", async () => {
    window.localStorage.setItem("todo.addAssignee", JSON.stringify("gone"));
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Mow{Enter}");
    expect(addTodoAction).toHaveBeenCalledWith(expect.objectContaining({ assigneeContactId: null }));
  });

  it("adds a due date one click in, then clears it for the next one", async () => {
    setup();
    expect(screen.queryByLabelText("Due date for the new to-do")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add a due date" }));
    fireEvent.change(screen.getByLabelText("Due date for the new to-do"), { target: { value: "2026-10-09" } });
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Pay bill{Enter}");
    expect(addTodoAction).toHaveBeenCalledWith({ text: "Pay bill", assigneeContactId: null, dueDate: "2026-10-09" });
    expect(screen.queryByLabelText("Due date for the new to-do")).toBeNull();
  });

  it("puts the text back and says why when adding fails", async () => {
    vi.mocked(addTodoAction).mockResolvedValue({ ok: false, error: "Type what needs doing" });
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Mow{Enter}");
    expect(await screen.findByText("Type what needs doing")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add a to-do" })).toHaveValue("Mow");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("says so when the new to-do is hidden by the filter", async () => {
    window.localStorage.setItem("todo.filter", JSON.stringify({ who: "mine", includeAnyone: false }));
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a to-do" }), "Mow{Enter}");
    expect(await screen.findByText("Added. It's hidden by the filter you're using.")).toBeInTheDocument();
  });
});

describe("the filter", () => {
  const items = () => [
    todo({ text: "Mine", assigneeContactId: "me", assigneeName: "Corey" }),
    todo({ text: "Sam's", assigneeContactId: "sam", assigneeName: "Sam" }),
    todo({ text: "Anyone's" }),
  ];

  it("shows everyone's, including Anyone's, by default", () => {
    setup({ open: items() });
    expect(openTexts()).toEqual(["Mine", "Sam's", "Anyone's"]);
  });

  it("narrows to mine or one member's, with or without Anyone's, and remembers it", async () => {
    const { unmount } = setup({ open: items() });
    await choose("Show", "Mine");
    expect(openTexts()).toEqual(["Mine", "Anyone's"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Include Anyone" }));
    expect(openTexts()).toEqual(["Mine"]);
    await choose("Show", "Sam's");
    expect(openTexts()).toEqual(["Sam's"]);
    unmount();
    setup({ open: items() });
    await waitFor(() => expect(openTexts()).toEqual(["Sam's"]));
  });

  it("says when the filter hides everything", async () => {
    setup({ open: [todo({ text: "Sam's", assigneeContactId: "sam" })] });
    await choose("Show", "Mine");
    expect(screen.getByText("Nothing to do for this filter.")).toBeInTheDocument();
  });

  it("offers no 'Mine' to a user who isn't a contact, and drops a remembered 'Mine' or unknown member", async () => {
    window.localStorage.setItem("todo.filter", JSON.stringify({ who: "mine", includeAnyone: true }));
    setup({ open: items(), myContactId: null });
    await waitFor(() => expect(openTexts()).toEqual(["Mine", "Sam's", "Anyone's"]));
    await userEvent.click(screen.getByRole("combobox", { name: "Show" }));
    expect(screen.queryByTitle("Mine")).toBeNull();
    expect(await screen.findByTitle("Corey's")).toBeInTheDocument();
  });

  it("works when browser storage is unavailable", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup({ open: items() });
    await choose("Show", "Mine");
    expect(openTexts()).toEqual(["Mine", "Anyone's"]);
    get.mockRestore();
    set.mockRestore();
  });

  it("filters the done items the same way", async () => {
    setup({ done: [todo({ text: "Sam's done", done: true, assigneeContactId: "sam" }), todo({ text: "Mine done", done: true, assigneeContactId: "me" })] });
    await choose("Show", "Mine");
    expect(screen.getByRole("button", { name: "Done (1)" })).toBeInTheDocument();
  });
});

describe("finishing", () => {
  it("moves a to-do to Done at once, saves it, and refreshes", async () => {
    setup({ open: [todo({ id: "a", text: "Mow" }), todo({ id: "b", text: "Rake" })] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Mow" }));
    expect(openTexts()).toEqual(["Rake"]);
    expect(setTodoDoneAction).toHaveBeenCalledWith("a", true, localDateString());
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    expect(within(screen.getByLabelText("Done")).getByText("Mow")).toBeInTheDocument();
  });

  it("puts it back and says why when saving fails", async () => {
    vi.mocked(setTodoDoneAction).mockResolvedValue({ ok: false, error: "That to-do isn't on the list any more" });
    setup({ open: [todo({ text: "Mow" })] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Mow" }));
    expect(await screen.findByText("That to-do isn't on the list any more")).toBeInTheDocument();
    expect(openTexts()).toEqual(["Mow"]);
  });

  it("shows done items one click in, crossed out, and undoes one back into the list", async () => {
    setup({ open: [todo({ text: "Rake" })], done: [todo({ id: "d", text: "Mow", done: true })] });
    expect(screen.queryByLabelText("Done")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    const done = within(screen.getByLabelText("Done"));
    expect(done.getByText("Mow").closest(".todo-row")).toHaveAttribute("data-done");
    expect(done.getByText("Done to-dos are cleared after 30 days.")).toBeInTheDocument();
    expect(done.queryByRole("combobox", { name: "Who: Mow" })).toBeNull();
    expect(done.getByText("Anyone")).toBeInTheDocument();
    expect(screen.queryByLabelText("Drag to reorder Mow")).toBeNull();
    await userEvent.click(done.getByRole("checkbox", { name: "Done: Mow" }));
    expect(setTodoDoneAction).toHaveBeenCalledWith("d", false, localDateString());
    expect(openTexts()).toEqual(["Rake", "Mow"]);
    expect(screen.queryByRole("button", { name: /Done \(/ })).toBeNull();
  });

  it("brings an undone item back to Done if saving fails", async () => {
    vi.mocked(setTodoDoneAction).mockResolvedValue({ ok: false, error: "Nope" });
    setup({ done: [todo({ id: "d", text: "Mow", done: true })] });
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Mow" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(openTexts()).toEqual([]);
    expect(within(screen.getByLabelText("Done")).getByText("Mow")).toBeInTheDocument();
  });

  it("clears done items, and hides them again", async () => {
    setup({ done: [todo({ text: "Mow", done: true })] });
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear done" }));
    expect(clearDoneTodosAction).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText("Done")).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says why clearing failed", async () => {
    vi.mocked(clearDoneTodosAction).mockResolvedValue({ ok: false, error: "Nope" });
    setup({ done: [todo({ text: "Mow", done: true })] });
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear done" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide done" }));
    expect(screen.queryByLabelText("Done")).toBeNull();
  });
});

describe("assigning", () => {
  it("changes who a to-do is for from its row, at once, leaving the others alone", async () => {
    setup({ open: [todo({ id: "a", text: "Mow" }), todo({ id: "b", text: "Rake" })] });
    await choose("Who: Mow", "Sam");
    expect(updateTodoAction).toHaveBeenCalledWith("a", { assigneeContactId: "sam" });
    expect(within(screen.getByRole("combobox", { name: "Who: Mow" }).closest(".ant-select")!).getByText("Sam")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Who: Rake" }).closest(".ant-select")!).getByText("Anyone")).toBeInTheDocument();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("hands it back to Anyone", async () => {
    setup({ open: [todo({ id: "a", text: "Mow", assigneeContactId: "sam", assigneeName: "Sam" })] });
    await choose("Who: Mow", "Anyone");
    expect(updateTodoAction).toHaveBeenCalledWith("a", { assigneeContactId: null });
  });

  it("puts the old person back and says why when saving fails", async () => {
    vi.mocked(updateTodoAction).mockResolvedValue({ ok: false, error: "Choose one of your household's members" });
    setup({ open: [todo({ id: "a", text: "Mow", assigneeContactId: "sam", assigneeName: "Sam" })] });
    await choose("Who: Mow", "Corey");
    expect(await screen.findByText("Choose one of your household's members")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Who: Mow" }).closest(".ant-select")!).getByText("Sam")).toBeInTheDocument();
  });

  it("keeps someone since removed, marked as removed", () => {
    const options = assigneeOptions(members, { assigneeContactId: "gone", assigneeName: null });
    expect(options.at(-1)).toEqual({ value: "gone", label: "Former member (removed)" });
    expect(assigneeOptions(members, { assigneeContactId: "gone", assigneeName: "Pat" }).at(-1)).toEqual({ value: "gone", label: "Pat (removed)" });
    expect(assigneeOptions(members)).toHaveLength(3);
  });
});

describe("reordering", () => {
  const three = () => [todo({ id: "a", text: "A" }), todo({ id: "b", text: "B" }), todo({ id: "c", text: "C" })];

  it("moves a dragged to-do at once and saves the whole order", async () => {
    setup({ open: three() });
    await act(async () => onDragEnd({ active: { id: "c" }, over: { id: "a" } }));
    expect(openTexts()).toEqual(["C", "A", "B"]);
    expect(reorderTodosAction).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  it("keeps hidden to-dos in their places when dragging in a filtered view", async () => {
    setup({ open: [todo({ id: "a", text: "A", assigneeContactId: "me" }), todo({ id: "b", text: "B", assigneeContactId: "sam" }), todo({ id: "c", text: "C", assigneeContactId: "me" })] });
    await choose("Show", "Mine");
    await act(async () => onDragEnd({ active: { id: "c" }, over: { id: "a" } }));
    expect(reorderTodosAction).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  it("ignores a drop outside the list or on itself", async () => {
    setup({ open: three() });
    await act(async () => onDragEnd({ active: { id: "a" }, over: null }));
    await act(async () => onDragEnd({ active: { id: "a" }, over: { id: "a" } }));
    expect(reorderTodosAction).not.toHaveBeenCalled();
  });

  it("puts the old order back and says why when saving fails", async () => {
    vi.mocked(reorderTodosAction).mockResolvedValue({ ok: false, error: "The list changed while you were moving things. Try again." });
    setup({ open: three() });
    await act(async () => onDragEnd({ active: { id: "c" }, over: { id: "a" } }));
    expect(await screen.findByText("The list changed while you were moving things. Try again.")).toBeInTheDocument();
    expect(openTexts()).toEqual(["A", "B", "C"]);
  });
});

describe("an item's details", () => {
  const open = async (text: string) => {
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${text}`) }));
    return within(await screen.findByRole("dialog"));
  };

  it("edits the text, notes, due date and person, then closes and refreshes", async () => {
    setup({ open: [todo({ id: "a", text: "Mow", notes: "Front", dueDate: "2026-10-09", assigneeContactId: "sam", assigneeName: "Sam" })] });
    const dialog = await open("Mow");
    expect(dialog.getByLabelText("Notes")).toHaveValue("Front");
    expect(dialog.getByLabelText("Due date")).toHaveValue("2026-10-09");
    await userEvent.clear(dialog.getByLabelText("To-do"));
    await userEvent.type(dialog.getByLabelText("To-do"), "Mow the back");
    await userEvent.click(dialog.getByRole("button", { name: "No date" }));
    await userEvent.type(dialog.getByLabelText("Notes"), " yard");
    await choose("Who", "Anyone");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateTodoAction).toHaveBeenCalledWith("a", { text: "Mow the back", notes: "Front yard", dueDate: "", assigneeContactId: null });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("saves on Enter in the text, keeping the person, and sets a due date", async () => {
    setup({ open: [todo({ id: "a", text: "Mow", assigneeContactId: "sam", assigneeName: "Sam" })] });
    const dialog = await open("Mow");
    expect(dialog.queryByRole("button", { name: "No date" })).toBeNull();
    fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "2026-10-10" } });
    await userEvent.type(dialog.getByLabelText("To-do"), "{Enter}");
    expect(updateTodoAction).toHaveBeenCalledWith("a", { text: "Mow", notes: "", dueDate: "2026-10-10", assigneeContactId: "sam" });
  });

  it("shows the reason when saving fails and stays open", async () => {
    vi.mocked(updateTodoAction).mockResolvedValue({ ok: false, error: "Type what needs doing" });
    setup({ open: [todo({ text: "Mow" })] });
    const dialog = await open("Mow");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText("Type what needs doing")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("deletes after confirming", async () => {
    setup({ open: [todo({ id: "a", text: "Mow" })] });
    const dialog = await open("Mow");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(deleteTodoAction).toHaveBeenCalledWith("a");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("opens a done item too (naming who it was for), and cancels without saving", async () => {
    setup({ done: [todo({ text: "Mow", done: true, assigneeName: "Sam", assigneeContactId: "sam" })] });
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    expect(within(screen.getByLabelText("Done")).getByText("Sam")).toBeInTheDocument();
    const dialog = await open("Mow");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(updateTodoAction).not.toHaveBeenCalled();
  });
});

describe("polling", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("looks again every 30 seconds while the tab is visible, and when the window gets focus", () => {
    const { unmount } = setup();
    act(() => vi.advanceTimersByTime(TODO_POLL_MS));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => vi.advanceTimersByTime(TODO_POLL_MS));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
    unmount();
    act(() => vi.advanceTimersByTime(TODO_POLL_MS));
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});

describe("a to-do made for a maintenance service", () => {
  const service = (over: Partial<TodoItem> = {}) => todo({ id: "s1", text: "Maintenance: Furnace", dueDate: TODAY, maintenance: { id: "m1", name: "Furnace" }, ...over });
  const open = async () => {
    await userEvent.click(screen.getByRole("button", { name: /^Maintenance: Furnace/ }));
    return within(await screen.findByRole("dialog"));
  };

  it("is marked as from Maintenance on its row, and checking it off sends the browser's date", async () => {
    setup({ open: [service()] });
    expect(screen.getByRole("button", { name: /^Maintenance: Furnace/ }).querySelector(".todo-maintenance")).not.toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Done: Maintenance: Furnace" }));
    expect(setTodoDoneAction).toHaveBeenCalledWith("s1", true, localDateString());
  });

  it("links to its item and says checking it off records the service; it can be skipped, not deleted", async () => {
    setup({ open: [service()] });
    const dialog = await open();
    expect(dialog.getByRole("link", { name: "Furnace" })).toHaveAttribute("href", "/maintenance/m1");
    expect(dialog.getByText(/Checking it off records the service as done today/)).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Delete" })).toBeNull();
    await userEvent.click(dialog.getByRole("button", { name: "Skip this time" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Skip" }));
    expect(skipMaintenanceTodoAction).toHaveBeenCalledWith("s1");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("can't be skipped once done", async () => {
    setup({ done: [service({ done: true })] });
    await userEvent.click(screen.getByRole("button", { name: "Done (1)" }));
    const dialog = await open();
    expect(dialog.getByRole("button", { name: "Skip this time" })).toBeDisabled();
  });
});
