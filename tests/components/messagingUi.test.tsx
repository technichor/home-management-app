// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/messages/actions", () => ({
  createChannelAction: vi.fn(),
  sendMessageAction: vi.fn(),
  addChannelMembersAction: vi.fn(),
  removeChannelMemberAction: vi.fn(),
  leaveChannelAction: vi.fn(),
  renameChannelAction: vi.fn(),
  archiveChannelAction: vi.fn(),
  unarchiveChannelAction: vi.fn(),
  markChannelReadAction: vi.fn(),
}));

import MessagesClient, { ChannelRow, LIST_POLL_INTERVAL_MS } from "@/app/(app)/messages/MessagesClient";
import ConversationClient, { MessageView, MemberView, POLL_INTERVAL_MS } from "@/app/(app)/messages/[id]/ConversationClient";
import {
  createChannelAction,
  sendMessageAction,
  addChannelMembersAction,
  removeChannelMemberAction,
  leaveChannelAction,
  renameChannelAction,
  archiveChannelAction,
  unarchiveChannelAction,
  markChannelReadAction,
} from "@/app/(app)/messages/actions";
import type { Candidate } from "@/lib/channels";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createChannelAction).mockResolvedValue({ ok: true, id: "new1" });
  vi.mocked(sendMessageAction).mockResolvedValue({ ok: true });
  vi.mocked(addChannelMembersAction).mockResolvedValue({ ok: true });
  vi.mocked(removeChannelMemberAction).mockResolvedValue({ ok: true });
  vi.mocked(leaveChannelAction).mockResolvedValue({ ok: true });
  vi.mocked(renameChannelAction).mockResolvedValue({ ok: true });
  vi.mocked(archiveChannelAction).mockResolvedValue({ ok: true });
  vi.mocked(unarchiveChannelAction).mockResolvedValue({ ok: true });
  vi.mocked(markChannelReadAction).mockResolvedValue({ ok: true });
});

const row = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: "cv1", name: "Trip", general: false, shared: false, memberCount: 3, unread: 0, preview: "see you there", previewSender: "Sam",
  lastActivity: "2026-01-02T00:00:00.000Z", ...over,
});

const candidates: Candidate[] = [
  { id: "u2", name: "Ann Smith", householdId: "h1", householdName: "Smiths", mine: true },
  { id: "u3", name: "Pat Jones", householdId: "h2", householdName: "Joneses", mine: false },
  { id: "u4", name: "Lee Jones", householdId: "h2", householdName: "Joneses", mine: false },
  { id: "u6", name: "Al Abbott", householdId: "h3", householdName: "Abbotts", mine: false },
];

describe("MessagesClient", () => {
  const setup = (channels: ChannelRow[] = [row()], showArchived = false, people: Candidate[] = candidates) =>
    render(
      <App>
        <MessagesClient channels={channels} candidates={people} showArchived={showArchived} />
      </App>
    );

  it("lists channels with tags, counts, previews and links", () => {
    setup([
      row(),
      row({ id: "cv2", name: "General", general: true, memberCount: 1, preview: null, previewSender: null }),
      row({ id: "cv3", name: "A & B", shared: true }),
    ]);
    expect(screen.getByRole("link", { name: /Trip/ })).toHaveAttribute("href", "/messages/cv1");
    expect(screen.getAllByText("Sam: see you there")).toHaveLength(2);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("1 person")).toBeInTheDocument();
    expect(screen.getAllByText("3 people")).toHaveLength(2);
  });

  it("shows the unread count on a channel that has some, and nothing on the others", () => {
    setup([row({ unread: 3 }), row({ id: "cv2", name: "Quiet" })]);
    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/unread$/)).toHaveLength(1);
  });

  describe("polling", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("refreshes the list on a timer while the tab is visible, and stops when it closes", () => {
      const { unmount } = setup();
      router.refresh.mockClear();
      act(() => vi.advanceTimersByTime(LIST_POLL_INTERVAL_MS * 2));
      expect(router.refresh).toHaveBeenCalledTimes(2);
      unmount();
      act(() => vi.advanceTimersByTime(LIST_POLL_INTERVAL_MS * 2));
      expect(router.refresh).toHaveBeenCalledTimes(2);
    });

    it("skips refreshing while the tab is hidden", () => {
      setup();
      router.refresh.mockClear();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      act(() => vi.advanceTimersByTime(LIST_POLL_INTERVAL_MS * 2));
      expect(router.refresh).not.toHaveBeenCalled();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });
  });

  it("shows an empty state, and a different one for the archive", () => {
    const { unmount } = setup([]);
    expect(screen.getByText(/No channels yet/)).toBeInTheDocument();
    unmount();
    setup([], true);
    expect(screen.getByText("No archived channels.")).toBeInTheDocument();
  });

  it("switches between the active and archived views", () => {
    const { unmount } = setup();
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/messages?archived=1");
    unmount();
    setup([row()], true);
    expect(screen.getByText("Archived channels")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/messages");
    expect(screen.queryByRole("button", { name: "New channel" })).not.toBeInTheDocument();
  });

  it("creates a channel with the chosen people, grouped by household, and opens it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New channel" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/Name, e.g./), "Weekend");
    expect(create).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Your household")).toBeInTheDocument();
    expect(screen.getByText("Joneses")).toBeInTheDocument();
    expect(screen.getByText("Abbotts")).toBeInTheDocument();
    await userEvent.click(await screen.findByTitle("Ann Smith"));
    await userEvent.click(await screen.findByTitle("Pat Jones"));
    await userEvent.click(create);
    await waitFor(() => expect(createChannelAction).toHaveBeenCalledWith("Weekend", ["u2", "u3"]));
    expect(router.push).toHaveBeenCalledWith("/messages/new1");
  });

  it("says so when nobody else is available", async () => {
    setup([row()], false, []);
    await userEvent.click(screen.getByRole("button", { name: "New channel" }));
    expect(screen.getByText(/No one else is available yet/)).toBeInTheDocument();
  });

  it("shows the reason when creating fails", async () => {
    vi.mocked(createChannelAction).mockResolvedValueOnce({ ok: false, error: "Add at least one other person." });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New channel" }));
    await userEvent.type(screen.getByPlaceholderText(/Name, e.g./), "x");
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Ann Smith"));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Add at least one other person.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("can cancel the dialog", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "New channel" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(createChannelAction).not.toHaveBeenCalled();
  });
});

