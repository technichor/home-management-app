// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/lists/actions", () => ({
  createListAction: vi.fn(),
  renameListAction: vi.fn(),
  archiveListAction: vi.fn(),
  unarchiveListAction: vi.fn(),
  deleteListAction: vi.fn(),
  leaveSharedListAction: vi.fn(),
}));

import ListsClient from "@/app/(app)/lists/ListsClient";
import ArchivedListsClient from "@/app/(app)/lists/archived/ArchivedListsClient";
import {
  createListAction,
  renameListAction,
  archiveListAction,
  unarchiveListAction,
  deleteListAction,
  leaveSharedListAction,
} from "@/app/(app)/lists/actions";

const row = (over: object) =>
  ({ kind: "STANDARD", access: "manage", visibility: "HOUSEHOLD", sharedBy: null, archivedAt: null, ...over }) as any;
const lists = [
  row({ id: "l1", name: "Costco run", tags: ["grocery", "weekly"], totalItems: 5, checkedItems: 2 }),
  row({ id: "l2", name: "Packing", tags: [], totalItems: 0, checkedItems: 0 }),
  row({ id: "l3", name: "Garden", tags: ["weekly"], totalItems: 3, checkedItems: 3 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createListAction).mockResolvedValue({ id: "new1" });
});

async function openRowMenu(listName: string) {
  await userEvent.click(screen.getByRole("button", { name: `More for ${listName}` }));
}

