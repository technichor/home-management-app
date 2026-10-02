// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/s/contacts",
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { household: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } } }));
vi.mock("@ant-design/nextjs-registry", () => ({
  AntdRegistry: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/app/[slug]/(app)/contacts/import/ImportClient", () => ({
  default: ({ slug }: any) => <div>import client for {slug}</div>,
}));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));

import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import RootLayout, { metadata } from "@/app/layout";
import RootPage from "@/app/page";
import AppLayout from "@/app/[slug]/(app)/layout";
import AppRootPage from "@/app/[slug]/(app)/page";
import ContactsLayout from "@/app/[slug]/(app)/contacts/layout";
import ListsLayout from "@/app/[slug]/(app)/lists/layout";
import ImportPage from "@/app/[slug]/(app)/contacts/import/page";

const params = Promise.resolve({ slug: "s" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RootLayout", () => {
  it("wraps children in an html document", () => {
    const html = renderToStaticMarkup(RootLayout({ children: <p>hello</p> }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<p>hello</p>");
    expect(metadata.title).toBe("Home Management");
  });
});

describe("RootPage", () => {
  it("redirects a signed-in user with a household to their contacts", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      household: { id: "h1", urlSlug: "smiths", deletedAt: null },
    } as any);
    await expect(RootPage()).rejects.toThrow("REDIRECT:/smiths/contacts");
  });

  it("sends a signed-in user without a household to onboarding", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", household: null } as any);
    await expect(RootPage()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("offers login and signup to a visitor with no session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    render(await RootPage());
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });
});

describe("AppLayout", () => {
  const household = { id: "h1", displayName: "The Smiths", passwordHash: "x", deletedAt: null };

  it("404s for an unknown slug", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(null);
    await expect(AppLayout({ children: null, params })).rejects.toThrow("NOT_FOUND");
  });

  it("404s for a household that is not an account", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ ...household, passwordHash: null } as any);
    await expect(AppLayout({ children: null, params })).rejects.toThrow("NOT_FOUND");
  });

  it("404s for a deleted household", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({ ...household, deletedAt: new Date() } as any);
    await expect(AppLayout({ children: null, params })).rejects.toThrow("NOT_FOUND");
  });

  it("redirects to login when the session is for another household", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(household as any);
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "other" } as any);
    await expect(AppLayout({ children: null, params })).rejects.toThrow("REDIRECT:/s");
  });

  describe("with a signed-in user", () => {
    beforeEach(() => {
      vi.mocked(prisma.household.findUnique).mockResolvedValue(household as any);
    });

    it("sends a user who is not a member of this household to the login", async () => {
      vi.mocked(getIronSession).mockResolvedValue({ userId: "u1", householdId: "h1" } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: "other", household: null } as any);
      await expect(AppLayout({ children: null, params })).rejects.toThrow("REDIRECT:/s");
    });

    it("does not trust a leftover household in the session once the user was removed", async () => {
      vi.mocked(getIronSession).mockResolvedValue({ userId: "u1", householdId: "h1" } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: null, household: null } as any);
      await expect(AppLayout({ children: null, params })).rejects.toThrow("REDIRECT:/s");
    });

    it("refreshes a member whose session predates joining", async () => {
      vi.mocked(getIronSession).mockResolvedValue({ userId: "u1" } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: "h1", household: null } as any);
      await expect(AppLayout({ children: null, params })).rejects.toThrow("REDIRECT:/enter");
    });

    it("renders for a member", async () => {
      vi.mocked(getIronSession).mockResolvedValue({ userId: "u1", householdId: "h1" } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", householdId: "h1", household: null } as any);
      render(await AppLayout({ children: <p>member body</p>, params }));
      expect(screen.getByText("member body")).toBeInTheDocument();
    });

    it("falls back to the household login when the session's user no longer exists", async () => {
      vi.mocked(getIronSession).mockResolvedValue({ userId: "gone", householdId: "other" } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(AppLayout({ children: null, params })).rejects.toThrow("REDIRECT:/s");
    });
  });

  it("renders the nav and children when logged in", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue(household as any);
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
    render(await AppLayout({ children: <p>page body</p>, params }));
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });
});

describe("small layouts and pages", () => {
  it("AppRootPage redirects to contacts", async () => {
    await expect(AppRootPage({ params })).rejects.toThrow("REDIRECT:/s/contacts");
  });

  it("ContactsLayout renders the contacts nav above its children", async () => {
    render(await ContactsLayout({ children: <p>kids</p>, params }));
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByText("kids")).toBeInTheDocument();
  });

  it("ListsLayout renders the lists nav above its children", async () => {
    render(await ListsLayout({ children: <p>kids</p>, params }));
    expect(screen.getByRole("button", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByText("kids")).toBeInTheDocument();
  });

  it("ImportPage passes the slug to the import client", async () => {
    render(await ImportPage({ params }));
    expect(screen.getByText("import client for s")).toBeInTheDocument();
  });
});
