// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/lists/actions", () => ({
  setSharedWithHouseholdAction: vi.fn(),
  shareListAction: vi.fn(),
  setShareEditAction: vi.fn(),
  unshareListAction: vi.fn(),
  setPublicAction: vi.fn(),
  newPublicLinkAction: vi.fn(),
}));

import ListSharingModal from "@/app/(app)/lists/[id]/ListSharingModal";
import {
  newPublicLinkAction,
  setPublicAction,
  setShareEditAction,
  setSharedWithHouseholdAction,
  shareListAction,
  unshareListAction,
} from "@/app/(app)/lists/actions";

const candidates = [
  { id: "u2", name: "Sam Becker", householdName: "The Beckers" },
  { id: "u3", name: "Ann Ray", householdName: "The Rays" },
];
const setup = (over: Partial<React.ComponentProps<typeof ListSharingModal>> = {}) => {
  const onClose = vi.fn();
  render(
    <App>
      <ListSharingModal
        open
        onClose={onClose}
        listId="l1"
        householdName="The Beckers"
        sharedWithHousehold
        shares={[]}
        candidates={candidates}
        publicUrl={null}
        {...over}
      />
    </App>,
  );
  return { onClose, dialog: within(screen.getByRole("dialog")) };
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [setSharedWithHouseholdAction, shareListAction, setShareEditAction, unshareListAction, setPublicAction, newPublicLinkAction]) {
    vi.mocked(fn).mockResolvedValue({ ok: true });
  }
});

describe("ListSharingModal", () => {
  it("turns sharing with the household off", async () => {
    const { dialog } = setup();
    expect(dialog.getByText("Everyone in The Beckers")).toBeInTheDocument();
    const toggle = dialog.getByRole("switch", { name: "Share with the household" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(setSharedWithHouseholdAction).toHaveBeenCalledWith("l1", false));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("adds people to view, or to edit", async () => {
    const { dialog } = setup();
    expect(dialog.getByText("Not shared with anyone else yet.")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("combobox", { name: "Add people" }));
    await userEvent.click(await screen.findByTitle("Ann Ray (The Rays)"));
    await userEvent.click(dialog.getByRole("combobox", { name: "New people can" }));
    await userEvent.click((await screen.findAllByTitle("Can edit")).at(-1)!);
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(shareListAction).toHaveBeenCalledWith("l1", ["u3"], true));
  });

  it("changes and removes a person, offering only people not on it yet", async () => {
    const { dialog } = setup({ shares: [{ userId: "u3", name: "Ann Ray", householdName: "The Rays", canEdit: false }] });
    expect(dialog.getByText("Ann Ray")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("combobox", { name: "What Ann Ray can do" }));
    await userEvent.click((await screen.findAllByTitle("Can edit")).at(-1)!);
    await waitFor(() => expect(setShareEditAction).toHaveBeenCalledWith("l1", "u3", true));
    await userEvent.click(dialog.getByRole("button", { name: "Stop sharing with Ann Ray" }));
    await waitFor(() => expect(unshareListAction).toHaveBeenCalledWith("l1", "u3"));
    await userEvent.click(dialog.getByRole("combobox", { name: "Add people" }));
    expect(screen.queryByTitle("Ann Ray (The Rays)")).toBeNull();
  });

  it("shows who can edit, and lets them be made view-only", async () => {
    const { dialog } = setup({ shares: [{ userId: "u2", name: "Sam Becker", householdName: "The Beckers", canEdit: true }] });
    expect(dialog.getByRole("combobox", { name: "What Sam Becker can do" }).closest(".ant-select")).toHaveTextContent("Can edit");
    await userEvent.click(dialog.getByRole("combobox", { name: "What Sam Becker can do" }));
    await userEvent.click((await screen.findAllByTitle("Can view")).at(-1)!);
    await waitFor(() => expect(setShareEditAction).toHaveBeenCalledWith("l1", "u2", false));
  });

  it("says who it could be shared with when there's no one left to add", () => {
    const { dialog } = setup({ candidates: [] });
    expect(dialog.getByText(/households you're synced with/)).toBeInTheDocument();
    expect(dialog.queryByRole("combobox", { name: "Add people" })).toBeNull();
  });

  it("turns the public link on, and shows it to copy when it is on", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const first = setup();
    await userEvent.click(first.dialog.getByRole("switch", { name: "Public link" }));
    await waitFor(() => expect(setPublicAction).toHaveBeenCalledWith("l1", true));
  });

  it("copies the public link, and makes a new one after confirming", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { dialog } = setup({ publicUrl: "https://domata.test/l/tok" });
    expect(dialog.getByLabelText("The public link")).toHaveValue("https://domata.test/l/tok");
    await userEvent.click(dialog.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith("https://domata.test/l/tok");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    await userEvent.click(dialog.getByText("Make a new link"));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "New link" }));
    await waitFor(() => expect(newPublicLinkAction).toHaveBeenCalledWith("l1"));
  });

  it("says when the link couldn't be copied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    const { dialog } = setup({ publicUrl: "https://domata.test/l/tok" });
    await userEvent.click(dialog.getByRole("button", { name: /Copy/ }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });

  it("selects the link when it's focused, for copying by hand", async () => {
    const { dialog } = setup({ publicUrl: "https://domata.test/l/tok" });
    const input = dialog.getByLabelText("The public link") as HTMLInputElement;
    await userEvent.click(input);
    expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  });

  it("shows why a change failed, without refreshing", async () => {
    vi.mocked(setPublicAction).mockResolvedValue({ ok: false, error: "Only the list's owner can do that" });
    const { dialog } = setup();
    await userEvent.click(dialog.getByRole("switch", { name: "Public link" }));
    expect(await screen.findByText("Only the list's owner can do that")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("closes with Done", async () => {
    const { dialog, onClose } = setup();
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
