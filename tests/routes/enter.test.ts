import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSessionUser: vi.fn(),
  startSession: vi.fn(),
}));

import { GET } from "@/app/enter/route";
import { getSessionUser, startSession } from "@/lib/auth";

beforeEach(() => vi.clearAllMocks());

describe("GET /enter", () => {
  it("sends a signed-out visitor to log in", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(GET()).rejects.toThrow("REDIRECT:/login");
    expect(startSession).not.toHaveBeenCalled();
  });

  it("refreshes the session and goes to the user's household", async () => {
    const user = { id: "u", household: { id: "h", urlSlug: "smiths", deletedAt: null } };
    vi.mocked(getSessionUser).mockResolvedValue(user as any);
    await expect(GET()).rejects.toThrow("REDIRECT:/smiths/contacts");
    expect(startSession).toHaveBeenCalledWith(user);
  });
});
