// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({ pageSuperuser: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    household: { count: vi.fn() },
    adminAuditEntry: { findMany: vi.fn() },
  },
}));
const seen: Record<string, any> = {};
vi.mock("@/components/AdminUsersTable", () => ({ default: (p: any) => ((seen.table = p), <div>users table</div>) }));
vi.mock("@/components/AdminUserActions", () => ({ default: (p: any) => ((seen.actions = p), <div>user actions</div>) }));

import AdminLayout from "@/app/admin/layout";
import AdminPage from "@/app/admin/page";
import AdminUserPage from "@/app/admin/users/[id]/page";
import { prisma } from "@/lib/db";
import { pageSuperuser } from "@/lib/auth";

const day = 24 * 60 * 60 * 1000;
const user = (over: object = {}) => ({
  id: "u1", email: "sam@x.co", firstName: "Sam", lastName: "Smith", role: "OWNER", isSuperuser: false,
  emailVerifiedAt: new Date("2026-01-02T00:00:00Z"), createdAt: new Date("2026-01-01T10:00:00Z"),
  lastLoginAt: new Date("2026-10-01T09:30:00Z"), lastSeenAt: new Date(), passwordChangedAt: null,
  household: { displayName: "The Smiths" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pageSuperuser).mockResolvedValue({ id: "me" } as any);
  vi.mocked(prisma.adminAuditEntry.findMany).mockResolvedValue([]);
});

