// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/setup/actions", () => ({ createHouseholdAction: vi.fn() }));

import SetupPage from "@/app/setup/page";
import { createHouseholdAction } from "@/app/setup/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createHouseholdAction).mockResolvedValue(null);
});

async function fillAndSubmit() {
  await userEvent.type(document.querySelector("input[name=setupCode]") as HTMLInputElement, "let-me-in");
  await userEvent.type(screen.getByPlaceholderText("e.g. The Reynolds Family"), "The Smiths");
  await userEvent.type(screen.getByPlaceholderText("reynolds-family"), "smiths");
  await userEvent.type(document.querySelector("input[name=password]") as HTMLInputElement, "longenough");
  await userEvent.click(screen.getByRole("button", { name: "Create household account" }));
}

describe("SetupPage", () => {
  it("submits the form to the create action", async () => {
    render(<SetupPage />);
    await fillAndSubmit();
    await waitFor(() => expect(createHouseholdAction).toHaveBeenCalled());
    const formData = vi.mocked(createHouseholdAction).mock.calls[0][1] as FormData;
    expect(formData.get("setupCode")).toBe("let-me-in");
    expect(formData.get("displayName")).toBe("The Smiths");
    expect(formData.get("urlSlug")).toBe("smiths");
    expect(formData.get("password")).toBe("longenough");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error the action returns", async () => {
    vi.mocked(createHouseholdAction).mockResolvedValue({ error: "That URL slug is already taken." });
    render(<SetupPage />);
    await fillAndSubmit();
    expect(await screen.findByText("That URL slug is already taken.")).toBeInTheDocument();
  });

  it("goes to the login page for a slug", async () => {
    render(<SetupPage />);
    await userEvent.type(screen.getByPlaceholderText("your-slug"), "  reynolds  ");
    await userEvent.click(screen.getByRole("button", { name: "Go to login" }));
    expect(push).toHaveBeenCalledWith("/reynolds");
  });

  it("does nothing when the slug is blank", async () => {
    render(<SetupPage />);
    await userEvent.type(screen.getByPlaceholderText("your-slug"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Go to login" }));
    expect(push).not.toHaveBeenCalled();
  });
});
