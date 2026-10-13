import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { open, seal, secretBoxReady } from "@/lib/secretBox";

const saved = process.env.TOKEN_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = saved;
});

describe("secretBox", () => {
  it("seals to a versioned value that reveals nothing, and opens it again", () => {
    const sealed = seal("refresh-token-123");
    expect(sealed).toMatch(/^v1:/);
    expect(sealed).not.toContain("refresh-token-123");
    expect(open(sealed)).toBe("refresh-token-123");
  });

  it("seals the same value differently each time", () => {
    expect(seal("x")).not.toBe(seal("x"));
  });

  it("refuses a tampered value", () => {
    const sealed = seal("secret");
    const bytes = Buffer.from(sealed.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => open(`v1:${bytes.toString("base64")}`)).toThrow();
  });

  it("refuses a value sealed under another key", () => {
    const sealed = seal("secret");
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => open(sealed)).toThrow();
  });

  it.each(["plain", "v2:abc", "v1:"])("refuses %s, which isn't one of ours", (value) => {
    expect(() => open(value)).toThrow("Not a sealed value");
  });

  it("is ready only with a 32-byte key", () => {
    expect(secretBoxReady()).toBe(true);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(secretBoxReady()).toBe(false);
    expect(() => seal("x")).toThrow("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64");
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(secretBoxReady()).toBe(false);
  });
});
