// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("says the page is missing and leads home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "This page could not be found." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your home page" })).toHaveAttribute("href", "/home");
  });
});
