import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => {
  const prisma: any = {
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: { findUnique: vi.fn() },
    household: { findUnique: vi.fn() },
    sync: { findFirst: vi.fn() },
    message: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conversationsVisibleTo } from "@/lib/messaging";
import {
  createGroupConversationAction,
  startContactThreadAction,
  sendMessageAction,
  archiveConversationAction,
  unarchiveConversationAction,
} from "@/app/[slug]/(app)/messages/actions";

const convo = (over: object = {}) => ({ id: "cv1", archivedAt: null, ...over });
const outsider = (over: object = {}) => ({
  id: "c1", ownerHouseholdId: "h1", firstName: "Pat", lastName: "Jones", householdId: "other", deletedAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo() as any);
  vi.mocked(prisma.conversation.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(prisma.conversation.update).mockResolvedValue({} as any);
  vi.mocked(prisma.contact.findUnique).mockResolvedValue(outsider() as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue({ accountContactId: "me1" } as any);
  vi.mocked(prisma.sync.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.message.create).mockResolvedValue({} as any);
});

// Every action must check the session first and refuse a caller without one.
describe("authentication", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["createGroupConversationAction", () => createGroupConversationAction("s", "Trip")],
    ["startContactThreadAction", () => startContactThreadAction("s", "c1")],
    ["sendMessageAction", () => sendMessageAction("s", "cv1", "hi")],
    ["archiveConversationAction", () => archiveConversationAction("s", "cv1")],
    ["unarchiveConversationAction", () => unarchiveConversationAction("s", "cv1")],
  ];

  it.each(calls)("%s refuses a caller with no session", async (_name, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("createGroupConversationAction", () => {
  it("creates a household-scope conversation for the caller's household", async () => {
    expect(await createGroupConversationAction("s", "  Trip planning ")).toEqual({ id: "new1" });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { scope: "HOUSEHOLD", householdId: "h1", name: "Trip planning" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/messages");
  });

  it("rejects a blank name", async () => {
    await expect(createGroupConversationAction("s", "  ")).rejects.toThrow("Give the conversation a name");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });
});

describe("startContactThreadAction", () => {
  it("creates a private note thread named for the contact", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    expect(await startContactThreadAction("s", "c1")).toEqual({ id: "new1" });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { scope: "HOUSEHOLD", householdId: "h1", relatedContactId: "c1", name: "Pat Jones" },
    });
  });

  it("reuses an open thread for the same contact instead of making another", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({ id: "existing" } as any);
    expect(await startContactThreadAction("s", "c1")).toEqual({ id: "existing" });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]?.where).toEqual({
      scope: "HOUSEHOLD", householdId: "h1", relatedContactId: "c1", archivedAt: null,
    });
  });

  it.each([
    ["a missing contact", null, "Contact not found"],
    ["a removed contact", outsider({ deletedAt: new Date() }), "Contact not found"],
    ["someone in our own household", outsider({ householdId: "h1" }), "already part of your household"],
  ])("rejects %s", async (_name, contact, message) => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact as any);
    await expect(startContactThreadAction("s", "c1")).rejects.toThrow(message);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("points a synced contact to the shared conversation instead", async () => {
    vi.mocked(prisma.sync.findFirst).mockResolvedValue({ id: "sy1" } as any);
    await expect(startContactThreadAction("s", "c1")).rejects.toThrow("synced with this contact");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });
});

describe("sendMessageAction", () => {
  it("sends as the account's linked contact and bumps the conversation's recency", async () => {
    await sendMessageAction("s", "cv1", "  hello there ");
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: "cv1", senderContactId: "me1", text: "hello there" },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "cv1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/messages/cv1");
    expect(revalidatePath).toHaveBeenCalledWith("/s/messages");
  });

  it("only ever looks the conversation up through the visibility rule", async () => {
    await sendMessageAction("s", "cv1", "hi");
    expect(vi.mocked(prisma.conversation.findFirst).mock.calls[0]?.[0]).toEqual({
      where: { id: "cv1", ...conversationsVisibleTo("h1") },
    });
  });

  it("reports a conversation the household cannot see as not found, and sends nothing", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    await expect(sendMessageAction("s", "cv1", "hi")).rejects.toThrow("Conversation not found");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("rejects blank and over-long text", async () => {
    await expect(sendMessageAction("s", "cv1", "   ")).rejects.toThrow("Write a message first");
    await expect(sendMessageAction("s", "cv1", "a".repeat(4001))).rejects.toThrow("at most 4000");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("will not send into an archived conversation", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(convo({ archivedAt: new Date() }) as any);
    await expect(sendMessageAction("s", "cv1", "hi")).rejects.toThrow("Unarchive this conversation");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no linked contact", { accountContactId: null }],
    ["no household row", null],
  ])("will not send when the account has %s", async (_name, household) => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(household as any);
    await expect(sendMessageAction("s", "cv1", "hi")).rejects.toThrow("Link your account to a contact");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("archive and unarchive", () => {
  it("archives a visible conversation", async () => {
    await archiveConversationAction("s", "cv1");
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "cv1" },
      data: { archivedAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/s/messages/cv1");
  });

  it("unarchives a visible conversation", async () => {
    await unarchiveConversationAction("s", "cv1");
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "cv1" },
      data: { archivedAt: null },
    });
  });

  it.each([
    ["archive", () => archiveConversationAction("s", "cv1")],
    ["unarchive", () => unarchiveConversationAction("s", "cv1")],
  ])("will not %s a conversation the household cannot see", async (_name, call) => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    await expect(call()).rejects.toThrow("Conversation not found");
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});
