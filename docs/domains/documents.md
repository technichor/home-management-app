# Domain: Documents

Status: **Spec written 2026-10-22. Stages 1 to 3 (catalog, schema and logic; create, view, edit, delete; the overview and nav entry) built 2026-10-26/27 on the `documents` branch, not merged; migration 0032 not applied to production.** The overview's grouping (cards, the Whose filter, search) is pure, in `lib/documents.ts` (`documentCards`, `documentIsWhose`, `slotIsWhose`, `documentMatches`). A quiet category's Add chip opens the form with `?category=`, which lists that category's types first. This is v0.01: a directory of links, not file storage. Migration numbers below assume the next free number is 0032.

## What this domain is

One place to find the household's important documents, and a checklist of what a family *should* have on hand digitally. That checklist is the reason this beats a Google Drive folder: Domata knows that each person should have a passport and a birth certificate, and that each car should have a title and registration. So the page can say "Passports: 3 of 4" and offer an **Add link** button for the missing one.

**Domata stores links, not files.** The files stay wherever the family keeps them (Google Drive, Dropbox, OneDrive, iCloud). Each document in Domata is a title, a category, who or what it belongs to, and one or more links. This means v0.01 has no storage, encryption, upload or virus-scanning work to do. Who can open a file is decided by the service that holds it, not by Domata.

**It holds no sensitive values.** Like Accounts, there is no field for an ID number, SSN, policy number or account number. Those stay inside the file. Free-text fields get a warning (not a block) when something looks like one (see "Sensitive-number warning").

Access is the same as every other domain:
- Any signed-in member of the household reads and writes all of its own household's documents.
- The household comes from the session. Any id sent from the browser (a document, a member, an item, an account) is checked against it.
- Nothing is shared across households. Synced households never see each other's documents. This is a hard rule for now.

Deleting is a hard delete with a confirm, like Maintenance and Accounts. The file itself is untouched, since it lives somewhere else.

## Concepts

- **Document**: a household-owned record with a title, a category, an optional **type** from the catalog, and 1 to 5 links.
- **Catalog**: a fixed list of document types, defined in code (`lib/documentCatalog.ts`) and not editable by users. Each type has a stable `key`, a `label`, a `category`, a `scope`, and whether it is `suggested`. Types that aren't suggested still appear in the type picker. They just don't show up as unfilled slots on the page.
- **Scope** says what a suggested type is *per*:
  - `HOUSEHOLD`: one slot for the household (Will, Deed). It is filled by any document of that type.
  - `PERSON`: one slot per household member (Passport, Birth certificate). A slot is filled by a document of that type whose **Whose** is that member. "Household members" means the same list To-do uses (`lib/householdMembers.ts`), so it includes kids who have no login.
  - `VEHICLE`: one slot per Maintenance item whose category is `VEHICLE` (Title, Registration). A slot is filled by a document of that type whose **Item** is that vehicle.
- **Suggestion state** is computed, never stored. For each slot:
  - **added** if a matching document exists;
  - otherwise **dismissed** if the household said it doesn't apply;
  - otherwise **open**.
  - Adding a document wins over a dismissal. There is nothing to clean up.
- **Dismissal ("Doesn't apply")**: stored per type and per subject. For example, "Driver's license doesn't apply to Ellie", or "Deed doesn't apply to us" for renters. Dismissals can be restored.

### How documents connect to other modules

A document has three optional, independent links to other records. Each is a plain foreign key, so there is no polymorphism:

| Field | Points to | Meaning |
|---|---|---|
| `ownerContactId` | a household member (Contact) | **Whose** document it is. Null means the whole household. |
| `maintenanceItemId` | a MaintenanceItem | The **item** it is about: the Pacifica's title, the dishwasher's manual. |
| `accountRecordId` | an AccountRecord | The **account** it is about: the mortgage note, the car loan agreement. |

A document can use more than one of these. A car loan agreement can point at the Pacifica *and* the auto-loan account.

The Maintenance item, Account and member Contact pages each show a **Documents** panel. It lists the documents pointing at that record and has an **Add document** button. That button opens the same document form with the field pre-filled. So there is exactly one kind of record, and anything added from those pages also shows on `/documents`.

