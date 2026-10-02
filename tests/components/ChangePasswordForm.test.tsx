// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(app)/account/actions", () => ({ changePasswordAction: vi.fn() }));

import ChangePasswordForm from "@/components/ChangePasswordForm";
import { changePasswordAction } from "@/app/(app)/account/actions";

beforeEach(() => vi.clearAllMocks());

async function fillAndSubmit() {
  await userEvent.type(document.querySelector("input[name=currentPassword]") as HTMLInputElement, "old-password");
  await userEvent.type(document.querySelector("input[name=newPassword]") as HTMLInputElement, "new-password-1");
  await userEvent.type(document.querySelector("input[name=confirmPassword]") as HTMLInputElement, "new-password-1");
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordForm", () => {
  it("submits all three fields and shows an error from the action", async () => {
    vi.mocked(changePasswordAction).mockResolvedValue({ error: "Your current password is incorrect." });
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    await waitFor(() => expect(changePasswordAction).toHaveBeenCalled());
    const data = vi.mocked(changePasswordAction).mock.calls[0][1] as FormData;
    expect([data.get("currentPassword"), data.get("newPassword"), data.get("confirmPassword")]).toEqual([
      "old-password", "new-password-1", "new-password-1",
    ]);
    expect(await screen.findByText("Your current password is incorrect.")).toBeInTheDocument();
  });

  it("confirms success and clears the fields", async () => {
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: true });
    render(<ChangePasswordForm />);
    await fillAndSubmit();
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
    expect((document.querySelector("input[name=newPassword]") as HTMLInputElement).value).toBe("");
  });
});