describe("ConversationClient", () => {
  const msgs: MessageView[] = [
    { id: "m1", text: "hello\nthere", createdAt: "2026-01-02T00:00:00.000Z", senderName: "Pat Jones", householdName: "Joneses", mine: false },
    { id: "m2", text: "hi back", createdAt: "2026-01-02T00:01:00.000Z", senderName: "Sam Smith", householdName: "Smiths", mine: true },
  ];
  const members: MemberView[] = [
    { userId: "u1", name: "Sam Smith", householdName: "Smiths", manager: true, mine: true },
    { userId: "u3", name: "Pat Jones", householdName: "Joneses", manager: false, mine: false },
    { userId: "u5", name: "Kim Doe", householdName: null, manager: false, mine: false },
  ];
  const trip = { id: "cv1", name: "Trip", general: false, archived: false, shared: false };

  const setup = (over: Partial<React.ComponentProps<typeof ConversationClient>> = {}) =>
    render(
      <App>
        <ConversationClient
          conversation={trip}
          members={members}
          canManage
          candidates={[candidates[2]]}
          messages={msgs}
          {...over}
        />
      </App>
    );

  const box = () => screen.getByPlaceholderText(/Write a message/);
  const openPeople = async () => userEvent.click(screen.getByRole("button", { name: /People \(/ }));
  const confirm = async () => userEvent.click(await screen.findByRole("button", { name: "OK" }));

  it("shows messages with sender names, and the household only in shared channels", () => {
    const { unmount } = setup();
    expect(screen.getByText("Pat Jones")).toBeInTheDocument();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(screen.queryByText(/Joneses/)).not.toBeInTheDocument();
    unmount();
    setup({ conversation: { ...trip, shared: true } });
    expect(screen.getByText(/Joneses/)).toBeInTheDocument();
    expect(screen.getByText(/Smiths/)).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("omits the household label when a sender has none", () => {
    setup({ conversation: { ...trip, shared: true }, messages: [{ ...msgs[0], householdName: null }] });
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  describe("read marker", () => {
    it("marks the channel read up to the newest message shown, then refreshes", async () => {
      setup();
      await waitFor(() => expect(markChannelReadAction).toHaveBeenCalledWith("cv1", msgs[1].createdAt));
      await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    });

    it("does nothing in an empty channel", () => {
      setup({ messages: [] });
      expect(markChannelReadAction).not.toHaveBeenCalled();
    });

    it("does not count a background tab as reading", () => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      setup();
      expect(markChannelReadAction).not.toHaveBeenCalled();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });
  });

  it("shows an empty state", () => {
    setup({ messages: [] });
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
  });

  it("sends on Enter, clears the box, and refreshes", async () => {
    setup();
    await userEvent.type(box(), "on my way{Enter}");
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("cv1", "on my way"));
    expect(box()).toHaveValue("");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("doesn't wipe the next message typed while the last one is still sending", async () => {
    let finish!: () => void;
    vi.mocked(sendMessageAction).mockReturnValueOnce(new Promise<{ ok: true }>((resolve) => (finish = () => resolve({ ok: true }))));
    setup();
    await userEvent.type(box(), "first{Enter}");
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("cv1", "first"));
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
    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("cv1", "ok"));
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
    vi.mocked(sendMessageAction).mockResolvedValueOnce({ ok: false, error: "Channel not found" });
    setup();
    await userEvent.type(box(), "keep me{Enter}");
    expect(await screen.findByText("Channel not found")).toBeInTheDocument();
    expect(box()).toHaveValue("keep me");
  });


  it("blocks sending in an archived channel", () => {
    setup({ conversation: { ...trip, archived: true } });
    expect(screen.getByText("Unarchive this channel to send messages.")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(box()).toBeDisabled();
  });

  it("tags General and links back to the list", () => {
    setup({ conversation: { ...trip, name: "General", general: true } });
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/messages");
  });

  describe("people panel", () => {
    it("lists members with household, role and a count", async () => {
      setup();
      await openPeople();
      expect(await screen.findByText("People in Trip")).toBeInTheDocument();
      const dialog = within(screen.getByRole("dialog"));
      expect(dialog.getByText(/Sam Smith/)).toBeInTheDocument();
      expect(dialog.getByText("(you)", { exact: false })).toBeInTheDocument();
      expect(dialog.getByText("Manager")).toBeInTheDocument();
      expect(dialog.getByText(/Kim Doe/)).toBeInTheDocument();
    });

    it("closes with the close button", async () => {
      setup();
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(leaveChannelAction).not.toHaveBeenCalled();
    });

    it("lets a manager remove someone, but not themselves", async () => {
      setup();
      await openPeople();
      expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
      await confirm();
      await waitFor(() => expect(removeChannelMemberAction).toHaveBeenCalledWith("cv1", "u3"));
      expect(router.refresh).toHaveBeenCalled();
    });

    it("lets a manager add people", async () => {
      setup();
      await openPeople();
      const add = screen.getByRole("button", { name: "Add" });
      expect(add).toBeDisabled();
      await userEvent.click(screen.getAllByRole("combobox")[0]);
      await userEvent.click(await screen.findByTitle("Lee Jones"));
      await userEvent.click(add);
      await waitFor(() => expect(addChannelMembersAction).toHaveBeenCalledWith("cv1", ["u4"]));
      await waitFor(() => expect(add).toBeDisabled());
    });

    it("keeps the selection when adding fails", async () => {
      vi.mocked(addChannelMembersAction).mockResolvedValueOnce({ ok: false, error: "not connected" });
      setup();
      await openPeople();
      await userEvent.click(screen.getAllByRole("combobox")[0]);
      await userEvent.click(await screen.findByTitle("Lee Jones"));
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(await screen.findByText("not connected")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    });

    it("lets a manager rename, only when the name changed", async () => {
      setup();
      await openPeople();
      const rename = screen.getByRole("button", { name: "Rename" });
      expect(rename).toBeDisabled();
      const input = screen.getByLabelText("Channel name");
      await userEvent.clear(input);
      expect(rename).toBeDisabled();
      await userEvent.type(input, "Plans");
      await userEvent.click(rename);
      await waitFor(() => expect(renameChannelAction).toHaveBeenCalledWith("cv1", "Plans"));
    });

    it("lets a manager archive, and unarchive", async () => {
      const { unmount } = setup();
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Archive channel" }));
      await waitFor(() => expect(archiveChannelAction).toHaveBeenCalledWith("cv1"));
      unmount();
      setup({ conversation: { ...trip, archived: true } });
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Unarchive channel" }));
      await waitFor(() => expect(unarchiveChannelAction).toHaveBeenCalledWith("cv1"));
    });

    it("keeps the panel open when archiving fails", async () => {
      vi.mocked(archiveChannelAction).mockResolvedValueOnce({ ok: false, error: "Only a channel manager can do that." });
      setup();
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Archive channel" }));
      expect(await screen.findByText("Only a channel manager can do that.")).toBeInTheDocument();
      expect(screen.getByText("People in Trip")).toBeInTheDocument();
    });

    it("shows a member no management controls", async () => {
      setup({ canManage: false });
      await openPeople();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Archive channel/ })).not.toBeInTheDocument();
    });

    it("lets a member leave and returns to the list", async () => {
      setup({ canManage: false });
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Leave channel" }));
      await confirm();
      await waitFor(() => expect(leaveChannelAction).toHaveBeenCalledWith("cv1"));
      expect(router.push).toHaveBeenCalledWith("/messages");
    });

    it("shows the reason when leaving fails", async () => {
      vi.mocked(leaveChannelAction).mockResolvedValueOnce({ ok: false, error: "Channel not found" });
      setup({ canManage: false });
      await openPeople();
      await userEvent.click(screen.getByRole("button", { name: "Leave channel" }));
      await confirm();
      expect(await screen.findByText("Channel not found")).toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
    });


    it("offers no Leave in General, and explains why", async () => {
      setup({ conversation: { ...trip, name: "General", general: true }, canManage: false });
      await openPeople();
      expect(screen.queryByRole("button", { name: "Leave channel" })).not.toBeInTheDocument();
      expect(screen.getByText("General always includes everyone in your household.")).toBeInTheDocument();
    });
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
