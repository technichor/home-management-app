// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getSessionUser: vi.fn() }));
vi.mock("@/components/AuthForm", () => ({ default: ({ mode }: any) => <div>form:{mode}</div> }));
vi.mock("@/app/login/actions", () => ({ loginAction: vi.fn(), logoutAction: vi.fn() }));
vi.mock("@/components/CreateHouseholdForm", () => ({ default: () => <div>create form</div> }));
vi.mock("@/app/signup/actions", () => ({ signupAction: vi.fn() }));

import { getSessionUser } from "@/lib/auth";
import AuthPage from "@/components/AuthPage";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import OnboardingPage from "@/app/onboarding/page";

beforeEach(() => vi.clearAllMocks());

describe("AuthPage", () => {
  const action = vi.fn();

  it("shows the form to a visitor", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    render(await AuthPage({ mode: "login", action }));
    expect(screen.getByText("form:login")).toBeInTheDocument();
  });

  it("sends a signed-in user where they belong", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", household: null } as any);
    await expect(AuthPage({ mode: "signup", action })).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("login and signup pages", () => {
  it("render the shared page in their own mode", () => {
    expect(LoginPage().props).toMatchObject({ mode: "login" });
    expect(SignupPage().props).toMatchObject({ mode: "signup" });
  });
});

describe("OnboardingPage", () => {
  it("requires a signed-in user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("sends a user who already has a household to it", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "u",
      household: { id: "h", urlSlug: "smiths", deletedAt: null },
    } as any);
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/smiths/contacts");
  });

  it("greets a user with no household and offers logout", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u", firstName: "Sam", email: "s@x.co", household: null } as any);
    render(await OnboardingPage());
    expect(screen.getByText("Welcome, Sam")).toBeInTheDocument();
    expect(screen.getByText(/s@x\.co/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByText("create form")).toBeInTheDocument();
    expect(screen.getByText(/Ask a member of that household/)).toBeInTheDocument();
  });
});
