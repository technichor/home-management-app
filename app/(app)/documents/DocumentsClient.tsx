"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Dropdown, Input, Select, Typography } from "antd";
import { MoreOutlined, PlusOutlined } from "@ant-design/icons";
import LinkButton from "@/components/LinkButton";
import { categoryLabel, DOCUMENT_TYPES, typeByKey } from "@/lib/documentCatalog";
import {
  addLinkFor,
  documentCards,
  documentIsWhose,
  documentMatches,
  slotCounts,
  slotIsWhose,
  slotLabel,
  suggestionSlots,
  type DocumentCard,
  type DocumentView,
  type Slot,
  type TypeSection,
  type Whose,
} from "@/lib/documents";
import { dismissSuggestionAction, restoreSuggestionAction } from "./actions";

/** A card shows this many rows before "Show all". */
export const CARD_ROWS = 8;
const WHOSE_KEY = "documents.whose";
const EVERYONE = "everyone";
const HOUSEHOLD = "household";

// Browser storage is a convenience (it remembers the Whose filter on this device); it may be unavailable.
function readWhose(): string | null {
  try {
    return window.localStorage.getItem(WHOSE_KEY);
  } catch {
    return null;
  }
}
function storeWhose(value: string) {
  try {
    window.localStorage.setItem(WHOSE_KEY, value);
  } catch {
    // Not saved; the choice still applies until the page is left.
  }
}

const toWhose = (value: string): Whose =>
  value === EVERYONE ? { kind: "everyone" } : value === HOUSEHOLD ? { kind: "household" } : { kind: "member", id: value };

type Member = { id: string; name: string };

