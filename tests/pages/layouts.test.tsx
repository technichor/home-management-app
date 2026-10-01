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
vi.mock("@/lib/db", () => ({ prisma: { household: { findUnique: vi.fn() } } }));
vi.mock("@ant-design/nextjs-registry", () => ({
  AntdRegistry: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/app/[slug]/(app)/contacts/import/ImportClient", () => ({
  default: ({ slug }: any) => <div>import client for {slug}</div>,
}));
vi.mock("@/app/[slug]/actions", () => ({ logoutAction: vi.fn() }));

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
  it("redirects a logged-in visitor to their contacts", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1", householdSlug: "smiths" } as any);
    await expect(RootPage()).rejects.toThrow("REDIRECT:/smiths/contacts");
  });

  it("shows the setup link to a visitor with no session", async () => {
    vi.mocked(getIronSession).mockResolvedValue({} as any);
    render(await RootPage());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/setup");
  });

  it("does not redirect on a session missing its slug", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ householdId: "h1" } as any);
    render(await RootPage());
    expect(screen.getByText("Home Management")).toBeInTheDocument();
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
