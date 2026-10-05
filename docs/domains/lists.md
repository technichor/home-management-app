# Domain: Lists

> **Meal Planning extension:** a list now has a `kind` (STANDARD or GROCERY). The household's shopping list is a GROCERY list owned by the Meal Planning module; it is excluded from everything described below (index, archive, rename, delete, reorder, ranking, assignment, CSV import). See `docs/domains/meal-planning.md`.

Status: **Draft — shaped through structured Q&A, ready for a final look before handing to Claude Code.**

## Why this domain, and why it matters

Unlike Contacts, "lists" isn't a market gap — Cozi, FamilyWall, and most family-organizer apps have some version of shared shopping/to-do lists. The point of building it here isn't novelty, it's keeping it inside the same no-gatekeeper household app instead of a separate sticky-note tool, and — since this app already tracks contacts — letting a list item's assignee be a real, linked person record instead of a free-text guess.

One capability worth calling out up front: **prioritization is a core part of this domain, not an afterthought.** Most list apps treat ordering as an incidental drag-and-drop detail. Here it's deliberate enough to warrant two complementary mechanisms — simple manual reordering for v1, and an Elo-style pairwise comparison ranking as a planned follow-on, because prioritizing a long list by eyeballing it is hard, but repeatedly answering "which of these two matters more" is easy. See the dedicated section below.

## Scope: what counts as a "list"

**Resolved: fully freeform, no built-in categories.** A list is just a name you make up ("Costco run," "Saturday chores," "Europe trip packing") — there's no fixed `type` enum like Contacts' category field. A household can have any number of lists active at once.

- **Optional freeform tags** on a list (e.g. "grocery," "chores") for filtering/finding lists later — same free-tagging pattern as Contacts, not required.
- **Multiple concurrent lists** are expected and normal — a "Costco run" and a "Target run" can both exist as separate grocery-ish lists at the same time.

## Editing model: in-app is primary — this is the key divergence from Contacts

Contacts is edited rarely and in bulk, so CSV export/import is its primary path. Lists are the opposite: items get checked off standing in a store aisle, added throughout the day, reassigned on the fly. **Resolved: the primary way to manage a list is directly in the app, in real time** — not a spreadsheet round-trip.

Core in-app interactions:
- Create / rename a list; add optional tags
- Quick-add items (fast, low-friction entry — typing an item and continuing to the next should not require extra taps)
- Check items off (and uncheck)
- Edit an item's quantity, assignee, or notes
- Reorder items within a list — manually (v1) or via pairwise comparison (phase 2; see below)
- Archive a list, and view/unarchive previously archived lists
- Delete a list or an individual item

**CSV import is also in v1**, specifically as a fast way to bulk-populate a large list rather than quick-adding dozens of items one at a time — see the dedicated section below for how it differs from Contacts' CSV model. A CSV export of a list (for backup or sharing outside the app) remains a nice-to-have, not required for v1.

## List record — fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID/string | System-generated | |
| `household_id` | reference to Household | **Yes** | |
| `name` | string | **Yes** | Freeform, e.g. "Costco run" |
| `tags` | array of strings | No | Freeform, optional |
| `archived_at` | timestamp, nullable | No | Null = active; set when manually archived |
| `created_at`, `updated_at` | timestamp | System-generated | |

No `created_by` field — consistent with the app's v1 access model (one shared household password, no individual logins), there's no reliable way to attribute a list to a specific person yet.

## List item record — fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID/string | System-generated | |
| `list_id` | reference to List | **Yes** | |
| `text` | string | **Yes** | The item itself, e.g. "milk" or "call the vet" |
| `quantity` | string (freeform) | No | e.g. "2 gallons" — freeform text, not a structured number+unit, matching the rest of the app's freeform-first approach |
| `assigned_to_contact_id` | reference to Contact | No | **Resolved: links to an existing Contact record**, not a freeform name. This is the first real use of the cross-domain "linking" building block from the framework doc. Not settable via CSV import — see below. |
| `notes` | text | No | Freeform |
| `checked` | boolean | No | Defaults `false` |
| `checked_at` | timestamp, nullable | No | Set when checked, cleared when unchecked |
| `position` | integer | System-managed | The single source of truth for display order. Updated directly by manual drag-and-drop (v1), rewritten in bulk after a pairwise comparison session (phase 2), or appended-to by a CSV import — see below. |
| `rating` | number (float) | System-managed | **Phase 2 only.** Elo-style rating used for pairwise comparison ranking. Defaults to `1500` on creation. Not used or shown anywhere until the comparison feature is built. |
| `comparison_count` | integer | System-managed | **Phase 2 only.** How many pairwise comparisons this item has been part of. Defaults to `0`. |
| `created_at`, `updated_at` | timestamp | System-generated | |

Since `assigned_to_contact_id` links to Contacts, assigning an item to a person means they need a Contact record first — in practice this works fine for household members and service providers already in the directory (e.g. assigning "call about the gutters" to the HVAC contact), and is a reasonable nudge to make sure family members have their own Contact records too.