**Why using the `VEHICLE` category is fine.** The category is an explicit choice the user makes from a fixed list. Domata does not guess it from the item's name. The category only decides *which items get vehicle suggestions*. What actually ties a document to a car is the explicit `maintenanceItemId` on the document. If an item's category is later changed away from Vehicle, its documents stay linked, and the vehicle suggestions for it simply stop.

**Maintenance's `manualUrl` is folded in.** Today a manual link lives in its own field on the item. Stage 5 moves each one into a Document (type `manual`, linked to the item) and drops the field. After that, every link lives in one place.

## Catalog

The category enum (`DocumentCategory`) and its display order:

| Enum | Label |
|---|---|
| `IDENTITY` | Identity & vital records |
| `HOME` | Home & property |
| `VEHICLES` | Vehicles |
| `INSURANCE` | Insurance |
| `TAXES` | Taxes |
| `MONEY` | Money & accounts |
| `LEGAL` | Legal & estate |
| `MEDICAL` | Medical |
| `EDUCATION` | School & kids |
| `WORK` | Work |
| `POSSESSIONS` | Manuals, warranties & valuables |
| `OTHER` | Other |

Types, by category. "Suggested" means it shows as a slot on the page. Keys are permanent: never rename or reuse one, because they are stored on documents and dismissals. A label can change freely.

**Identity & vital records**

| Key | Label | Scope | Suggested |
|---|---|---|---|
| `birth-certificate` | Birth certificate | PERSON | ✓ |
| `social-security-card` | Social Security card | PERSON | ✓ |
| `passport` | Passport | PERSON | ✓ |
| `drivers-license` | Driver's license or state ID | PERSON | ✓ |
| `passport-card` | Passport card | PERSON | |
| `citizenship-certificate` | Citizenship or naturalization certificate | PERSON | |
| `trusted-traveler` | Global Entry / TSA PreCheck / NEXUS | PERSON | |
| `marriage-certificate` | Marriage certificate | HOUSEHOLD | ✓ |
| `divorce-decree` | Divorce decree | HOUSEHOLD | |
| `name-change` | Name change documents | PERSON | |
| `military-records` | Military records (DD-214) | PERSON | |
| `adoption-records` | Adoption records | PERSON | |
| `death-certificate` | Death certificate (a relative) | HOUSEHOLD | |

**Home & property**

| Key | Label | Scope | Suggested |
|---|---|---|---|
| `deed` | Deed or title | HOUSEHOLD | ✓ |
| `closing-documents` | Closing disclosure and settlement statement | HOUSEHOLD | ✓ |
| `mortgage-note` | Mortgage note | HOUSEHOLD | ✓ |
| `lease` | Lease agreement | HOUSEHOLD | ✓ |
| `property-tax-bill` | Property tax bill or assessment | HOUSEHOLD | ✓ |
| `home-improvement-records` | Home improvement receipts and contracts | HOUSEHOLD | ✓ |
| `title-insurance` | Title insurance policy | HOUSEHOLD | |
| `survey` | Survey or plat | HOUSEHOLD | |
| `refinance-documents` | Refinance documents | HOUSEHOLD | |
| `heloc-agreement` | HELOC agreement | HOUSEHOLD | |
| `home-appraisal` | Home appraisal | HOUSEHOLD | |
| `home-inspection` | Home inspection report | HOUSEHOLD | |
| `hoa-documents` | HOA documents (CC&Rs, bylaws, rules) | HOUSEHOLD | |
| `building-permits` | Building permits | HOUSEHOLD | |
| `home-warranty` | Home warranty contract | HOUSEHOLD | |
| `floor-plans` | Floor plans | HOUSEHOLD | |

Owners will dismiss Lease, and renters will dismiss the four ownership types. That is expected and is what dismissal is for.

**Vehicles** (every type here is VEHICLE scope)

| Key | Label | Suggested |
|---|---|---|
| `vehicle-title` | Title | ✓ |
| `vehicle-registration` | Registration | ✓ |
| `vehicle-insurance-card` | Insurance card | ✓ |
| `vehicle-loan-or-lease` | Loan or lease agreement | ✓ |
| `vehicle-purchase-agreement` | Purchase agreement or bill of sale | |
| `vehicle-warranty` | Warranty or service contract | |
| `vehicle-service-records` | Service records | |
| `vehicle-lien-release` | Lien release | |

