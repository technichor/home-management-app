// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue({ householdId: "me" }),
}));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: { conversation: { findMany: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock("@/lib/channels", () => ({ candidatesFor: vi.fn() }));
const seen: Record<string, any> = {};
vi.mock("@/app/(app)/messages/MessagesClient", () => ({
  default: (p: any) => ((seen.list = p), <div>messages client</div>),
}));
vi.mock("@/app/(app)/messages/[id]/ConversationClient", () => ({
  default: (p: any) => ((seen.convo = p), <div>conversation client</div>),
}));

import { prisma } from "@/lib/db";
import { candidatesFor } from "@/lib/channels";
import { channelsFor } from "@/lib/messaging";
import MessagesPage from "@/app/(app)/messages/page";
import ConversationPage from "@/app/(app)/messages/[id]/page";

// The signed-in user is "u1" in household "me" (see fakeAuth).
const member = (userId: string, householdId: string | null, role = "MEMBER", first = "Sam") => ({
  userId, role,
  user: { firstName: first, lastName: "X", householdId, household: householdId ? { displayName: `H-${householdId}` } : null },
});
const dbChannel = (over: object = {}) => ({
  id: "cv1", name: "Trip", kind: "CHANNEL", createdAt: new Date("2026-01-01T00:00:00Z"), archivedAt: null,
  members: [{ user: { householdId: "me" } }], messages: [], ...over,
});
const lastMsg = (iso: string, text = "hello", sender: object | null = { firstName: "Sam" }) => ({
  text, createdAt: new Date(iso), sender,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
  vi.mocked(candidatesFor).mockResolvedValue([]);
});

describe("MessagesPage", () => {
  const run = async (searchParams: object = {}) =>
    render(await MessagesPage({ searchParams: Promise.resolve(searchParams) }));
  const whereOf = () => vi.mocked(prisma.conversation.findMany).mock.calls[0]?.[0]?.where as any;

  it("only queries channels the user is in, excluding archived ones", async () => {
    await run();
    expect(whereOf()).toEqual({ AND: [channelsFor("u1"), { archivedAt: null }] });
    expect(seen.list.showArchived).toBe(false);
  });

  it("shows only archived channels on request", async () => {
    await run({ archived: "1" });
    expect(whereOf()).toEqual({ AND: [channelsFor("u1"), { archivedAt: { not: null } }] });
    expect(seen.list.showArchived).toBe(true);
  });

  it("hands over the people the user may add, from the channel library", async () => {
    const people = [{ id: "u2", name: "Ann", householdId: "me", householdName: "Us", mine: true }];
    vi.mocked(candidatesFor).mockResolvedValue(people);
    await run();
    expect(seen.list.candidates).toEqual(people);
    expect(candidatesFor).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", householdId: "me" }));
  });

  it("labels General and shared channels, counts people and previews the latest message", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      dbChannel({ id: "g", messages: [lastMsg("2026-02-01T00:00:00Z", "a\n  b   c")] }),
      dbChannel({ id: "gen", kind: "GENERAL", name: "General" }),
      dbChannel({ id: "s", members: [{ user: { householdId: "me" } }, { user: { householdId: "other" } }] }),
      dbChannel({ id: "f", messages: [lastMsg("2026-02-02T00:00:00Z", "bye", null)] }),
    ] as any);
    await run();
    const byId = Object.fromEntries(seen.list.channels.map((c: any) => [c.id, c]));
    expect(byId.g).toMatchObject({ general: false, shared: false, memberCount: 1, preview: "a b c", previewSender: "Sam" });
    expect(byId.gen).toMatchObject({ general: true, preview: null, previewSender: null });
    expect(byId.s).toMatchObject({ shared: true, memberCount: 2 });
    expect(byId.f).toMatchObject({ previewSender: "Former member" });
  });

  it("puts General first, then sorts by activity, falling back to creation time when there are no messages", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      dbChannel({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
      dbChannel({ id: "newest-msg", messages: [lastMsg("2026-03-01T00:00:00Z")] }),
      dbChannel({ id: "general", kind: "GENERAL", createdAt: new Date("2025-01-01T00:00:00Z") }),
      dbChannel({ id: "mid", createdAt: new Date("2026-02-01T00:00:00Z") }),
    ] as any);
    await run();
    expect(seen.list.channels.map((c: any) => c.id)).toEqual(["general", "newest-msg", "mid", "old"]);
    expect(seen.list.channels[1].lastActivity).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("ConversationPage", () => {
  const sender = (first: string, householdId: string | null) => ({
    firstName: first, lastName: "Z", householdId, household: householdId ? { displayName: `H-${householdId}` } : null,
  });
  const msg = (over: object = {}) => ({
    id: "m1", text: "hi", createdAt: new Date("2026-01-02T00:00:00Z"), senderUserId: "u1", sender: sender("Sam", "me"), ...over,
  });
  const convo = (over: object = {}) =>
    dbChannel({ members: [member("u1", "me", "MANAGER"), member("u2", "other", "MEMBER", "Pat")], ...over });
  const run = async () => render(await ConversationPage({ params: Promise.resolve({ id: "cv1" }) }));

  it("looks the channel up only through the membership rule", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo() as any);
    await run();
    expect(vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]?.where).toEqual({ id: "cv1", ...channelsFor("u1") });
  });

  it("404s for a channel the user is not in", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    await expect(ConversationPage({ params: Promise.resolve({ id: "cv1" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("passes the channel, its members and whether it spans households", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo() as any);
    await run();
    expect(seen.convo.conversation).toEqual({ id: "cv1", name: "Trip", general: false, archived: false, shared: true });
    expect(seen.convo.members).toEqual([
      { userId: "u1", name: "Sam X", householdName: "H-me", manager: true, mine: true },
      { userId: "u2", name: "Pat X", householdName: "H-other", manager: false, mine: false },
    ]);
  });

  it("lets a manager add people who are not already in the channel", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo() as any);
    vi.mocked(candidatesFor).mockResolvedValue([
      { id: "u2", name: "Pat", householdId: "other", householdName: "O", mine: false },
      { id: "u3", name: "Lee", householdId: "me", householdName: "Us", mine: true },
    ]);
    await run();
    expect(seen.convo.canManage).toBe(true);
    expect(seen.convo.candidates.map((c: any) => c.id)).toEqual(["u3"]);
  });

  it("gives a plain member no management rights and doesn't look up candidates", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      convo({ members: [member("u1", "me", "MEMBER"), member("u2", "me", "MANAGER")] }) as any
    );
    await run();
    expect(seen.convo.canManage).toBe(false);
    expect(seen.convo.candidates).toEqual([]);
    expect(candidatesFor).not.toHaveBeenCalled();
  });

  it("has no managers in General, and a member with no household shows none", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      convo({ kind: "GENERAL", members: [member("u1", "me", "MANAGER"), member("u2", null)] }) as any
    );
    await run();
    expect(seen.convo.canManage).toBe(false);
    expect(seen.convo.conversation.general).toBe(true);
    expect(seen.convo.members[1].householdName).toBeNull();
  });

  it("passes messages oldest first, marking which are ours and which household they came from", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      convo({
        messages: [
          msg({ id: "newer", text: "second", createdAt: new Date("2026-01-03T00:00:00Z") }),
          msg({ id: "older", text: "first", senderUserId: "u2", sender: sender("Pat", "other") }),
        ],
      }) as any
    );
    await run();
    expect(seen.convo.messages.map((m: any) => m.id)).toEqual(["older", "newer"]);
    expect(seen.convo.messages[0]).toMatchObject({ senderName: "Pat Z", householdName: "H-other", mine: false });
    expect(seen.convo.messages[1]).toMatchObject({ senderName: "Sam Z", householdName: "H-me", mine: true });
  });

  it("shows a deleted sender as a former member, with no household, and the archived state", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      convo({ archivedAt: new Date(), messages: [msg({ senderUserId: null, sender: null })] }) as any
    );
    await run();
    expect(seen.convo.messages[0]).toMatchObject({ senderName: "Former member", householdName: null, mine: false });
    expect(seen.convo.conversation.archived).toBe(true);
  });

  it("shows a sender who has left their household with no household label", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      convo({ messages: [msg({ senderUserId: "u2", sender: sender("Pat", null) })] }) as any
    );
    await run();
    expect(seen.convo.messages[0].householdName).toBeNull();
  });

  it("asks for only the most recent window of messages", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo() as any);
    await run();
    const include = vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]?.include as any;
    expect(include.messages).toMatchObject({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
  });
});
