// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/[slug]/(app)/lists/actions", () => ({
  addItemsAction: vi.fn(),
  toggleItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  deleteItemAction: vi.fn(),
  reorderItemsAction: vi.fn(),
  setSortModeAction: vi.fn(),
}));
// jsdom can't perform a real drag, so capture onDragEnd and call it directly.
let onDragEnd: (e: any) => void = () => {};
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children, onDragEnd: handler }: any) => {
      onDragEnd = handler;
      return <>{children}</>;
    },
  };
});
vi.mock("@/app/[slug]/(app)/lists/ImportItemsModal", () => ({
  default: ({ open, onClose, onDone }: any) =>
    open ? (
      <div>
        import modal
        <button onClick={onClose}>close import</button>
        <button onClick={onDone}>finish import</button>
      </div>
    ) : null,
}));

import ListDetailClient from "@/app/[slug]/(app)/lists/[id]/ListDetailClient";
import {
  addItemsAction,
  toggleItemAction,
  updateItemAction,
  deleteItemAction,
  reorderItemsAction,
  setSortModeAction,
} from "@/app/[slug]/(app)/lists/actions";

const items = [
  { id: "a", text: "milk", quantity: "2 gallons", notes: "whole", checked: false, assignedToContactId: "c1" },
  { id: "b", text: "eggs", quantity: null, notes: null, checked: true, assignedToContactId: null },
  { id: "c", text: "bread", quantity: null, notes: null, checked: false, assignedToContactId: null },
];
const contacts = [
  { id: "c1", name: "Sam Smith" },
  { id: "c2", name: "Pat Jones" },
];

function setup(props: Partial<React.ComponentProps<typeof ListDetailClient>> = {}) {
  const base = {
    slug: "s",
    listId: "l1",
    listName: "Groceries",
    sortMode: "MANUAL" as const,
    openImport: false,
    items,
    contacts,
  };
  const ui = (p: Partial<typeof base>) => (
    <App>
      <ListDetailClient {...base} {...p} />
    </App>
  );
  const view = render(ui(props as any));
  return { ...view, rerenderWith: (p: any) => view.rerender(ui(p)) };
}

const rowOf = (text: string) => screen.getByText(text).closest("div[style*='border-bottom']") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [addItemsAction, toggleItemAction, updateItemAction, deleteItemAction, reorderItemsAction, setSortModeAction]) {
    vi.mocked(fn as any).mockResolvedValue(undefined);
  }
});

describe("display", () => {
  it("shows items with quantity, notes and assignee, checked items last", () => {
    setup();
    expect(screen.getByText("· 2 gallons", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("whole")).toBeInTheDocument();
    expect(screen.getByText("Sam Smith")).toBeInTheDocument();
    const order = screen.getAllByRole("checkbox").map((cb) => (cb as HTMLInputElement).checked);
    expect(order).toEqual([false, false, true]);
    expect(screen.getByText("eggs")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("shows an empty state", () => {
    setup({ items: [] });
    expect(screen.getByText("No items yet.")).toBeInTheDocument();
  });

  it("falls back to no assignee label for an unknown contact", () => {
    setup({ items: [{ ...items[0], assignedToContactId: "gone" }] });
    expect(screen.queryByText("Sam Smith")).not.toBeInTheDocument();
  });

  it("picks up new items from the server", () => {
    const { rerenderWith } = setup();
    rerenderWith({ items: [{ ...items[2], text: "bagels" }] });
    expect(screen.getByText("bagels")).toBeInTheDocument();
    expect(screen.queryByText("milk")).not.toBeInTheDocument();
  });
});

describe("quick add", () => {
  const box = () => screen.getByPlaceholderText(/Add an item/);

  it("adds on Enter and clears the box", async () => {
    setup();
    await userEvent.type(box(), "butter{Enter}");
    await waitFor(() => expect(addItemsAction).toHaveBeenCalledWith("l1", "s", ["butter"]));
    expect(box()).toHaveValue("");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("adds several lines at once", async () => {
    setup();
    await userEvent.click(box());
    await userEvent.paste("one\ntwo");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(addItemsAction).toHaveBeenCalledWith("l1", "s", ["one", "two"]));
  });

  it("does not submit on Shift+Enter or blank input", async () => {
    setup();
    await userEvent.type(box(), "x{Shift>}{Enter}{/Shift}");
    expect(addItemsAction).not.toHaveBeenCalled();
    await userEvent.clear(box());
    await userEvent.type(box(), "{Enter}");
    expect(addItemsAction).not.toHaveBeenCalled();
  });

  it("shows the error when adding fails", async () => {
    vi.mocked(addItemsAction).mockRejectedValue(new Error("List not found"));
    setup();
    await userEvent.type(box(), "x{Enter}");
    expect(await screen.findByText("List not found")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows a generic message for a non-Error failure", async () => {
    vi.mocked(addItemsAction).mockRejectedValue("boom");
    setup();
    await userEvent.type(box(), "x{Enter}");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});

describe("check, edit, delete", () => {
  it("checks and unchecks an item", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("checkbox"));
    await waitFor(() => expect(toggleItemAction).toHaveBeenCalledWith("a", "s", true));
    await userEvent.click(within(rowOf("eggs")).getByRole("checkbox"));
    await waitFor(() => expect(toggleItemAction).toHaveBeenCalledWith("b", "s", false));
  });

  it("deletes after confirming", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Delete item" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent('Delete "milk"?');
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteItemAction).toHaveBeenCalledWith("a", "s"));
  });

  it("edits every field, including the assignee", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Edit item" }));
    const text = await screen.findByPlaceholderText("Item");
    expect(text).toHaveValue("milk");
    await userEvent.clear(text);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(text, "oat milk");
    await userEvent.clear(screen.getByPlaceholderText(/Quantity/));
    await userEvent.type(screen.getByPlaceholderText(/Quantity/), "1 carton");
    await userEvent.clear(screen.getByPlaceholderText("Notes"));
    await userEvent.type(screen.getByPlaceholderText("Notes"), "unsweetened");
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Pat Jones"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateItemAction).toHaveBeenCalledWith("a", "s", {
        text: "oat milk",
        quantity: "1 carton",
        notes: "unsweetened",
        assignedToContactId: "c2",
      })
    );
  });

  it("fills blanks for an item with no quantity, notes or assignee, and clears the assignee", async () => {
    setup();
    await userEvent.click(within(rowOf("bread")).getByRole("button", { name: "Edit item" }));
    expect(await screen.findByPlaceholderText(/Quantity/)).toHaveValue("");
    expect(screen.getByPlaceholderText("Notes")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateItemAction).toHaveBeenCalledWith("c", "s", {
        text: "bread",
        quantity: "",
        notes: "",
        assignedToContactId: null,
      })
    );
  });

  it("clears an assignee with the clear control", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Edit item" }));
    await screen.findByPlaceholderText("Item");
    const select = document.querySelector(".ant-select") as HTMLElement;
    await userEvent.hover(select);
    await userEvent.click(select.querySelector(".ant-select-clear") as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateItemAction).toHaveBeenCalledWith("a", "s", expect.objectContaining({ assignedToContactId: null }))
    );
  });

  it("closes the edit modal on cancel without saving", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Edit item" }));
    await screen.findByPlaceholderText("Item");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateItemAction).not.toHaveBeenCalled();
  });
});

