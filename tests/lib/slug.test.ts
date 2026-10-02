import { describe, it, expect } from "vitest";
import { slugify, pickSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, strips accents and punctuation, and hyphenates", () => {
    expect(slugify("The Reynolds Family")).toBe("the-reynolds-family");
    expect(slugify("  Zoë & Zack's Place!! ")).toBe("zoe-zack-s-place");
  });
  it("caps the length", () => {
    expect(slugify("a".repeat(100))).toHaveLength(48);
  });
  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("household");
    expect(slugify("x")).toBe("household");
  });
});

describe("pickSlug", () => {
  it("uses the base when it is free", () => {
    expect(pickSlug("smiths", [])).toBe("smiths");
  });
  it("numbers past taken slugs", () => {
    expect(pickSlug("smiths", ["smiths", "smiths-2"])).toBe("smiths-3");
  });
  it("never returns a reserved slug", () => {
    expect(pickSlug("login", [])).toBe("login-2");
  });
});
