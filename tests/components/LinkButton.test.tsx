// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LinkButton from "@/components/LinkButton";

describe("LinkButton", () => {
  it("opens the link in a new tab, showing where it goes", () => {
    render(<LinkButton url="https://drive.google.com/file/d/1" />);
    const link = screen.getByRole("link", { name: "drive.google.com" });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "https://drive.google.com/file/d/1");
  });

  it("shows its own label instead, and says what it opens when named", () => {
    render(<LinkButton url="https://www.dropbox.com/s/x" label="Front" name="Driver's license" />);
    const link = screen.getByRole("link", { name: "Open Driver's license (dropbox.com)" });
    expect(link).toHaveTextContent("Front");
  });
});
