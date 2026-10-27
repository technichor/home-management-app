// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/db", () => ({ prisma: { list: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/db";
import PublicListPage, { generateMetadata } from "@/app/l/[token]/page";

const params = (token = "tok") => ({ params: Promise.resolve({ token }) });
const stored = (over: object = {}) => ({
  name: "Corey's Christmas list",
  kind: "GIFT",
  archivedAt: null,
  owner: { firstName: "Corey" },
  items: [
    { id: "i1", text: "Lego set", quantity: null, notes: "The big one", url: "https://www.amazon.com/dp/B0" },
    { id: "i2", text: "Socks", quantity: "3 pairs", notes: null, url: null },
  ],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("PublicListPage", () => {
  it("finds the list by its public link only, and reads only what's still to get", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(stored() as any);
    render(await PublicListPage(params("abc")));
    const args = vi.mocked(prisma.list.findUnique).mock.calls[0][0] as any;
    expect(args.where).toEqual({ publicToken: "abc" });
    expect(args.select.items.where).toEqual({ checked: false });
    // Nothing about the household, its people, or who the items are for.
    expect(Object.keys(args.select).sort()).toEqual(["archivedAt", "items", "kind", "name", "owner"]);
    expect(args.select.owner).toEqual({ select: { firstName: true } });
  });

  it("shows a gift list's ideas with their notes and links, from its owner", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(stored() as any);
    render(await PublicListPage(params()));
    expect(screen.getByText("Gift ideas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Corey's Christmas list");
    expect(screen.getByText("From Corey")).toBeInTheDocument();
    expect(screen.getByText("The big one")).toBeInTheDocument();
    expect(screen.getByText("· 3 pairs")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Lego set (amazon.com)" });
    expect(link).toHaveAttribute("href", "https://www.amazon.com/dp/B0");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Made with Domata" })).toHaveAttribute("href", "/");
  });

  it("shows an ordinary list without the gift heading, and an owner-less one without a name", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(stored({ kind: "STANDARD", owner: null, items: [] }) as any);
    render(await PublicListPage(params()));
    expect(screen.queryByText("Gift ideas")).toBeNull();
    expect(screen.queryByText(/^From /)).toBeNull();
    expect(screen.getByText("Nothing on this list right now.")).toBeInTheDocument();
  });

  it("is not found for a link that was turned off or replaced, or a list that was archived", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    await expect(PublicListPage(params())).rejects.toThrow("NOT_FOUND");
    vi.mocked(prisma.list.findUnique).mockResolvedValue(stored({ archivedAt: new Date() }) as any);
    await expect(PublicListPage(params())).rejects.toThrow("NOT_FOUND");
  });

  it("is titled with the list's name and kept out of search engines", async () => {
    vi.mocked(prisma.list.findUnique).mockResolvedValue(stored() as any);
    expect(await generateMetadata(params())).toEqual({ title: "Corey's Christmas list · Domata", robots: { index: false, follow: false } });
    vi.mocked(prisma.list.findUnique).mockResolvedValue(null);
    expect(await generateMetadata(params())).toEqual({ title: "Domata", robots: { index: false, follow: false } });
  });
});
