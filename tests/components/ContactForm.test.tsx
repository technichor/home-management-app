// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/(app)/contacts/contactActions", () => ({
  createContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  deleteContactAction: vi.fn(),
}));

import ContactForm from "@/app/(app)/contacts/ContactForm";
import { createContactAction, updateContactAction, deleteContactAction } from "@/app/(app)/contacts/contactActions";

const households = [
  { id: "h1", displayName: "The Smiths" },
  { id: "h2", displayName: "The Joneses" },
];
const values = { firstName: "Jane", lastName: "Smith", category: "SERVICE_PROVIDER" as const, address: "9 Elm St", tags: ["plumber"], favorite: false };

async function choose(label: string, optionText: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  const option = await waitFor(() => {
    const el = [...document.querySelectorAll(".ant-select-item-option")].find((e) => e.textContent === optionText);
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
  await userEvent.click(option);
}
const type = (label: string | RegExp, text: string) => userEvent.type(screen.getByLabelText(label), text);

beforeEach(() => vi.clearAllMocks());

describe("ContactForm (adding)", () => {
  it("starts as Family & Friend: explains the inherited address and has no address field", () => {
    render(<ContactForm households={households} />);
    expect(screen.getByText(/uses their household's mailing address/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Address/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("shows an address field for other categories", async () => {
    render(<ContactForm households={households} />);
    await choose("Category", "Service Provider");
    expect(screen.getByLabelText(/^Address/)).toBeInTheDocument();
    expect(screen.queryByText(/uses their household's mailing address/)).toBeNull();
  });

  it("won't submit a Family & Friend contact without a household", async () => {
    render(<ContactForm households={households} />);
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    expect(await screen.findByText("Choose the household this person belongs to")).toBeInTheDocument();
    expect(createContactAction).not.toHaveBeenCalled();
  });

  it("creates the contact and opens it", async () => {
    vi.mocked(createContactAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<ContactForm households={households} />);
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await choose("Household", "The Joneses");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(createContactAction).toHaveBeenCalled());
    expect(vi.mocked(createContactAction).mock.calls[0][0]).toMatchObject({
      firstName: "Jane", lastName: "Smith", category: "FAMILY_FRIEND", householdId: "h2", favorite: false,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/new1"));
  });

  it("shows server field errors on the field and a summary", async () => {
    vi.mocked(createContactAction).mockResolvedValue({
      ok: false, error: "Enter a valid email address", fieldErrors: { emailPrimary: "Enter a valid email address" },
    });
    render(<ContactForm households={households} />);
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await choose("Household", "The Smiths");
    await type(/^Primary email/, "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(screen.getAllByText("Enter a valid email address").length).toBe(2));
    expect(push).not.toHaveBeenCalled();
  });

  it("takes a birthday with an optional year, and sends it with the contact", async () => {
    vi.mocked(createContactAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<ContactForm households={households} />);
    expect(screen.getByText("The year is optional.")).toBeInTheDocument();
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await choose("Household", "The Smiths");
    await choose("Birthday month", "March");
    await type("Birthday day", "4");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(createContactAction).toHaveBeenCalled());
    expect(vi.mocked(createContactAction).mock.calls[0][0]).toMatchObject({ birthdayMonth: 3, birthdayDay: 4 });
  });

  it("shows a birthday problem under the birthday, and clears it on the next try", async () => {
    vi.mocked(createContactAction)
      .mockResolvedValueOnce({ ok: false, error: "February doesn't have 30 days", fieldErrors: { birthday: "February doesn't have 30 days" } })
      .mockResolvedValueOnce({ ok: true, id: "new1" });
    render(<ContactForm households={households} />);
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await choose("Household", "The Smiths");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(screen.getAllByText("February doesn't have 30 days").length).toBe(2));
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/new1"));
  });

  it("shows a server error that has no field", async () => {
    vi.mocked(createContactAction).mockResolvedValue({ ok: false, error: "Something went wrong" });
    render(<ContactForm households={households} />);
    await type("First name", "Jane");
    await type("Last name", "Smith");
    await choose("Household", "The Smiths");
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("cancel goes back to the list", async () => {
    render(<ContactForm households={households} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/contacts");
  });
});

describe("ContactForm (editing)", () => {
  it("prefills the saved values", () => {
    render(<ContactForm households={households} contact={{ id: "c1", values }} />);
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jane");
    expect((screen.getByLabelText(/^Address/) as HTMLTextAreaElement).value).toBe("9 Elm St");
    expect(screen.getByText("plumber")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("saves changes to that contact and opens it", async () => {
    vi.mocked(updateContactAction).mockResolvedValue({ ok: true, id: "c1" });
    render(<ContactForm households={households} contact={{ id: "c1", values }} />);
    await type(/^Nickname/, "JJ");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateContactAction).toHaveBeenCalled());
    expect(vi.mocked(updateContactAction).mock.calls[0].slice(0, 1)).toEqual(["c1"]);
    expect(vi.mocked(updateContactAction).mock.calls[0][1]).toMatchObject({ firstName: "Jane", nickname: "JJ" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/c1"));
  });

  it("cancel goes back to the contact", async () => {
    render(<ContactForm households={households} contact={{ id: "c1", values }} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/contacts/c1");
  });

  async function confirmRemove() {
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const ok = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm .ant-btn-primary");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await userEvent.click(ok);
  }

  it("removes after confirming and returns to the list", async () => {
    vi.mocked(deleteContactAction).mockResolvedValue({ ok: true, id: "c1" });
    render(<ContactForm households={households} contact={{ id: "c1", values }} />);
    await confirmRemove();
    await waitFor(() => expect(deleteContactAction).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts"));
  });

  it("shows why a contact couldn't be removed", async () => {
    vi.mocked(deleteContactAction).mockResolvedValue({ ok: false, error: "This contact is a household member's own profile." });
    render(<ContactForm households={households} contact={{ id: "c1", values }} />);
    await confirmRemove();
    expect(await screen.findByText(/own profile/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
