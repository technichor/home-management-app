// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(app)/maintenance/actions", () => ({
  createMaintenanceItemAction: vi.fn(),
  updateMaintenanceItemAction: vi.fn(),
  deleteMaintenanceItemAction: vi.fn(),
  markServicedAction: vi.fn(),
}));

import MaintenanceClient, { type InventoryRow } from "@/app/(app)/maintenance/MaintenanceClient";
import MaintenanceForm, { type MaintenanceFormItem } from "@/app/(app)/maintenance/MaintenanceForm";
import MaintenanceDetailClient from "@/app/(app)/maintenance/[id]/MaintenanceDetailClient";
import {
  createMaintenanceItemAction,
  deleteMaintenanceItemAction,
  markServicedAction,
  updateMaintenanceItemAction,
} from "@/app/(app)/maintenance/actions";
import { localDateString } from "@/lib/dates";

const TODAY = "2026-10-05";
beforeEach(() => vi.resetAllMocks());

const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  id: "m1", name: "Furnace", category: "HVAC", location: "Basement", brand: "Carrier", modelNumber: "X1", installedYear: 2004,
  serviceEveryMonths: 12, lastServicedOn: "2026-01-03", ...over,
});
const rows: InventoryRow[] = [
  row({ id: "a", name: "Furnace" }),
  row({ id: "b", name: "Refrigerator", category: "APPLIANCE", brand: "GE", modelNumber: null, location: null, installedYear: 2015, serviceEveryMonths: null, lastServicedOn: null }),
  row({ id: "c", name: "Air filters", category: "HVAC", location: null, brand: null, modelNumber: null, installedYear: null, serviceEveryMonths: 3, lastServicedOn: "2026-06-01" }),
];
const names = () => screen.getAllByRole("link").filter((l) => /^\/maintenance\/[a-z]$/.test(l.getAttribute("href") ?? "")).map((l) => l.querySelector("div")!.textContent);