**Insurance** (HOUSEHOLD scope)

| Key | Label | Suggested |
|---|---|---|
| `health-insurance-card` | Health insurance cards | ✓ |
| `home-insurance-policy` | Homeowner's or renter's policy | ✓ |
| `auto-insurance-policy` | Auto policy | ✓ |
| `life-insurance-policy` | Life insurance policy | ✓ |
| `dental-vision-cards` | Dental and vision cards | |
| `umbrella-policy` | Umbrella policy | |
| `disability-policy` | Disability policy | |
| `long-term-care-policy` | Long-term care policy | |
| `flood-policy` | Flood or earthquake policy | |
| `insurance-claim` | Claim records | |

**Taxes** (HOUSEHOLD scope)

There is no year field. A slot is filled by any document of that type, and the year goes in the title ("2025 W-2 – Corey").

| Key | Label | Suggested |
|---|---|---|
| `federal-tax-return` | Federal tax return | ✓ |
| `state-tax-return` | State tax return | ✓ |
| `w-2` | W-2s | ✓ |
| `form-1099` | 1099s | ✓ |
| `form-1098` | 1098 (mortgage interest) | |
| `form-1098-education` | 1098-T / 1098-E (tuition, student loans) | |
| `form-1095` | 1095 (health coverage) | |
| `charitable-receipts` | Charitable donation receipts | |
| `childcare-statements` | Childcare provider statements | |
| `estimated-tax-payments` | Estimated tax payments | |
| `tax-correspondence` | IRS or state letters | |

**Money & accounts**

| Key | Label | Scope | Suggested |
|---|---|---|---|
| `year-end-statements` | Year-end account statements | HOUSEHOLD | ✓ |
| `loan-agreement` | Loan agreement (student, personal) | HOUSEHOLD | |
| `pay-stubs` | Pay stubs | PERSON | |
| `social-security-statement` | Social Security statement | PERSON | |
| `stock-grants` | Stock option or RSU grants | PERSON | |
| `pension-documents` | Pension documents | PERSON | |
| `cost-basis-records` | Investment cost basis records | HOUSEHOLD | |

**Legal & estate** (HOUSEHOLD scope)

| Key | Label | Suggested |
|---|---|---|
| `will` | Wills | ✓ |
| `financial-poa` | Financial power of attorney | ✓ |
| `healthcare-directive` | Healthcare directive or power of attorney | ✓ |
| `guardianship-designation` | Guardianship designation for the kids | ✓ |
| `beneficiary-designations` | Beneficiary designations | ✓ |
| `trust` | Trust documents | |
| `prenuptial-agreement` | Prenuptial agreement | |
| `custody-agreement` | Custody agreement | |
| `court-order` | Court orders or settlements | |
| `business-formation` | Business formation (LLC, EIN letter) | |

**Medical** (PERSON scope)

| Key | Label | Suggested |
|---|---|---|
| `immunization-records` | Immunization records | ✓ |
| `medication-list` | Current medication list | |
| `allergy-action-plan` | Allergy or asthma action plan | |
| `vision-prescription` | Glasses or contacts prescription | |
| `medical-history` | Medical history summary | |
| `sports-physical` | Sports physical | |
| `school-health-form` | School health form | |

**School & kids**

| Key | Label | Scope | Suggested |
|---|---|---|---|
| `diploma` | Diplomas and degrees | PERSON | |
| `transcript` | Transcripts | PERSON | |
| `report-card` | Report cards | PERSON | |
| `test-scores` | Standardized test scores | PERSON | |
| `iep-504-plan` | IEP or 504 plan | PERSON | |
| `school-enrollment` | School enrollment documents | HOUSEHOLD | |
| `childcare-agreement` | Childcare or nanny agreement | HOUSEHOLD | |
| `activity-waivers` | Camp and activity forms and waivers | HOUSEHOLD | |

**Work** (PERSON scope)