describe("ListsClient", () => {
  it("shows an empty state with no lists, and no filters", () => {
    render(<ListsClient lists={[]} />);
    expect(screen.getByText(/No active lists/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search lists by name")).not.toBeInTheDocument();
  });

  it("lists names, tags, counts and links", () => {
    render(<ListsClient lists={lists} />);
    expect(screen.getByText("Lists (3)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Costco run" })).toHaveAttribute("href", "/lists/l1");
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("grocery")).toBeInTheDocument();
  });

  it("filters by name search and shows a no-match message", async () => {
    render(<ListsClient lists={lists} />);
    const search = screen.getByPlaceholderText("Search lists by name");
    await userEvent.type(search, "cost");
    expect(screen.getByText("Costco run")).toBeInTheDocument();
    expect(screen.queryByText("Packing")).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText("No lists match that search or tag.")).toBeInTheDocument();
  });

  it("filters by tag", async () => {
    render(<ListsClient lists={lists} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("grocery"));
    expect(screen.getByText("Costco run")).toBeInTheDocument();
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
  });

  it("clears the tag filter", async () => {
    render(<ListsClient lists={lists} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("grocery"));
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    const select = document.querySelector(".ant-select") as HTMLElement;
    await userEvent.hover(select);
    await userEvent.click(select.querySelector(".ant-select-clear") as HTMLElement);
    expect(await screen.findByText("Garden")).toBeInTheDocument();
  });

  it("hides the tag filter when no list has tags", () => {
    render(<ListsClient lists={[lists[1]]} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("creates a list and opens it", async () => {
    render(<ListsClient lists={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("e.g. Costco run"), "  Trip  ");
    await userEvent.type(screen.getByPlaceholderText("grocery, urgent"), "a, ,b");
    await userEvent.click(create);
    await waitFor(() => expect(createListAction).toHaveBeenCalledWith("Trip", ["a", "b"], "STANDARD"));
    expect(router.push).toHaveBeenCalledWith("/lists/new1");
  });

  it("opens the CSV import after creating when asked", async () => {
    render(<ListsClient lists={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    await userEvent.type(screen.getByPlaceholderText("e.g. Costco run"), "Trip");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/lists/new1?import=1"));
  });

  it("ignores Enter on a blank name and resets when cancelled", async () => {
    render(<ListsClient lists={[]} />);
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
    render(<ListsClient lists={lists} />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Rename"));
    const input = await screen.findByDisplayValue("Costco run");
    await userEvent.clear(input);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(input, "{Enter}");
    expect(renameListAction).not.toHaveBeenCalled();
    await userEvent.type(input, "Bulk run{Enter}");
    await waitFor(() => expect(renameListAction).toHaveBeenCalledWith("l1", "Bulk run"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("cancels a rename", async () => {
    render(<ListsClient lists={lists} />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Rename"));
    await screen.findByDisplayValue("Costco run");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(renameListAction).not.toHaveBeenCalled();
  });

  it("archives a list", async () => {
    render(<ListsClient lists={lists} />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Archive"));
    await waitFor(() => expect(archiveListAction).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ListsClient lists={lists} />);
    await openRowMenu("Costco run");
    await userEvent.click(await screen.findByText("Delete"));
    expect(deleteListAction).not.toHaveBeenCalled();
  });

  it("deletes a list once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ListsClient lists={lists} />);
    await openRowMenu("Packing");
    await userEvent.click(await screen.findByText("Delete"));
    await waitFor(() => expect(deleteListAction).toHaveBeenCalledWith("l2"));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("ListsClient: kinds and sharing", () => {
  it("creates a Gift ideas list, saying it starts with a public link", async () => {
    render(<ListsClient lists={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "New list" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(dialog.getByPlaceholderText("e.g. Costco run"), "Corey's Christmas list");
    await userEvent.click(dialog.getByText("Gift ideas"));
    expect(dialog.getByText(/Starts with a public link/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createListAction).toHaveBeenCalledWith("Corey's Christmas list", [], "GIFT"));
    expect(router.push).toHaveBeenCalledWith("/lists/new1");
  });

  it("shows who can see each list, and marks gift lists", () => {
    render(
      <ListsClient
        lists={[
          row({ id: "a", name: "Mine", tags: [], totalItems: 0, checkedItems: 0, visibility: "PERSONAL" }),
          row({ id: "b", name: "Gifts", kind: "GIFT", tags: [], totalItems: 0, checkedItems: 0, visibility: "PUBLIC" }),
        ]}
      />,
    );
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByLabelText("Gift ideas")).toBeInTheDocument();
  });

  it("puts lists shared with the member under Shared with me, with who shared them, and lets them remove one", async () => {
    vi.mocked(leaveSharedListAction).mockResolvedValue({ ok: true });
    render(
      <ListsClient
        lists={[
          row({ id: "a", name: "Ours", tags: [], totalItems: 0, checkedItems: 0 }),
          row({ id: "b", name: "Ann's wishlist", tags: [], totalItems: 1, checkedItems: 0, access: "view", visibility: "SHARED", sharedBy: "Ann Ray" }),
        ]}
      />,
    );
    const shared = within(screen.getByRole("region", { name: "Shared with me" }));
    expect(shared.getByText("from Ann Ray · view only")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Lists" })).getByText("Ours")).toBeInTheDocument();
    await openRowMenu("Ann's wishlist");
    await userEvent.click(await screen.findByText("Remove from my lists"));
    await waitFor(() => expect(leaveSharedListAction).toHaveBeenCalledWith("b"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows why a shared list couldn't be removed", async () => {
    vi.mocked(leaveSharedListAction).mockResolvedValue({ ok: false, error: "That list isn't shared with you" });
    render(
      <App>
        <ListsClient lists={[row({ id: "b", name: "Theirs", tags: [], totalItems: 0, checkedItems: 0, access: "edit", visibility: "SHARED", sharedBy: "Ann Ray" })]} />
      </App>,
    );
    await openRowMenu("Theirs");
    await userEvent.click(await screen.findByText("Remove from my lists"));
    expect(await screen.findByText("That list isn't shared with you")).toBeInTheDocument();
  });

  it("offers no menu on a household list the member doesn't own", () => {
    render(<ListsClient lists={[row({ id: "a", name: "Sam's list", tags: [], totalItems: 0, checkedItems: 0, access: "edit" })]} />);
    expect(screen.queryByRole("button", { name: "More for Sam's list" })).toBeNull();
  });
});

describe("ArchivedListsClient", () => {
  const archived = [
    { ...lists[0], archivedAt: "1/2/2026" },
    { ...lists[1], archivedAt: "3/4/2026" },
  ];

  it("shows an empty state", () => {
    render(<ArchivedListsClient lists={[]} />);
    expect(screen.getByText("No archived lists.")).toBeInTheDocument();
  });

  it("lists archived lists with dates, tags and counts", () => {
    render(<ArchivedListsClient lists={archived} />);
    expect(screen.getByText("Archived lists (2)")).toBeInTheDocument();
    expect(screen.getByText("archived 1/2/2026")).toBeInTheDocument();
    expect(screen.getByText("grocery")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("unarchives a list", async () => {
    render(<ArchivedListsClient lists={archived} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Unarchive" })[0]);
    await waitFor(() => expect(unarchiveListAction).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("offers nothing but the list to someone who isn't its owner", () => {
    render(<ArchivedListsClient lists={[{ ...archived[0], access: "edit" }]} />);
    expect(screen.queryByRole("button", { name: "Unarchive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("deletes a list only after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<ArchivedListsClient lists={archived} />);
    const buttons = screen.getAllByRole("button", { name: "Delete" });

    confirmSpy.mockReturnValueOnce(false);
    await userEvent.click(buttons[0]);
    expect(deleteListAction).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await userEvent.click(buttons[1]);
    await waitFor(() => expect(deleteListAction).toHaveBeenCalledWith("l2"));
  });
});
