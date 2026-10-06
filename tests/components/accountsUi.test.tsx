// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/accounts/actions", () => ({
  createAccountRecordAction: vi.fn(),
  updateAccountRecordAction: vi.fn(),
  deleteAccountRecordAction: vi.fn(),
}));

import AccountsClient, { type AccountRow } from "@/app/(app)/accounts/AccountsClient";
import AccountForm, { type AccountFormRecord } from "@/app/(app)/accounts/AccountForm";
import AccountDetailClient from "@/app/(app)/accounts/[id]/AccountDetailClient";
import { createAccountRecordAction, deleteAccountRecordAction, updateAccountRecordAction } from "@/app/(app)/accounts/actions";

beforeEach(() => vi.resetAllMocks());

const row = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: "a1", name: "Corey's HSA", kind: "HEALTH_SAVINGS", status: "ACTIVE", institution: "Fidelity", lastFour: "1234", ownerName: "Corey", ...over,
});
const accounts: AccountRow[] = [
  row(),
  row({ id: "a2", name: "Old 401k", kind: "RETIREMENT", status: "REVIEW", institution: "Acme", lastFour: null, ownerName: "Sam" }),
  row({ id: "a3", name: "Old checking", kind: "BANK", status: "CLOSED", institution: null, lastFour: null, ownerName: null }),
  row({ id: "a4", name: "Electric", kind: "UTILITY", institution: "City Power", lastFour: null, ownerName: null }),
];
const names = () => screen.getAllByRole("link").filter((l) => /^\/accounts\/a\d$/.test(l.getAttribute("href") ?? "")).map((l) => l.querySelector("span")!.textContent);
const choose = async (name: string, title: string) => {
  await userEvent.click(screen.getByRole("combobox", { name }));
  await userEvent.click(await screen.findByTitle(title));
};

