// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(app)/lists/actions", () => ({ importItemsAction: vi.fn() }));

import ImportItemsModal from "@/app/(app)/lists/ImportItemsModal";
import { importItemsAction } from "@/app/(app)/lists/actions";

const onClose = vi.fn();
const onDone = vi.fn();

function setup(open = true) {
  return render(
    <ImportItemsModal open={open} onClose={onClose} onDone={onDone} listId="l1" listName="Packing" />
  );
}

async function choose(contents: string, name = "items.csv") {
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  await userEvent.upload(input, new File([contents], name, { type: "text/csv" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImportItemsModal", () => {
  it("renders nothing while closed", () => {
    setup(false);
    expect(screen.queryByText(/Import items into/)).not.toBeInTheDocument();
  });

  it("starts with the add button disabled", () => {
    setup();
    expect(screen.getByText('Import items into "Packing"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items" })).toBeDisabled();
  });

  it("previews the item count and imports", async () => {
    vi.mocked(importItemsAction).mockResolvedValue({ added: 2, errors: [] });
    const csv = "*text,quantity\nmilk,2\neggs,\n";
    setup();
    await choose(csv);
    expect(await screen.findByText('2 items will be added to "Packing".')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /items\.csv/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 2 items" }));
    await waitFor(() => expect(importItemsAction).toHaveBeenCalledWith("l1", csv));
    expect(onDone).toHaveBeenCalled();
  });

  it("uses the singular for one item", async () => {
    setup();
    await choose("text\nmilk\n");
    expect(await screen.findByText('1 item will be added to "Packing".')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 item" })).toBeEnabled();
  });

  it("lists row errors and blocks the import, with plural wording", async () => {
    setup();
    await choose("text\n \n,\nmilk\n");
    expect(await screen.findByText(/2 errors found/)).toBeInTheDocument();
    expect(screen.getByText("Row 2, column text: text is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items" })).toBeDisabled();
  });

  it("uses the singular for one error", async () => {
    setup();
    await choose("name\nmilk\n");
    expect(await screen.findByText(/1 error found/)).toBeInTheDocument();
  });

  it("shows errors the server finds and does not finish", async () => {
    vi.mocked(importItemsAction).mockResolvedValue({
      added: 0,
      errors: [{ row: 5, column: "text", message: "text is required" }],
    });
    setup();
    await choose("text\nmilk\n");
    await userEvent.click(await screen.findByRole("button", { name: "Add 1 item" }));
    expect(await screen.findByText("Row 5, column text: text is required")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does nothing if the import button is somehow used with no file", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add items" }));
    expect(importItemsAction).not.toHaveBeenCalled();
  });

  it("resets and closes on cancel", async () => {
    setup();
    await choose("text\nmilk\n");
    await screen.findByText(/will be added/);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/will be added/)).not.toBeInTheDocument();
  });

  it("downloads the template", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Download template" }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
