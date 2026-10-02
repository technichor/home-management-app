// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ pageMember: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    conversation: { findMany: vi.fn() },
    list: { findMany: vi.fn() },
    contact: { findMany: vi.fn(), count: vi.fn() },
    household: { count: vi.fn() },
  },
}));

import HomePage from "@/app/(app)/home/page";
import { prisma } from "@/lib/db";
import { pageMember } from "@/lib/auth";
import { conversationsVisibleTo } from "@/lib/messaging";
const me = (role = "OWNER") => ({ firstName: "Sam", role, householdId: "h1", household: { displayName: "The Smiths" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  vi.mocked(pageMember).mockResolvedValue(me() as any);
  vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
  vi.mocked(prisma.list.findMany).mockResolvedValue([]);
  // 1st call: contacts with dates, 2nd: favorites.
  vi.mocked(prisma.contact.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  vi.mocked(prisma.contact.count).mockResolvedValue(0);
  vi.mocked(prisma.household.count).mockResolvedValue(1);
});
afterEach(() => vi.useRealTimers());

const run = async () => render(await HomePage());

describe("HomePage", () => {
  it("greets the user and shows empty states", async () => {
    await run();
    expect(screen.getByText("Welcome back, Sam")).toBeInTheDocument();
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
    expect(screen.getByText("No lists yet.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing coming up/)).toBeInTheDocument();
    expect(screen.getByText("Star a contact to keep them handy here.")).toBeInTheDocument();
    expect(screen.getByText("0 people in 1 household")).toBeInTheDocument();
    for (const name of ["Meal planning", "Maintenance", "Schedules"]) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it("offers quick actions, with Invite only for owners", async () => {
    const { unmount } = await run();
    expect(screen.getByRole("link", { name: "Add contact" })).toHaveAttribute("href", "/contacts/new");
    expect(screen.getByRole("link", { name: "Invite someone" })).toHaveAttribute("href", "/household");
    unmount();
    vi.mocked(pageMember).mockResolvedValue(me("MEMBER") as any);
    vi.mocked(prisma.contact.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await run();
    expect(screen.queryByRole("link", { name: "Invite someone" })).toBeNull();
  });

  it("asks only for what this household may see", async () => {
    await run();
    const convoQuery = vi.mocked(prisma.conversation.findMany).mock.calls[0][0]!;
    expect(convoQuery.where).toEqual({ AND: [conversationsVisibleTo("h1"), { archivedAt: null }] });
    expect(vi.mocked(prisma.list.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", archivedAt: null });
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]!.where).toMatchObject({ ownerHouseholdId: "h1", deletedAt: null });
    expect(vi.mocked(prisma.contact.count).mock.calls[0][0]!.where).toEqual({ ownerHouseholdId: "h1", deletedAt: null });
    expect(vi.mocked(prisma.household.count).mock.calls[0][0]!.where).toEqual({
      OR: [{ id: "h1" }, { ownerHouseholdId: "h1" }],
      deletedAt: null,
    });
  });

  it("shows recent conversations with the latest message", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      { id: "cv1", name: "Weekend plans", messages: [{ text: "Who is\nbringing snacks?", sender: { firstName: "Pat" } }] },
      { id: "cv2", name: "Empty chat", messages: [] },
    ] as any);
    await run();
    expect(screen.getByRole("link", { name: /Weekend plans/ })).toHaveAttribute("href", "/messages/cv1");
    expect(screen.getByText("Pat: Who is bringing snacks?")).toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("shows lists with their progress", async () => {
    vi.mocked(prisma.list.findMany).mockResolvedValue([
      { id: "l1", name: "Costco run", items: [{ checked: true }, { checked: false }, { checked: false }] },
    ] as any);
    await run();
    expect(screen.getByRole("link", { name: /Costco run/ })).toHaveAttribute("href", "/lists/l1");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows upcoming birthdays and anniversaries", async () => {
    vi.mocked(prisma.contact.findMany).mockReset();
    vi.mocked(prisma.contact.findMany)
      .mockResolvedValueOnce([
        { id: "c1", firstName: "Jo", lastName: "Jones", importantDate1: "1990-10-02", importantDate1Label: "Birthday", importantDate2: "2010-10-10", importantDate2Label: null },
      ] as any)
      .mockResolvedValueOnce([]);
    await run();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("In 8 days")).toBeInTheDocument();
    expect(screen.getByText("· Birthday")).toBeInTheDocument();
    expect(screen.getByText("· Important date")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Jo Jones/ })[0]).toHaveAttribute("href", "/contacts/c1");
  });

  it("shows favorites and the counts", async () => {
    vi.mocked(prisma.contact.findMany).mockReset();
    vi.mocked(prisma.contact.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "c2", firstName: "Kim", lastName: "Wu" }] as any);
    vi.mocked(prisma.contact.count).mockResolvedValue(1);
    await run();
    expect(screen.getByRole("link", { name: /Kim Wu/ })).toHaveAttribute("href", "/contacts/c2");
    expect(screen.getByText("1 person in 1 household")).toBeInTheDocument();
  });

  it("uses the plural for several households", async () => {
    vi.mocked(prisma.contact.count).mockResolvedValue(5);
    vi.mocked(prisma.household.count).mockResolvedValue(3);
    await run();
    expect(screen.getByText("5 people in 3 households")).toBeInTheDocument();
  });
});
