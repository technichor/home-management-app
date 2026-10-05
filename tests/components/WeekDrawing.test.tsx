// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WeekDrawing from "@/components/WeekDrawing";
import { buildDrawing } from "@/lib/weekBrief";

const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

describe("WeekDrawing", () => {
  it("is an image with the given description and one path, and draws no day names (the page has those)", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 2, 1, 0, 0, 0, 0], labels, 1)} description="A light week" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "A light week");
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelectorAll("text")).toHaveLength(0);
  });

  it("draws a dot only on days with something on, and colors today's with the accent", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 2, 1, 0, 0, 0, 0], labels, 1)} description="x" />);
    const dots = [...container.querySelectorAll("circle")];
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute("fill", "var(--accent)");
    expect(dots[1]).toHaveAttribute("fill", "var(--text)");
  });

  it("is a flat line with no dots when nothing is on", () => {
    const { container } = render(<WeekDrawing drawing={buildDrawing([0, 0, 0, 0, 0, 0, 0], labels, -1)} description="x" />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});
