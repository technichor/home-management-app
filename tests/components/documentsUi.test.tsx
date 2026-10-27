// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/documents/actions", () => ({
  createDocumentAction: vi.fn(),
  updateDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));

import DocumentForm, { SENSITIVE_WARNING, SHARING_LINE } from "@/app/(app)/documents/DocumentForm";
import DocumentDetailClient from "@/app/(app)/documents/[id]/DocumentDetailClient";
import { createDocumentAction, deleteDocumentAction, updateDocumentAction } from "@/app/(app)/documents/actions";
import type { DocumentView } from "@/lib/documents";

const options = {
  members: [
    { id: "m1", name: "Corey" },
    { id: "m2", name: "Ellie" },
  ],
  items: [
    { id: "v1", name: "Pacifica", isVehicle: true },
    { id: "i1", name: "Dishwasher", isVehicle: false },
  ],
  accounts: [{ id: "a1", name: "Car loan" }],
};
const view = (over: Partial<DocumentView> = {}): DocumentView => ({
  id: "d1", title: "Passport – Corey", category: "IDENTITY", typeKey: "passport", ownerContactId: "m1", ownerName: "Corey", maintenanceItemId: null, itemName: null,
  accountRecordId: null, accountName: null, links: [{ url: "https://drive.google.com/p", label: null }], originalLocation: null, notes: null, ...over,
});

const combo = (name: string) => screen.getByRole("combobox", { name });
/** The options with this title in the open dropdowns (closed ones linger in the DOM, hidden). */
const optionsTitled = (option: string) =>
  [...document.querySelectorAll<HTMLElement>(`.ant-select-item-option[title="${option}"]`)].filter((o) => !o.closest(".ant-select-dropdown-hidden"));
async function choose(name: string, option: string) {
  if (combo(name).getAttribute("aria-expanded") !== "true") await userEvent.click(combo(name));
  await userEvent.click(await waitFor(() => optionsTitled(option).at(-1) ?? Promise.reject(new Error(`No option "${option}"`))));
}
// The type list is long (and virtual), so search it first.
async function chooseType(option: string) {
  await userEvent.type(combo("Type"), option);
  await choose("Type", option);
}
const title = () => screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
const save = (name = "Add document") => userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createDocumentAction).mockResolvedValue({ ok: true, id: "new1" });
  vi.mocked(updateDocumentAction).mockResolvedValue({ ok: true });
});

