import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/channels", () => ({ checkChannelMembers: vi.fn(), leaveChannelTx: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma: any = {
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversationMember: { createMany: vi.fn() },
    message: { create: vi.fn() },
  };
  prisma.$transaction = (fn: (tx: any) => unknown) => fn(prisma);
  return { prisma };
});

import { getIronSession } from "iron-session";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { checkChannelMembers, leaveChannelTx } from "@/lib/channels";
import {
  createChannelAction,
  sendMessageAction,
  addChannelMembersAction,
  removeChannelMemberAction,
  leaveChannelAction,
  renameChannelAction,
  archiveChannelAction,
  unarchiveChannelAction,
} from "@/app/(app)/messages/actions";

// The signed-in user is "u1" (see fakeAuth). By default they manage a channel that u2 is also in.
const channel = (over: object = {}) => ({
  id: "cv1",
  kind: "CHANNEL",
  archivedAt: null,
  members: [
    { userId: "u1", role: "MANAGER", user: { householdId: "h1" } },
    { userId: "u2", role: "MEMBER", user: { householdId: "h2" } },
  ],
  ...over,
});
const asMember = () =>
  channel({ members: [{ userId: "u1", role: "MEMBER", user: { householdId: "h1" } }, { userId: "u2", role: "MANAGER", user: { householdId: "h1" } }] });
const general = () => channel({ kind: "GENERAL" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
  vi.mocked(prisma.conversation.findFirst).mockResolvedValue(channel() as any);
  vi.mocked(prisma.conversation.create).mockResolvedValue({ id: "new1" } as any);
  vi.mocked(checkChannelMembers).mockResolvedValue({ ok: true, userIds: ["u2"] });
});

// Every action must check the session first and refuse a caller without one.
describe("authentication", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["createChannelAction", () => createChannelAction("Trip", ["u2"])],
    ["sendMessageAction", () => sendMessageAction("cv1", "hi")],
    ["addChannelMembersAction", () => addChannelMembersAction("cv1", ["u2"])],
    ["removeChannelMemberAction", () => removeChannelMemberAction("cv1", "u2")],
    ["leaveChannelAction", () => leaveChannelAction("cv1")],
    ["renameChannelAction", () => renameChannelAction("cv1", "New")],
    ["archiveChannelAction", () => archiveChannelAction("cv1")],
    ["unarchiveChannelAction", () => unarchiveChannelAction("cv1")],
  ];

  it.each(calls)("%s refuses a caller with no session", async (_name, call) => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    await expect(call()).rejects.toThrow("Not authenticated");
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });
});

describe("unexpected failures", () => {
  it("are not turned into results", async () => {
    vi.mocked(prisma.conversation.create).mockRejectedValueOnce(new Error("db down"));
    await expect(createChannelAction("Trip", ["u2"])).rejects.toThrow("db down");
  });
});

