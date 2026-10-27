// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/documents/actions", () => ({ dismissSuggestionAction: vi.fn(), restoreSuggestionAction: vi.fn() }));

import DocumentsClient from "@/app/(app)/documents/DocumentsClient";
import { dismissSuggestionAction, restoreSuggestionAction } from "@/app/(app)/documents/actions";
import type { DocumentView } from "@/lib/documents";
import { DOCUMENT_TYPES } from "@/lib/documentCatalog";

const members = [
  { id: "c1", name: "Corey" },
  { id: "c2", name: "Ellie" },
];
const vehicles = [{ id: "v1", name: "Pacifica" }];
const doc = (over: Partial<DocumentView>): DocumentView => ({
  id: "d", title: "T", category: "IDENTITY", typeKey: null, ownerContactId: null, ownerName: null, maintenanceItemId: null, itemName: null,
  accountRecordId: null, accountName: null, links: [{ url: "https://drive.google.com/x", label: null }], originalLocation: null, notes: null, ...over,
});
const docs = [
  doc({ id: "p1", title: "Passport – Corey", typeKey: "passport", ownerContactId: "c1", ownerName: "Corey", links: [{ url: "https://drive.google.com/p", label: "Photo page" }] }),
  doc({ id: "w", title: "Our wills", typeKey: "will", category: "LEGAL" }),
  doc({ id: "b", title: "Badge", category: "WORK", ownerContactId: "c2", ownerName: "Ellie" }),
  doc({ id: "deed", title: "Deed or title", typeKey: "deed", category: "HOME" }),
];

function show(props: Partial<Parameters<typeof DocumentsClient>[0]> = {}) {
  return render(
    <App>
      <DocumentsClient documents={docs} members={members} vehicles={vehicles} dismissals={[]} {...props} />
    </App>,
  );
}
const card = (name: string) => screen.getByRole("region", { name });
const addLink = (name: string) => screen.getByRole("link", { name: `Add link: ${name}` });

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(dismissSuggestionAction).mockResolvedValue({ ok: true });
  vi.mocked(restoreSuggestionAction).mockResolvedValue({ ok: true });
});
afterEach(() => vi.restoreAllMocks());

