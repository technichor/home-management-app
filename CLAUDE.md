# Home Management App — Build Brief for Claude Code

> **Start here: read [`docs/HANDOFF.md`](docs/HANDOFF.md) first.** It is the current state of the project (what is built and deployed, environment, gotchas, what to verify, what to do next). Per-domain requirements are in `docs/domains/` (`lists.md`, `messaging.md`). The brief below is the original Phase 1 (Contacts & Households) spec; the app has since grown past it. Quality rules: keep `npm run test:coverage` at 100%, lint and `tsc` clean, and `next build` passing before pushing to `main` (it auto-deploys to Vercel).

This is the Claude Code equivalent of the AI Studio brief, adjusted for the fact that Claude Code doesn't come with a hosting/database platform built in — you need to provision those yourself, once, before or alongside handing this to Claude Code. Everything below is written so you can drop it into the repo (as `CLAUDE.md`, see below) and use it as Claude Code's standing context.

---

## Part 1: One-time setup you do yourself (outside Claude Code)

Claude Code can write all the application code, but a few things need a human clicking through web signup flows first, since they involve creating accounts and provisioning real infrastructure.

### Recommended stack, and why

| Piece | Recommendation | Why |
|---|---|---|
| Framework | **Next.js (TypeScript, App Router)** | One framework for both the UI and the backend (API routes/server actions) — no separate frontend/backend repos or deployments to coordinate. Extremely well-represented in Claude's training and in its own docs, so Claude Code will work with it fluently. |
| Hosting | **Vercel** | Built by the same team as Next.js; deploys straight from a GitHub push with zero config. Free "Hobby" tier is more than enough for a household-scale app. |
| Database | **Vercel Postgres** (Neon-backed) | Provisioned from the same Vercel dashboard as hosting — one account, one place to manage both, one connection string auto-injected as an environment variable. (Alternative if you'd like a friendlier data-browsing UI to poke at raw tables yourself: **Supabase**, also Postgres, also has a generous free tier — either works fine with everything below; Vercel Postgres just means one less account to manage.) |
| ORM / migrations | **Prisma** | Type-safe queries, a clear schema file that doubles as living documentation of your data model, and a clean migration workflow (`prisma migrate`) that Claude Code can run for you. |
| Styling | **Tailwind CSS** | Fast to build with, no separate design system needed for a prototype. |
| Auth / sessions | **`iron-session`** (or similar signed-cookie library) + **`bcrypt`** for password hashing | Matches the custom household-password model below — no need for a full auth provider (Auth0, Clerk, etc.) since there's no concept of individual user accounts yet. |
| CSV parsing | **`papaparse`** or **`csv-parse`** | Handles the two-file CSV import/export described below. |
| Validation | **`zod`** | Enforces the conditional required-field rules (e.g. `household_id` required only when `category = family_friend`) at the API boundary. |

### Setup steps

1. **Create the GitHub repo.** Empty repo is fine — Claude Code will scaffold into it. Keep it private, since it'll eventually hold real household data (even if only in a database, not the repo itself).
2. **Create a Vercel account** (sign up with your GitHub account — this makes step 3 trivial) at vercel.com.
3. **Import the GitHub repo into Vercel** (from the Vercel dashboard: Add New → Project → select the repo). It's fine that there's no app in it yet; Vercel will just wait for a first push with a working Next.js project.
4. **Provision the database.** In the same Vercel project, go to the Storage tab → Create Database → Postgres. This gives you a connection string automatically wired up as an environment variable (`POSTGRES_URL` or similar) — Vercel injects it into both your deployed app and, if you pull env vars locally (`vercel env pull`), your local dev environment too.
5. **Generate a session secret.** Any long random string (e.g. `openssl rand -base64 32` in a terminal) — this signs the household login session cookies. Add it to Vercel's environment variables (Project Settings → Environment Variables) as `SESSION_SECRET`, and to a local `.env.local` file for development (never commit this file — make sure `.gitignore` excludes it).
6. **Link Claude Code to the repo.** Clone the repo locally (or however your Claude Code setup connects to it) and start a session there.

### Give Claude Code the context

Save Part 2 of this document (everything below) as **`CLAUDE.md`** in the repo root before your first real Claude Code session on this project. Claude Code automatically reads `CLAUDE.md` at the start of every session in that repo, so you won't need to re-paste this context each time — this is the main practical difference from the AI Studio version of this brief, which had to be pasted once as an initial prompt.

A good first message to Claude Code, once `CLAUDE.md` is in place, is simply something like: *"Read CLAUDE.md and scaffold the Next.js project with Prisma and the database schema described. Set up the household login flow first, then the contacts CSV import/export."* Let it work in stages and check in after each — schema/migrations, then auth, then the contacts views, then CSV import/export — rather than asking for everything in one shot.

---

## Part 2: Project context (save as `CLAUDE.md`)

### What this is

One module of a larger home-management application being built for a single household (not a multi-tenant SaaS product aimed at the public, though the architecture happens to support other households using it too — see the access model below).

**This phase builds the Contacts & Households module only.** The full application will eventually add: home maintenance & appliance tracking, scheduling & calendar, meal planning & recipes, utility management, and financial account information. Don't build those now, but keep the data model extensible enough that they can be added later without a redesign — specifically, other domains will need to reference `Contact` and `Household` records (e.g., a maintenance record referencing the technician who did the work), so use a normal foreign-key/relation pattern in Prisma rather than anything that would make that awkward later.

Design principles worth keeping in mind while building:
- **No single gatekeeper.** Anyone with access to the household's data can read and write everything.
- **Built for real, moderate-scale usage**, not a public consumer product — dozens to low hundreds of contacts, not millions. Optimize for correctness and clarity over scale or premature performance work.

### Access & identity model

The whole application is organized around a **Household** — this is both the login/tenancy boundary *and* the contact-grouping concept described below. They are the same entity, not two separate systems.
- A `Household` has: a unique URL slug (e.g. `/becker-family`), a password (hashed with bcrypt, never stored or logged in plaintext), a display name, a mailing address, tags, notes, and a `head_of_household` reference.
- **Account creation:** a setup flow where a new visitor picks a display name, a URL slug (validate uniqueness), and a password. The creator becomes `head_of_household` — this field has no enforced behavior yet, it's a placeholder for future multi-admin support.
- **Login:** visiting `/[slug]` prompts for the password; on success, set a signed session cookie (via `iron-session`) so the user stays logged in across page loads until logout/expiry.
- **Authorization:** once authenticated to a household, full read/write access to everything belonging to it. No roles or per-person permissions yet.
- **Most `Household` records will have no account fields populated** — only a household explicitly "activated" via the creation flow gets a slug/password. Every other household (e.g., "The Reynolds Family," recorded just to group contacts you know) is a passive record.
- **Security:** account fields (`url_slug`, `password_hash`) must never appear in the CSV export/import feature, and must never be modifiable through that path.

### Data model (Prisma schema, conceptually)

**`Household`**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | String (cuid/uuid) | System-generated | |
| `displayName` | String | **Yes** | e.g. "The Reynolds Family" |
| `mailingAddress` | String? | No | The address every linked Family & Friends contact inherits |
| `tags` | String[] | No | |
| `notes` | String? | No | |
| `urlSlug` | String? unique | Only if activated as an account | |
| `passwordHash` | String? | Only if activated as an account | |
| `headOfHousehold` | String? | Only if activated as an account | Placeholder, no enforced behavior |
| `createdAt`, `updatedAt` | DateTime | System-generated | |
| `deletedAt` | DateTime? | System-generated | Soft delete marker — null means active |

**`Contact`**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | String | System-generated | |
| `householdId` | String? (FK → Household) | **Required if `category = FAMILY_FRIEND`; optional otherwise** | Enforce with Zod at the API layer, not just a DB constraint |
| `firstName`, `lastName` | String | **Yes** | |
| `nickname` | String? | No | |
| `category` | Enum: `FAMILY_FRIEND \| SERVICE_PROVIDER \| MEDICAL_SCHOOL \| HOUSEHOLD_ADMIN` | **Yes** | |
| `address` | String? | No, **only meaningful for non-`FAMILY_FRIEND` categories** | A `FAMILY_FRIEND` contact has no address of its own — display the linked household's `mailingAddress` instead |
| `phoneMobile`, `phoneHome`, `phoneWork` | String? | No | Fixed slots |
| `emailPrimary`, `emailSecondary` | String? | No | Fixed slots |
| `tags` | String[] | No | |
| `favorite` | Boolean | No | Default `false` |
| `relationshipNotes` | String? | No | e.g. "Bailey's friend from soccer" |
| `linkedFamilyMember` | String? | No | Which of *our own* household's members this contact is most associated with |
| `importantDate1`, `importantDate1Label`, `importantDate2`, `importantDate2Label` | Date?/String? | No | Fixed slots, 2 max |
| `notes` | String? | No | |
| `createdAt`, `updatedAt` | DateTime | System-generated | |
| `deletedAt` | DateTime? | System-generated | Soft delete marker |

**Conditional validation (enforce in a Zod schema used by both the CSV import and any future in-app form):**
- `category === 'FAMILY_FRIEND'` → `householdId` required; `address` ignored/blank.
- otherwise → `householdId` optional; `address` optional, used as-is.

**`ActivityLogEntry`**

| Field | Type | Notes |
|---|---|---|
| `id` | String | |
| `entityType` | Enum: `CONTACT \| HOUSEHOLD` | |
| `entityId` | String | |
| `action` | Enum: `CREATED \| UPDATED \| DELETED \| RESTORED` | |
| `changedFields` | Json? | Before/after or field list, for `UPDATED` |
| `source` | Enum: `CSV_IMPORT \| MANUAL` | |
| `timestamp` | DateTime | |

**`ImportVersion`**

| Field | Type | Notes |
|---|---|---|
| `id` | String | |
| `householdId` | String (FK) | Which household's data this import affected |
| `importedAt` | DateTime | |
| `summary` | Json | Counts/details of what changed |
| `contactsSnapshot` | Json | Full state of `contacts.csv` at this point, stored as JSON in Postgres (no separate blob storage needed for this prototype) |
| `householdsSnapshot` | Json | Same, for `households.csv` |

**Retention: nothing is ever auto-purged.** Soft-deleted records and all import versions persist indefinitely. Store snapshots as JSON columns (Postgres `jsonb`) rather than external file storage — keeps infrastructure to just the one database, no S3/blob service needed for this phase.

### Core features to build

1. **Household account creation & login** — create flow (display name, slug, password), login (`/[slug]` → password → session cookie), logout.
2. **Contacts list view** — active (non-deleted) contacts for the logged-in household; filter by category/tag/favorite; search by name; show name, category, favorite flag, primary phone/email, and (for `FAMILY_FRIEND` contacts) their household's display name.
3. **Contact detail view** — all fields, including the inherited household address (clearly labeled as inherited, not their own) for `FAMILY_FRIEND` contacts, plus that record's activity log.
4. **Household list & detail view** — all households (ours and passive ones), each showing display name, address, tags, notes, and linked `FAMILY_FRIEND` members. Visually distinguish our own (active-account) household from passive ones.
5. **CSV export** — two linked files, `contacts.csv` and `households.csv`, joined by `household_id`. Required columns unmistakable (e.g. leading `*` in headers or an accompanying instructions row/file). Account fields never included. Empty template on a brand-new household.
6. **CSV import** — the primary edit path for this phase (an in-app add/edit form is optional/nice-to-have, not required):
   1. Upload both files.
   2. Validate: required fields, the conditional `householdId` rule, and referential integrity (`household_id` in `contacts.csv` must exist in `households.csv` or be blank). Reject with specific row/column errors — never generic failures.
   3. Compute a diff (added/changed/removed for both files); specifically flag any household removal that would leave `FAMILY_FRIEND` contacts without an address.
   4. Show the diff in plain language; require explicit confirmation before committing.
   5. On confirm: apply changes, soft-delete anything removed, write an `ImportVersion` snapshot and `ActivityLogEntry` rows.
   6. Structurally guarantee our own household's account fields can't be touched by this path (they're not in the CSV at all — make sure no by-`id` matching logic could accidentally overwrite them anyway).
7. **Removed-items view** — list soft-deleted contacts/households with a restore action. No permanent-delete action needed yet.

### Explicitly out of scope for this phase

- The other five domains (maintenance, scheduling, meal planning, utilities, finances)
- Individual user logins, per-person permissions/roles beyond one shared household password
- A contact belonging to more than one household
- Automated import/sync from phone contacts or any external source
- Real-time conflict detection between simultaneous imports (confirmation-diff + soft-delete/versioning is the only safeguard for now)
- Cross-household federation/sync between two independently-run household accounts (don't preclude it in the data model, but don't build any sync logic)
- Messaging/communication features — this is a directory, not a chat tool
- Automatic purge of soft-deleted records or old import versions
- In-app "create new household inline" workflow — household management happens via the CSV for now

### Tone

This is a tool for one specific household, not a marketed product. Copy, empty states, and error messages should be plain and specific (name the actual row/column with a problem) rather than generic or marketing-toned.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
