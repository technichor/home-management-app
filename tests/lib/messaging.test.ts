import { describe, it, expect } from "vitest";
import { channelsFor, previewText } from "@/lib/messaging";
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
