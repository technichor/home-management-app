// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WeekDrawing from "@/components/WeekDrawing";
import { buildDrawing } from "@/lib/weekBrief";

const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

describe("WeekDrawing", () => {
  it("is an image with the given description, one path and a label for every day", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 2, 1, 0, 0, 0, 0], labels, 1)} description="A light week" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "A light week");
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(labels);
  });

  it("draws a dot only on days with something on, and colors today's with the accent", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 2, 1, 0, 0, 0, 0], labels, 1)} description="x" />);
    const dots = [...container.querySelectorAll("circle")];
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute("fill", "var(--accent)");
    expect(dots[1]).toHaveAttribute("fill", "var(--text)");
    const todayLabel = [...container.querySelectorAll("text")].find((t) => t.textContent === "Mon")!;
    expect(todayLabel).toHaveAttribute("fill", "var(--accent)");
    expect(todayLabel).toHaveAttribute("font-weight", "600");
  });

  it("is a flat line with no dots when nothing is on", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 0, 0, 0, 0, 0, 0], labels, -1)} description="x" />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect([...container.querySelectorAll("text")].every((t) => t.getAttribute("fill") === "var(--muted)")).toBe(true);
  });
});
