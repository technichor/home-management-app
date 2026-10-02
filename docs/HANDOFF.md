# Handoff: current state of the Home Management App

Written 2026-10-01 so a new Claude Code session on another machine can pick up cleanly. Read this first, then `CLAUDE.md` (the original build brief) and `docs/domains/*.md` (per-domain requirements). Everything described here is committed to `main` and deployed.

## One-paragraph summary

A Next.js 16 / Prisma / Postgres app for a household. Three modules are built, tested and live in production: **Contacts & Households** (CSV import/export), **Lists** (items, drag reorder, CSV import, optional pairwise Elo ranking), and **Messaging** (group chats, private notes, and household-to-household "sync" with shared conversations). Production is https://home-management-app-tan.vercel.app. The owner has logged in successfully on production. **None of the Lists or Messaging screens have been exercised in a real browser yet** (only in automated tests); see "Verify by hand".

## Stack and tooling

- Next.js 16.3.7 (App Router, Turbopack), React 19, TypeScript, **Ant Design v6** (UI), iron-session v9 (signed cookie session), bcryptjs, Zod v4, papaparse, `@dnd-kit` (list drag reorder).
- Prisma 5.14 + PostgreSQL on Neon (via Vercel). Do not upgrade Prisma to v8; it is a different architecture.
- Tests: Vitest 5 + Testing Library + jsdom. `npm test`, `npm run test:coverage`.
- Hosting: Vercel project `home-management-app` (team `technichor`), auto-deploys from `origin/main` at https://github.com/technichor/home-management-app.
- Windows 11 dev machine, Node 24. Git Bash + PowerShell available.

## Quality bar (the owner cares about this)

- **100% coverage is enforced**: `vitest.config.mts` has thresholds of 100 for statements, branches, functions and lines over `lib/**`, `app/**`, `components/**`. `npm run test:coverage` exits non-zero if it drops. Keep it green.
- Also keep `npx eslint .` and `npx tsc --noEmit` clean, and `npx next build` passing before pushing. At handoff: 38 test files, 509 tests, all passing.
- The owner wants to move fast to production but also wants things tested. Working style that has been confirmed: work in stages, check in after each, commit with the `Co-Authored-By` trailer from the session's attribution reminder, and **push to `main` when a stage is verified** (the owner said "push all changes when possible").

## Environment variables

Set in Vercel (Production unless noted); locally in `.env` and `.env.local` (both gitignored; `.env.local.example` is the template):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres. **The same database is used for local dev and production.** Anything run against it from a dev machine (e.g. a migration) is a production change. |
| `SESSION_SECRET` | Signs the iron-session cookie. |
| `SETUP_CODE` | Required on `/setup` to create a household account; if unset, signup is closed. **Production only** (Preview deliberately has none). The value is a secret kept in Vercel (sensitive, not readable back) and by the owner. If lost: `npx vercel env rm SETUP_CODE production`, then re-add a new one. Never commit it. |

Vercel CLI: `npx vercel ...` (not installed globally). On a new machine run `! npx vercel login` in the Claude prompt (interactive). The repo's `.vercel/project.json` links it to the project.

## Architecture in brief

- **Household = tenant and login.** One shared password per household (bcrypt). Session = `{ householdId, householdSlug }` (`lib/session.ts`). `app/[slug]/(app)/layout.tsx` guards every authenticated route.
- **Each household account acts as one Contact** (`Household.accountContactId`): the sender of its messages and the "head" who answers sync invites. Everyone sharing the password appears as that person. Set at setup; existing accounts link one on `/[slug]/account`.
- **Contacts and households are shared across all accounts** (no per-household scoping). This is why signup is gated by `SETUP_CODE`. Real isolation between households would be a larger change.
- **Server actions are public endpoints.** Every action checks the session itself; list/messaging actions also check ownership/visibility. Several missing-auth bugs were found and fixed in the Contacts import and restore actions; do not add an action without an auth check and a test for it.

### Routes
```
/                              landing / redirect if logged in
/setup                         create a household account (needs SETUP_CODE, owner's name)
/[slug]                        household login
/invite/[token]                accept/decline a sync invite (public route; needs a logged-in household)
/[slug]/account                choose/create the Contact this account acts as
/[slug]/contacts               people list, filters; /[id] detail (+ sync card); /households, /households/[id];
                               /import (two-file CSV, diff + confirm); /removed (soft-deleted + restore);
                               /api/export?file=households|contacts
/[slug]/lists                  active lists; /archived; /[id] items; /[id]/compare (pairwise ranking)
/[slug]/messages               conversation list (?archived=1); /[id] conversation view
```

### Data model (prisma/schema.prisma; migrations 0001–0005 in prisma/migrations)
Household, Contact, ActivityLogEntry, ImportVersion (Contacts) · List, ListItem (`ListSortMode` MANUAL|PAIRWISE, `rating`, `comparisonCount`) · Sync, Conversation, Message (Messaging). Contacts use soft delete (`deletedAt`) and an activity log; Lists hard-delete (no soft delete, no activity log by design); Messages are soft-delete only and never edited.

### Key files
- `lib/csv.ts`, `lib/listCsv.ts` CSV parse/export/diff · `lib/elo.ts` Elo + pair selection · `lib/messaging.ts` **`conversationsVisibleTo`** (the one messaging access rule) · `lib/syncToken.ts` invite-token hashing · `lib/validations.ts` all Zod schemas.
- Server actions: `app/[slug]/(app)/{lists,messages,account}/actions.ts`, `contacts/import/actions.ts`, `contacts/removed/actions.ts`, `contacts/[id]/syncActions.ts`, `app/invite/[token]/actions.ts`, `app/setup/actions.ts`, `app/[slug]/actions.ts` (login/logout).