| Key | Label | Suggested |
|---|---|---|
| `offer-letter` | Offer letter or employment contract | |
| `severance-agreement` | Severance or separation agreement | |
| `benefits-summary` | Benefits enrollment summary | |
| `professional-license` | Professional license or certification | |
| `retirement-rollover` | 401(k) rollover paperwork | |

**Manuals, warranties & valuables**

| Key | Label | Scope | Suggested |
|---|---|---|---|
| `home-inventory` | Home inventory photos or video | HOUSEHOLD | ✓ |
| `manual` | Manual | HOUSEHOLD | |
| `product-warranty` | Warranty | HOUSEHOLD | |
| `purchase-receipt` | Purchase receipt | HOUSEHOLD | |
| `valuables-appraisal` | Appraisal (jewelry, art, collectibles) | HOUSEHOLD | |

**Other** (HOUSEHOLD scope, none suggested): `membership` (Membership cards and contracts), `service-contract` (Service contract: internet, security, lawn care).

A document can also have **no type**. In that case it is a custom document, and the user picks its category. Custom documents never count toward suggestions.

Suggestions are deliberately limited to vehicles. Manuals, warranties and receipts can be attached to any Maintenance item, but no item other than a vehicle gets suggestion slots. Asking for a manual for every lamp would be noise.

## Schema (migration 0032, additive)

```prisma
enum DocumentCategory {
  IDENTITY
  HOME
  VEHICLES
  INSURANCE
  TAXES
  MONEY
  LEGAL
  MEDICAL
  EDUCATION
  WORK
  POSSESSIONS
  OTHER
}

// A household's important document, as links to where the file lives (Domata stores no files yet). `typeKey` is a key
// from lib/documentCatalog.ts (validated in Zod, not a DB enum, so the catalog can grow without a migration); null is
// a custom document. Holds no ID, policy or account numbers. ownerContactId null = the whole household.
model Document {
  id                String           @id @default(cuid())
  householdId       String
  household         Household        @relation(fields: [householdId], references: [id])
  title             String
  category          DocumentCategory
  typeKey           String?
  ownerContactId    String?
  owner             Contact?         @relation(fields: [ownerContactId], references: [id], onDelete: SetNull)
  maintenanceItemId String?
  maintenanceItem   MaintenanceItem? @relation(fields: [maintenanceItemId], references: [id], onDelete: SetNull)
  accountRecordId   String?
  accountRecord     AccountRecord?   @relation(fields: [accountRecordId], references: [id], onDelete: SetNull)
  originalLocation  String?
  notes             String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  links             DocumentLink[]

  @@index([householdId])
  @@index([ownerContactId])
  @@index([maintenanceItemId])
  @@index([accountRecordId])
}

// One link of a document (a license has a front and a back; a closing packet may be several files). http/https only.
model DocumentLink {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  url        String
  label      String?
  position   Int

  @@index([documentId])
}

// "Doesn't apply" for one suggestion slot. subjectKey is "household", "contact:<id>" or "item:<id>" (a string, because
// Postgres treats NULLs as distinct and a nullable-FK unique wouldn't hold).
model DocumentDismissal {
  id          String    @id @default(cuid())
  householdId String
  household   Household @relation(fields: [householdId], references: [id])
  typeKey     String
  subjectKey  String
  createdAt   DateTime  @default(now())

  @@unique([householdId, typeKey, subjectKey])
}
```

Add the back-relations on `Household`, `Contact`, `MaintenanceItem` and `AccountRecord`.

**When a linked record is deleted**, the document stays and the link becomes null (`SetNull`):
- A deleted vehicle's title becomes a household Vehicles document.
- A deleted account's documents keep their category.
- Dismissals for a deleted item or contact are orphaned and harmless. Optionally, delete them in the same transaction as the item or contact.

**A member who leaves the household** keeps their documents, shown with "(removed)" after the name, as To-do does. Suggestion slots exist only for current members.

**Leave room for real files.** Later, a `DocumentFile` table, with a `documentId` alongside `DocumentLink`, can add stored files without changing anything here.

## Rules