describe("every admin page checks for a superuser itself", () => {
  it.each([
    ["the layout", () => AdminLayout({ children: null })],
    ["the users page", () => AdminPage()],
    ["a user's page", () => AdminUserPage({ params: Promise.resolve({ id: "u1" }) })],
  ])("%s shows the plain 404 to anyone else, before reading any data", async (_n, call) => {
    vi.mocked(pageSuperuser).mockRejectedValue(new Error("NOT_FOUND"));
    await expect(call()).rejects.toThrow("NOT_FOUND");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("AdminLayout", () => {
  it("wraps the page in a plain admin header with a way back", async () => {
    render(await AdminLayout({ children: <p>page body</p> }));
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Back to the app" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });
});

describe("AdminPage", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      user(),
      user({ id: "u2", email: "kim@x.co", firstName: "Kim", lastName: "Wu", isSuperuser: true, emailVerifiedAt: null, lastSeenAt: new Date(Date.now() - 30 * day), lastLoginAt: null, household: null }),
      user({ id: "u3", email: "new@x.co", lastSeenAt: null, lastLoginAt: null }),
    ] as any);
    vi.mocked(prisma.household.count).mockResolvedValue(1);
  });

  it("summarizes the accounts and passes serializable rows to the table", async () => {
    render(await AdminPage());
    for (const [label, value] of [["Users", "3"], ["Email confirmed", "2"], ["Active households", "1"], ["Seen in the last 7 days", "1"], ["Superusers", "1"]]) {
      expect(screen.getByText(label, { selector: "div" }).previousElementSibling).toHaveTextContent(value);
    }
    expect(seen.table.users).toEqual([
      {
        id: "u1", email: "sam@x.co", name: "Sam Smith", role: "OWNER", householdName: "The Smiths", isSuperuser: false,
        verified: true, createdAt: "2026-01-01T10:00:00.000Z", lastLoginAt: "2026-10-01T09:30:00.000Z", lastSeenAt: expect.any(String),
      },
      expect.objectContaining({ id: "u2", householdName: null, isSuperuser: true, verified: false, lastLoginAt: null }),
      expect.objectContaining({ id: "u3", lastSeenAt: null, lastLoginAt: null }),
    ]);
    expect(vi.mocked(prisma.household.count).mock.calls[0][0]!.where).toEqual({ deletedAt: null, members: { some: {} } });
  });

  it("shows recent admin activity, naming deleted users", async () => {
    vi.mocked(prisma.adminAuditEntry.findMany).mockResolvedValue([
      { id: "a1", action: "SUPERUSER_GRANTED", createdAt: new Date("2026-10-02T12:00:00Z"), actor: { email: "me@x.co" }, targetUser: { email: "kim@x.co" } },
      { id: "a2", action: "SOMETHING_NEW", createdAt: new Date("2026-10-02T11:00:00Z"), actor: null, targetUser: null },
    ] as any);
    render(await AdminPage());
    expect(screen.getByText(/granted superuser access to/)).toBeInTheDocument();
    expect(screen.getByText("kim@x.co")).toBeInTheDocument();
    expect(screen.getByText(/SOMETHING_NEW/)).toBeInTheDocument();
    expect(screen.getAllByText("a deleted user")).toHaveLength(2);
  });

  it("says when nothing has been done yet", async () => {
    render(await AdminPage());
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });
});

describe("AdminUserPage", () => {
  const params = Promise.resolve({ id: "u1" });
  const full = (over: object = {}) => ({
    ...user(),
    household: { displayName: "The Smiths", deletedAt: null, _count: { members: 3 } },
    resetTokens: [],
    ...over,
  });
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(full() as any);
  });

  it("404s for an unknown user (to a superuser)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(AdminUserPage({ params })).rejects.toThrow("NOT_FOUND");
  });

  it("shows every detail about the account", async () => {
    render(await AdminUserPage({ params }));
    expect(screen.getByRole("heading", { name: /Sam Smith/ })).toBeInTheDocument();
    expect(screen.getAllByText("sam@x.co").length).toBeGreaterThan(0); // in the breadcrumb and the details
    for (const text of [
      "2026-01-02 00:00 UTC", "2026-01-01 10:00 UTC", "2026-10-01 09:30 UTC",
      "Never (still the one they signed up with)", "The Smiths · 3 members", "Owner", "None", "u1",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(seen.actions).toEqual({ userId: "u1", email: "sam@x.co", isSelf: false, isSuperuser: false });
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });

  it("shows the odd cases: unconfirmed, superuser, no household, a pending reset link, a changed password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      full({
        id: "me", isSuperuser: true, emailVerifiedAt: null, household: null,
        passwordChangedAt: new Date("2026-05-05T05:05:00Z"),
        resetTokens: [{ expiresAt: new Date("2026-10-03T00:00:00Z") }],
      }) as any
    );
    render(await AdminUserPage({ params }));
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getAllByText("Superuser").length).toBeGreaterThan(0);
    expect(screen.getByText("None yet")).toBeInTheDocument();
    expect(screen.getByText("2026-05-05 05:05 UTC")).toBeInTheDocument();
    expect(screen.getByText("Yes, expires 2026-10-03 00:00 UTC")).toBeInTheDocument();
    expect(seen.actions).toMatchObject({ isSelf: true, isSuperuser: true });
  });

  it("words a removed household and a one-person household", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      full({ role: "MEMBER", household: { displayName: "Gone", deletedAt: new Date(), _count: { members: 1 } } }) as any
    );
    render(await AdminUserPage({ params }));
    expect(screen.getByText("Gone (removed) · 1 member")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("lists admin activity involving the user, naming deleted users and unknown actions", async () => {
    vi.mocked(prisma.adminAuditEntry.findMany).mockResolvedValue([
      { id: "a1", action: "PASSWORD_RESET_LINK_CREATED", createdAt: new Date("2026-10-02T12:00:00Z"), actor: { email: "me@x.co" }, targetUser: { email: "sam@x.co" } },
      { id: "a2", action: "SOMETHING_NEW", createdAt: new Date("2026-10-02T11:00:00Z"), actor: null, targetUser: null },
    ] as any);
    render(await AdminUserPage({ params }));
    expect(screen.getByText(/created a password reset link for/)).toBeInTheDocument();
    expect(screen.getByText(/SOMETHING_NEW/)).toBeInTheDocument();
    expect(screen.getAllByText("a deleted user")).toHaveLength(2);
    expect(vi.mocked(prisma.adminAuditEntry.findMany).mock.calls[0][0]!.where).toEqual({
      OR: [{ targetUserId: "u1" }, { actorId: "u1" }],
    });
  });
});
