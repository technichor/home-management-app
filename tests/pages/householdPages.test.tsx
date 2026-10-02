// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    household: { findUnique: vi.fn() },
    householdInvite: { findMany: vi.fn(), findUnique: vi.fn() },
    joinRequest: { findMany: vi.fn() },
  },
}));
vi.mock("@/app/[slug]/(app)/household/HouseholdClient", () => ({
  default: (props: any) => <pre data-testid="client">{JSON.stringify(props)}</pre>,
}));
vi.mock("@/app/join/[token]/AcceptInvite", () => ({ default: ({ token }: any) => <div>accept {token}</div> }));

import HouseholdPage from "@/app/[slug]/(app)/household/page";
import JoinPage from "@/app/join/[token]/page";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";

const params = Promise.resolve({ slug: "smiths" });
const household = { id: "h1", displayName: "The Smiths", urlSlug: "smiths", deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1", firstName: "Sam" }] as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue({ joinCode: "ABCD2345" } as any);
  vi.mocked(prisma.householdInvite.findMany).mockResolvedValue([
    { id: "i1", createdAt: new Date("2026-01-02T00:00:00Z"), expiresAt: new Date("2026-01-09T00:00:00Z") },
  ] as any);
  vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([
    { id: "r1", user: { firstName: "Pat", lastName: "Lee", email: "p@x.co" } },
  ] as any);
});

describe("HouseholdPage", () => {
  it("requires a signed-in user who belongs to this household", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(HouseholdPage({ params })).rejects.toThrow("REDIRECT:/login");
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "OWNER", household: null } as any);
    await expect(HouseholdPage({ params })).rejects.toThrow("NOT_FOUND");
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "OWNER", household: { ...household, urlSlug: "other" } } as any);
    await expect(HouseholdPage({ params })).rejects.toThrow("NOT_FOUND");
  });

  it("gives an owner the join code, pending invites and requests", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "OWNER", household } as any);
    render(await HouseholdPage({ params }));
    const props = JSON.parse(screen.getByTestId("client").textContent!);
    expect(props).toMatchObject({
      householdName: "The Smiths",
      currentUserId: "u1",
      isOwner: true,
      joinCode: "ABCD2345",
      invites: [{ id: "i1", createdAt: "2026-01-02T00:00:00.000Z", expiresAt: "2026-01-09T00:00:00.000Z" }],
      requests: [{ id: "r1", name: "Pat Lee", email: "p@x.co" }],
    });
  });

  it("gives an owner a null code when join requests are off", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "OWNER", household } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    render(await HouseholdPage({ params }));
    expect(JSON.parse(screen.getByTestId("client").textContent!).joinCode).toBeNull();
  });

  it("shows a plain member only the member list", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u2", role: "MEMBER", household } as any);
    render(await HouseholdPage({ params }));
    const props = JSON.parse(screen.getByTestId("client").textContent!);
    expect(props).toMatchObject({ isOwner: false, joinCode: null, invites: [], requests: [] });
    expect(prisma.householdInvite.findMany).not.toHaveBeenCalled();
    expect(prisma.joinRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("JoinPage", () => {
  const tokenParams = Promise.resolve({ token: "tok" });
  const invite = (over: any = {}) => ({
    status: "PENDING",
    expiresAt: new Date(Date.now() + 3600_000),
    household: { displayName: "The Smiths", deletedAt: null },
    ...over,
  });

  it("looks the invite up by token hash", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(null);
    await JoinPage({ params: tokenParams });
    expect(vi.mocked(prisma.householdInvite.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashInviteToken("tok") });
  });

  it("says when the link is not valid", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(null);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText("Invite not found")).toBeInTheDocument();
  });

  it("treats an invite to a deleted household as not found", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(
      invite({ household: { displayName: "Gone", deletedAt: new Date() } }) as any
    );
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText("Invite not found")).toBeInTheDocument();
  });

  it("says when the invite was used or withdrawn, or expired", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite({ status: "ACCEPTED" }) as any);
    const { unmount } = render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText(/already used or withdrawn/)).toBeInTheDocument();
    unmount();
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }) as any);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText(/has expired/)).toBeInTheDocument();
  });

  it("asks a signed-out visitor to log in or sign up, then come back", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fjoin%2Ftok");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fjoin%2Ftok");
  });

  it("tells a user who already has a household they can't accept", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", email: "a@b.co", household: { deletedAt: null } } as any);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText(/already belong to a household/)).toBeInTheDocument();
    expect(screen.queryByText("accept tok")).toBeNull();
  });

  it("offers to accept to a user with no household (or a deleted one)", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", email: "a@b.co", household: { deletedAt: new Date() } } as any);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText("accept tok")).toBeInTheDocument();
    expect(screen.getByText(/a@b\.co/)).toBeInTheDocument();
  });

  it("offers to accept to a user with no household at all", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", email: "a@b.co", household: null } as any);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText("accept tok")).toBeInTheDocument();
  });
});