describe("DocumentsClient", () => {
  it("an empty household: the intro, every suggestion open, and the categories with nothing to suggest last", () => {
    show({ documents: [], vehicles: [] });
    expect(screen.getByRole("heading", { name: "Documents (0)" })).toBeInTheDocument();
    expect(screen.getByText(/A checklist of the documents families need to find in a hurry/)).toBeInTheDocument();
    expect(screen.getByText(/^0 of \d+ suggestions added$/)).toBeInTheDocument();
    expect(within(card("Identity & vital records")).getByText("0 of 9")).toBeInTheDocument();
    expect(addLink("Passport – Ellie")).toHaveAttribute("href", "/documents/new?type=passport&contact=c2&returnTo=%2Fdocuments");
    expect(addLink("Deed or title")).toHaveAttribute("href", "/documents/new?type=deed&returnTo=%2Fdocuments");
    // Work, School & kids, Other and (with no vehicles) Vehicles: just an Add chip each, at the end.
    const quiet = screen.getByLabelText("Other categories");
    expect(within(quiet).getAllByRole("link").map((l) => l.textContent?.trim())).toEqual(["Vehicles", "School & kids", "Work", "Other"]);
    expect(within(quiet).getByRole("link", { name: /Work/ })).toHaveAttribute("href", "/documents/new?category=WORK&returnTo=/documents");
    expect(screen.queryByRole("region", { name: "Work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dismissed/ })).not.toBeInTheDocument();
  });

  it("shows each document under its type, with whose and its links; a card's count is added of suggested", () => {
    show();
    expect(screen.getByRole("heading", { name: "Documents (4)" })).toBeInTheDocument();
    expect(screen.queryByText(/A checklist of the documents/)).not.toBeInTheDocument();
    const identity = card("Identity & vital records");
    expect(within(identity).getByText("1 of 9")).toBeInTheDocument();
    expect(within(identity).getByText("· 1 of 2")).toBeInTheDocument(); // Passport, of Corey and Ellie
    expect(within(identity).getByRole("link", { name: "Passport – Corey" })).toHaveAttribute("href", "/documents/p1");
    expect(within(identity).queryByText("Corey", { selector: ".documents-doc-detail" })).not.toBeInTheDocument();
    expect(within(identity).getByRole("link", { name: "Open Passport – Corey: Photo page (drive.google.com)" })).toHaveAttribute("target", "_blank");
    expect(addLink("Passport – Ellie")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add link: Passport – Corey" })).not.toBeInTheDocument();
    // A household slot shows its document (naming the type when the title doesn't), not an Add link.
    const legal = card("Legal & estate");
    expect(within(legal).getByRole("link", { name: "Our wills" })).toBeInTheDocument();
    expect(within(legal).getByText("Wills")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add link: Wills" })).not.toBeInTheDocument();
    // Titled just as its type is, it isn't named twice.
    expect(within(card("Home & property")).queryByText("Deed or title", { selector: ".documents-doc-detail" })).not.toBeInTheDocument();
    expect(within(card("Home & property")).getByRole("link", { name: "Deed or title" })).toHaveAttribute("href", "/documents/deed");
    // A category with only other documents counts them.
    expect(within(card("Work")).getByText("1 document")).toBeInTheDocument();
    expect(within(card("Work")).getByText("Ellie")).toBeInTheDocument();
    // A vehicle's slots, per vehicle.
    expect(addLink("Title – Pacifica")).toHaveAttribute("href", "/documents/new?type=vehicle-title&item=v1&returnTo=%2Fdocuments");
  });

  it("a card with many rows shows eight until Show all", async () => {
    const many = Array.from({ length: 6 }, (_, i) => doc({ id: `o${i}`, title: `Other ${i}`, category: "OTHER" }));
    show({ documents: [...many, doc({ id: "o9", title: "Other 9", category: "OTHER" }), doc({ id: "o8", title: "Other 8", category: "OTHER" }), doc({ id: "oa", title: "Other A", category: "OTHER" })] });
    const other = card("Other");
    expect(within(other).getByText("9 documents")).toBeInTheDocument();
    expect(within(other).queryByRole("link", { name: "Other A" })).not.toBeInTheDocument();
    await userEvent.click(within(other).getByRole("button", { name: "Show all (9)" }));
    expect(within(other).getByRole("link", { name: "Other A" })).toBeInTheDocument();
    expect(within(other).queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("'Doesn't apply' for a household slot and for one person's", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "More for Lease agreement" }));
    await userEvent.click(await screen.findByText("Doesn't apply"));
    expect(dismissSuggestionAction).toHaveBeenCalledWith("lease", "household");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "More for Driver's license or state ID – Ellie" }));
    await userEvent.click(await screen.findByText("Doesn't apply to Ellie"));
    expect(dismissSuggestionAction).toHaveBeenCalledWith("drivers-license", "contact:c2");
  });

  it("says when the server refuses", async () => {
    vi.mocked(dismissSuggestionAction).mockResolvedValue({ ok: false, error: "That suggestion isn't one of yours" });
    show();
    await userEvent.click(screen.getByRole("button", { name: "More for Lease agreement" }));
    await userEvent.click(await screen.findByText("Doesn't apply"));
    expect(await screen.findByText("That suggestion isn't one of yours")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("dismissed slots leave the cards and the counts, and can be restored", async () => {
    show({ dismissals: [{ typeKey: "lease", subjectKey: "household" }, { typeKey: "drivers-license", subjectKey: "contact:c2" }] });
    expect(screen.queryByRole("link", { name: "Add link: Lease agreement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add link: Driver's license or state ID – Ellie" })).not.toBeInTheDocument();
    expect(within(card("Identity & vital records")).getByText("1 of 8")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Dismissed (2)" });
    await userEvent.click(toggle);
    const list = screen.getByRole("list", { name: "Dismissed" });
    expect(within(list).getByText("Lease agreement")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Restore Driver's license or state ID – Ellie" }));
    expect(restoreSuggestionAction).toHaveBeenCalledWith("drivers-license", "contact:c2");
    await userEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Dismissed" })).not.toBeInTheDocument();
  });

  it("a type whose every slot is dismissed, with no documents, is left out", () => {
    show({ documents: [], dismissals: [{ typeKey: "passport", subjectKey: "contact:c1" }, { typeKey: "passport", subjectKey: "contact:c2" }] });
    expect(within(card("Identity & vital records")).queryByText("Passport")).not.toBeInTheDocument();
  });

  it("whose: one member's documents and slots, remembered on this device", async () => {
    show();
    await userEvent.click(screen.getByRole("combobox", { name: "Whose" }));
    await userEvent.click(await screen.findByTitle("Ellie"));
    expect(window.localStorage.getItem("documents.whose")).toBe("c2");
    expect(screen.queryByRole("link", { name: "Passport – Corey" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Badge" })).toBeInTheDocument();
    expect(addLink("Passport – Ellie")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add link: Deed or title" })).not.toBeInTheDocument();
    expect(screen.getByText("0 of 5 suggestions added")).toBeInTheDocument();
  });

  it("the household: documents that are no one person's, and the household's and vehicles' slots", async () => {
    window.localStorage.setItem("documents.whose", "household");
    show();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Passport – Corey" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Our wills" })).toBeInTheDocument();
    expect(addLink("Title – Pacifica")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add link: Passport – Ellie" })).not.toBeInTheDocument();
  });

  it("forgets a remembered member who has left, and works without browser storage", () => {
    window.localStorage.setItem("documents.whose", "gone");
    const { unmount } = show();
    expect(screen.getByRole("link", { name: "Passport – Corey" })).toBeInTheDocument();
    unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    expect(screen.getByRole("link", { name: "Passport – Corey" })).toBeInTheDocument();
  });

  it("choosing works without browser storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    await userEvent.click(screen.getByRole("combobox", { name: "Whose" }));
    await userEvent.click(await screen.findByTitle("Household"));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Passport – Corey" })).not.toBeInTheDocument());
  });

  it("search: a flat list of matching documents, and what isn't added yet", async () => {
    show();
    await userEvent.type(screen.getByLabelText("Search documents"), "passport");
    const found = screen.getByRole("region", { name: "Matching documents" });
    expect(within(found).getByRole("link", { name: "Passport – Corey" })).toBeInTheDocument();
    // What the title already says isn't said again.
    expect(within(found).getByText("Identity & vital records")).toBeInTheDocument();
    const notAdded = screen.getByRole("region", { name: "Not added yet" });
    expect(within(notAdded).getByText("Passport – Ellie")).toBeInTheDocument();
    expect(within(notAdded).getByRole("link", { name: "Add link: Passport – Ellie" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Legal & estate" })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search documents"));
    await userEvent.type(screen.getByLabelText("Search documents"), "ellie");
    expect(screen.getByRole("link", { name: "Badge" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Not added yet" })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search documents"));
    await userEvent.type(screen.getByLabelText("Search documents"), "zzz");
    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });

  it("with every suggestion dismissed, no summary line", () => {
    const all = DOCUMENT_TYPES.filter((t) => t.suggested && t.scope === "HOUSEHOLD").map((t) => ({ typeKey: t.key, subjectKey: "household" }));
    show({ documents: [], members: [], vehicles: [], dismissals: all });
    expect(screen.queryByText(/suggestions added/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Dismissed (${all.length})` })).toBeInTheDocument();
  });
});
