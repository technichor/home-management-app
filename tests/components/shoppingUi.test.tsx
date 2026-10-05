// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/meals/shopping" }));
vi.mock("@/app/(app)/lists/actions", () => ({
  toggleItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  deleteItemAction: vi.fn(),
}));
vi.mock("@/app/(app)/meals/shopping/actions", () => ({
  addShoppingItemAction: vi.fn(),
  setItemCategoryAction: vi.fn(),
  removeCheckedItemsAction: vi.fn(),
}));

import ShoppingList, { SHOPPING_POLL_MS } from "@/app/(app)/meals/shopping/ShoppingList";
import type { ShoppingItem } from "@/lib/shoppingGroups";
import { deleteItemAction, toggleItemAction, updateItemAction } from "@/app/(app)/lists/actions";
import { addShoppingItemAction, removeCheckedItemsAction, setItemCategoryAction } from "@/app/(app)/meals/shopping/actions";

const it0 = (id: string, text: string, category: ShoppingItem["category"], over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id, text, quantity: null, notes: null, checked: false, category, ...over,
});
const base = [
  it0("a", "Apples", "PRODUCE", { quantity: "6" }),
  it0("b", "Milk", "DAIRY_EGGS", { notes: "whole" }),
  it0("c", "Bananas", "PRODUCE"),
  it0("d", "Eggs", "DAIRY_EGGS", { checked: true }),
];

const setup = (items = base, variant: "page" | "panel" = "page") =>
  render(
    <App>
      <ShoppingList items={items} variant={variant} />
    </App>
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(toggleItemAction).mockResolvedValue(undefined);
  vi.mocked(updateItemAction).mockResolvedValue(undefined);
  vi.mocked(deleteItemAction).mockResolvedValue(undefined);
  vi.mocked(addShoppingItemAction).mockResolvedValue({ ok: true, id: "new1" });
  vi.mocked(setItemCategoryAction).mockResolvedValue({ ok: true });
  vi.mocked(removeCheckedItemsAction).mockResolvedValue({ ok: true, removed: 1 });
});

const sectionLabels = () => [...document.querySelectorAll(".shop-section-name")].map((e) => e.textContent);
const rowsIn = (label: string) => {
  const head = [...document.querySelectorAll(".shop-section-head")].find((h) => h.textContent?.startsWith(label))!;
  return [...head.parentElement!.querySelectorAll(".shop-name")].map((e) => e.textContent);
};

describe("what it shows", () => {
  it("groups items under section headings in store order, with the to-buy count", () => {
    setup();
    expect(sectionLabels()).toEqual(["Produce", "Dairy & Eggs"]);
    expect(rowsIn("Produce")).toEqual(["Apples", "Bananas"]);
    expect(screen.getByRole("heading", { name: "Shopping list (3)" })).toBeInTheDocument();
    expect(document.querySelectorAll(".shop-count")[0]).toHaveTextContent("2");
    expect(document.querySelectorAll(".shop-count")[1]).toHaveTextContent("1");
  });

  it("lists checked items last in a section, crossed out", () => {
    setup();
    expect(rowsIn("Dairy")).toEqual(["Milk", "Eggs"]);
    const eggs = screen.getByRole("checkbox", { name: "Eggs" });
    expect(eggs).toBeChecked();
    expect(eggs.closest(".shop-row")).toHaveAttribute("data-checked");
  });

  it("shows quantity and notes, and the section on every item", () => {
    setup();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("whole")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Section for Apples: Produce" })).toBeInTheDocument();
  });

  it("explains an empty list, and shows no title in the panel", () => {
    const { unmount } = setup([]);
    expect(screen.getByText(/Nothing on the list/)).toBeInTheDocument();
    unmount();
    setup(base, "panel");
    expect(screen.queryByRole("heading", { name: /Shopping list/ })).toBeNull();
    expect(document.querySelector(".shop")).toHaveClass("shop-panel");
  });

  it("marks the full page for big tap targets", () => {
    setup();
    expect(document.querySelector(".shop")).toHaveClass("shop-page");
  });

  it("collapses and expands a section", async () => {
    setup();
    const head = document.querySelector(".shop-section-head") as HTMLElement;
    expect(head).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Apples")).toBeNull();
    expect(screen.getByText("Milk")).toBeInTheDocument();
    await userEvent.click(head);
    expect(screen.getByText("Apples")).toBeInTheDocument();
  });
});

