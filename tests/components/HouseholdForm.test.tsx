// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/(app)/contacts/households/householdActions", () => ({
  createHouseholdAction: vi.fn(),
  updateHouseholdAction: vi.fn(),
  deleteHouseholdAction: vi.fn(),
}));

import HouseholdForm from "@/app/(app)/contacts/households/HouseholdForm";
import {
  createHouseholdAction,
  updateHouseholdAction,
  deleteHouseholdAction,
} from "@/app/(app)/contacts/households/householdActions";

const edit = (over: object = {}) => ({
  id: "x1", isOurs: false, contactCount: 0,
  values: { displayName: "The Joneses", mailingAddress: "1 Main St", tags: ["a"] },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("HouseholdForm (adding)", () => {
  it("requires a name before submitting", async () => {
    render(<HouseholdForm />);
    await userEvent.click(screen.getByRole("button", { name: "Add household" }));
    expect(await screen.findByText("Household name is required")).toBeInTheDocument();
    expect(createHouseholdAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("creates the household and opens it", async () => {
    vi.mocked(createHouseholdAction).mockResolvedValue({ ok: true, id: "new1" });
    render(<HouseholdForm />);
    await userEvent.type(screen.getByLabelText("Household name"), "The Joneses");
    await userEvent.type(screen.getByLabelText(/^Mailing address/), "1 Main St");
    await userEvent.click(screen.getByRole("button", { name: "Add household" }));
    await waitFor(() => expect(createHouseholdAction).toHaveBeenCalled());
    expect(vi.mocked(createHouseholdAction).mock.calls[0][0]).toMatchObject({ displayName: "The Joneses", mailingAddress: "1 Main St" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/households/new1"));
  });

  it("shows server field errors and a summary", async () => {
    vi.mocked(updateHouseholdAction).mockResolvedValue({ ok: false, error: "Bad name", fieldErrors: { displayName: "Bad name" } });
    render(<HouseholdForm household={edit()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getAllByText("Bad name").length).toBe(2));
  });

  it("shows a server error that has no field", async () => {
    vi.mocked(createHouseholdAction).mockResolvedValue({ ok: false, error: "Something went wrong" });
    render(<HouseholdForm />);
    await userEvent.type(screen.getByLabelText("Household name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Add household" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("cancel goes back to the list", async () => {
    render(<HouseholdForm />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/contacts/households");
  });
});

describe("HouseholdForm (editing)", () => {
  it("prefills, saves to that household, and opens it", async () => {
    vi.mocked(updateHouseholdAction).mockResolvedValue({ ok: true, id: "x1" });
    render(<HouseholdForm household={edit()} />);
    expect((screen.getByLabelText("Household name") as HTMLInputElement).value).toBe("The Joneses");
    expect(screen.getByText("a")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Notes/), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateHouseholdAction).toHaveBeenCalled());
    expect(vi.mocked(updateHouseholdAction).mock.calls[0].slice(0, 1)).toEqual(["x1"]);
    expect(vi.mocked(updateHouseholdAction).mock.calls[0][1]).toMatchObject({ notes: "hello" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/households/x1"));
  });

  it("cancel goes back to the household", async () => {
    render(<HouseholdForm household={edit()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/contacts/households/x1");
  });

  it("offers no Remove for the caller's own household", () => {
    render(<HouseholdForm household={edit({ isOurs: true })} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  async function confirmRemove() {
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const ok = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm .ant-btn-primary");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    return ok;
  }

  it("warns how many contacts lose their address, then removes", async () => {
    vi.mocked(deleteHouseholdAction).mockResolvedValue({ ok: true, id: "x1" });
    render(<HouseholdForm household={edit({ contactCount: 2 })} />);
    const ok = await confirmRemove();
    expect(screen.getByText(/2 Family & Friend contacts will lose their inherited address/)).toBeInTheDocument();
    await userEvent.click(ok);
    await waitFor(() => expect(deleteHouseholdAction).toHaveBeenCalledWith("x1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/households"));
  });

  it("uses the singular for one contact, and a plain note for none", async () => {
    const { unmount } = render(<HouseholdForm household={edit({ contactCount: 1 })} />);
    await confirmRemove();
    expect(screen.getByText(/1 Family & Friend contact will lose/)).toBeInTheDocument();
    unmount();
    render(<HouseholdForm household={edit({ contactCount: 0 })} />);
    await confirmRemove();
    expect(screen.getByText("It moves to Removed, where you can restore it.")).toBeInTheDocument();
  });

  it("shows why a household couldn't be removed", async () => {
    vi.mocked(deleteHouseholdAction).mockResolvedValue({ ok: false, error: "Household not found." });
    render(<HouseholdForm household={edit()} />);
    const ok = await confirmRemove();
    await userEvent.click(ok);
    expect(await screen.findByText("Household not found.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
