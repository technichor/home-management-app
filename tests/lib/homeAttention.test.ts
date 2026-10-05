import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { conversation: { findMany: vi.fn() }, joinRequest: { findMany: vi.fn() }, sync: { findMany: vi.fn() } },
}));
vi.mock("@/lib/messaging", async (orig) => ({ ...(await orig<typeof import("@/lib/messaging")>()), unreadCounts: vi.fn() }));

import { prisma } from "@/lib/db";
import { unreadCounts } from "@/lib/messaging";
import { MAX_UNREAD_CHANNELS, loadAttention } from "@/lib/homeAttention";

const owner = { id: "u1", role: "OWNER", householdId: "h1" };
const member = { id: "u2", role: "MEMBER", householdId: "h1" };
const channel = (id: string, name: string, at: string, text = "hi", first: string | null = "Pat") => ({
  id, name, messages: [{ text, createdAt: new Date(at), sender: first ? { firstName: first } : null }],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(unreadCounts).mockResolvedValue(new Map());
  vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
  vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([]);
  vi.mocked(prisma.sync.findMany).mockResolvedValue([]);
});

describe("loadAttention", () => {
  it("is empty when nothing is waiting, and doesn't look up channels", async () => {
    expect(await loadAttention(owner)).toEqual([]);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it("lists channels with unread messages, most recent first, with the latest message", async () => {
    vi.mocked(unreadCounts).mockResolvedValue(new Map([["c1", 3], ["c2", 1]]));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      channel("c1", "Weekend plans", "2026-10-01T10:00:00Z", "Who is bringing\n snacks?"),
      channel("c2", "General", "2026-10-02T10:00:00Z", "Dinner at 6", null),
    ] as any);
    const items = await loadAttention(member);
    expect(items.map((i) => i.title)).toEqual(["General has 1 unread message", "Weekend plans has 3 unread messages"]);
    expect(items[0].support).toBe("In Messages, the latest is from a former member: “Dinner at 6”");
    expect(items[1].support).toBe("In Messages, the latest is from Pat: “Who is bringing snacks?”");
    expect(items.map((i) => i.href)).toEqual(["/messages/c2", "/messages/c1"]);
    expect(vi.mocked(prisma.conversation.findMany).mock.calls[0][0]!.where).toEqual({ id: { in: ["c1", "c2"] } });
    expect(unreadCounts).toHaveBeenCalledWith("u2");
  });

  it("shows a channel with no readable latest message plainly, and counts it as unread zero safely", async () => {
    vi.mocked(unreadCounts).mockResolvedValue(new Map([["c1", 2]]));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([{ id: "c1", name: "Empty", messages: [] }] as any);
    expect((await loadAttention(owner))[0]).toMatchObject({ title: "Empty has 2 unread messages", support: "In Messages." });
  });

  it("puts a channel whose latest message can't be found after the ones that have one", async () => {
    vi.mocked(unreadCounts).mockResolvedValue(new Map([["e1", 1], ["c1", 1], ["e2", 1]]));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      { id: "e1", name: "Empty one", messages: [] },
      channel("c1", "Has one", "2026-10-01T00:00:00Z"),
      { id: "e2", name: "Empty two", messages: [] },
    ] as any);
    expect((await loadAttention(owner))[0].key).toBe("channel-c1");
  });

  it("reads a missing unread count as zero", async () => {
    vi.mocked(unreadCounts).mockResolvedValue(new Map([["c1", 1]]));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([channel("c1", "A", "2026-10-01T00:00:00Z"), channel("other", "B", "2026-10-02T00:00:00Z")] as any);
    const items = await loadAttention(owner);
    expect(items.find((i) => i.key === "channel-other")!.title).toBe("B has 0 unread messages");
  });

  it("caps the channels listed and counts the rest", async () => {
    const ids = Array.from({ length: MAX_UNREAD_CHANNELS + 2 }, (_, i) => `c${i}`);
    vi.mocked(unreadCounts).mockResolvedValue(new Map(ids.map((id) => [id, 1])));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue(ids.map((id, i) => channel(id, `Chan ${i}`, `2026-10-0${i + 1}T00:00:00Z`)) as any);
    const items = await loadAttention(owner);
    expect(items).toHaveLength(MAX_UNREAD_CHANNELS + 1);
    expect(items.at(-1)).toMatchObject({ key: "channels-more", title: "2 more channels have unread messages", href: "/messages" });
  });

  it("uses the singular when one channel is left over", async () => {
    const ids = Array.from({ length: MAX_UNREAD_CHANNELS + 1 }, (_, i) => `c${i}`);
    vi.mocked(unreadCounts).mockResolvedValue(new Map(ids.map((id) => [id, 1])));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue(ids.map((id, i) => channel(id, `Chan ${i}`, `2026-10-0${i + 1}T00:00:00Z`)) as any);
    expect((await loadAttention(owner)).at(-1)!.title).toBe("1 more channel has unread messages");
  });

  it("lists join requests for an owner only, asking only about their household's pending ones", async () => {
    vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([{ id: "r1", user: { firstName: "Ann", lastName: "Ray" } }] as any);
    const items = await loadAttention(owner);
    expect(items).toEqual([{ key: "join-r1", title: "Ann Ray asked to join your household", support: "On the Household page, approve or decline the request.", href: "/household" }]);
    expect(vi.mocked(prisma.joinRequest.findMany).mock.calls[0][0]!.where).toEqual({ householdId: "h1", status: "PENDING" });
    vi.mocked(prisma.joinRequest.findMany).mockClear();
    expect(await loadAttention(member)).toEqual([]);
    expect(prisma.joinRequest.findMany).not.toHaveBeenCalled();
  });

  it("lists sync invites this household sent that are still waiting", async () => {
    vi.mocked(prisma.sync.findMany).mockResolvedValue([{ id: "s1", counterpartEmail: "pat@x.co", createdAt: new Date("2026-10-03T12:00:00Z"), relatedContactId: "c9" }] as any);
    expect(await loadAttention(member)).toEqual([
      { key: "sync-s1", title: "Your sync invite to pat@x.co hasn't been answered", support: "On the contact's page, sent Oct 3, 2026.", href: "/contacts/c9" },
    ]);
    expect(vi.mocked(prisma.sync.findMany).mock.calls[0][0]!.where).toEqual({ initiatingHouseholdId: "h1", status: "PENDING" });
  });

  it("puts messages first, then join requests, then sync invites", async () => {
    vi.mocked(unreadCounts).mockResolvedValue(new Map([["c1", 1]]));
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([channel("c1", "A", "2026-10-01T00:00:00Z")] as any);
    vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([{ id: "r1", user: { firstName: "A", lastName: "B" } }] as any);
    vi.mocked(prisma.sync.findMany).mockResolvedValue([{ id: "s1", counterpartEmail: "x@y.co", createdAt: new Date("2026-10-03T00:00:00Z"), relatedContactId: "c" }] as any);
    expect((await loadAttention(owner)).map((i) => i.key)).toEqual(["channel-c1", "join-r1", "sync-s1"]);
  });
});