describe("createChannelAction", () => {
  it("creates the channel with the creator as manager and the others as members", async () => {
    expect(await createChannelAction("  Trip ", ["u2"])).toEqual({ ok: true, id: "new1" });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: {
        name: "Trip",
        createdById: "u1",
        members: { create: [{ userId: "u1", role: "MANAGER" }, { userId: "u2", addedById: "u1" }] },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/messages");
  });

  it("rejects a blank name", async () => {
    await expect(createChannelAction("  ", ["u2"])).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Give the channel a name") });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("rejects people the caller may not add", async () => {
    vi.mocked(checkChannelMembers).mockResolvedValue({ ok: false, error: "nope" });
    await expect(createChannelAction("Trip", ["u9"])).resolves.toMatchObject({ ok: false, error: expect.stringContaining("nope") });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("requires at least one other person", async () => {
    vi.mocked(checkChannelMembers).mockResolvedValue({ ok: true, userIds: [] });
    await expect(createChannelAction("Trip", [])).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Add at least one other person.") });
  });
});

describe("sendMessageAction", () => {
  it("stores the message as the signed-in user and bumps the channel", async () => {
    await sendMessageAction("cv1", " hello ");
    expect(prisma.message.create).toHaveBeenCalledWith({ data: { conversationId: "cv1", senderUserId: "u1", text: "hello" } });
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: "cv1" }, data: { updatedAt: expect.any(Date) } });
    expect(revalidatePath).toHaveBeenCalledWith("/messages/cv1");
  });

  it("looks the channel up by membership, so a non-member can't write to it", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    await expect(sendMessageAction("cv1", "hi")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Channel not found") });
    expect(vi.mocked(prisma.conversation.findFirst).mock.calls[0][0]!.where).toMatchObject({
      id: "cv1",
      members: { some: { userId: "u1" } },
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("rejects blank text and archived channels", async () => {
    await expect(sendMessageAction("cv1", "  ")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Write a message first") });
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(channel({ archivedAt: new Date() }) as any);
    await expect(sendMessageAction("cv1", "hi")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Unarchive this channel to send messages") });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("addChannelMembersAction", () => {
  it("adds the new people after checking them against everyone already in the channel", async () => {
    await addChannelMembersAction("cv1", ["u2", "u3"]);
    expect(checkChannelMembers).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), ["u3"], ["h1", "h2"]);
    expect(prisma.conversationMember.createMany).toHaveBeenCalledWith({
      data: [{ conversationId: "cv1", userId: "u2", addedById: "u1" }],
      skipDuplicates: true,
    });
  });

  it("ignores existing members' households with no household id", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(
      channel({ members: [{ userId: "u1", role: "MANAGER", user: { householdId: null } }] }) as any
    );
    await addChannelMembersAction("cv1", ["u2"]);
    expect(checkChannelMembers).toHaveBeenCalledWith(expect.anything(), ["u2"], []);
  });

  it("refuses people who fail the check and an empty selection", async () => {
    vi.mocked(checkChannelMembers).mockResolvedValue({ ok: false, error: "not connected" });
    await expect(addChannelMembersAction("cv1", ["u3"])).resolves.toMatchObject({ ok: false, error: expect.stringContaining("not connected") });
    vi.mocked(checkChannelMembers).mockResolvedValue({ ok: true, userIds: [] });
    await expect(addChannelMembersAction("cv1", ["u2"])).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Choose at least one person") });
    expect(prisma.conversationMember.createMany).not.toHaveBeenCalled();
  });
});

describe("removeChannelMemberAction", () => {
  it("removes another member", async () => {
    await removeChannelMemberAction("cv1", "u2");
    expect(leaveChannelTx).toHaveBeenCalledWith(prisma, "cv1", "u2", "CHANNEL");
  });

  it("refuses removing yourself or someone who isn't in the channel", async () => {
    await expect(removeChannelMemberAction("cv1", "u1")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Use Leave channel") });
    await expect(removeChannelMemberAction("cv1", "u9")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("That person isn't in this channel.") });
    expect(leaveChannelTx).not.toHaveBeenCalled();
  });
});

describe("leaveChannelAction", () => {
  it("lets any member leave", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(asMember() as any);
    await leaveChannelAction("cv1");
    expect(leaveChannelTx).toHaveBeenCalledWith(prisma, "cv1", "u1", "CHANNEL");
  });

  it("does not let anyone leave General", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(general() as any);
    await expect(leaveChannelAction("cv1")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("You can't leave General") });
    expect(leaveChannelTx).not.toHaveBeenCalled();
  });
});

describe("management", () => {
  it("renames, archives and unarchives for a manager", async () => {
    await renameChannelAction("cv1", " Plans ");
    expect(prisma.conversation.update).toHaveBeenLastCalledWith({ where: { id: "cv1" }, data: { name: "Plans" } });
    await archiveChannelAction("cv1");
    expect(prisma.conversation.update).toHaveBeenLastCalledWith({ where: { id: "cv1" }, data: { archivedAt: expect.any(Date) } });
    await unarchiveChannelAction("cv1");
    expect(prisma.conversation.update).toHaveBeenLastCalledWith({ where: { id: "cv1" }, data: { archivedAt: null } });
  });

  it("rejects a blank new name", async () => {
    await expect(renameChannelAction("cv1", " ")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Give the channel a name") });
  });

  it.each([
    ["rename", () => renameChannelAction("cv1", "X")],
    ["archive", () => archiveChannelAction("cv1")],
    ["unarchive", () => unarchiveChannelAction("cv1")],
    ["add", () => addChannelMembersAction("cv1", ["u3"])],
    ["remove", () => removeChannelMemberAction("cv1", "u2")],
  ])("refuses to %s for a member who isn't a manager", async (_n, call) => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(asMember() as any);
    expect(await call()).toEqual({ ok: false, error: "Only a channel manager can do that." });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("refuses to change General at all", async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(general() as any);
    await expect(archiveChannelAction("cv1")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("General always includes everyone") });
    await expect(renameChannelAction("cv1", "X")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("General always includes everyone") });
  });
});
