import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { prisma } from "@/lib/db";
import { channelsFor, previewText, totalUnread, unreadCounts } from "@/lib/messaging";
import { conversationNameSchema, messageSchema } from "@/lib/validations";

describe("channelsFor", () => {
  it("shows a channel only to its members, with no other way in", () => {
    expect(channelsFor("u1")).toEqual({ members: { some: { userId: "u1" } } });
  });
});

describe("previewText", () => {
  it("collapses whitespace and leaves short text alone", () => {
    expect(previewText("  hello \n  there  ")).toBe("hello there");
  });

  it("truncates long text with an ellipsis within the limit", () => {
    const out = previewText("a".repeat(200), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps text exactly at the limit", () => {
    expect(previewText("abcde", 5)).toBe("abcde");
  });
});

describe("messaging validation", () => {
  it("trims names and messages and rejects blanks", () => {
    expect(conversationNameSchema.safeParse({ name: "  Trip " }).data).toEqual({ name: "Trip" });
    expect(conversationNameSchema.safeParse({ name: " " }).error?.issues[0].message).toBe("Give the channel a name");
    expect(messageSchema.safeParse({ text: " hi " }).data).toEqual({ text: "hi" });
    expect(messageSchema.safeParse({ text: "  " }).error?.issues[0].message).toBe("Write a message first");
  });

  it("enforces maximum lengths", () => {
    expect(conversationNameSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    expect(conversationNameSchema.safeParse({ name: "a".repeat(100) }).success).toBe(true);
    expect(messageSchema.safeParse({ text: "a".repeat(4001) }).success).toBe(false);
    expect(messageSchema.safeParse({ text: "a".repeat(4000) }).success).toBe(true);
  });
});

describe("unread counts", () => {
  it("maps each channel with unread messages to its count, asking for the given user", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { conversationId: "c1", unread: 2 },
      { conversationId: "c2", unread: 5 },
    ]);
    const counts = await unreadCounts("u1");
    expect(counts).toEqual(new Map([["c1", 2], ["c2", 5]]));
    const call = vi.mocked(prisma.$queryRaw).mock.calls.at(-1)!;
    expect(call.slice(1)).toEqual(["u1"]);
    const sql = (call[0] as unknown as string[]).join("?");
    expect(sql).toContain('"lastReadAt"');
    expect(sql).toContain('"archivedAt" IS NULL');
    expect(sql).toContain('IS DISTINCT FROM cm."userId"');
  });

  it("totals them, and is zero when nothing is unread", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ conversationId: "c1", unread: 2 }, { conversationId: "c2", unread: 5 }]);
    expect(await totalUnread("u1")).toBe(7);
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);
    expect(await totalUnread("u1")).toBe(0);
  });
});
