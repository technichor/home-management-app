// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/(app)/contacts/import/actions", () => ({
  validateImportAction: vi.fn(),
  applyImportAction: vi.fn(),
}));

import ImportClient from "@/app/(app)/contacts/import/ImportClient";
import { validateImportAction, applyImportAction } from "@/app/(app)/contacts/import/actions";

const emptyDiff = {
  households: { added: [], updated: [], removed: [], unchanged: 0 },
  contacts: { added: [], updated: [], removed: [], unchanged: 0 },
};
const person = (over: object = {}) => ({
  firstName: "Joe", lastName: "Plumber", category: "SERVICE_PROVIDER", tags: [], favorite: false, ...over,
});
const richDiff = {
  households: {
    added: [{ displayName: "Newbies", tags: [] }],
    updated: [
      { before: { displayName: "Old Name" }, after: { displayName: "New Name" } },
      { before: { displayName: "Same Name" }, after: { displayName: "Same Name" } },
    ],
    removed: [
      { id: "h-a", displayName: "Gone With Kids", hasFamilyFriendContacts: true },
      { id: "h-b", displayName: "Gone Quietly", hasFamilyFriendContacts: false },
    ],
    unchanged: 4,
  },
  contacts: {
    added: [person()],
    updated: [{ before: { firstName: "Jane", lastName: "Smith" }, after: person() }],
    removed: [{ id: "c-x", name: "Old Contact" }],
    unchanged: 7,
  },
};
const success = (diff: object = richDiff) => ({
  ok: true as const,
  diff: diff as any,
  householdsCSV: "H-CSV",
  contactsCSV: "C-CSV",
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function upload() {
  await waitFor(() => expect(document.querySelector("input[name=householdsFile]")).not.toBeNull());
  const h = document.querySelector("input[name=householdsFile]") as HTMLInputElement;
  const c = document.querySelector("input[name=contactsFile]") as HTMLInputElement;
  await userEvent.upload(h, new File(["h"], "households.csv", { type: "text/csv" }));
  await userEvent.upload(c, new File(["c"], "contacts.csv", { type: "text/csv" }));
  // jsdom does not count userEvent-uploaded files toward the inputs' "required" check, so submit directly.
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

const stat = (title: string) =>
  screen.getByText(title, { selector: ".ant-statistic-title" }).closest(".ant-statistic") as HTMLElement;

describe("upload step", () => {
  it("explains how importing works and links the export files", () => {
    render(<ImportClient />);
    expect(screen.getByText("How importing works")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /households\.csv/ })).toHaveAttribute(
      "href",
      "/contacts/api/export?file=households"
    );
    expect(screen.getByRole("link", { name: /contacts\.csv/ })).toHaveAttribute(
      "href",
      "/contacts/api/export?file=contacts"
    );
  });

  it("sends both files for validation", async () => {
    vi.mocked(validateImportAction).mockResolvedValue(success(emptyDiff));
    render(<ImportClient />);
    await upload();
    await waitFor(() => expect(validateImportAction).toHaveBeenCalled());
    const fd = vi.mocked(validateImportAction).mock.calls[0][0];
    // (jsdom's FormData does not carry the uploaded files' names, so check the fields are sent.)
    expect(fd.has("householdsFile")).toBe(true);
    expect(fd.has("contactsFile")).toBe(true);
  });

  it("lists row-level errors, with and without a row number", async () => {
    vi.mocked(validateImportAction).mockResolvedValue({
      ok: false,
      errors: [
        { row: 3, column: "firstName", message: "first_name is required" },
        { row: 0, column: "file", message: "Both households.csv and contacts.csv are required." },
      ],
    });
    render(<ImportClient />);
    await upload();
    expect(await screen.findByText(/2 errors found/)).toBeInTheDocument();
    expect(screen.getByText(/Row 3,/)).toBeInTheDocument();
    expect(screen.getByText("firstName")).toBeInTheDocument();
    expect(screen.getByText(/first_name is required/)).toBeInTheDocument();
    expect(screen.getByText(/Both households.csv and contacts.csv are required./)).toBeInTheDocument();
  });

  it("uses the singular for one error", async () => {
    vi.mocked(validateImportAction).mockResolvedValue({
      ok: false,
      errors: [{ row: 2, column: "category", message: "bad" }],
    });
    render(<ImportClient />);
    await upload();
    expect(await screen.findByText(/1 error found/)).toBeInTheDocument();
  });

  it("shows a validating state while waiting", async () => {
    let release: (v: any) => void = () => {};
    vi.mocked(validateImportAction).mockReturnValue(new Promise((r) => (release = r)));
    render(<ImportClient />);
    await upload();
    expect(await screen.findByRole("button", { name: /Validating/ })).toBeInTheDocument();
    release(success(emptyDiff));
    await screen.findByText(/No changes detected/);
  });
});

describe("diff step", () => {
  async function toDiff(diff: object = richDiff) {
    vi.mocked(validateImportAction).mockResolvedValue(success(diff));
    render(<ImportClient />);
    await upload();
    await screen.findByText(/to apply|No changes detected/);
    // Back is disabled while the validate transition is still pending; wait so clicks aren't ignored under load.
    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeEnabled());
  }

  it("summarizes the counts and lists each change", async () => {
    await toDiff();
    expect(screen.getByText("8 changes to apply")).toBeInTheDocument();
    expect(within(stat("Households added")).getByText("1")).toBeInTheDocument();
    expect(within(stat("Households updated")).getByText("2")).toBeInTheDocument();
    expect(within(stat("Households removed")).getByText("2")).toBeInTheDocument();
    expect(within(stat("Households unchanged")).getByText("4")).toBeInTheDocument();
    expect(within(stat("Contacts unchanged")).getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Newbies")).toBeInTheDocument();
    expect(screen.getByText("Old Name → New Name")).toBeInTheDocument();
    expect(screen.getByText("Same Name")).toBeInTheDocument();
    expect(screen.getByText("Gone With Kids ⚠ has Family & Friend contacts")).toBeInTheDocument();
    expect(screen.getByText("Gone Quietly")).toBeInTheDocument();
    expect(screen.getByText("Joe Plumber (SERVICE_PROVIDER)")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Old Contact")).toBeInTheDocument();
  });

  it("warns about removing households that have Family & Friend contacts", async () => {
    await toDiff();
    const warning = screen.getByText("Removing households that have Family & Friend contacts");
    expect(warning).toBeInTheDocument();
    expect(screen.getByText(/will lose their inherited address/)).toBeInTheDocument();
  });

  it("has no warning, and no empty sections, when nothing risky changes", async () => {
    await toDiff({
      ...emptyDiff,
      contacts: { ...emptyDiff.contacts, added: [person()] },
    });
    expect(screen.getByText("1 change to apply")).toBeInTheDocument();
    expect(screen.queryByText(/Removing households/)).not.toBeInTheDocument();
    expect(screen.queryByText("Households added", { selector: ".ant-card-head-title *" })).not.toBeInTheDocument();
  });

  it("offers no Apply button when there is nothing to apply", async () => {
    await toDiff(emptyDiff);
    expect(screen.getByText("No changes detected. Nothing will be committed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });

  it("goes back to the upload step", async () => {
    await toDiff();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("How importing works")).toBeInTheDocument();
  });

  it("applies using only the CSV text, then shows success", async () => {
    vi.mocked(applyImportAction).mockResolvedValue({ ok: true });
    await toDiff();
    await userEvent.click(await screen.findByRole("button", { name: /Apply 8 changes/ }));
    await waitFor(() =>
      expect(applyImportAction).toHaveBeenCalledWith({ householdsCSV: "H-CSV", contactsCSV: "C-CSV" })
    );
    expect(await screen.findByText("Import applied successfully.")).toBeInTheDocument();
  });

  it("uses the singular on the Apply button for a single change", async () => {
    await toDiff({ ...emptyDiff, contacts: { ...emptyDiff.contacts, added: [person()] } });
    expect(await screen.findByRole("button", { name: /Apply 1 change/ })).toBeInTheDocument();
  });

  it("shows the apply error and clears it when going back", async () => {
    vi.mocked(applyImportAction).mockResolvedValue({ ok: false, error: "Not authenticated." });
    await toDiff();
    await userEvent.click(await screen.findByRole("button", { name: /Apply 8 changes/ }));
    expect(await screen.findByText("Not authenticated.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await upload();
    await screen.findByText(/to apply/);
    expect(screen.queryByText("Not authenticated.")).not.toBeInTheDocument();
  });

  it("falls back to a generic message when the apply fails without one", async () => {
    vi.mocked(applyImportAction).mockResolvedValue({ ok: false });
    await toDiff();
    await userEvent.click(await screen.findByRole("button", { name: /Apply 8 changes/ }));
    expect(await screen.findByText("Unknown error.")).toBeInTheDocument();
  });
});

describe("success step", () => {
  async function toSuccess() {
    vi.mocked(validateImportAction).mockResolvedValue(success());
    vi.mocked(applyImportAction).mockResolvedValue({ ok: true });
    render(<ImportClient />);
    await upload();
    await userEvent.click(await screen.findByRole("button", { name: /Apply 8 changes/ }));
    await screen.findByText("Import applied successfully.");
  }

  it("can start another import", async () => {
    await toSuccess();
    await userEvent.click(screen.getByRole("button", { name: "Import again" }));
    expect(screen.getByText("How importing works")).toBeInTheDocument();
  });

  it("can go to the contacts list", async () => {
    await toSuccess();
    await userEvent.click(screen.getByRole("button", { name: "View contacts" }));
    expect(push).toHaveBeenCalledWith("/contacts");
  });
});