describe("AccountsClient", () => {
  it("lists open accounts by name with what they are, whose, and any that need review", () => {
    render(<AccountsClient accounts={accounts} />);
    expect(names()).toEqual(["Corey's HSA", "Electric", "Old 401k"]);
    expect(screen.getByText("HSA or FSA · Fidelity ····1234 · Corey")).toBeInTheDocument();
    expect(screen.getByText("Utility · City Power · Whole household")).toBeInTheDocument();
    expect(screen.getByText("To review or consolidate")).toBeInTheDocument();
    expect(screen.getByText("1 account to review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts (3)" })).toBeInTheDocument();
    expect(screen.getByText(/No passwords, balances or full account numbers/)).toBeInTheDocument();
  });

  it("counts several to review", () => {
    render(<AccountsClient accounts={[row({ status: "REVIEW" }), row({ id: "a2", status: "REVIEW" })]} />);
    expect(screen.getByText("2 accounts to review")).toBeInTheDocument();
  });

  it("filters by status, with closed accounts hidden until asked for", async () => {
    render(<AccountsClient accounts={accounts} />);
    await choose("Status", "All, including closed");
    expect(names()).toEqual(["Corey's HSA", "Electric", "Old 401k", "Old checking"]);
    await choose("Status", "Closed");
    expect(names()).toEqual(["Old checking"]);
    await choose("Status", "To review or consolidate");
    expect(names()).toEqual(["Old 401k"]);
    await choose("Status", "Active");
    expect(names()).toEqual(["Corey's HSA", "Electric"]);
  });

  it("filters by kind, and searches name, institution and owner", async () => {
    render(<AccountsClient accounts={accounts} />);
    await choose("Kind", "Retirement");
    expect(names()).toEqual(["Old 401k"]);
    await choose("Kind", "All kinds");
    await userEvent.type(screen.getByLabelText("Search accounts"), "city power");
    expect(names()).toEqual(["Electric"]);
    await userEvent.clear(screen.getByLabelText("Search accounts"));
    await userEvent.type(screen.getByLabelText("Search accounts"), "sam");
    expect(names()).toEqual(["Old 401k"]);
    await userEvent.clear(screen.getByLabelText("Search accounts"));
    await userEvent.type(screen.getByLabelText("Search accounts"), "zzz");
    expect(screen.getByText("No account matches.")).toBeInTheDocument();
  });

  it("invites adding the first account", () => {
    render(<AccountsClient accounts={[]} />);
    expect(screen.getByText(/No accounts yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search accounts")).toBeNull();
    expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute("href", "/accounts/new");
  });
});

const owners = [{ id: "m1", name: "Sam", fullName: "Sam Doe" }, { id: "m2", name: "Annie", fullName: "Ann Doe" }];
const record = (over: Partial<AccountFormRecord> = {}): AccountFormRecord => ({
  id: "a1", name: "Corey's HSA", kind: "HEALTH_SAVINGS", status: "REVIEW", institution: "Fidelity", lastFour: "1234", ownerContactId: "m1", ownerName: "Sam",
  website: "https://f.test", phone: "555-0100", notes: "Roll into the IRA", ...over,
});

describe("AccountForm", () => {
  it("warns never to enter secrets, and adds an account from what was typed", async () => {
    vi.mocked(createAccountRecordAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<AccountForm owners={owners} />);
    expect(screen.getByText(/Never enter a password, a balance or a full account number/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add account" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Name"), "Old 401k");
    await choose("Kind", "Retirement");
    await choose("Status", "To review or consolidate");
    await userEvent.type(screen.getByLabelText("Institution"), "Acme");
    await userEvent.type(screen.getByLabelText("Last 4"), "98765");
    await choose("Whose account", "Annie");
    await userEvent.type(screen.getByLabelText("Website"), "https://acme.test");
    await userEvent.type(screen.getByLabelText("Phone"), "555");
    await userEvent.type(screen.getByLabelText("Notes"), "Consolidate");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() =>
      expect(createAccountRecordAction).toHaveBeenCalledWith({
        name: "Old 401k", kind: "RETIREMENT", status: "REVIEW", institution: "Acme", lastFour: "9876", ownerContactId: "m2",
        website: "https://acme.test", phone: "555", notes: "Consolidate",
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/accounts/new1"));
  });

  it("defaults to a whole-household bank account that is active", async () => {
    vi.mocked(createAccountRecordAction).mockResolvedValue({ ok: true, id: "n" });
    render(<AccountForm owners={owners} />);
    await userEvent.type(screen.getByLabelText("Name"), "Joint checking");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(createAccountRecordAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "BANK", status: "ACTIVE", ownerContactId: null })));
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/accounts");
  });

  it("shows the reason when adding fails, and stays put", async () => {
    vi.mocked(createAccountRecordAction).mockResolvedValue({ ok: false, error: "Choose one of your household's members" });
    render(<AccountForm owners={owners} />);
    await userEvent.type(screen.getByLabelText("Name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByText("Choose one of your household's members")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edits a record, filled in, and returns to it", async () => {
    vi.mocked(updateAccountRecordAction).mockResolvedValue({ ok: true });
    render(<AccountForm owners={owners} record={record()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Corey's HSA");
    expect(screen.getByLabelText("Last 4")).toHaveValue("1234");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/accounts/a1");
    await choose("Status", "Closed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAccountRecordAction).toHaveBeenCalledWith("a1", expect.objectContaining({ status: "CLOSED", ownerContactId: "m1", lastFour: "1234" })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/accounts/a1"));
  });

  it("shows an edit failure, and can hand a record back to the whole household", async () => {
    vi.mocked(updateAccountRecordAction).mockResolvedValue({ ok: false, error: "That account isn't in your list any more" });
    render(<AccountForm owners={owners} record={record({ institution: null, lastFour: null, website: null, phone: null, notes: null })} />);
    expect(screen.getByLabelText("Institution")).toHaveValue("");
    await choose("Whose account", "Whole household");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That account isn't in your list any more")).toBeInTheDocument();
    expect(updateAccountRecordAction).toHaveBeenCalledWith("a1", expect.objectContaining({ ownerContactId: null }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps an owner who has since been removed, marked as removed", async () => {
    render(<AccountForm owners={owners} record={record({ ownerContactId: "gone", ownerName: "Pat" })} />);
    expect(screen.getByText("Pat (removed)")).toBeInTheDocument();
  });

  it("calls a removed owner with no name a former member", async () => {
    render(<AccountForm owners={owners} record={record({ ownerContactId: "gone", ownerName: null })} />);
    expect(screen.getByText("Former member (removed)")).toBeInTheDocument();
  });
});

describe("AccountDetailClient", () => {
  it("shows what exists about the account, with the number masked and the website as a safe link", () => {
    render(<AccountDetailClient record={record()} />);
    expect(screen.getByRole("heading", { name: "Corey's HSA" })).toBeInTheDocument();
    expect(screen.getByText("To review or consolidate")).toBeInTheDocument();
    for (const text of ["HSA or FSA", "Fidelity", "····1234", "Sam", "555-0100", "Roll into the IRA"]) expect(screen.getByText(text)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://f.test" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/accounts/a1/edit");
  });

  it("leaves out what isn't known, and says whole household", () => {
    render(<AccountDetailClient record={record({ status: "ACTIVE", institution: null, lastFour: null, ownerContactId: null, ownerName: null, website: null, phone: null, notes: null })} />);
    expect(screen.queryByText("Institution")).toBeNull();
    expect(screen.queryByText("Account number")).toBeNull();
    expect(screen.getByText("Whole household")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("deletes after confirming, then goes back to the list", async () => {
    vi.mocked(deleteAccountRecordAction).mockResolvedValue({ ok: true });
    render(<AccountDetailClient record={record()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteAccountRecordAction).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/accounts"));
  });

  it("shows why deleting failed, and the message can be dismissed", async () => {
    vi.mocked(deleteAccountRecordAction).mockResolvedValue({ ok: false, error: "That account isn't in your list any more" });
    render(<AccountDetailClient record={record()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("That account isn't in your list any more")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(document.querySelector(".ant-alert-close-icon")!);
    await waitFor(() => expect(screen.queryByText("That account isn't in your list any more")).toBeNull());
  });
});
