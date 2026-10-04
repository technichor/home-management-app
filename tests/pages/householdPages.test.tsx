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
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
  pageMember: vi.fn(),
  isUnverified: (u: any) => u.emailVerifiedAt === null,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    household: { findUnique: vi.fn() },
    householdInvite: { findMany: vi.fn(), findUnique: vi.fn() },
    joinRequest: { findMany: vi.fn() },
    sync: { findMany: vi.fn() },
  },
}));
vi.mock("@/app/(app)/household/HouseholdClient", () => ({
  default: (props: any) => <pre data-testid="client">{JSON.stringify(props)}</pre>,
}));
vi.mock("@/app/join/[token]/AcceptInvite", () => ({ default: ({ token }: any) => <div>accept {token}</div> }));

import HouseholdPage from "@/app/(app)/household/page";
import JoinPage from "@/app/join/[token]/page";
import { prisma } from "@/lib/db";
import { getSessionUser, pageMember } from "@/lib/auth";
import { hashInviteToken } from "@/lib/syncToken";
const household = { id: "h1", displayName: "The Smiths", deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1", firstName: "Sam" }] as any);
  vi.mocked(prisma.household.findUnique).mockResolvedValue({ joinCode: "ABCD2345" } as any);
  vi.mocked(prisma.householdInvite.findMany).mockResolvedValue([
    { id: "i1", createdAt: new Date("2026-01-02T00:00:00Z"), expiresAt: new Date("2026-01-09T00:00:00Z") },
  ] as any);
  vi.mocked(prisma.sync.findMany).mockResolvedValue([]);
  vi.mocked(prisma.joinRequest.findMany).mockResolvedValue([
    { id: "r1", user: { firstName: "Pat", lastName: "Lee", email: "p@x.co" } },
  ] as any);
});

describe("HouseholdPage", () => {
  it("gives an owner the join code, pending invites and requests", async () => {
    vi.mocked(pageMember).mockResolvedValue({ id: "u1", role: "OWNER", householdId: "h1", household } as any);
    render(await HouseholdPage());
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
    vi.mocked(pageMember).mockResolvedValue({ id: "u1", role: "OWNER", householdId: "h1", household } as any);
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    render(await HouseholdPage());
    expect(JSON.parse(screen.getByTestId("client").textContent!).joinCode).toBeNull();
  });

  it("lists active syncs from either side by the other household's name", async () => {
    vi.mocked(pageMember).mockResolvedValue({ id: "u1", role: "OWNER", householdId: "h1", household } as any);
    vi.mocked(prisma.sync.findMany).mockResolvedValue([
      { id: "s1", initiatingHouseholdId: "h1", initiatingHousehold: { displayName: "The Smiths" }, counterpartHousehold: { displayName: "The Joneses" } },
      { id: "s2", initiatingHouseholdId: "h2", initiatingHousehold: { displayName: "The Lees" }, counterpartHousehold: { displayName: "The Smiths" } },
      { id: "s3", initiatingHouseholdId: "h1", initiatingHousehold: { displayName: "The Smiths" }, counterpartHousehold: null },
    ] as any);
    render(await HouseholdPage());
    expect(JSON.parse(screen.getByTestId("client").textContent!).syncs).toEqual([
      { id: "s1", householdName: "The Joneses" },
      { id: "s2", householdName: "The Lees" },
      { id: "s3", householdName: "Another household" },
    ]);
    expect(vi.mocked(prisma.sync.findMany).mock.calls[0][0]!.where).toEqual({
      status: "ACTIVE",
      OR: [{ initiatingHouseholdId: "h1" }, { counterpartHouseholdId: "h1" }],
    });
  });

  it("shows a plain member only the member list", async () => {
    vi.mocked(pageMember).mockResolvedValue({ id: "u2", role: "MEMBER", householdId: "h1", household } as any);
    render(await HouseholdPage());
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

  it("asks an unverified user to confirm their email first", async () => {
    vi.mocked(prisma.householdInvite.findUnique).mockResolvedValue(invite() as any);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", email: "a@b.co", emailVerifiedAt: null, household: null } as any);
    render(await JoinPage({ params: tokenParams }));
    expect(screen.getByText(/Confirm your email address first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirm your email" })).toHaveAttribute("href", "/verify-email");
    expect(screen.queryByText("accept tok")).toBeNull();
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