describe("sort mode", () => {
  it("shows drag handles and no Prioritize button when manual", () => {
    setup();
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Prioritize/ })).not.toBeInTheDocument();
  });

  it("hides drag handles and offers Prioritize when pairwise", () => {
    setup({ sortMode: "PAIRWISE" });
    expect(screen.queryByLabelText("Drag to reorder")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/s/lists/l1/compare");
  });

  it("hides Prioritize in pairwise mode with fewer than two unchecked items", () => {
    setup({ sortMode: "PAIRWISE", items: [items[0], items[1]] });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("switches to pairwise after confirmation", async () => {
    setup();
    await userEvent.click(screen.getByText("Pairwise"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Switch to pairwise ranking?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(setSortModeAction).toHaveBeenCalledWith("l1", "s", "PAIRWISE"));
  });

  it("switches to manual after confirmation", async () => {
    setup({ sortMode: "PAIRWISE" });
    await userEvent.click(screen.getByText("Manual"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Switch to manual sorting?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(setSortModeAction).toHaveBeenCalledWith("l1", "s", "MANUAL"));
  });
});

describe("drag to reorder", () => {
  it("saves the new order, treating checked items as part of the displayed order", () => {
    setup();
    // Displayed order is milk, bread, eggs (checked last). Drag bread above milk.
    onDragEnd({ active: { id: "c" }, over: { id: "a" } });
    expect(reorderItemsAction).toHaveBeenCalledWith("l1", "s", ["c", "a", "b"]);
  });

  it("ignores a drop with no target or onto itself", () => {
    setup();
    onDragEnd({ active: { id: "a" }, over: null });
    onDragEnd({ active: { id: "a" }, over: { id: "a" } });
    expect(reorderItemsAction).not.toHaveBeenCalled();
  });

  it("ignores drags in pairwise mode", () => {
    setup({ sortMode: "PAIRWISE" });
    onDragEnd({ active: { id: "c" }, over: { id: "a" } });
    expect(reorderItemsAction).not.toHaveBeenCalled();
  });
});

describe("CSV import entry", () => {
  it("opens from the button and closes", async () => {
    setup();
    expect(screen.queryByText("import modal")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Import CSV/ }));
    expect(screen.getByText("import modal")).toBeInTheDocument();
    await userEvent.click(screen.getByText("close import"));
    expect(screen.queryByText("import modal")).not.toBeInTheDocument();
  });

  it("opens straight away when asked, and refreshes when done", async () => {
    setup({ openImport: true });
    await userEvent.click(screen.getByText("finish import"));
    expect(router.replace).toHaveBeenCalledWith("/s/lists/l1");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByText("import modal")).not.toBeInTheDocument();
  });
});