describe("quick add", () => {
  const box = () => screen.getByLabelText("Add an item");

  it("adds on Enter, in Other by default, shows it at once, clears the box and keeps focus", async () => {
    setup([]);
    await userEvent.type(box(), "  Batteries {Enter}");
    expect(addShoppingItemAction).toHaveBeenCalledWith("Batteries", "OTHER");
    expect(rowsIn("Other")).toEqual(["Batteries"]);
    expect(box()).toHaveValue("");
    expect(box()).toHaveFocus();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("lets many items be entered one after another without touching anything else", async () => {
    setup([]);
    await userEvent.type(box(), "One{Enter}Two{Enter}Three{Enter}");
    expect(vi.mocked(addShoppingItemAction).mock.calls.map((c) => c[0])).toEqual(["One", "Two", "Three"]);
    expect(rowsIn("Other")).toEqual(["One", "Two", "Three"]);
  });

  it("files into the chosen section, and keeps it for the next item", async () => {
    setup([]);
    await userEvent.click(screen.getByRole("combobox", { name: "Section" }));
    await userEvent.click(await screen.findByTitle("Bakery"));
    await userEvent.type(box(), "Bagels{Enter}Rolls{Enter}");
    expect(addShoppingItemAction).toHaveBeenNthCalledWith(1, "Bagels", "BAKERY");
    expect(addShoppingItemAction).toHaveBeenNthCalledWith(2, "Rolls", "BAKERY");
  });

  it("adds with the Add button, which is off while the box is empty", async () => {
    setup([]);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await userEvent.type(box(), "Salt");
    await userEvent.click(add);
    expect(addShoppingItemAction).toHaveBeenCalledWith("Salt", "OTHER");
  });

  it("ignores Enter on a blank box", async () => {
    setup([]);
    await userEvent.type(box(), "   {Enter}");
    expect(addShoppingItemAction).not.toHaveBeenCalled();
  });

  it("warns, but still adds, an item already on the list unchecked", async () => {
    setup();
    await userEvent.type(box(), "MILK{Enter}");
    expect(await screen.findByText('"MILK" is already on the list')).toBeInTheDocument();
    expect(addShoppingItemAction).toHaveBeenCalled();
  });

  it("does not warn about an item that is only on the list checked", async () => {
    setup();
    await userEvent.type(box(), "eggs{Enter}");
    expect(screen.queryByText(/already on the list/)).toBeNull();
  });

  it("takes the item back out and shows the reason if the server refuses it", async () => {
    vi.mocked(addShoppingItemAction).mockResolvedValue({ ok: false, error: "Items can be at most 200 characters" });
    setup([]);
    await userEvent.type(box(), "Thing{Enter}");
    expect(await screen.findByText("Items can be at most 200 characters")).toBeInTheDocument();
    expect(screen.queryByText("Thing")).toBeNull();
  });

  it("can't be edited, checked or moved until it has been saved", async () => {
    let finish!: (v: { ok: true; id: string }) => void;
    vi.mocked(addShoppingItemAction).mockReturnValue(new Promise((r) => (finish = r)));
    setup([]);
    await userEvent.type(box(), "Soon{Enter}");
    expect(screen.getByRole("checkbox", { name: "Soon" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Soon" })).toBeDisabled();
    await act(async () => finish({ ok: true, id: "real" }));
    expect(screen.getByRole("checkbox", { name: "Soon" })).toBeEnabled();
  });
});

describe("checking items off", () => {
  it("shows the change at once and saves it", async () => {
    setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Apples" }));
    expect(screen.getByRole("checkbox", { name: "Apples" })).toBeChecked();
    expect(toggleItemAction).toHaveBeenCalledWith("a", true);
    expect(rowsIn("Produce")).toEqual(["Bananas", "Apples"]); // checked items drop to the bottom
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("unchecks too", async () => {
    setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Eggs" }));
    expect(toggleItemAction).toHaveBeenCalledWith("d", false);
    expect(screen.getByRole("checkbox", { name: "Eggs" })).not.toBeChecked();
  });

  it("puts the item back and offers a retry when saving fails; the retry works", async () => {
    vi.mocked(toggleItemAction).mockRejectedValueOnce(new Error("offline"));
    setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Apples" }));
    const retry = await screen.findByRole("button", { name: /Couldn.t save. Retry/ });
    expect(screen.getByRole("checkbox", { name: "Apples" })).not.toBeChecked();
    expect(router.refresh).not.toHaveBeenCalled();
    await userEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull());
    expect(toggleItemAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("checkbox", { name: "Apples" })).toBeChecked();
  });
});

describe("changing an item's section", () => {
  it("moves it at once and saves", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Section for Bananas: Produce" }));
    await userEvent.click(await screen.findByText("Frozen"));
    expect(setItemCategoryAction).toHaveBeenCalledWith("c", "FROZEN");
    expect(sectionLabels()).toEqual(["Produce", "Dairy & Eggs", "Frozen"]);
    expect(rowsIn("Frozen")).toEqual(["Bananas"]);
  });

  it("puts it back and offers a retry if the server says no", async () => {
    vi.mocked(setItemCategoryAction).mockResolvedValue({ ok: false, error: "That item isn't on your shopping list any more" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Section for Bananas: Produce" }));
    await userEvent.click(await screen.findByText("Frozen"));
    expect(await screen.findByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(rowsIn("Produce")).toEqual(["Apples", "Bananas"]);
  });
});

describe("editing an item", () => {
  const open = async (name: string | RegExp) => {
    await userEvent.click(screen.getByRole("button", { name }));
    return within(await screen.findByRole("dialog"));
  };

  it("saves quantity and notes (blank becomes none)", async () => {
    setup();
    const dialog = await open("Bananas");
    await userEvent.type(dialog.getByLabelText("Quantity"), "  1 bunch ");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateItemAction).toHaveBeenCalledWith("c", { quantity: "1 bunch", notes: null });
    expect(screen.getByText("1 bunch")).toBeInTheDocument();
  });

  it("starts from what is there, and clearing it removes it", async () => {
    setup();
    const dialog = await open(/^Apples/);
    expect(dialog.getByLabelText("Quantity")).toHaveValue("6");
    await userEvent.clear(dialog.getByLabelText("Quantity"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateItemAction).toHaveBeenCalledWith("a", { quantity: null, notes: null });
  });

  it("deletes an item after confirming", async () => {
    setup();
    const dialog = await open("Bananas");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(deleteItemAction).toHaveBeenCalledWith("c");
    expect(rowsIn("Produce")).toEqual(["Apples"]);
  });

  it("brings a deleted item back, with a retry, if the delete fails", async () => {
    vi.mocked(deleteItemAction).mockRejectedValueOnce(new Error("offline"));
    setup();
    const dialog = await open("Bananas");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(rowsIn("Produce")).toContain("Bananas");
  });

  it("saves notes", async () => {
    setup();
    const dialog = await open("Bananas");
    await userEvent.type(dialog.getByLabelText("Notes"), "ripe ones");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateItemAction).toHaveBeenCalledWith("c", { quantity: null, notes: "ripe ones" });
    expect(document.querySelector(".shop-notes:not(:empty)")).toHaveTextContent("ripe ones");
  });

  it("closes with the X without saving", async () => {
    setup();
    const dialog = await open(/^Milk/);
    await userEvent.click(dialog.getByRole("button", { name: /close/i }));
    expect(updateItemAction).not.toHaveBeenCalled();
  });

  it("cancels without saving", async () => {
    setup();
    const dialog = await open(/^Apples/);
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(updateItemAction).not.toHaveBeenCalled();
  });
});

describe("removing checked items", () => {
  it("states the count, asks first, then removes them", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Remove checked items (1)" }));
    expect(await screen.findByText("Remove 1 checked item?")).toBeInTheDocument();
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeCheckedItemsAction).toHaveBeenCalled());
    expect(screen.queryByText("Eggs")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove checked items/ })).toBeNull();
  });

  it("says 'items' for several", async () => {
    setup([it0("x", "A", "OTHER", { checked: true }), it0("y", "B", "OTHER", { checked: true })]);
    await userEvent.click(screen.getByRole("button", { name: "Remove checked items (2)" }));
    expect(await screen.findByText("Remove 2 checked items?")).toBeInTheDocument();
  });

  it("is not offered when nothing is checked", () => {
    setup([it0("x", "A", "OTHER")]);
    expect(screen.queryByRole("button", { name: /Remove checked items/ })).toBeNull();
  });

  it("keeps the items and shows the reason if it fails", async () => {
    vi.mocked(removeCheckedItemsAction).mockResolvedValue({ ok: false, error: "nope" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Remove checked items/ }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(screen.getByText("Eggs")).toBeInTheDocument();
  });
});

describe("keeping up with other people's changes", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("refreshes on a timer while the tab is visible, and when the window gets focus", () => {
    setup();
    router.refresh.mockClear();
    act(() => vi.advanceTimersByTime(SHOPPING_POLL_MS * 2));
    expect(router.refresh).toHaveBeenCalledTimes(2);
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("does not refresh a hidden tab, and stops when closed", () => {
    const { unmount } = setup();
    router.refresh.mockClear();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => vi.advanceTimersByTime(SHOPPING_POLL_MS * 2));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    unmount();
    act(() => vi.advanceTimersByTime(SHOPPING_POLL_MS * 2));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows what the server sends next, unless a change of ours is still being saved", async () => {
    let finish!: () => void;
    vi.mocked(toggleItemAction).mockReturnValue(new Promise<void>((r) => (finish = r)));
    const wrap = (items: ShoppingItem[]) => (
      <App>
        <ShoppingList items={items} variant="page" />
      </App>
    );
    const { rerender } = render(wrap(base));
    await userEvent.click(screen.getByRole("checkbox", { name: "Apples" }));
    // The server's copy still says unchecked while ours is in flight: ours stays.
    rerender(wrap(base.map((i) => ({ ...i }))));
    expect(screen.getByRole("checkbox", { name: "Apples" })).toBeChecked();
    await act(async () => finish());
    // Once saved, the next copy from the server (with someone else's new item) is taken.
    rerender(wrap([...base.map((i) => (i.id === "a" ? { ...i, checked: true } : i)), it0("z", "Zucchini", "PRODUCE")]));
    expect(screen.getByText("Zucchini")).toBeInTheDocument();
  });
});
