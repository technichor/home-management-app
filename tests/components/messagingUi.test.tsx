// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/[slug]/(app)/messages/actions", () => ({
  createGroupConversationAction: vi.fn(),
  startContactThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  archiveConversationAction: vi.fn(),
  unarchiveConversationAction: vi.fn(),
}));

import MessagesClient, { ConversationRow } from "@/app/[slug]/(app)/messages/MessagesClient";
import ConversationClient, { MessageView, POLL_INTERVAL_MS } from "@/app/[slug]/(app)/messages/[id]/ConversationClient";
import {
  createGroupConversationAction,
  startContactThreadAction,
  sendMessageAction,
  archiveConversationAction,
  unarchiveConversationAction,
} from "@/app/[slug]/(app)/messages/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createGroupConversationAction).mockResolvedValue({ id: "new1" });
  vi.mocked(startContactThreadAction).mockResolvedValue({ id: "thread1" });
  vi.mocked(sendMessageAction).mockResolvedValue(undefined);
  vi.mocked(archiveConversationAction).mockResolvedValue(undefined);
  vi.mocked(unarchiveConversationAction).mockResolvedValue(undefined);
});

const row = (over: Partial<ConversationRow> = {}): ConversationRow => ({
  id: "cv1", name: "Trip", kind: "group", preview: "see you there", previewSender: "Sam",
  lastActivity: "2026-01-02T00:00:00.000Z", ...over,
});

describe("MessagesClient", () => {
  const setup = (conversations: ConversationRow[] = [row()], showArchived = false, contacts = [{ id: "c1", name: "Pat Jones" }]) =>
    render(
      <App>
        <MessagesClient slug="s" conversations={conversations} contacts={contacts} showArchived={showArchived} />
      </App>
    );

  it("lists conversations with kind labels, previews and links", () => {
    setup([
      row(),
      row({ id: "cv2", name: "Pat", kind: "private", preview: null, previewSender: null }),
      row({ id: "cv3", name: "A & B", kind: "synced" }),
    ]);
    expect(screen.getByRole("link", { name: /Trip/ })).toHaveAttribute("href", "/s/messages/cv1");
    expect(screen.getAllByText("Sam: see you there")).toHaveLength(2);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Private note")).toBeInTheDocument();
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it("shows an empty state, and a different one for the archive", () => {
    const { unmount } = setup([]);
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
    unmount();
    setup([], true);
    expect(screen.getByText("No archived conversations.")).toBeInTheDocument();
  });

  it("switches between the active and archived views", () => {
    const { unmount } = setup();
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/s/messages?archived=1");
    unmount();
    setup([row()], true);
    expect(screen.getByText("Archived conversations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/s/messages");
    expect(screen.queryByRole("button", { name: "New group chat" })).not.toBeInTheDocument();
  });

  it("creates a group chat and opens it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New group chat" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/Name, e.g./), "Weekend");
    await userEvent.click(create);
    await waitFor(() => expect(createGroupConversationAction).toHaveBeenCalledWith("s", "Weekend"));
    expect(router.push).toHaveBeenCalledWith("/s/messages/new1");
  });

  it("opens a private note thread about a chosen contact", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Note about a contact" }));
    const open = screen.getByRole("button", { name: "Open" });
    expect(open).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Pat Jones"));
    await userEvent.click(open);
    await waitFor(() => expect(startContactThreadAction).toHaveBeenCalledWith("s", "c1"));
    expect(router.push).toHaveBeenCalledWith("/s/messages/thread1");
  });

  it("shows the reason when creating fails, and a generic message for non-errors", async () => {
    vi.mocked(createGroupConversationAction).mockRejectedValueOnce(new Error("Give the conversation a name"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New group chat" }));
    await userEvent.type(screen.getByPlaceholderText(/Name, e.g./), "x");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give the conversation a name")).toBeInTheDocument();
    vi.mocked(createGroupConversationAction).mockRejectedValueOnce("boom");
    await userEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("can cancel either dialog", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New group chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Note about a contact" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Cancel" }).pop() as HTMLElement);
    expect(createGroupConversationAction).not.toHaveBeenCalled();
    expect(startContactThreadAction).not.toHaveBeenCalled();
  });
});

