// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "@/components/Logo";

describe("Logo", () => {
  it("draws the horizontal lockup by default, named Domata, its ink themed and the door logo green", () => {
    render(<Logo width={112} />);
    const svg = screen.getByRole("img", { name: "Domata" });
    expect(svg).toHaveAttribute("width", "112");
    expect(svg).toHaveAttribute("viewBox", "0 -43.27 264.63 47.5");
    expect(svg.querySelectorAll(".logo-ink").length).toBe(14);
    expect(svg.querySelectorAll('[fill="#0F9246"]').length).toBe(1);
    expect(svg.innerHTML).not.toContain("#26262B");
  });

  it.each([
    ["mark", "0 0 60 47.5"],
    ["stacked", "0 0 217.02 214.88"],
  ] as const)("draws the %s", (variant, viewBox) => {
    render(<Logo variant={variant} width={48} />);
    expect(screen.getByRole("img", { name: "Domata" })).toHaveAttribute("viewBox", viewBox);
  });

  it("can be hidden from screen readers when the name is written beside it", () => {
    const { container } = render(<Logo variant="mark" width={24} decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