describe("MaintenanceClient", () => {
  it("lists items by name with what they are, how old, and where service stands", () => {
    render(<MaintenanceClient items={rows} today={TODAY} />);
    expect(names()).toEqual(["Air filters", "Furnace", "Refrigerator"]);
    expect(screen.getByRole("link", { name: /Furnace/ })).toHaveAttribute("href", "/maintenance/a");
    expect(screen.getByText("Heating & cooling · Carrier X1 · Basement · 22 years old")).toBeInTheDocument();
    expect(screen.getByText("Appliance · GE · 11 years old")).toBeInTheDocument();
    expect(screen.getByText("Next service Jan 3, 2027")).toBeInTheDocument();
    const overdue = screen.getByText("Service was due Sep 1, 2026");
    expect(overdue).toHaveAttribute("data-overdue", "true");
    expect(screen.getByText("Next service Jan 3, 2027")).not.toHaveAttribute("data-overdue");
  });

  it("searches name, brand, model and location", async () => {
    render(<MaintenanceClient items={rows} today={TODAY} />);
    await userEvent.type(screen.getByLabelText("Search maintenance items"), "carrier");
    expect(names()).toEqual(["Furnace"]);
    await userEvent.clear(screen.getByLabelText("Search maintenance items"));
    await userEvent.type(screen.getByLabelText("Search maintenance items"), "basement");
    expect(names()).toEqual(["Furnace"]);
    await userEvent.clear(screen.getByLabelText("Search maintenance items"));
    await userEvent.type(screen.getByLabelText("Search maintenance items"), "zzz");
    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });

  it("filters by category and sorts oldest first, with unknown ages last", async () => {
    render(<MaintenanceClient items={rows} today={TODAY} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Category" }));
    await userEvent.click(await screen.findByTitle("Appliance"));
    expect(names()).toEqual(["Refrigerator"]);
    await userEvent.click(screen.getByRole("combobox", { name: "Category" }));
    await userEvent.click(await screen.findByTitle("All categories"));
    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    await userEvent.click(await screen.findByTitle("Sort by oldest"));
    expect(names()).toEqual(["Furnace", "Refrigerator", "Air filters"]);
  });

  it("breaks ties between equally old (or equally unknown) items by name", async () => {
    render(<MaintenanceClient items={[row({ id: "x", name: "B" }), row({ id: "y", name: "A" }), row({ id: "p", name: "D", installedYear: null }), row({ id: "q", name: "C", installedYear: null })]} today={TODAY} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    await userEvent.click(await screen.findByTitle("Sort by oldest"));
    expect(names()).toEqual(["A", "B", "C", "D"]);
  });

  it("invites adding the first item", () => {
    render(<MaintenanceClient items={[]} today={TODAY} />);
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search maintenance items")).toBeNull();
    expect(screen.getByRole("link", { name: "Add item" })).toHaveAttribute("href", "/maintenance/new");
  });
});

const item = (over: Partial<MaintenanceFormItem> = {}): MaintenanceFormItem => ({
  id: "m1", name: "Furnace", category: "HVAC", location: "Basement", brand: "Carrier", modelNumber: "X1", serialNumber: "S1", installedYear: 2004,
  warrantyUntil: "2030-01-02", serviceEveryMonths: 12, lastServicedOn: "2026-01-03", manualUrl: "https://x.test/m", notes: "Filter size 16x25", ...over,
});

describe("MaintenanceForm", () => {
  it("adds an item from what was typed, then opens it", async () => {
    vi.mocked(createMaintenanceItemAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<MaintenanceForm />);
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Name"), "Water heater");
    await userEvent.click(screen.getByRole("combobox", { name: "Category" }));
    await userEvent.click(await screen.findByTitle("Plumbing & water"));
    await userEvent.type(screen.getByLabelText("Location"), "Basement");
    await userEvent.type(screen.getByLabelText("Brand"), "Rheem");
    await userEvent.type(screen.getByLabelText("Model number"), "R1");
    await userEvent.type(screen.getByLabelText("Serial number"), "S9");
    fireEvent.change(screen.getByLabelText("Year installed"), { target: { value: "2010" } });
    fireEvent.change(screen.getByLabelText("Warranty until"), { target: { value: "2020-05-06" } });
    fireEvent.change(screen.getByLabelText("Service every (months)"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Last serviced"), { target: { value: "2026-03-04" } });
    await userEvent.type(screen.getByLabelText("Manual link"), "https://x.test");
    await userEvent.type(screen.getByLabelText("Notes"), "Flush yearly");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() =>
      expect(createMaintenanceItemAction).toHaveBeenCalledWith({
        name: "Water heater", category: "PLUMBING", location: "Basement", brand: "Rheem", modelNumber: "R1", serialNumber: "S9",
        installedYear: 2010, warrantyUntil: "2020-05-06", serviceEveryMonths: 12, lastServicedOn: "2026-03-04", manualUrl: "https://x.test", notes: "Flush yearly",
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/maintenance/new1"));
  });

  it("sends no year or interval when they are left empty", async () => {
    vi.mocked(createMaintenanceItemAction).mockResolvedValue({ ok: true, id: "n" });
    render(<MaintenanceForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Gutters");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(createMaintenanceItemAction).toHaveBeenCalledWith(expect.objectContaining({ category: "OTHER", installedYear: null, serviceEveryMonths: null })));
  });

  it("shows the reason when adding fails, and stays put", async () => {
    vi.mocked(createMaintenanceItemAction).mockResolvedValue({ ok: false, error: "The year can't be before 1900" });
    render(<MaintenanceForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Old");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByText("The year can't be before 1900")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edits an item, filled in, and returns to it", async () => {
    vi.mocked(updateMaintenanceItemAction).mockResolvedValue({ ok: true });
    render(<MaintenanceForm item={item()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Furnace");
    expect(screen.getByLabelText("Year installed")).toHaveValue(2004);
    expect(screen.getByLabelText("Manual link")).toHaveValue("https://x.test/m");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/maintenance/m1");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Upstairs furnace");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMaintenanceItemAction).toHaveBeenCalledWith("m1", expect.objectContaining({ name: "Upstairs furnace", installedYear: 2004, serviceEveryMonths: 12 })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/maintenance/m1"));
  });

  it("starts empty for an item with nothing optional filled in, and shows an edit failure", async () => {
    vi.mocked(updateMaintenanceItemAction).mockResolvedValue({ ok: false, error: "That item isn't in your inventory any more" });
    render(<MaintenanceForm item={item({ location: null, brand: null, modelNumber: null, serialNumber: null, installedYear: null, warrantyUntil: null, serviceEveryMonths: null, lastServicedOn: null, manualUrl: null, notes: null })} />);
    expect(screen.getByLabelText("Brand")).toHaveValue("");
    expect(screen.getByLabelText("Year installed")).toHaveValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That item isn't in your inventory any more")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("cancels back to the list when adding", () => {
    render(<MaintenanceForm />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/maintenance");
  });
});

describe("MaintenanceDetailClient", () => {
  it("shows what to tell a repair person, and where service stands", () => {
    render(<MaintenanceDetailClient item={item()} today={TODAY} />);
    expect(screen.getByRole("heading", { name: "Furnace" })).toBeInTheDocument();
    for (const text of ["Heating & cooling", "Basement", "Carrier", "X1", "S1", "2004 (22 years old)", "Jan 2, 2030", "12 months", "Jan 3, 2026", "Filter size 16x25"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("Next service Jan 3, 2027")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://x.test/m" });
    expect(link).toHaveAttribute("href", "https://x.test/m");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/maintenance/m1/edit");
  });

  it("leaves out what isn't known, reads a one-month interval, and flags overdue service", () => {
    render(
      <MaintenanceDetailClient
        item={item({ location: null, brand: null, modelNumber: null, serialNumber: null, installedYear: null, warrantyUntil: null, serviceEveryMonths: 1, lastServicedOn: "2026-01-01", manualUrl: null, notes: null })}
        today={TODAY}
      />,
    );
    expect(screen.queryByText("Location")).toBeNull();
    expect(screen.queryByText("Installed")).toBeNull();
    expect(screen.getByText("1 month")).toBeInTheDocument();
    expect(screen.getByText("Service was due Feb 1, 2026")).toBeInTheDocument();
  });

  it("says so for a scheduled item that has never been serviced", () => {
    render(<MaintenanceDetailClient item={item({ lastServicedOn: null })} today={TODAY} />);
    expect(screen.getByText("No service recorded yet")).toBeInTheDocument();
    expect(screen.queryByText("Last serviced")).toBeNull();
  });

  it("says an item installed this year was installed this year", () => {
    render(<MaintenanceDetailClient item={item({ installedYear: 2026 })} today={TODAY} />);
    expect(screen.getByText("2026 (installed this year)")).toBeInTheDocument();
  });

  it("has no service button, or status, for an item with no schedule", () => {
    render(<MaintenanceDetailClient item={item({ serviceEveryMonths: null })} today={TODAY} />);
    expect(screen.queryByRole("button", { name: "Serviced today" })).toBeNull();
    expect(screen.queryByText(/Next service/)).toBeNull();
  });

  it("records service today (the browser's date), then refreshes", async () => {
    vi.mocked(markServicedAction).mockResolvedValue({ ok: true });
    render(<MaintenanceDetailClient item={item()} today={TODAY} />);
    await userEvent.click(screen.getByRole("button", { name: "Serviced today" }));
    await waitFor(() => expect(markServicedAction).toHaveBeenCalledWith("m1", localDateString()));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("records the device's date at the moment of the click, not the page's (which can still be the server's UTC date)", async () => {
    vi.mocked(markServicedAction).mockResolvedValue({ ok: true });
    render(<MaintenanceDetailClient item={item()} today="2000-01-01" />);
    await userEvent.click(screen.getByRole("button", { name: "Serviced today" }));
    await waitFor(() => expect(markServicedAction).toHaveBeenCalledWith("m1", localDateString()));
  });

  it("shows why recording service failed", async () => {
    vi.mocked(markServicedAction).mockResolvedValue({ ok: false, error: "That item isn't in your inventory any more" });
    render(<MaintenanceDetailClient item={item()} today={TODAY} />);
    await userEvent.click(screen.getByRole("button", { name: "Serviced today" }));
    expect(await screen.findByText("That item isn't in your inventory any more")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("deletes after confirming, then goes back to the list", async () => {
    vi.mocked(deleteMaintenanceItemAction).mockResolvedValue({ ok: true });
    render(<MaintenanceDetailClient item={item()} today={TODAY} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMaintenanceItemAction).toHaveBeenCalledWith("m1"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/maintenance"));
  });

  it("shows why deleting failed and stays", async () => {
    vi.mocked(deleteMaintenanceItemAction).mockResolvedValue({ ok: false, error: "That item isn't in your inventory any more" });
    render(<MaintenanceDetailClient item={item()} today={TODAY} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("That item isn't in your inventory any more")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(document.querySelector(".ant-alert-close-icon")!);
    await waitFor(() => expect(screen.queryByText("That item isn't in your inventory any more")).toBeNull());
  });
});
