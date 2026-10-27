"use client";

import Link from "next/link";
import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import LinkButton from "@/components/LinkButton";
import { typeByKey } from "@/lib/documentCatalog";
import type { DocumentsPanelData } from "@/lib/documentPanels";

/**
 * A record's Documents section (a Maintenance item, an Account, a household member): its documents, each with its
 * links, the suggested ones it doesn't have yet, and Add document. Adding comes back to this page.
 */
export default function DocumentsPanel({ panel }: { panel: DocumentsPanelData }) {
  return (
    <section className="documents-panel" aria-label="Documents">
      <header>
        <h4>Documents</h4>
        <Link href={panel.addHref}>
          <Button size="small" icon={<PlusOutlined />}>
            Add document
          </Button>
        </Link>
      </header>
      {panel.documents.length === 0 && panel.openSlots.length === 0 && (
        <p className="documents-panel-empty">No documents yet. Add a link to where one lives (Google Drive, Dropbox, ...).</p>
      )}
      {panel.documents.map((d) => {
        const type = typeByKey(d.typeKey)?.label;
        return (
          <div key={d.id} className="documents-doc">
            <div>
              <Link href={`/documents/${d.id}`} className="documents-doc-title">
                {d.title}
              </Link>
              {type && !d.title.includes(type) && <span className="documents-doc-detail">{type}</span>}
            </div>
            <div className="documents-links">
              {d.links.map((l, i) => (
                <LinkButton key={i} url={l.url} label={l.label} name={l.label ? `${d.title}: ${l.label}` : d.title} />
              ))}
            </div>
          </div>
        );
      })}
      {panel.openSlots.length > 0 && (
        <div className="documents-chips" aria-label="Suggested">
          {panel.openSlots.map((s) => (
            <Link key={s.key} href={s.href} className="documents-chip documents-chip-add" aria-label={`Add ${s.label}`}>
              <PlusOutlined aria-hidden /> {s.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