## Bulk-adding via CSV import (v1)

**Resolved: CSV import is in v1**, but it works differently from Contacts' CSV import, because the two domains have opposite risk profiles.

**Contacts' import is a full-replace**: the imported file represents the complete intended state, anything missing from it gets soft-deleted, and that's safe specifically because Contacts has soft delete and full version history to fall back on. Lists have neither (see Retention, below) — items there get checked and deleted constantly through normal use, so treating a CSV import as "the complete state, remove anything not in this file" would be a real way to accidentally wipe out items someone already checked off or added since the file was exported. **So Lists' CSV import is append-only: importing a file adds items, full stop — it never removes or modifies anything already in the list.** This sidesteps the need for any of the diff-computation, soft-delete, or version-retention machinery Contacts' import required.

**Entry points** — both use the same underlying "add these items to this list" operation:
- **Starting a new list**: name the list, then optionally upload a CSV of items instead of quick-adding them one by one — the motivating case for this feature (e.g. a 40-item moving/packing checklist).
- **Adding to an existing list**: an "import items" action from within a list's detail view, for topping up an already-in-progress list.

**CSV schema** (deliberately minimal — this is for fast bulk entry, not full data portability):

| Column | Required? | Notes |
|---|---|---|
| `text` | **Yes** | The item itself |
| `quantity` | No | Freeform, e.g. "2 gallons" |
| `notes` | No | Freeform |

No `id`, `list_id`, `assigned_to`, or `checked` columns. `assigned_to_contact_id` specifically is left out of the CSV rather than accepting a freeform name and trying to match it to a Contact — fuzzy name-matching during import is a real source of silent mistakes (which "Sarah" did you mean?), and assigning the handful of items that need it is quick to do in-app after the bulk add.