describe("ConversationClient", () => {
  const msgs: MessageView[] = [
    { id: "m1", text: "hello\nthere", createdAt: "2026-01-02T00:00:00.000Z", senderName: "Pat Jones", householdName: "Joneses", mine: false },
    { id: "m2", text: "hi back", createdAt: "2026-01-02T00:01:00.000Z", senderName: "Sam Smith", householdName: "Smiths", mine: true },
  ];

  const setup = (over: Partial<React.ComponentProps<typeof ConversationClient>> = {}) =>
    render(
      <App>
        <ConversationClient
          slug="s"
          conversation={{ id: "cv1", name: "Trip", synced: false, archived: false }}
          messages={msgs}
          canSend
          {...over}
        />
      </App>
    );

  const box = () => screen.getByPlaceholderText(/Write a message/);

  it("shows messages with sender names, and the household only in synced conversations", () => {
    const { unmount } = setup();
    expect(screen.getByText("Pat Jones")).toBeInTheDocument();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.queryByText(/Joneses/)).not.toBeInTheDocument();
    unmount();
    setup({ conversation: { id: "cv1", name: "A & B", synced: true, archived: false } });
    expect(screen.getByText(/Joneses/)).toBeInTheDocument();
    expect(screen.getByText(/Smiths/)).toBeInTheDocument();
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it("omits the household label when a sender has none", () => {
    setup({
      conversation: { id: "cv1", name: "A & B", synced: true, archived: false },
      messages: [{ ...msgs[0], householdName: null }],
    });
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows an empty state", () => {
    setup({ messages: [] });
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
  });

  it("sends on Enter, clears the box, and refreshes", async () => {
    setup();
    await userEvent.type(box(), "on my way{Enter}");
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("s", "cv1", "on my way"));
    expect(box()).toHaveValue("");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("doesn't wipe the next message typed while the last one is still sending", async () => {
    let finish!: () => void;
    vi.mocked(sendMessageAction).mockReturnValueOnce(new Promise<undefined>((resolve) => (finish = () => resolve(undefined))));
    setup();
    await userEvent.type(box(), "first{Enter}");
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("s", "cv1", "first"));
    await userEvent.clear(box());
    await userEvent.type(box(), "second");
    finish();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(box()).toHaveValue("second");
  });

  it("sends with the Send button", async () => {
    setup();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await userEvent.type(box(), "ok");
    await userEvent.click(send);
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("s", "cv1", "ok"));
  });

  it("does not send on Shift+Enter or when blank", async () => {
    setup();
    await userEvent.type(box(), "line one{Shift>}{Enter}{/Shift}line two");
    expect(sendMessageAction).not.toHaveBeenCalled();
    await userEvent.clear(box());
    await userEvent.type(box(), "   {Enter}");
    expect(sendMessageAction).not.toHaveBeenCalled();
  });

  it("keeps the draft and shows the reason when sending fails", async () => {
    vi.mocked(sendMessageAction).mockRejectedValueOnce(new Error("Unarchive this conversation to send messages"));
    setup();
    await userEvent.type(box(), "keep me{Enter}");
    expect(await screen.findByText("Unarchive this conversation to send messages")).toBeInTheDocument();
    expect(box()).toHaveValue("keep me");
  });

  it("shows a generic message for a non-Error failure", async () => {
    vi.mocked(sendMessageAction).mockRejectedValueOnce("boom");
    setup();
    await userEvent.type(box(), "x{Enter}");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("explains how to fix an unlinked account and blocks sending", () => {
    setup({ canSend: false });
    expect(screen.getByText("Your account is not linked to a contact yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Account page/ })).toHaveAttribute("href", "/s/account");
    expect(box()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("blocks sending in an archived conversation, and can unarchive it", async () => {
    setup({ conversation: { id: "cv1", name: "Trip", synced: false, archived: true } });
    expect(screen.getByText("Unarchive this conversation to send messages.")).toBeInTheDocument();
    expect(box()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    await waitFor(() => expect(unarchiveConversationAction).toHaveBeenCalledWith("s", "cv1"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("archives a conversation", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(archiveConversationAction).toHaveBeenCalledWith("s", "cv1"));
  });

  it("links back to the list", () => {
    setup();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/s/messages");
  });

  describe("polling", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("refreshes on a timer while the tab is visible", () => {
      setup();
      router.refresh.mockClear();
      act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 3));
      expect(router.refresh).toHaveBeenCalledTimes(3);
    });

    it("skips refreshing while the tab is hidden", () => {
      setup();
      router.refresh.mockClear();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2));
      expect(router.refresh).not.toHaveBeenCalled();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });

    it("stops polling when the conversation is closed", () => {
      const { unmount } = setup();
      unmount();
      router.refresh.mockClear();
      act(() => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2));
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });
});
