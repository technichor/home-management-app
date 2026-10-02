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
  prisma: {
    conversation: { findMany: vi.fn(), findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
    sync: { findMany: vi.fn() },
    household: { findUnique: vi.fn() },
  },
}));
const seen: Record<string, any> = {};
vi.mock("@/app/[slug]/(app)/messages/MessagesClient", () => ({
  default: (p: any) => ((seen.list = p), <div>messages client</div>),
}));
vi.mock("@/app/[slug]/(app)/messages/[id]/ConversationClient", () => ({
  default: (p: any) => ((seen.convo = p), <div>conversation client</div>),
}));

import { prisma } from "@/lib/db";
import { getIronSession } from "iron-session";
import { conversationsVisibleTo } from "@/lib/messaging";
import MessagesPage from "@/app/[slug]/(app)/messages/page";
import ConversationPage from "@/app/[slug]/(app)/messages/[id]/page";

const params = Promise.resolve({ slug: "s" });
const dbConvo = (over: object = {}) => ({
  id: "cv1", name: "Trip", scope: "HOUSEHOLD", relatedContactId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"), archivedAt: null, messages: [], ...over,
});
const lastMsg = (iso: string, text = "hello", first = "Sam") => ({
  text, createdAt: new Date(iso), sender: { firstName: first },
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
  vi.mocked(prisma.sync.findMany).mockResolvedValue([]);
});

describe("MessagesPage", () => {
  const run = async (searchParams: object = {}) =>
    render(await MessagesPage({ params, searchParams: Promise.resolve(searchParams) }));
  const whereOf = () => vi.mocked(prisma.conversation.findMany).mock.calls[0]?.[0]?.where as any;

  it("only queries conversations the household may see, excluding archived ones", async () => {
    await run();
    expect(whereOf()).toEqual({ AND: [conversationsVisibleTo("me"), { archivedAt: null }] });
    expect(seen.list.showArchived).toBe(false);
  });

  it("shows only archived conversations on request", async () => {
    await run({ archived: "1" });
    expect(whereOf()).toEqual({ AND: [conversationsVisibleTo("me"), { archivedAt: { not: null } }] });
    expect(seen.list.showArchived).toBe(true);
  });

  it("labels each kind of conversation and previews the latest message", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      dbConvo({ id: "g", messages: [lastMsg("2026-02-01T00:00:00Z", "a\n  b   c")] }),
      dbConvo({ id: "p", relatedContactId: "c9", name: "Pat" }),
      dbConvo({ id: "s", scope: "SYNCED", name: "A & B" }),
    ] as any);
    await run();
    const byId = Object.fromEntries(seen.list.conversations.map((c: any) => [c.id, c]));
    expect(byId.g).toMatchObject({ kind: "group", preview: "a b c", previewSender: "Sam" });
    expect(byId.p).toMatchObject({ kind: "private", preview: null, previewSender: null });
    expect(byId.s).toMatchObject({ kind: "synced" });
  });

  it("sorts by most recent activity, falling back to creation time when there are no messages", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      dbConvo({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
      dbConvo({ id: "newest-msg", messages: [lastMsg("2026-03-01T00:00:00Z")] }),
      dbConvo({ id: "mid", createdAt: new Date("2026-02-01T00:00:00Z") }),
    ] as any);
    await run();
    expect(seen.list.conversations.map((c: any) => c.id)).toEqual(["newest-msg", "mid", "old"]);
    expect(seen.list.conversations[0].lastActivity).toBe("2026-03-01T00:00:00.000Z");
  });

  it("offers only outside contacts that are not already synced for a private note", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "c1", firstName: "Pat", lastName: "Jones" },
      { id: "c2", firstName: "Lee", lastName: "Kim" },
    ] as any);
    vi.mocked(prisma.sync.findMany).mockResolvedValue([{ relatedContactId: "c2" }] as any);
    await run();
    expect(seen.list.contacts).toEqual([{ id: "c1", name: "Pat Jones" }]);
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0]?.[0]?.where).toEqual({
      ownerHouseholdId: "me",
      deletedAt: null,
      OR: [{ householdId: null }, { householdId: { not: "me" } }],
    });
    expect(vi.mocked(prisma.sync.findMany).mock.calls[0]?.[0]?.where).toEqual({
      initiatingHouseholdId: "me",
      status: "ACTIVE",
    });
  });
});

describe("ConversationPage", () => {
  const msg = (over: object = {}) => ({
    id: "m1", text: "hi", createdAt: new Date("2026-01-02T00:00:00Z"),
    sender: { firstName: "Sam", lastName: "Smith", householdId: "me", household: { displayName: "Smiths" } },
    ...over,
  });
  const run = async () => render(await ConversationPage({ params: Promise.resolve({ slug: "s", id: "cv1" }) }));

  beforeEach(() => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "me", contactId: "me1" } as any);
  });

  it("looks the conversation up only through the visibility rule", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(dbConvo() as any);
    await run();
    expect(vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]?.where).toEqual({
      id: "cv1",
      ...conversationsVisibleTo("me"),
    });
  });

  it("404s for a conversation the household cannot see", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    await expect(ConversationPage({ params: Promise.resolve({ slug: "s", id: "cv1" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  it("passes messages oldest first, marking which are ours and which household they came from", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      dbConvo({
        scope: "SYNCED",
        messages: [
          msg({ id: "newer", text: "second", createdAt: new Date("2026-01-03T00:00:00Z") }),
          msg({
            id: "older", text: "first",
            sender: { firstName: "Pat", lastName: "Jones", householdId: "other", household: { displayName: "Joneses" } },
          }),
        ],
      }) as any
    );
    await run();
    expect(seen.convo.conversation).toEqual({ id: "cv1", name: "Trip", synced: true, archived: false });
    expect(seen.convo.messages.map((m: any) => m.id)).toEqual(["older", "newer"]);
    expect(seen.convo.messages[0]).toMatchObject({ senderName: "Pat Jones", householdName: "Joneses", mine: false });
    expect(seen.convo.messages[1]).toMatchObject({ senderName: "Sam Smith", householdName: "Smiths", mine: true });
    expect(seen.convo.canSend).toBe(true);
  });

  it("tolerates a sender with no household and shows archived state", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      dbConvo({
        archivedAt: new Date(),
        messages: [msg({ sender: { firstName: "X", lastName: "Y", householdId: null, household: null } })],
      }) as any
    );
    await run();
    expect(seen.convo.messages[0]).toMatchObject({ householdName: null, mine: false });
    expect(seen.convo.conversation.archived).toBe(true);
  });

  it("cannot send until the user is linked to a contact", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(dbConvo() as any);
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "me", contactId: null } as any);
    await run();
    expect(seen.convo.canSend).toBe(false);
  });

  it("asks for only the most recent window of messages", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(dbConvo() as any);
    await run();
    const include = vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]?.include as any;
    expect(include.messages).toMatchObject({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
  });
});
