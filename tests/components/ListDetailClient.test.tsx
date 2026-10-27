// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/lists/actions", () => ({
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
vi.mock("@/app/(app)/lists/[id]/ListSharingModal", () => ({
  default: ({ open, onClose, publicUrl }: any) =>
    open ? (
      <div>
        sharing for {publicUrl ?? "no link"}
        <button onClick={onClose}>close sharing</button>
      </div>
    ) : null,
}));
vi.mock("@/app/(app)/lists/ImportItemsModal", () => ({
  default: ({ open, onClose, onDone }: any) =>
    open ? (
      <div>
        import modal
        <button onClick={onClose}>close import</button>
        <button onClick={onDone}>finish import</button>
      </div>
    ) : null,
}));

import ListDetailClient from "@/app/(app)/lists/[id]/ListDetailClient";
import {
  addItemsAction,
  toggleItemAction,
  updateItemAction,
  deleteItemAction,
  reorderItemsAction,
  setSortModeAction,
} from "@/app/(app)/lists/actions";

const items = [
  { id: "a", text: "milk", quantity: "2 gallons", notes: "whole", url: null, checked: false, assignedToContactId: "c1" },
  { id: "b", text: "eggs", quantity: null, notes: null, url: null, checked: true, assignedToContactId: null },
  { id: "c", text: "bread", quantity: null, notes: null, url: null, checked: false, assignedToContactId: null },
];
const contacts = [
  { id: "c1", name: "Sam Smith" },
  { id: "c2", name: "Pat Jones" },
];

function setup(props: Partial<React.ComponentProps<typeof ListDetailClient>> = {}) {
  const base = {
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
    await waitFor(() => expect(addItemsAction).toHaveBeenCalledWith("l1", ["butter"], undefined, null));
    expect(box()).toHaveValue("");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("adds several lines at once", async () => {
    setup();
    await userEvent.click(box());
    await userEvent.paste("one\ntwo");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(addItemsAction).toHaveBeenCalledWith("l1", ["one", "two"], undefined, null));
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
    await waitFor(() => expect(toggleItemAction).toHaveBeenCalledWith("a", true));
    await userEvent.click(within(rowOf("eggs")).getByRole("checkbox"));
    await waitFor(() => expect(toggleItemAction).toHaveBeenCalledWith("b", false));
  });

  it("deletes after confirming", async () => {
    setup();
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Delete item" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent('Delete "milk"?');
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteItemAction).toHaveBeenCalledWith("a"));
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
      expect(updateItemAction).toHaveBeenCalledWith("a", {
        text: "oat milk",
        quantity: "1 carton",
        notes: "unsweetened",
        url: "",
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
      expect(updateItemAction).toHaveBeenCalledWith("c", {
        text: "bread",
        quantity: "",
        notes: "",
        url: "",
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
      expect(updateItemAction).toHaveBeenCalledWith("a", expect.objectContaining({ assignedToContactId: null }))
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
    expect(screen.getByRole("link")).toHaveAttribute("href", "/lists/l1/compare");
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
    await waitFor(() => expect(setSortModeAction).toHaveBeenCalledWith("l1", "PAIRWISE"));
  });

  it("switches to manual after confirmation", async () => {
    setup({ sortMode: "PAIRWISE" });
    await userEvent.click(screen.getByText("Manual"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Switch to manual sorting?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(setSortModeAction).toHaveBeenCalledWith("l1", "MANUAL"));
  });
});

describe("drag to reorder", () => {
  it("saves the new order, treating checked items as part of the displayed order", () => {
    setup();
    // Displayed order is milk, bread, eggs (checked last). Drag bread above milk.
    onDragEnd({ active: { id: "c" }, over: { id: "a" } });
    expect(reorderItemsAction).toHaveBeenCalledWith("l1", ["c", "a", "b"]);
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
    expect(router.replace).toHaveBeenCalledWith("/lists/l1");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByText("import modal")).not.toBeInTheDocument();
  });
});

describe("links", () => {
  it("shows an item's link as a button that opens where it goes in a new tab", () => {
    setup({ items: [{ ...items[0], url: "https://www.amazon.com/dp/B0" }] });
    const link = within(rowOf("milk")).getByRole("link", { name: "Open milk (amazon.com)" });
    expect(link).toHaveAttribute("href", "https://www.amazon.com/dp/B0");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("amazon.com");
  });

  it("edits an item's link, and won't save one that isn't http(s)", async () => {
    setup({ items: [{ ...items[2], url: "https://old.test/x" }] });
    await userEvent.click(within(rowOf("bread")).getByRole("button", { name: "Edit item" }));
    const link = await screen.findByLabelText("Link");
    expect(link).toHaveValue("https://old.test/x");
    await userEvent.clear(link);
    await userEvent.type(link, "javascript:alert(1)");
    expect(screen.getByText("A link must start with http:// or https://")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.clear(link);
    await userEvent.type(link, "https://shop.test/bread");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateItemAction).toHaveBeenCalledWith("c", expect.objectContaining({ url: "https://shop.test/bread" })));
  });
});

