import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken } from "@/lib/syncToken";

describe("hashInviteToken", () => {
  it("is a stable SHA-256 hex digest", () => {
    expect(hashInviteToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
  });

  it("differs for different tokens", () => {
    expect(hashInviteToken("a")).not.toBe(hashInviteToken("b"));
  });
});

describe("generateInviteToken", () => {
  it("returns a URL-safe token with 256 bits of entropy and its hash", () => {
    const { token, hash } = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).not.toContain(token);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInviteToken().token));
    expect(tokens.size).toBe(50);
  });
});