**Validation**: reject rows missing `text`, with a row-level error message (same convention as Contacts: which row, what's wrong) — no silent partial failures. Unrecognized extra columns are ignored rather than rejected, to stay forgiving about pasted-together spreadsheets. Since nothing is ever removed, there's no diff to compute or confirm beyond a simple preview (e.g. "14 items will be added to 'Moving day packing list'") before committing.

**Imported items get the same defaults as any new item**: appended to the end of the list's current `position` order (in the order they appear in the file), `rating` defaults to `1500`, `comparison_count` defaults to `0`, `checked` defaults to `false`. This pairs naturally with the phase 2 pairwise comparison feature — a freshly bulk-imported 40-item list is exactly the kind of list that's hardest to prioritize by dragging, and easiest to prioritize by comparison.

**Reuse from Contacts, for Claude Code:** the CSV parsing library/utility, the file-upload UI, and the row-level validation-error convention are all reasonable to share with the Contacts import code, since the mechanics of "parse a CSV, validate rows, show errors" are identical. **What should not be reused wholesale is the import *pipeline* itself** — Contacts' diff/confirm/soft-delete engine doesn't apply here at all; Lists' import is a much simpler "validate then insert" operation. Sharing the parsing/validation layer while keeping the commit logic separate should keep the surface area down without forcing an ill-fitting full-replace model onto a domain that doesn't need it.

## Prioritization: manual drag-and-drop (v1) and pairwise comparison ranking (phase 2)

Two complementary ways to order a list's items. Both ultimately write to the same `position` field, so there's always one source of truth for display order — not two competing sort mechanisms fighting each other.

**v1 — manual drag-and-drop.** The only reordering mechanism required for the initial build. Dragging an item up or down rewrites `position` for the affected items, exactly as described above.

**Phase 2 — pairwise comparison ranking.** Not required for the initial build — flagging it here in full so the data model (the `rating` and `comparison_count` fields above) doesn't need to change later when this gets built. The problem it solves: manually dragging items into order gets hard once a list is long (say, 20+ house-project ideas, or a big CSV-imported list); repeatedly answering "which of these two matters more" is a much easier judgment, and an Elo-style rating turns a series of those small judgments into a full ranking.

How it's specified to work:
- **Comparison mode** presents two items from the same list at a time and asks which is more important, with a third option for "about equal." The user isn't required to compare every possible pair — they can stop at any point, and even a partial round of comparisons improves the ordering. Which pairs to surface and in what sequence (random, weighted toward items with a low `comparison_count` so far, etc.) is left to Claude Code's judgment as an implementation detail — it's not specified further here.
- **Rating update — standard Elo formula:**
  - Expected outcome for item A vs. item B: `E_A = 1 / (1 + 10^((R_B − R_A) / 400))`
  - After a result: `R_A' = R_A + K × (S_A − E_A)`, applied symmetrically to both items, where `S_A` = 1 if A was picked as more important, 0 if B was picked, or 0.5 for "about equal."
  - **K-factor: 32** — a standard, fast-converging value, appropriate here since any one list will only ever see a handful of comparisons, not thousands of competitive-game matches.
  - Both items' `comparison_count` increments by 1 regardless of outcome.
- After a comparison (or after a comparison session ends — Claude Code's call), items are re-sorted by `rating` descending and that order is written back into `position`. The list's actual displayed order and manual drag-and-drop both continue to just work off `position` — a pairwise-ranked list stays fully manually adjustable afterward, and a manually-reordered list can still be run through comparison mode later (its existing `rating` values are the starting point, not reset).
- New items added to a list that's already been through comparisons — whether added one at a time or via CSV import — start at the default `rating` of `1500`, so they get folded naturally into future comparison rounds rather than needing a separate onboarding step.
- Ratings are **scoped per list** — there's no cross-list comparison or global ranking. An item's `rating` only means something relative to other items in the same list.

## Retention: no soft-delete or version history — also a divergence from Contacts

Contacts keeps everything indefinitely (soft delete + full import version history) because CSV-driven bulk edits carry real risk of accidental mass changes, and contact data is meant to stay accurate over a long horizon. Lists don't share that risk profile — items are checked and unchecked dozens of times a day, and keeping a permanent trail of every checkbox toggle isn't useful. This is also exactly why Lists' CSV import is append-only rather than full-replace (see above) — it sidesteps the accidental-mass-deletion risk that makes Contacts' retention policy necessary in the first place.

**Recommendation (flagging as a decision, not assuming it silently): lists and list items are genuinely deleted when a user deletes them** — no soft delete, no version history. **Archiving a list** (see above) is the intended way to preserve useful history ("what did we get last time") without full audit-log overhead. Open to reconsidering if this turns out to matter in practice.

## No activity log — also a divergence from Contacts

Two reasons: (1) with no individual user accounts in v1, there's no way to attribute a specific edit to a specific person anyway — Contacts' own activity log already only tracks action/timestamp, not identity; (2) per-item logging would be extremely noisy given how often items get checked and unchecked. The "no gatekeeper" principle is still satisfied structurally — anyone with household access can add, edit, check off, or delete anything on any list, with no per-list ownership or restriction.

## Access model

Governed at the app level, same as every other domain — see `claude/product-framework.md`'s "Access & identity model." One shared household password, full read/write on everything, no per-domain or per-list tier in v1.

## Core features to build

1. **Active lists view** — all non-archived lists for the household, showing name, tags, and item count (e.g. "3 of 7 checked")
2. **Archived lists view** — separately accessible, not cluttering the active view
3. **Create / rename / archive / unarchive / delete a list**
4. **List detail view** — quick-add items, check/uncheck, edit quantity/assignee/notes inline, manually drag-to-reorder, delete an item
5. **CSV import** — bulk-add items to a new or existing list (append-only; see dedicated section above for schema and validation)
6. **Assign an item** — picker sourced from existing Contact records (reuses the Contacts domain's data, doesn't duplicate it)
7. **Filter/search lists** by name or tag
8. *(Phase 2, not required for the initial build)* **Pairwise comparison mode** — cycle through item pairs, record which is more important (or "about equal"), update Elo ratings, re-sort `position` by `rating`. Fully specified above so the initial build's schema already has the fields it needs.
9. *(Nice-to-have, not required for v1)* CSV export of a single list, for backup or sharing outside the app

## Out of scope for v1 (explicitly deferred, not forgotten)

- A Contacts-style **full-replace** CSV import (diff, confirm, soft-delete anything missing) — Lists' import is append-only instead; see above
- Activity log / audit trail
- Soft delete, version history, or "undo" beyond what archiving provides
- Recurring or template lists (e.g., duplicating a past grocery list to start a new one) — a strong v2 candidate, but not v1
- Auto-populating items from other domains (a recipe's ingredients flowing into a grocery list, a maintenance task spawning a to-do item) — deferred until Recipes/Maintenance actually exist, per the cross-domain-linking decision above
- Setting `assigned_to_contact_id` via CSV import (name-matching ambiguity — see above); assignment stays an in-app-only action
- Multiple assignees per item
- Notifications or due-date reminders tied to list items (the shared Reminders/schedule engine building block could hook in here eventually, but not now)
- Individual user accounts or per-person permissions beyond the shared household password
- The pairwise comparison ranking feature itself is phase 2, not v1 (see above) — the schema supports it from day one, but the comparison UI and rating logic don't need to be built in the first pass

## Open items worth a second look once this is being built

- **Quick-entry UX**: whether adding items supports pasting/typing several at once (e.g. one per line, auto-split into separate items) is a real usability question, but it's an implementation nicety Claude Code can reasonably decide rather than something that needs to be resolved here first.
- **Checked-item display**: default assumption is checked items stay visible (crossed out, probably sorted to the bottom) until the list is archived or deleted, rather than disappearing immediately — flagging as a default, not a firm requirement.
- **Pairwise comparison pair-selection strategy**: which pairs to show and in what order (random vs. weighted toward under-compared items) is intentionally left open — worth a second look once this phase is actually being built, but not a blocker now.
- **Duplicate detection on CSV import**: worth considering a light warning if an imported item's text exactly matches something already in the list (e.g. re-importing the same file twice) — not required for v1, but a cheap improvement if it comes up in practice.
