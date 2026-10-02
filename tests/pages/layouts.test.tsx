// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/contacts",
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSessionUser: vi.fn() }));
vi.mock("@ant-design/nextjs-registry", () => ({
  AntdRegistry: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/app/(app)/contacts/import/ImportClient", () => ({
  default: () => <div>import client</div>,
}));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));

import { getSessionUser } from "@/lib/auth";
import RootLayout, { metadata } from "@/app/layout";
import RootPage from "@/app/page";
import AppLayout from "@/app/(app)/layout";
import ContactsLayout from "@/app/(app)/contacts/layout";
import ListsLayout from "@/app/(app)/lists/layout";
import ImportPage from "@/app/(app)/contacts/import/page";

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
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", household: { deletedAt: null } } as any);
    await expect(RootPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("sends a signed-in user without a household to onboarding", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", household: null } as any);
    await expect(RootPage()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("offers login and signup to a visitor with no session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await RootPage());
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });
});

describe("AppLayout", () => {
  const household = { id: "h1", displayName: "The Smiths", deletedAt: null };

  it("sends a signed-out visitor to log in", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("sends a user with no household, or a deleted one, to onboarding", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", household: null } as any);
    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/onboarding");
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", household: { ...household, deletedAt: new Date() } } as any);
    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("renders the nav and children for a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", household } as any);
    render(await AppLayout({ children: <p>page body</p> }));
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });
});

describe("small layouts and pages", () => {
  it("ContactsLayout renders the contacts nav above its children", async () => {
    render(await ContactsLayout({ children: <p>kids</p> }));
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByText("kids")).toBeInTheDocument();
  });

  it("ListsLayout renders the lists nav above its children", async () => {
    render(await ListsLayout({ children: <p>kids</p> }));
    expect(screen.getByRole("button", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByText("kids")).toBeInTheDocument();
  });

  it("ImportPage renders the import client", async () => {
    render(await ImportPage());
    expect(screen.getByText("import client")).toBeInTheDocument();
  });
});
