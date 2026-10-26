import { describe, it, expect } from "vitest";
import { linkHost } from "@/lib/links";

describe("linkHost", () => {
  it("shows where a link goes, without www.", () => {
    expect(linkHost("https://drive.google.com/file/d/abc/view")).toBe("drive.google.com");
    expect(linkHost("https://www.amazon.com/dp/B0")).toBe("amazon.com");
    expect(linkHost("not a link")).toBe("");
  });
});
