// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/[slug]/(app)/lists/actions", () => ({
  createListAction: vi.fn(),
  renameListAction: vi.fn(),
  archiveListAction: vi.fn(),
  unarchiveListAction: vi.fn(),
  deleteListAction: vi.fn(),
}));

import ListsClient from "@/app/[slug]/(app)/lists/ListsClient";
import ArchivedListsClient from "@/app/[slug]/(app)/lists/archived/ArchivedListsClient";
import {
  createListAction,
  renameListAction,
  archiveListAction,
  unarchiveListAction,
  deleteListAction,
} from "@/app/[slug]/(app)/lists/actions";

const lists = [
  { id: "l1", name: "Costco run", tags: ["grocery", "weekly"], totalItems: 5, checkedItems: 2 },
  { id: "l2", name: "Packing", tags: [], totalItems: 0, checkedItems: 0 },
  { id: "l3", name: "Garden", tags: ["weekly"], totalItems: 3, checkedItems: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createListAction).mockResolvedValue({ id: "new1" });
});

async function openRowMenu(listName: string) {
  const row = screen.getByText(listName).closest("div[style*='display: flex']") as HTMLElement;
  await userEvent.click(within(row).getByRole("button"));
}

describe("ListsClient", () => {
  it("shows an empty state with no lists, and no filters", () => {
    render(<ListsClient lists={[]} slug="s" />);
    expect(screen.getByText(/No active lists/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search lists by name")).not.toBeInTheDocument();
  });

  it("lists names, tags, counts and links", () => {
    render(<ListsClient lists={lists} slug="s" />);
    expect(screen.getByText("Lists (3)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Costco run" })).toHaveAttribute("href", "/s/lists/l1");
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("grocery")).toBeInTheDocument();
  });

  it("filters by name search and shows a no-match message", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    const search = screen.getByPlaceholderText("Search lists by name");
    await userEvent.type(search, "cost");
    expect(screen.getByText("Costco run")).toBeInTheDocument();
    expect(screen.queryByText("Packing")).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText("No lists match that search or tag.")).toBeInTheDocument();
  });

  it("filters by tag", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("grocery"));
    expect(screen.getByText("Costco run")).toBeInTheDocument();
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
  });

  it("clears the tag filter", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("grocery"));
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    const select = document.querySelector(".ant-select") as HTMLElement;
    await userEvent.hover(select);
    await userEvent.click(select.querySelector(".ant-select-clear") as HTMLElement);
    expect(await screen.findByText("Garden")).toBeInTheDocument();
  });

  it("hides the tag filter when no list has tags", () => {
    render(<ListsClient lists={[lists[1]]} slug="s" />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("creates a list and opens it", async () => {
    render(<ListsClient lists={[]} slug="s" />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("e.g. Costco run"), "  Trip  ");
    await userEvent.type(screen.getByPlaceholderText("grocery, urgent"), "a, ,b");
    await userEvent.click(create);
    await waitFor(() => expect(createListAction).toHaveBeenCalledWith("s", "Trip", ["a", "b"]));
    expect(router.push).toHaveBeenCalledWith("/s/lists/new1");
  });

  it("opens the CSV import after creating when asked", async () => {
    render(<ListsClient lists={[]} slug="s" />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    await userEvent.type(screen.getByPlaceholderText("e.g. Costco run"), "Trip");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/s/lists/new1?import=1"));
  });

  it("ignores Enter on a blank name and resets when cancelled", async () => {
    render(<ListsClient lists={[]} slug="s" />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    const name = screen.getByPlaceholderText("e.g. Costco run");
    await userEvent.type(name, "{Enter}");
    expect(createListAction).not.toHaveBeenCalled();
    await userEvent.type(name, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    await waitFor(() => expect(screen.getByPlaceholderText("e.g. Costco run")).toHaveValue(""));
  });

  it("renames a list", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Rename"));
    const input = await screen.findByDisplayValue("Costco run");
    await userEvent.clear(input);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(input, "{Enter}");
    expect(renameListAction).not.toHaveBeenCalled();
    await userEvent.type(input, "Bulk run{Enter}");
    await waitFor(() => expect(renameListAction).toHaveBeenCalledWith("l1", "Bulk run", "s"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("cancels a rename", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Rename"));
    await screen.findByDisplayValue("Costco run");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(renameListAction).not.toHaveBeenCalled();
  });

  it("archives a list", async () => {
    render(<ListsClient lists={lists} slug="s" />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Archive"));
    await waitFor(() => expect(archiveListAction).toHaveBeenCalledWith("l1", "s"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ListsClient lists={lists} slug="s" />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Delete"));
    expect(deleteListAction).not.toHaveBeenCalled();
  });

  it("deletes a list once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ListsClient lists={lists} slug="s" />);
    await openRowMenu("Packing");
    await userEvent.click(await screen.findByText("Delete"));
    await waitFor(() => expect(deleteListAction).toHaveBeenCalledWith("l2", "s"));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("ArchivedListsClient", () => {
  const archived = [
    { ...lists[0], archivedAt: "1/2/2026" },
    { ...lists[1], archivedAt: "3/4/2026" },
  ];

  it("shows an empty state", () => {
    render(<ArchivedListsClient lists={[]} slug="s" />);
    expect(screen.getByText("No archived lists.")).toBeInTheDocument();
  });

  it("lists archived lists with dates, tags and counts", () => {
    render(<ArchivedListsClient lists={archived} slug="s" />);
    expect(screen.getByText("Archived lists (2)")).toBeInTheDocument();
    expect(screen.getByText("archived 1/2/2026")).toBeInTheDocument();
    expect(screen.getByText("grocery")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("unarchives a list", async () => {
    render(<ArchivedListsClient lists={archived} slug="s" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Unarchive" })[0]);
    await waitFor(() => expect(unarchiveListAction).toHaveBeenCalledWith("l1", "s"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("deletes a list only after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<ArchivedListsClient lists={archived} slug="s" />);
    const buttons = screen.getAllByRole("button", { name: "Delete" });

    confirmSpy.mockReturnValueOnce(false);
    await userEvent.click(buttons[0]);
    expect(deleteListAction).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await userEvent.click(buttons[1]);
    await waitFor(() => expect(deleteListAction).toHaveBeenCalledWith("l2", "s"));
  });
});