export default function DocumentsClient({
  documents,
  members,
  vehicles,
  dismissals,
}: {
  documents: DocumentView[];
  members: Member[];
  vehicles: Member[];
  dismissals: { typeKey: string; subjectKey: string }[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [whoseValue, setWhoseValue] = useState(EVERYONE);
  const [showDismissed, setShowDismissed] = useState(false);

  // The remembered filter, read after the first render (the server has no browser storage); a member who has left is forgotten.
  useEffect(() => {
    const stored = readWhose();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage only exists after mount
    if (stored === HOUSEHOLD || members.some((m) => m.id === stored)) setWhoseValue(stored!);
  }, [members]);

  function chooseWhose(value: string) {
    setWhoseValue(value);
    storeWhose(value);
  }

  const whose = toWhose(whoseValue);
  const allSlots = useMemo(() => suggestionSlots(DOCUMENT_TYPES, members, vehicles, documents, dismissals), [members, vehicles, documents, dismissals]);
  const slots = allSlots.filter((s) => slotIsWhose(s, whose));
  const shown = documents.filter((d) => documentIsWhose(d, whose));
  const cards = documentCards(slots, shown);
  const counts = slotCounts(slots);
  const dismissed = allSlots.filter((s) => s.state === "dismissed");

  async function run(action: Promise<{ ok: true } | { ok: false; error: string }>) {
    const result = await action;
    if (!result.ok) return message.error(result.error);
    router.refresh();
  }
  const dismiss = (slot: Slot) => run(dismissSuggestionAction(slot.type.key, slot.subjectKey));
  const restore = (slot: Slot) => run(restoreSuggestionAction(slot.type.key, slot.subjectKey));

  return (
    <div className="documents">
      <div className="documents-header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Documents ({documents.length})
        </Typography.Title>
        <Link href="/documents/new">
          <Button type="primary">Add document</Button>
        </Link>
      </div>

      {documents.length === 0 && (
        <Typography.Text type="secondary">
          A checklist of the documents families need to find in a hurry. Add a link to where each one lives (Google Drive, Dropbox, ...).
        </Typography.Text>
      )}

      <div className="documents-filters">
        <Input.Search
          allowClear
          placeholder="Search title, type, person, item"
          aria-label="Search documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="fill-on-mobile"
          style={{ width: 280 }}
        />
        <Select
          aria-label="Whose"
          value={whoseValue}
          onChange={chooseWhose}
          className="fill-on-mobile"
          style={{ width: 200 }}
          options={[{ value: EVERYONE, label: "Everyone" }, { value: HOUSEHOLD, label: "Household" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
        />
      </div>

      {counts.suggested > 0 && (
        <Typography.Text type="secondary" className="documents-summary">
          {counts.added} of {counts.suggested} suggestions added
        </Typography.Text>
      )}

      {query.trim() ? (
        <SearchResults query={query} documents={shown} slots={slots} />
      ) : (
        <>
          <div className="documents-cards">
            {cards
              .filter((c) => !c.quiet)
              .map((card) => (
                <CategoryCard key={card.category} card={card} onDismiss={dismiss} />
              ))}
          </div>
          {cards.some((c) => c.quiet) && (
            <div className="documents-quiet" aria-label="Other categories">
              {cards
                .filter((c) => c.quiet)
                .map((c) => (
                  <Link key={c.category} href={`/documents/new?category=${c.category}&returnTo=/documents`} className="documents-chip">
                    <PlusOutlined aria-hidden /> {c.label}
                  </Link>
                ))}
            </div>
          )}
        </>
      )}

      {dismissed.length > 0 && (
        <div>
          <Button type="link" style={{ paddingInline: 0 }} aria-expanded={showDismissed} onClick={() => setShowDismissed((v) => !v)}>
            Dismissed ({dismissed.length})
          </Button>
          {showDismissed && (
            <ul className="documents-dismissed" aria-label="Dismissed">
              {dismissed.map((s) => (
                <li key={`${s.type.key}|${s.subjectKey}`}>
                  <span>{slotLabel(s)}</span>
                  <Button size="small" onClick={() => restore(s)} aria-label={`Restore ${slotLabel(s)}`}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ card, onDismiss }: { card: DocumentCard; onDismiss: (slot: Slot) => void }) {
  const [all, setAll] = useState(false);
  const rows = [
    ...card.sections.map((s) => <SectionRows key={s.type.key} section={s} onDismiss={onDismiss} />),
    ...card.others.map((d) => <DocumentRow key={d.id} doc={d} detail={[typeByKey(d.typeKey)?.label, d.ownerName, d.itemName]} />),
  ];
  return (
    <section className="documents-card" aria-label={card.label}>
      <header>
        <h3>{card.label}</h3>
        <span className="documents-count">
          {card.counts.suggested > 0
            ? `${card.counts.added} of ${card.counts.suggested}`
            : `${card.documentCount} ${card.documentCount === 1 ? "document" : "documents"}`}
        </span>
      </header>
      {all ? rows : rows.slice(0, CARD_ROWS)}
      {!all && rows.length > CARD_ROWS && (
        <Button type="link" size="small" style={{ paddingInline: 0, alignSelf: "flex-start" }} onClick={() => setAll(true)}>
          Show all ({rows.length})
        </Button>
      )}
    </section>
  );
}

/** A suggested type: a household slot is its documents, or an open row; a per-person or per-vehicle type is a row with a count, its documents and a chip per missing one. */
function SectionRows({ section, onDismiss }: { section: TypeSection; onDismiss: (slot: Slot) => void }) {
  const { type, slots, documents } = section;
  if (type.scope === "HOUSEHOLD") {
    if (documents.length > 0) return documents.map((d) => <DocumentRow key={d.id} doc={d} detail={[type.label]} />);
    return <OpenSlotRow slot={slots[0]} onDismiss={onDismiss} />;
  }
  const counts = slotCounts(slots);
  const open = slots.filter((s) => s.state === "open");
  return (
    <div className="documents-type">
      <div className="documents-type-name">
        {type.label}
        {slots.length > 0 && <span className="documents-count"> · {counts.added} of {counts.suggested}</span>}
      </div>
      {documents.map((d) => (
        <DocumentRow key={d.id} doc={d} detail={[d.ownerName, d.itemName]} />
      ))}
      {open.length > 0 && (
        <div className="documents-chips">
          {open.map((s) => (
            <SlotChip key={s.subjectKey} slot={s} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A document: its title (to its page), what else says what it is (anything the title doesn't already say), and its links. */
function DocumentRow({ doc, detail }: { doc: DocumentView; detail: (string | null | undefined)[] }) {
  const words = detail.filter((w) => w && !doc.title.includes(w)).join(" · ");
  return (
    <div className="documents-doc">
      <div>
        <Link href={`/documents/${doc.id}`} className="documents-doc-title">
          {doc.title}
        </Link>
        {words && <span className="documents-doc-detail">{words}</span>}
      </div>
      <div className="documents-links">
        {doc.links.map((l, i) => (
          <LinkButton key={i} url={l.url} label={l.label} name={l.label ? `${doc.title}: ${l.label}` : doc.title} />
        ))}
      </div>
    </div>
  );
}

function DismissMenu({ slot, label, onDismiss }: { slot: Slot; label: string; onDismiss: (slot: Slot) => void }) {
  return (
    <Dropdown trigger={["click"]} menu={{ items: [{ key: "dismiss", label }], onClick: () => onDismiss(slot) }}>
      <Button type="text" size="small" icon={<MoreOutlined />} aria-label={`More for ${slotLabel(slot)}`} />
    </Dropdown>
  );
}

function OpenSlotRow({ slot, onDismiss }: { slot: Slot; onDismiss: (slot: Slot) => void }) {
  return (
    <div className="documents-doc documents-open">
      <span>{slot.type.label}</span>
      <span className="documents-open-actions">
        <Link href={addLinkFor(slot)} aria-label={`Add link: ${slotLabel(slot)}`}>
          <Button size="small" icon={<PlusOutlined />}>
            Add link
          </Button>
        </Link>
        <DismissMenu slot={slot} label="Doesn't apply" onDismiss={onDismiss} />
      </span>
    </div>
  );
}

function SlotChip({ slot, onDismiss }: { slot: Slot; onDismiss: (slot: Slot) => void }) {
  // Chips are only for a member's or a vehicle's slots, which always have a name.
  const name = (slot.subject as { name: string }).name;
  return (
    <span className="documents-chip">
      <Link href={addLinkFor(slot)} aria-label={`Add link: ${slotLabel(slot)}`}>
        <PlusOutlined aria-hidden /> {name}
      </Link>
      <DismissMenu slot={slot} label={`Doesn't apply to ${name}`} onDismiss={onDismiss} />
    </span>
  );
}

function SearchResults({ query, documents, slots }: { query: string; documents: DocumentView[]; slots: Slot[] }) {
  const q = query.trim().toLowerCase();
  const found = documents.filter((d) => documentMatches(d, query)).sort((a, b) => a.title.localeCompare(b.title));
  const notAdded = slots.filter((s) => s.state === "open" && s.type.label.toLowerCase().includes(q));
  return (
    <div className="documents-results">
      {found.length === 0 && notAdded.length === 0 && <Typography.Text type="secondary">Nothing matches.</Typography.Text>}
      {found.length > 0 && (
        <section className="documents-card" aria-label="Matching documents">
          {found.map((d) => (
            <DocumentRow key={d.id} doc={d} detail={[categoryLabel(d.category), typeByKey(d.typeKey)?.label, d.ownerName, d.itemName, d.accountName]} />
          ))}
        </section>
      )}
      {notAdded.length > 0 && (
        <section className="documents-card" aria-label="Not added yet">
          <header>
            <h3>Not added yet</h3>
          </header>
          {notAdded.map((s) => (
            <div key={`${s.type.key}|${s.subjectKey}`} className="documents-doc documents-open">
              <span>{slotLabel(s)}</span>
              <Link href={addLinkFor(s)} aria-label={`Add link: ${slotLabel(s)}`}>
                <Button size="small" icon={<PlusOutlined />}>
                  Add link
                </Button>
              </Link>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
