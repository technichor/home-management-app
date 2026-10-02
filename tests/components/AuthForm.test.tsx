// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthForm from "@/components/AuthForm";

const action = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  action.mockResolvedValue(null);
});

describe("AuthForm login", () => {
  it("asks only for email and password and links to signup", () => {
    render(<AuthForm mode="login" action={action} />);
    expect(document.querySelector("input[name=email]")).toBeInTheDocument();
    expect(document.querySelector("input[name=password]")).toBeInTheDocument();
    expect(document.querySelector("input[name=firstName]")).toBeNull();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });

  it("submits the credentials and shows an error from the action", async () => {
    action.mockResolvedValue({ error: "Incorrect email or password." });
    render(<AuthForm mode="login" action={action} />);
    await userEvent.type(document.querySelector("input[name=email]") as HTMLInputElement, "a@b.co");
    await userEvent.type(document.querySelector("input[name=password]") as HTMLInputElement, "pw");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect(data.get("email")).toBe("a@b.co");
    expect(data.get("password")).toBe("pw");
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });
});

describe("AuthForm signup", () => {
  it("also asks for a name and links to login", () => {
    render(<AuthForm mode="signup" action={action} />);
    expect(document.querySelector("input[name=firstName]")).toBeInTheDocument();
    expect(document.querySelector("input[name=lastName]")).toBeInTheDocument();
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("submits all four fields", async () => {
    render(<AuthForm mode="signup" action={action} />);
    await userEvent.type(document.querySelector("input[name=firstName]") as HTMLInputElement, "Sam");
    await userEvent.type(document.querySelector("input[name=lastName]") as HTMLInputElement, "Smith");
    await userEvent.type(document.querySelector("input[name=email]") as HTMLInputElement, "a@b.co");
    await userEvent.type(document.querySelector("input[name=password]") as HTMLInputElement, "longenough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("firstName"), data.get("lastName"), data.get("email")]).toEqual(["Sam", "Smith", "a@b.co"]);
  });
});

describe("AuthForm next", () => {
  it("carries the next path in a hidden field and on the other mode's link", () => {
    render(<AuthForm mode="login" action={action} next="/join/abc" />);
    expect((document.querySelector("input[name=next]") as HTMLInputElement).value).toBe("/join/abc");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fjoin%2Fabc");
  });
});

describe("AuthForm extras", () => {
  it("login links to password reset; signup does not", () => {
    const { unmount } = render(<AuthForm mode="login" action={action} />);
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    unmount();
    render(<AuthForm mode="signup" action={action} />);
    expect(screen.queryByRole("link", { name: "Forgot your password?" })).toBeNull();
  });

  it("shows a notice, but not alongside an error", async () => {
    action.mockResolvedValue({ error: "Incorrect email or password." });
    render(<AuthForm mode="login" action={action} notice="Password changed." />);
    expect(screen.getByText("Password changed.")).toBeInTheDocument();
    await userEvent.type(document.querySelector("input[name=email]") as HTMLInputElement, "a@b.co");
    await userEvent.type(document.querySelector("input[name=password]") as HTMLInputElement, "pw");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(screen.queryByText("Password changed.")).toBeNull();
  });
});