- **Validation** goes in a Zod schema in `lib/documents.ts`:
  - **title**: required, up to 200 characters.
  - **category**: required, and must equal the type's category when a type is set. The server sets it from the type and ignores whatever the browser sent.
  - **typeKey**: optional, and must be a catalog key.
  - **links**: 1 to 5. Each `url` is required, http or https only (`isHttpUrl` from `lib/urls.ts`, so it can never be a `javascript:` link), and up to 2,000 characters. Each `label` is optional, up to 50 characters.
  - **originalLocation**: up to 200 characters.
  - **notes**: up to 5,000 characters, plain text.
- **Scope requirements:**
  - A PERSON-scope type requires `ownerContactId`.
  - A VEHICLE-scope type requires `maintenanceItemId`, and that item's category must be `VEHICLE`.
  - Otherwise all three relation fields are optional.
- **Ownership checks**, on the server, for every create and edit:
  - `ownerContactId` must be a current member of the caller's household.
  - `maintenanceItemId` and `accountRecordId` must belong to the caller's household.
  - When editing, a document that already belongs to a removed member may keep that member.
- **Links** open in a new tab with `rel="noopener noreferrer"`. Each link shows its label, if any, and the link's host (e.g. `drive.google.com`), so people can see where it goes.
- **Sharing guidance.** The form shows one plain line: *"Domata saves the link, not the file. Who can open it is set where the file lives; for anything sensitive, share with specific people, not 'anyone with the link'."* Domata can't check a link's sharing settings in v0.01.
- **Sensitive-number warning.** If the title, a link label, the original location or the notes contains something that looks like an SSN (`\d{3}-?\d{2}-?\d{4}`) or a run of 8 or more digits, the form shows a warning: *"This looks like an ID or account number. Keep those in the file, not in Domata."* It does not block saving. URLs are not checked, since they are full of digits.
- **"Where the original is"** is free text, with an autocomplete offering: Fireproof safe, Safe deposit box, Filing cabinet, Attorney's office. A paper original often matters more than a scan.
- **Default title.** It is the type's label, plus " – <first name>" for a PERSON type or " – <item name>" for a VEHICLE type. It stays editable, and the default is filled in only while the user hasn't typed their own title.
- **Default type from the Maintenance panel.** Adding from a `VEHICLE` item starts with no type, and the type picker shows the Vehicles types first. Adding from any other item starts with type `manual`.

## Screens

### `/documents` (the overview)

- **Header**: "Documents (n)", **Add document**, a search box, and a **Whose** filter. The filter offers Everyone (the default), Household, or one member. Choosing a member shows only that member's documents and slots, which makes "Ellie's documents" one click away. The filter is remembered per device in browser storage, wrapped in try/catch, and the page works without it.
- **Summary line**: "31 of 45 suggestions added". Dismissed slots are left out of both numbers.
- **Category cards**, in catalog order: one column on a phone, two at 820px and up.
  - The card header shows the label and "added of suggested" (e.g. "4 of 9"). Categories with no suggestions show only a document count.
  - **Rows for suggested types**, in catalog order, each followed by that type's documents. Then the category's other documents (unsuggested types and custom documents), sorted by title.
  - **A HOUSEHOLD slot** shows either its document(s) or the type label with **Add link** and a ⋯ menu containing **Doesn't apply**.
  - **A PERSON or VEHICLE type** is one compact row. Example: "Passport · 2 of 4". Under it go the added documents (with the person or vehicle named), then a chip for each missing subject (**+ Bailey**, **+ Ellie**). Each chip has its own **Doesn't apply to Ellie**.
  - **A document row** shows its title and whose or which item it is. Each link has its own open button with the label or host. Clicking the title opens the document's page.
  - A card with more than 8 rows collapses behind **Show all**.
  - Categories with no documents and no open slots are moved to the end as a single compact row of "Add" chips, so the page leads with what needs attention.
- **Search**:
  - It matches the title, the type label, the member's name, the item's name and the account's name.
  - While there is a query, the cards are replaced by a flat list of matching documents.
  - Open slots whose type label matches are listed under "Not added yet", with **Add link**.
- **"Dismissed (n)"** is a link at the bottom. It opens a list of dismissed slots, each with **Restore**.
- **Empty household (no documents)**: the same cards, all slots open, and a one-line intro: *"A checklist of the documents families need to find in a hurry. Add a link to where each one lives (Google Drive, Dropbox, ...)."*

### `/documents/new`