## What is built, and what is not

**Contacts & Households**: complete per `CLAUDE.md` (in-app add/edit forms were optional and are not built; CSV is the edit path).

**Lists**: complete per `docs/domains/lists.md`, including the pairwise Elo mode (a list is either manually sorted or pairwise, set per list; switching to pairwise keeps the order and resets all ratings to 1500). Not built: single-list CSV export (nice-to-have).

**Messaging**: stages 1–3 done per `docs/domains/messaging.md`. **Not built**: attachments (no file storage exists; `attachmentIds` is always empty), email delivery of invites (replaced by a copyable link), revoke UI (the REVOKED status exists only in the schema), any REVOKED history behavior.

## Known gaps and suggestions for next work

1. **Verify by hand** (see below), since only automated tests have run against Lists and Messaging.
2. **Attachments**: add storage (Vercel Blob is the natural fit) then wire `attachmentIds`.
3. **Login rate limiting**: the shared household password can be guessed repeatedly; no lockout or throttle exists.
4. **Tenant isolation**: contacts/households are global across accounts (see above).
5. **Invite links are bearer tokens**: whoever holds a pending link, from a logged-in household that isn't the inviter, can answer it; the invite email is only a label.
6. Real-time messaging is a 5s poll via `router.refresh()`; fine at this scale.
7. No end-to-end/browser tests exist. Component tests run in jsdom and cannot catch Next.js server-component problems (see gotchas).

## Verify by hand (not yet done in a browser)

1. Log in → **Account** → link or create the contact your household acts as (required before sending messages).
2. **Lists**: create a list, add items, drag to reorder, check items off, import a CSV, flip **Sort: Pairwise** and use **Prioritize**, search/filter.
3. **Messages**: create a group chat and send a message; archive/unarchive; start a "Note about a contact".
4. **Sync, end to end**: in a private window open `/setup`, create a **second household** (needs the setup code; the form also asks for the owner's name). In the main household open a contact outside the household, click **Request sync**, copy the link, open it in the second household, **Accept**. Both sides should then see a shared "A & B" conversation, with messages arriving within ~5s and each message labelled with its household. Also confirm the second household's first-ever visit to `/setup` with a wrong code says "Incorrect setup code."

## Gotchas and workflow notes (hard-won)

- **Migrations on Windows/Node 24**: `prisma migrate dev` and `prisma init` fail. The working method used for migrations 0003–0005: edit `schema.prisma`, run `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/NNNN_name/migration.sql` (this compares the live DB to the schema and prints the SQL), review it, apply with `npx prisma db execute --file <that file> --schema prisma/schema.prisma`, then re-run the diff to confirm it prints "empty migration". Remember the database is production.
- **`prisma generate` fails with `EPERM ... query_engine-windows.dll.node`** while `next dev` (or anything) holds the engine file. Stop the dev server first. Types may still regenerate even when this error prints.
- **Ant Design in server components**: dotted members (`Typography.Title`, `Form.Item`, `Space.Compact`, ...) are `undefined` in Server Components and cause a 500 only at request time. Use plain elements there (or put the UI in a `"use client"` component). `tests/lib/serverComponents.test.ts` fails if any server component uses a dotted JSX tag. Top-level antd components (Card, Button, Alert, Table, ...) are fine.
- **antd in jsdom tests**: responsive table columns need a `matchMedia` that returns `matches: true`; loading buttons keep a spinner in their accessible name (match with a regex like `/Apply 8 changes/`); `userEvent.click` installs its own clipboard stub (use `userEvent.setup()` then spy on `navigator.clipboard`); `required` file inputs block jsdom form submit (use `fireEvent.submit`).
- **Test harness**: component tests opt into jsdom with a `// @vitest-environment jsdom` docblock; shared setup is `tests/setup.tsx` (antd browser-API shims, a `Blob.text` polyfill, `next/link` stub). Mock `@/lib/db`, `iron-session`, `next/headers`, `next/navigation` per file. Pattern for server actions: mock prisma, make `$transaction` run the callback with the mock as `tx`.
- **Environment quirks**: `git add` prints CRLF warnings (harmless). Git Bash rewrites arguments that look like `/paths` in `echo`/`printf` labels. `sleep` followed by a command is blocked by the harness; poll with a loop or a background command instead. `next dev` rewrites a "This is NOT the Next.js you know" block into `CLAUDE.md`; it is committed and harmless.
- **Auto-mode permission classifier**: once it denied a harmless read-only `git diff`/`grep` (labelled "Production Deploy"). If that recurs, do not route around it; ask the owner to allow it (or confirm) and retry.
- **Coverage tip**: to list uncovered lines/branches, run `npx vitest run --coverage --coverage.reporter=lcov` and read `coverage/lcov.info` (`DA:` lines with 0, `BRDA:` entries with 0).
- **Production check after deploy**: `npx vercel ls` (status), `npx vercel logs <deployment-url> --no-follow` (runtime errors), and `curl` a few routes. Component tests will not reveal server-component or env problems; a real request will.

## How to resume in a new session

1. `git clone https://github.com/technichor/home-management-app.git` (or `git pull`), `npm install`.
2. Copy `.env.local.example` to `.env.local` and fill `DATABASE_URL` and `SESSION_SECRET` (pull them from Vercel: `npx vercel login`, then `npx vercel env pull .env.local`; `SETUP_CODE` is Production-only and sensitive, so it will not pull, which is fine for local dev unless you want to test `/setup`). Remember the DB is shared with production.
3. `npx prisma generate`, then `npm test` (expect 509 passing) and `npm run dev`.
4. Tell Claude: "Read docs/HANDOFF.md and continue", then pick from the suggestions above, or say what you want next.