describe("DocumentForm (adding)", () => {
  it("says where the file lives, and waits for a type and a title", () => {
    render(<DocumentForm options={options} />);
    expect(screen.getByText(SHARING_LINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add document" })).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Category" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/documents");
  });

  it("a person's type: the title follows whose it is, until someone types their own", async () => {
    render(<DocumentForm options={options} />);
    await chooseType("Passport");
    expect(title().value).toBe("Passport");
    await choose("Whose", "Ellie");
    expect(title().value).toBe("Passport – Ellie");
    await userEvent.clear(title());
    await userEvent.type(title(), "Ellie's passport (old)");
    await choose("Whose", "Corey");
    expect(title().value).toBe("Ellie's passport (old)");
  });

  it("a person's type isn't offered for the household as a whole", async () => {
    render(<DocumentForm options={options} />);
    await chooseType("Passport");
    await userEvent.click(combo("Whose"));
    await waitFor(() => expect(optionsTitled("Ellie")).toHaveLength(1));
    expect(optionsTitled("Household")).toHaveLength(0);
  });

  it("saves the document with its links, then goes to its page", async () => {
    render(<DocumentForm options={options} />);
    await chooseType("Wills");
    await userEvent.type(screen.getByLabelText("Link 1"), "https://drive.test/will");
    await userEvent.type(screen.getByLabelText("Label for link 1"), "Signed");
    await userEvent.click(screen.getByRole("button", { name: /Add another link/ }));
    await userEvent.type(screen.getByLabelText("Link 2"), "https://drive.test/codicil");
    await choose("Account", "Car loan");
    await userEvent.type(screen.getByLabelText("Where the original is"), "Attorney's office");
    await userEvent.type(screen.getByLabelText("Notes"), "Updated 2024");
    await save();
    expect(createDocumentAction).toHaveBeenCalledWith({
      title: "Wills", typeKey: "will", category: null, ownerContactId: null, maintenanceItemId: null, accountRecordId: "a1",
      links: [{ url: "https://drive.test/will", label: "Signed" }, { url: "https://drive.test/codicil", label: "" }],
      originalLocation: "Attorney's office", notes: "Updated 2024",
    });
    expect(router.push).toHaveBeenCalledWith("/documents/new1");
  });

  it("up to five links, any but the last one removable", async () => {
    render(<DocumentForm options={options} />);
    expect(screen.queryByRole("button", { name: "Remove link 1" })).not.toBeInTheDocument();
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole("button", { name: /Add another link/ }));
    expect(screen.getByLabelText("Link 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add another link/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Link 2"), "https://two.test");
    await userEvent.click(screen.getByRole("button", { name: "Remove link 1" }));
    expect(screen.getAllByLabelText(/^Link \d$/)).toHaveLength(4);
    expect(screen.getByLabelText("Link 1")).toHaveValue("https://two.test");
  });

  it("a custom document picks its category", async () => {
    render(<DocumentForm options={options} />);
    await chooseType("Custom (no type)");
    await choose("Category", "Work");
    await userEvent.type(title(), "Badge photo");
    await save();
    expect(createDocumentAction).toHaveBeenCalledWith(expect.objectContaining({ title: "Badge photo", typeKey: null, category: "WORK" }));
  });

  it("a custom document with no category yet is the server's to refuse", async () => {
    vi.mocked(createDocumentAction).mockResolvedValue({ ok: false, error: "Choose a category" });
    render(<DocumentForm options={options} />);
    await chooseType("Custom (no type)");
    await userEvent.type(title(), "Badge photo");
    await save();
    expect(createDocumentAction).toHaveBeenCalledWith(expect.objectContaining({ typeKey: null, category: null }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent === "Choose a category")).toBe(true));
  });

  it("a vehicle's type: only vehicles, the title naming it, and an item that isn't one is let go", async () => {
    render(<DocumentForm options={options} initial={{ typeKey: "manual", ownerContactId: null, maintenanceItemId: "i1", accountRecordId: null }} />);
    expect(title().value).toBe("Manual");
    await chooseType("Registration");
    expect(screen.getByText("Vehicle")).toBeInTheDocument();
    await choose("Item", "Pacifica");
    expect(optionsTitled("Dishwasher")).toHaveLength(0);
    expect(title().value).toBe("Registration – Pacifica");
    await chooseType("Title");
    expect(title().value).toBe("Title – Pacifica"); // a vehicle stays
  });

  it("with no vehicles yet, says to add one in Maintenance", async () => {
    render(<DocumentForm options={{ ...options, items: [] }} initial={{ typeKey: "vehicle-title", ownerContactId: null, maintenanceItemId: null, accountRecordId: null }} />);
    await userEvent.click(combo("Item"));
    expect(await screen.findByText("Add the vehicle in Maintenance first (category Vehicle)")).toBeInTheDocument();
  });

  it("from a vehicle, the Vehicles types come first", async () => {
    render(<DocumentForm options={options} firstCategory="VEHICLES" initial={{ typeKey: null, ownerContactId: null, maintenanceItemId: "v1", accountRecordId: null }} />);
    await userEvent.click(combo("Type"));
    const groups = [...document.querySelectorAll(".ant-select-item-group")].map((g) => g.textContent);
    expect(groups[0]).toBe("Vehicles");
  });

  it("warns about something that looks like an ID number, but still saves", async () => {
    render(<DocumentForm options={options} initial={{ typeKey: "will", ownerContactId: null, maintenanceItemId: null, accountRecordId: null }} />);
    expect(screen.queryByText(SENSITIVE_WARNING)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Notes"), "123-45-6789");
    expect(screen.getByText(SENSITIVE_WARNING)).toBeInTheDocument();
    await save();
    expect(createDocumentAction).toHaveBeenCalled();
  });

  it("shows what the server refused, and stays", async () => {
    vi.mocked(createDocumentAction).mockResolvedValue({ ok: false, error: "Add a link to where the document is" });
    render(<DocumentForm options={options} initial={{ typeKey: "will", ownerContactId: null, maintenanceItemId: null, accountRecordId: null }} />);
    await save();
    expect(await screen.findByText("Add a link to where the document is")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("comes back to where it was opened from", async () => {
    render(<DocumentForm options={options} initial={{ typeKey: "passport", ownerContactId: "m2", maintenanceItemId: null, accountRecordId: null }} returnTo="/contacts/m2" />);
    expect(title().value).toBe("Passport – Ellie");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/contacts/m2");
    await save();
    expect(router.push).toHaveBeenCalledWith("/contacts/m2");
  });
});

describe("DocumentForm (editing)", () => {
  it("starts from the document, keeps its own title, and saves it", async () => {
    render(<DocumentForm options={options} record={view({ links: [{ url: "https://a.test", label: "Front" }, { url: "https://b.test", label: null }] })} />);
    expect(screen.getByRole("heading", { name: "Edit document" })).toBeInTheDocument();
    expect(screen.getByLabelText("Label for link 1")).toHaveValue("Front");
    expect(screen.getByLabelText("Link 2")).toHaveValue("https://b.test");
    await choose("Whose", "Ellie");
    expect(title().value).toBe("Passport – Corey");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/documents/d1");
    await save("Save");
    expect(updateDocumentAction).toHaveBeenCalledWith("d1", expect.objectContaining({ title: "Passport – Corey", ownerContactId: "m2", links: [
      { url: "https://a.test", label: "Front" }, { url: "https://b.test", label: "" },
    ] }));
    expect(router.push).toHaveBeenCalledWith("/documents/d1");
  });

  it("a custom document shows its category; a household one 'Household'", async () => {
    render(<DocumentForm options={options} record={view({ typeKey: null, category: "WORK", ownerContactId: null, ownerName: null, links: [] })} />);
    expect(within(combo("Category").closest(".ant-select")!).getByTitle("Work")).toBeInTheDocument();
    expect(within(combo("Whose").closest(".ant-select")!).getByTitle("Household")).toBeInTheDocument();
    expect(screen.getByLabelText("Link 1")).toHaveValue("");
  });

  it("keeps a member who has left, marked removed", () => {
    render(<DocumentForm options={options} record={view({ ownerContactId: "gone", ownerName: "Bailey" })} />);
    expect(within(combo("Whose").closest(".ant-select")!).getByTitle("Bailey (removed)")).toBeInTheDocument();
  });

  it("a member who has left, with no name kept", () => {
    render(<DocumentForm options={options} record={view({ ownerContactId: "gone", ownerName: null })} />);
    expect(within(combo("Whose").closest(".ant-select")!).getByTitle("Former member (removed)")).toBeInTheDocument();
  });

  it("shows what the server refused", async () => {
    vi.mocked(updateDocumentAction).mockResolvedValue({ ok: false, error: "Choose one of your vehicles" });
    render(<DocumentForm options={options} record={view()} />);
    await save("Save");
    expect(await screen.findByText("Choose one of your vehicles")).toBeInTheDocument();
  });
});

describe("DocumentDetailClient", () => {
  it("shows what it is, whose, what it's about, and each link to open", () => {
    render(
      <DocumentDetailClient
        ownerRemoved={false}
        doc={view({
          typeKey: "vehicle-loan-or-lease", category: "VEHICLES", title: "Pacifica loan", maintenanceItemId: "v1", itemName: "Pacifica", accountRecordId: "a1", accountName: "Car loan",
          links: [{ url: "https://drive.google.com/1", label: "Signed" }, { url: "https://www.dropbox.com/2", label: null }], originalLocation: "Filing cabinet", notes: "Paid off 2027",
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pacifica loan" })).toBeInTheDocument();
    expect(screen.getByText("Vehicles · Loan or lease agreement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pacifica" })).toHaveAttribute("href", "/maintenance/v1");
    expect(screen.getByRole("link", { name: "Car loan" })).toHaveAttribute("href", "/accounts/a1");
    expect(screen.getByRole("link", { name: "Open Pacifica loan: Signed (drive.google.com)" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Open Pacifica loan (dropbox.com)" })).toHaveAttribute("href", "https://www.dropbox.com/2");
    expect(screen.getByText("Filing cabinet")).toBeInTheDocument();
    expect(screen.getByText("Paid off 2027")).toBeInTheDocument();
    expect(screen.getByText("Corey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/documents/d1/edit");
  });

  it("a custom household document, and a member who has left", () => {
    const { unmount } = render(<DocumentDetailClient ownerRemoved={false} doc={view({ typeKey: null, category: "OTHER", ownerContactId: null, ownerName: null })} />);
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("Household")).toBeInTheDocument();
    unmount();
    render(<DocumentDetailClient ownerRemoved doc={view({ ownerName: "Bailey" })} />);
    expect(screen.getByText("Bailey (removed)")).toBeInTheDocument();
  });

  it("deletes after a confirm that leaves the file alone, then goes to Documents", async () => {
    vi.mocked(deleteDocumentAction).mockResolvedValue({ ok: true });
    render(<DocumentDetailClient ownerRemoved={false} doc={view()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("The file itself isn't touched.")).toBeInTheDocument();
    expect(screen.getByText('Delete "Passport – Corey"?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/documents"));
    expect(deleteDocumentAction).toHaveBeenCalledWith("d1");
  });

  it("shows a refused delete, and can be dismissed", async () => {
    vi.mocked(deleteDocumentAction).mockResolvedValue({ ok: false, error: "That document isn't in your list any more" });
    render(<DocumentDetailClient ownerRemoved={false} doc={view()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Delete" })).at(-1)!);
    expect(await screen.findByText("That document isn't in your list any more")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByText("That document isn't in your list any more")).not.toBeInTheDocument());
    expect(router.push).not.toHaveBeenCalled();
  });
});