The form. Every field can be pre-filled from the query string: `type`, `contact`, `item`, `account`, plus `returnTo`, which must be a same-site path and is checked like `?next=` on login.

The fields:
- **Type**: searchable, grouped by category, with "Custom (no type)" at the end.
- **Title**
- **Category**: shown only for a custom document.
- **Whose**: Household or a member. Required for PERSON types.
- **Item**: Maintenance items. VEHICLE types are required and only list vehicles.
- **Account**
- **Links**: rows of URL plus an optional label, with "Add another link" up to 5.
- **Where the original is**
- **Notes**

Saving returns to `returnTo`, or else to the new document's page.

### `/documents/[id]` and `/documents/[id]/edit`

**The detail page** shows:
- the title and category · type;
- Whose;
- the Item and Account, as links to their pages;
- each link as an open button;
- where the original is, and the notes;
- **Edit** and **Delete**. Delete uses a Popconfirm: *"Delete '<title>'? The file itself isn't touched."*

**The edit page** is the same form as `/documents/new`.

### Panels on other pages

Each of these pages gets a "Documents" section, listing its linked documents (title plus link buttons) and an **Add document** button that pre-fills the form and comes back afterwards:
- `/maintenance/[id]`: documents with this `maintenanceItemId`. For a vehicle, it also shows its open vehicle slots (**+ Title**, **+ Registration**, ...).
- `/accounts/[id]`: documents with this `accountRecordId`.
- `/contacts/[id]`, for household members only: documents with this `ownerContactId`, plus that person's open PERSON slots.

### Navigation

Add `documents` to `MODULES` in `components/navModules.tsx`, after Accounts. The label is "Documents", with a file icon. It is the ninth module, so on a phone it goes under More. Add `/documents` (and a document page) to the 375px no-overflow list in `e2e/home-and-mobile.e2e.ts`.

## Key files (to create)

