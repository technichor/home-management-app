// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/onboarding/actions", () => ({ createHouseholdForUserAction: vi.fn() }));

import CreateHouseholdForm from "@/components/CreateHouseholdForm";
import { createHouseholdForUserAction } from "@/app/onboarding/actions";

beforeEach(() => vi.clearAllMocks());

describe("CreateHouseholdForm", () => {
  it("submits the name and address", async () => {
    vi.mocked(createHouseholdForUserAction).mockResolvedValue(null);
    render(<CreateHouseholdForm />);
    await userEvent.type(screen.getByPlaceholderText("e.g. The Reynolds Family"), "The Smiths");
    await userEvent.type(document.querySelector("textarea[name=mailingAddress]") as HTMLElement, "1 Main St");
    await userEvent.click(screen.getByRole("button", { name: "Create household" }));
    await waitFor(() => expect(createHouseholdForUserAction).toHaveBeenCalled());
    const data = vi.mocked(createHouseholdForUserAction).mock.calls[0][1] as FormData;
    expect(data.get("displayName")).toBe("The Smiths");
    expect(data.get("mailingAddress")).toBe("1 Main St");
  });

  it("shows an error from the action", async () => {
    vi.mocked(createHouseholdForUserAction).mockResolvedValue({ error: "You already belong to a household." });
    render(<CreateHouseholdForm />);
    await userEvent.type(screen.getByPlaceholderText("e.g. The Reynolds Family"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByText("You already belong to a household.")).toBeInTheDocument();
  });
});