describe("a Gift ideas list", () => {
  it("adds an idea with its link", async () => {
    setup({ kind: "GIFT", items: [] });
    expect(screen.getByText("Gift ideas")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/Add an item/), "Lego set");
    await userEvent.type(screen.getByLabelText("Link for the new item"), " https://shop.test/lego {Enter}");
    await waitFor(() => expect(addItemsAction).toHaveBeenCalledWith("l1", ["Lego set"], undefined, "https://shop.test/lego"));
    expect(screen.getByLabelText("Link for the new item")).toHaveValue("");
  });

  it("refuses a link that isn't one, or one for several items at once", async () => {
    setup({ kind: "GIFT", items: [] });
    await userEvent.type(screen.getByPlaceholderText(/Add an item/), "Lego set");
    await userEvent.type(screen.getByLabelText("Link for the new item"), "shop.test/lego{Enter}");
    expect(await screen.findByText("A link must start with http:// or https://")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Link for the new item"));
    await userEvent.type(screen.getByLabelText("Link for the new item"), "https://shop.test/lego");
    await userEvent.click(screen.getByPlaceholderText(/Add an item/));
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}Puzzle");
    await userEvent.click(screen.getByLabelText("Link for the new item"));
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("A link can only go with one item")).toBeInTheDocument();
    expect(addItemsAction).not.toHaveBeenCalled();
  });
});

describe("who can see it", () => {
  it("says who can see it and whose it is", () => {
    setup({ visibility: "SHARED", ownerName: "Ann Ray" });
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Ann Ray's list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Share/ })).toBeNull();
  });

  it("lets its owner open the Share dialog", async () => {
    setup({ sharing: { householdName: "The Beckers", sharedWithHousehold: true, shares: [], candidates: [], publicUrl: "https://domata.test/l/tok" } });
    await userEvent.click(screen.getByRole("button", { name: /Share/ }));
    expect(screen.getByText("sharing for https://domata.test/l/tok")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "close sharing" }));
    expect(screen.queryByText(/sharing for/)).toBeNull();
  });

  it("is read only for someone it's shared with to view: no adding, checking, editing, reordering or importing", () => {
    setup({ canEdit: false, contacts: [], items: [{ ...items[0], url: "https://shop.test/milk" }] });
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Add an item/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Import CSV/ })).toBeNull();
    expect(screen.queryByText("Sort:")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Done: milk" })).toBeDisabled();
    expect(within(rowOf("milk")).queryByRole("button", { name: "Edit item" })).toBeNull();
    expect(within(rowOf("milk")).queryByLabelText("Drag to reorder")).toBeNull();
    expect(within(rowOf("milk")).getByRole("link", { name: /Open milk/ })).toBeInTheDocument();
  });

  it("hides the assignee picker when there are no contacts to pick", async () => {
    setup({ contacts: [] });
    await userEvent.click(within(rowOf("milk")).getByRole("button", { name: "Edit item" }));
    await screen.findByPlaceholderText("Item");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