- `lib/documentCatalog.ts`: the categories (labels, order) and the types. Pure data plus lookups (`typeByKey`, `typesInCategory`).
- `lib/documents.ts`:
  - the Zod schema;
  - `defaultTitle`;
  - `looksSensitive`;
  - (a link's host for display is `linkHost` in `lib/links.ts`, shared with Lists);
  - **`suggestionSlots(catalog, members, vehicles, documents, dismissals)`**: a pure function that returns every slot with its state. The overview, the counts and the panels all use it, so the counting rule exists in one place.
- `app/(app)/documents/{page,actions,DocumentsClient,DocumentForm}`, `new/page`, `[id]/{page,DocumentDetailClient}`, `[id]/edit/page`.
- `components/DocumentsPanel.tsx`: the shared panel for Maintenance, Accounts and Contacts.
- **Actions**:
  - `createDocumentAction`, `updateDocumentAction`, `deleteDocumentAction`;
  - `dismissSuggestionAction`, `restoreSuggestionAction`.
  - Each one calls `requireHouseholdId` first, checks ownership as above, and returns `{ ok: false, error }` through `lib/actionResult.ts` for expected failures.
- **Tests**: `tests/lib/documentCatalog.test.ts`, `tests/lib/documents.test.ts`, `tests/actions/documents.test.ts`, `tests/pages/documentsPages.test.tsx`, `tests/components/documentsUi.test.tsx`, `e2e/documents.e2e.ts`.

## Build stages

Work on a branch, and check in after each stage. Every stage must keep the gate green: 100% coverage, eslint, `tsc --noEmit`, `next build`, e2e.

1. **Catalog, schema and logic.**
   - Write `lib/documentCatalog.ts`, then `lib/documents.ts`, with `suggestionSlots` fully unit-tested. Cover HOUSEHOLD, PERSON and VEHICLE slots; dismissed versus added (added wins); removed members; non-vehicle items; custom documents not counting.
   - Write migration `0032_documents` (additive).
   - Catalog tests must also check that every key is unique, every key is kebab-case, and every category has a label.
2. **Create, view, edit, delete.**
   - The actions (with auth, ownership and cross-household tests for each) and `/documents/new`, `/[id]`, `/[id]/edit`.
   - The query-string pre-fill and `returnTo`.
   - The sensitive-number warning and the sharing line.
3. **The overview.**
   - `/documents`: category cards, slots, **Add link** going to the pre-filled form, dismiss and restore, Show all, search, the Whose filter, and the summary line.
   - The nav entry, and `/documents`, `/documents/new` and a document page in the 375px list.
   - e2e coverage: add a passport for one member, then see "1 of N"; dismiss a driver's license for a kid; restore it; search.
4. **Panels.**
   - Documents panels on the Maintenance item, Account and member Contact pages.
   - Vehicle slots on vehicle items, and person slots on member pages.
   - e2e coverage: add the Pacifica's title from its Maintenance page, then see it on `/documents` under Vehicles.
5. **Fold in `manualUrl`** (expand/contract, following the HANDOFF rule for dropping columns).
   - **(a)** Deploy code whose Prisma schema no longer has `MaintenanceItem.manualUrl`. Remove it from `lib/maintenance.ts`, the form and the detail page; the item's Documents panel replaces it.
   - **(b)** Then apply `00NN_maintenance_manual_to_documents` (the next free migration number at the time; Lists sharing may take 0033):
     - for each item with a `manualUrl`, insert a `Document` (title "<item name> manual", type `manual`, category `VEHICLES` if the item is a vehicle and `POSSESSIONS` otherwise, linked to the item) and one `DocumentLink` (label "Manual", position 0);
     - drop the column;
     - ids can be `gen_random_uuid()::text`, since any unique string works.
   - **(c)** Afterwards, `prisma migrate diff` must say "empty migration".
6. **Docs.**
   - Update `docs/HANDOFF.md`: routes, data model, the module count and what's built.
   - Update `docs/domains/maintenance.md`: manuals now live in Documents.
   - Mark this file built.

## Not built (on purpose)

- **Leaving out file storage** saves the hardest work in v0.01: uploads, encryption at rest, virus scanning, previews and OCR.
- **Cross-household sharing** of documents (including synced households), and Messaging attachments. Revisit both when file storage arrives.
- **Expiration dates**, renewal reminders and an "expiring soon" view.
- **Tax-year slots** ("2025 W-2s: 0 of 2"). Any W-2 fills the W-2 slot.
- **Per-account suggestions** (e.g. a Loan account suggesting a loan agreement), and suggestions for non-vehicle Maintenance items.
- **Pets**.
- **User-editable catalog**: no adding or renaming types. Custom documents cover the gap.
- **Soft delete and an activity log**: the file lives elsewhere, so a deleted record is cheap to re-add.
- **Checking a link's sharing settings**, and a Google Drive picker.
- **Per-person permissions**: every household member sees every document record. Whether they can open the file is up to where it lives.
- **CSV import/export**.

## Ideas for next (not decided)

- **Real file storage** (Vercel Blob or S3) with encryption at rest, re-authentication to open anything in Identity or Legal, an audit trail of who opened what, and per-person visibility, so a kid's login doesn't open a parent's passport. This is the security pass that also gates Accounts storing secrets.
- **A Google Drive picker** using the existing Google connection (a `drive.file` scope). It would let users choose a file instead of pasting a link, and would show its sharing state.
- **Expiration dates** on IDs, registrations and insurance cards, feeding a reminder or a to-do like Maintenance services.
- **An "Own or rent?" household setting** that dismisses the other group of Home slots in one step.
- **A printable "if something happens" summary**: what exists, and where each original is.
- **A "Documents" count in Home's Needs attention** ("6 suggested documents not added").

## Verify by hand

1. Open `/documents` with no documents and check that every category and slot is there, and that the per-person rows list every household member, kids included.
2. Add a passport for one person from the **+ name** chip. Check that the link opens in a new tab and that the row reads "1 of N".
3. On a phone, check that a long Drive URL doesn't widen the page, and that each link shows its host.
4. Dismiss "Driver's license" for a kid and "Lease" for the household. Check that both counts drop, then restore both from Dismissed.
5. From the Pacifica's Maintenance page, add its title. Check that it shows under Vehicles on `/documents`. Then delete the Pacifica, and check that the title stays as a household Vehicles document.
6. Type a 9-digit number in the notes and check that the warning shows and saving still works.
7. Check the overview in dark mode, and on a 375px screen.
