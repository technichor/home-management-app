// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DocumentsPanel from "@/components/DocumentsPanel";
import type { DocumentView } from "@/lib/documents";

const doc = (over: Partial<DocumentView>): DocumentView => ({
  id: "d1", title: "Title – Pacifica", category: "VEHICLES", typeKey: "vehicle-title", ownerContactId: null, ownerName: null, maintenanceItemId: "v1", itemName: "Pacifica",
  accountRecordId: null, accountName: null, links: [{ url: "https://drive.google.com/t", label: null }], originalLocation: null, notes: null, ...over,
});

describe("DocumentsPanel", () => {
  it("lists the documents with their links, what's suggested, and Add document", () => {
    render(
      <DocumentsPanel
        panel={{
          documents: [doc({}), doc({ id: "d2", title: "Owner's manual", typeKey: "manual", links: [{ url: "https://www.honda.test/m.pdf", label: "PDF" }] }), doc({ id: "d3", title: "Receipt", typeKey: null })],
          openSlots: [{ key: "vehicle-registration", label: "Registration", href: "/documents/new?type=vehicle-registration&item=v1&returnTo=%2Fmaintenance%2Fv1" }],
          addHref: "/documents/new?item=v1&returnTo=%2Fmaintenance%2Fv1",
        }}
      />,
    );
    const panel = screen.getByRole("region", { name: "Documents" });
    expect(within(panel).getByRole("link", { name: "Title – Pacifica" })).toHaveAttribute("href", "/documents/d1");
    expect(within(panel).getByRole("link", { name: "Open Title – Pacifica (drive.google.com)" })).toHaveAttribute("target", "_blank");
    expect(within(panel).getByText("Manual")).toBeInTheDocument(); // the type, when the title doesn't say it
    expect(within(panel).queryByText("Title", { selector: ".documents-doc-detail" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open Owner's manual: PDF (honda.test)" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Add Registration" })).toHaveAttribute("href", "/documents/new?type=vehicle-registration&item=v1&returnTo=%2Fmaintenance%2Fv1");
    expect(within(panel).getByRole("link", { name: /Add document/ })).toHaveAttribute("href", "/documents/new?item=v1&returnTo=%2Fmaintenance%2Fv1");
    expect(screen.queryByText(/No documents yet/)).not.toBeInTheDocument();
  });

  it("says when there's nothing yet", () => {
    render(<DocumentsPanel panel={{ documents: [], openSlots: [], addHref: "/documents/new?account=a1" }} />);
    expect(screen.getByText(/No documents yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Suggested")).not.toBeInTheDocument();
  });
});
