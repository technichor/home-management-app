// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("../helpers/fakeAuth")).fakeAuth);
vi.mock("@/lib/db", () => ({
  prisma: {
    sync: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    contact: { findMany: vi.fn() },
  },
}));
const seen: Record<string, any> = {};
vi.mock("@/app/invite/[token]/InviteResponse", () => ({
  default: (p: any) => ((seen.response = p), <div>invite response</div>),
}));
vi.mock("@/components/ChangePasswordForm", () => ({ default: () => <div>change password form</div> }));
vi.mock("@/app/[slug]/(app)/account/AccountClient", () => ({
  default: (p: any) => ((seen.account = p), <div>account client</div>),
}));

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/syncToken";
import InvitePage from "@/app/invite/[token]/page";
import AccountPage from "@/app/[slug]/(app)/account/page";

const run = () => InvitePage({ params: Promise.resolve({ token: "tok" }) });

const sync = (over: object = {}) => ({
  status: "PENDING",
  counterpartEmail: "pat@x.com",
  initiatingHouseholdId: "h-inviter",
  counterpartHouseholdId: null,
  initiatingHousehold: { displayName: "Reynolds" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seen)) delete seen[k];
  vi.mocked(getIronSession).mockResolvedValue({ householdId: "me" } as any);
  vi.mocked(prisma.sync.findUnique).mockResolvedValue(sync() as any);
});

describe("InvitePage", () => {
  it("looks the invite up by the token's hash, never the raw token", async () => {
    render(await run());
    expect(vi.mocked(prisma.sync.findUnique).mock.calls[0]?.[0]?.where).toEqual({
      inviteTokenHash: hashInviteToken("tok"),
    });
  });

  it("explains an unknown or replaced link", async () => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(null);
    render(await run());
    expect(screen.getByText("Invite not found")).toBeInTheDocument();
    expect(screen.queryByText("invite response")).not.toBeInTheDocument();
  });

  it("asks a logged-out visitor to log in first, without offering to answer", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    render(await run());
    expect(screen.getByText("Reynolds invited you to sync")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/login?next=%2Finvite%2Ftok");
    expect(screen.queryByText("invite response")).not.toBeInTheDocument();
  });

  it("tells the inviting household this is its own invite", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h-inviter" } as any);
    render(await run());
    expect(screen.getByText("This is your own invite")).toBeInTheDocument();
    expect(screen.queryByText("invite response")).not.toBeInTheDocument();
  });

  it("offers accept and decline for a pending invite, naming the household and the email", async () => {
    render(await run());
    expect(screen.getByText("Reynolds wants to sync with your household")).toBeInTheDocument();
    expect(screen.getByText("pat@x.com")).toBeInTheDocument();
    expect(screen.getByText("invite response")).toBeInTheDocument();
    expect(seen.response).toEqual({ token: "tok" });
  });

  it.each([
    ["ACTIVE", "me", "You are synced with Reynolds."],
    ["ACTIVE", "someone-else", "This invite was already accepted."],
    ["DECLINED", null, "This invite was declined."],
    ["REVOKED", null, "This invite was revoked."],
  ])("shows a %s invite (counterpart %s) as already answered", async (status, counterpart, text) => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(sync({ status, counterpartHouseholdId: counterpart }) as any);
    render(await run());
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText("invite response")).not.toBeInTheDocument();
  });
});

describe("InvitePage: after accepting", () => {
  it("links the accepting household to its messages", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "me", householdSlug: "smiths" } as any);
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(sync({ status: "ACTIVE", counterpartHouseholdId: "me" }) as any);
    render(await run());
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/smiths/messages");
  });

  it("does not offer messages to someone who is not part of the sync", async () => {
    vi.mocked(prisma.sync.findUnique).mockResolvedValue(sync({ status: "ACTIVE", counterpartHouseholdId: "other" }) as any);
    render(await run());
    expect(screen.queryByRole("link", { name: "Open messages" })).not.toBeInTheDocument();
  });
});

describe("AccountPage", () => {
  const params = Promise.resolve({ slug: "s" });

  it("passes the linked contact and the household's Family & Friend members", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      contact: { id: "m1", firstName: "Sam", lastName: "Smith" },
    } as any);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "m1", firstName: "Sam", lastName: "Smith" },
      { id: "m2", firstName: "Pat", lastName: "Smith" },
    ] as any);
    render(await AccountPage({ params }));
    expect(screen.getByText("change password form")).toBeInTheDocument();
    expect(seen.account).toEqual({
      slug: "s",
      current: { id: "m1", name: "Sam Smith" },
      members: [
        { id: "m1", name: "Sam Smith" },
        { id: "m2", name: "Pat Smith" },
      ],
    });
    expect(vi.mocked(prisma.contact.findMany).mock.calls[0]?.[0]?.where).toEqual({
      householdId: "me",
      deletedAt: null,
      category: "FAMILY_FRIEND",
    });
  });

  it("passes no current contact when none is linked yet", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ contact: null } as any);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    render(await AccountPage({ params }));
    expect(seen.account.current).toBeNull();
  });

  it("copes with the user row being missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    render(await AccountPage({ params }));
    expect(seen.account.current).toBeNull();
  });
});
