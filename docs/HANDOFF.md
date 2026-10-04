# Handoff: current state of the Home Management App

Written 2026-10-01 (accounts section revised the same day, after the move to individual user accounts) so a new Claude Code session on another machine can pick up cleanly. Read this first, then `CLAUDE.md` (the original build brief) and `docs/domains/*.md` (per-domain requirements). **Branch status:** the individual-user-accounts work (everything about `User`, `/login`, `/signup`, invites, directory scoping below) lives on branch `user-accounts` and is **not yet merged or deployed**; `main` (production) still runs the old shared-household-password login. Migrations 0006–0016 are already applied to the shared database (they are additive, so the old code keeps working). Merge `user-accounts` to `main` after the manual check below.

## One-paragraph summary

A Next.js 16 / Prisma / Postgres app for a household. Three modules are built, tested and live in production: **Contacts & Households** (CSV import/export), **Lists** (items, drag reorder, CSV import, optional pairwise Elo ranking), and **Messaging** (group chats, private notes, and household-to-household "sync" with shared conversations). Production is https://home-management-app-tan.vercel.app. The owner has logged in successfully on production. **None of the Lists or Messaging screens have been exercised in a real browser yet** (only in automated tests); see "Verify by hand".

## Stack and tooling

- Next.js 16.3.7 (App Router, Turbopack), React 19, TypeScript, **Ant Design v6** (UI), iron-session v9 (signed cookie session), bcryptjs, Zod v4, papaparse, `@dnd-kit` (list drag reorder).
- Prisma 5.14 + PostgreSQL on Neon (via Vercel). Do not upgrade Prisma to v8; it is a different architecture.
- Tests: Vitest 5 + Testing Library + jsdom (`npm test`, `npm run test:coverage`) and Playwright browser tests (`npm run test:e2e`, in `e2e/`). The e2e runner (`scripts/e2e.mjs`) starts a throwaway Postgres from the `embedded-postgres` npm package, applies every migration from scratch, then builds and starts the app against it (a production build, as on Vercel); it sets `DATABASE_URL` itself, so it can never touch the real database. Emails are read from a file (`EMAIL_OUTBOX_FILE`, a seam in `lib/email.ts`). Covered: signup/confirm/login/lockout/reset/change password, household invites + join codes + removal, two-account isolation (contacts, exports, lists, conversations), contact/household add/edit/remove/restore, CSV round-trip, lists, messages, and two-household sync. CI (`.github/workflows/ci.yml`) runs lint, tsc, coverage and e2e on every push and PR. Chromium comes from `npx playwright install chromium`.
- Hosting: Vercel project `home-management-app` (team `technichor`), auto-deploys from `origin/main` at https://github.com/technichor/home-management-app.
- Windows 11 dev machine, Node 24. Git Bash + PowerShell available.

## Quality bar (the owner cares about this)

- **100% coverage is enforced**: `vitest.config.mts` has thresholds of 100 for statements, branches, functions and lines over `lib/**`, `app/**`, `components/**`. `npm run test:coverage` exits non-zero if it drops. Keep it green.
- Also keep `npx eslint .` and `npx tsc --noEmit` clean, and `npx next build` passing before pushing. At last check on `user-accounts`: 70 test files, 900 unit tests plus 40 browser tests, all passing.
- The owner wants to move fast to production but also wants things tested. Working style that has been confirmed: work in stages, check in after each, commit with the `Co-Authored-By` trailer from the session's attribution reminder, and **push to `main` when a stage is verified** (the owner said "push all changes when possible").

## Environment variables

Set in Vercel (Production unless noted); locally in `.env` and `.env.local` (both gitignored; `.env.local.example` is the template):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres. **The same database is used for local dev and production.** Anything run against it from a dev machine (e.g. a migration) is a production change. |
| `SESSION_SECRET` | Signs the iron-session cookie. |
| `RESEND_API_KEY` | Sends verification and password-reset email via Resend. **Set in Vercel Production** (sensitive); verified working on 2026-10-02. Unset = the email is only printed to the server log (local dev). |
| `EMAIL_FROM` | Sender. **Set in Vercel Production to `Home Management <noreply@domata.app>`**; `domata.app` is registered at Vercel (DNS on Vercel) and verified in Resend (records `send` MX + SPF TXT and `resend._domainkey` DKIM TXT, added to Vercel DNS automatically; verified 2026-10-04). A real send to a non-owner address was accepted that day (see `/admin/email`). Unset, it falls back to Resend's shared test sender `onboarding@resend.dev`, which only delivers to the Resend account owner (`corey.b.becker@gmail.com`) and refuses everything else with `403 You can only send testing emails to your own email address`. |
| `APP_URL` | Public site URL used in emailed links (never taken from the request's Host header). **Set in Vercel Production** to `https://home-management-app-tan.vercel.app`; update it if a custom domain is added. Falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then localhost. |

Vercel CLI: `npx vercel ...` (not installed globally). On a new machine run `! npx vercel login` in the Claude prompt (interactive). The repo's `.vercel/project.json` links it to the project.

## Architecture in brief

- **Users, not shared household logins.** Anyone can sign up at `/signup` (email + own password, bcrypt) and log in at `/login`. The session is just `{ userId }` (`lib/session.ts`, iron-session); the user's household is looked up in the database on every request (`lib/auth.ts`: `getSessionUser`, `requireMember`/`requireOwner`/`requireHouseholdId` for server actions, `pageMember`/`pageHouseholdId` for pages), so removing someone takes effect immediately. A user with no household is sent to `/onboarding` and can't use any feature until they create a household (they become its `OWNER`) or join one.
- **Joining a household:** an owner makes a single-use invite link (`/join/[token]`, 7-day expiry, token hash stored) on `/household`, or turns on a household join code that lets a household-less user *request* to join (owner approves). Users belong to at most one household. Owners can promote/remove members; members can leave; the last owner can't leave.
- **Each user acts as their own Contact** (`User.contactId`, created when they found/join a household; relink on `/account`). That contact is the sender of their messages.  The old shared-login columns (`Household.passwordHash`, `headOfHousehold`, `accountContactId`) were dropped in migration 0012.
- **Contacts and households are private to a household's directory** (`ownerHouseholdId` on Contact and Household; `lib/scope.ts` has the filters and ownership checks). Every list, detail, restore, export, import, sync and messaging lookup is scoped, and CSV rows can only reference the caller's own households. The account household itself has `ownerHouseholdId = null`; passive households it recorded point at it.
- **Admin area (superusers only), `/admin`:** `User.isSuperuser` (separate from the household OWNER/MEMBER role; migration 0015 made `corey.b.becker@gmail.com` the first). It lists every account (created, last login, last seen, confirmed, household), has a page per user, lets a superuser **start a password reset** for someone (email them a link, or create a one-time 24-hour link to copy and send by hand; the admin never sees or sets a password, and the user's completing it signs out their other devices), and **grant/revoke superuser** (re-asks the admin's own password, counts wrong guesses against the login limiter, can never remove the last superuser). Everything is written to `AdminAuditEntry` and shown under "Recent admin activity". **It must stay invisible to everyone else:** `app/admin/layout.tsx` AND every admin page call `pageSuperuser()`, which shows the ordinary 404 page (no redirect to login, even when signed out); every admin server action calls `requireSuperuser()` first; the "Admin" nav link is only rendered for superusers; the check reads the database on every request, so granting/revoking takes effect immediately. Known limit: Next's router *prefetch* response for `/admin` returns a content-free route skeleton, so someone crafting raw requests could tell an `/admin` segment exists (nothing else). "Last seen" is refreshed at most every 10 minutes (`lib/auth.ts`); "last login" on password login. **Email log (`/admin/email`):** every send attempt (recipient, subject, SENT / FAILED / NOT_SENT, the provider's message id or error text; never the body, since links in it are secrets) is recorded by `lib/email.ts` in `EmailLogEntry` (migration 0016; kept 30 days; logging can never block a send), with a "send a test email" tool that shows the provider's exact answer, and a "failed in 24h" count on the overview. **Why it exists:** forgot-password / verification pages say "Check your email" even when sending fails (by design, so they can't reveal which addresses exist), and Vercel keeps runtime logs only ~1 hour, so a refused send was invisible. `e2e/admin.e2e.ts` covers all of this (it promotes users straight in the test database via `makeSuperuser`).
- **No household name in URLs.** Every page lives at the same address for every household (`/home`, `/contacts`, `/lists`, `/messages`, `/account`, `/household`, ...); the data always comes from who you're signed in as (`app/(app)/layout.tsx` guards the whole group). Sharing a link to a record only works for people in the same household. `app/not-found.tsx` is the 404 page. The old `Household.urlSlug` column was dropped in migration 0013. **Rule for dropping a column:** first deploy code whose Prisma schema no longer has it (the column can sit unused), and only then apply the drop migration; dropping it while the running code still reads it breaks every query that loads that table.
- **Server actions are public endpoints.** Every action checks the session itself; list/messaging actions also check ownership/visibility. Several missing-auth bugs were found and fixed in the Contacts import and restore actions; do not add an action without an auth check and a test for it.

### Routes
```
/                              landing / redirect if logged in
/signup  /login                email + password (accept `?next=` for a same-site path)
/onboarding                    create a household or ask to join one (user with no household)
/join/[token]                  accept a household invite (needs login; goes through /login?next=)
/invite/[token]                accept/decline a sync invite (needs a user in a household)
/household              members, invite links, join code + requests, leave
/account                choose/create the Contact the signed-in user acts as; change email; change password
/admin  /admin/users/[id]     SUPERUSERS ONLY (404 for everyone else): all users, per-user details, password reset links, grant/revoke superuser, audit log
/change-email/[token]          confirm a new login email (opened from the email sent to the new address)
/home                         HOME (signed-in dashboard: recent messages, lists + progress, upcoming birthdays/anniversaries in 30 days, favorites, quick actions); where login, signup, invite-accept and household creation all land
/contacts               people list, filters; /new add form; /[id] detail (+ sync card), /[id]/edit; /households, /households/[id];
                               /import (two-file CSV, diff + confirm); /removed (soft-deleted + restore);
                               /api/export?file=households|contacts
/lists                  active lists; /archived; /[id] items; /[id]/compare (pairwise ranking)
/messages               conversation list (?archived=1); /[id] conversation view
```

### Data model (prisma/schema.prisma; migrations 0001–0016 in prisma/migrations)
User (+ `UserRole`), HouseholdInvite, JoinRequest (accounts) · Household, Contact, ActivityLogEntry, ImportVersion (Contacts) · List, ListItem (`ListSortMode` MANUAL|PAIRWISE, `rating`, `comparisonCount`) · Sync, Conversation, Message (Messaging). Contacts use soft delete (`deletedAt`) and an activity log; Lists hard-delete (no soft delete, no activity log by design); Messages are soft-delete only and never edited.

### Key files
- `lib/csv.ts`, `lib/listCsv.ts` CSV parse/export/diff · `lib/elo.ts` Elo + pair selection · `lib/messaging.ts` **`conversationsVisibleTo`** (the one messaging access rule) · `lib/syncToken.ts` invite-token hashing · `lib/validations.ts` all Zod schemas.
- Server actions: `app/(app)/{lists,messages,account}/actions.ts`, `contacts/import/actions.ts`, `contacts/removed/actions.ts`, `contacts/[id]/syncActions.ts`, `app/invite/[token]/actions.ts`, `app/join/[token]/actions.ts`, `app/onboarding/actions.ts`, `app/signup/actions.ts`, `app/login/actions.ts`, `app/(app)/household/actions.ts`.

## What is built, and what is not

**Contacts & Households**: complete per `CLAUDE.md` (in-app add/edit/remove forms: `/contacts/new` and `/[id]/edit`, validated by `contactFormSchema`, scoped to the household's directory, logged to the activity log as MANUAL; CSV import also still works). Households have the same: `/contacts/households/new` and `/[id]/edit` (`householdFormSchema`; the household you're logged in as can be edited but not removed; removing one warns how many Family & Friend contacts lose their inherited address).

**Lists**: complete per `docs/domains/lists.md`, including the pairwise Elo mode (a list is either manually sorted or pairwise, set per list; switching to pairwise keeps the order and resets all ratings to 1500). Not built: single-list CSV export (nice-to-have).

**Messaging**: stages 1–3 done per `docs/domains/messaging.md`. **Not built**: attachments (no file storage exists; `attachmentIds` is always empty), email delivery of invites (replaced by a copyable link), ending an **active** sync (only a *pending* invite can be revoked, from the Messaging sync card on the contact page: `revokeInviteAction`; the link then stops working and the sender can invite again) and any decision about what happens to conversation history if an active sync is ended.

## Known gaps and suggestions for next work

1. **Verify by hand** (see below). Accounts, Lists and Messaging have only had automated tests.
2. **First owner for the existing household:** run `scripts/adopt-household.mjs` once (usage in the file) to create your user in the pre-accounts household; after that, everyone else signs up and is invited.
3. **Login rate limiting** is in (`lib/rateLimit.ts`, `AuthAttempt` table, migration 0009): 5 failed logins per email or 30 per IP in a sliding 15 minutes locks that key out; a success clears the email's count. Not covered: signup and join-code guessing. Signed-in users can change their password on `/account` (needs the current one; wrong guesses count against the login limiter; ). A change also signs out every other session (`User.passwordChangedAt` vs the session's `issuedAt`). **Forgotten password:** `/forgot-password` emails a single-use link (`/reset-password/[token]`, 1 hour, hash stored; newest link only; same answer for unknown emails; 3 requests/hour per email and 10 per IP); a reset also signs out other sessions and clears lockouts. Email goes through `lib/email.ts` (Resend REST API). **Email verification:** signup emails a single-use link (`/verify-email/[token]`, 24h, hash stored; confirm button); until confirmed a user is held on `/verify-email` and can't create/join a household (`isUnverified` in `lib/auth.ts`, checked in `homePathFor` and the create/join/accept actions; resends are rate limited like resets). Users that existed before it (migration 0011) were marked verified, and `scripts/adopt-household.mjs` creates verified users. A password reset also verifies. **Changing your login email** (account page, `requestEmailChangeAction`): needs the current password (wrong guesses count against the login limiter) and a free address; a single-use link (`/change-email/[token]`, 1 hour, hash stored, newest request replaces older) goes to the NEW address, and the email only changes when it is opened (no login needed; the new address then counts as verified). The OLD address is sent a notice naming both. Other sessions are not signed out. Rate limited like reset requests (3/hour per user, 10/IP). Table `EmailChangeToken` (migration 0014) (no email delivery exists; invites are copyable links), so a lost password needs a manual fix. Note a lockout can be triggered against someone else's email by an attacker (15 minutes at most).
4. **Attachments**: add storage (Vercel Blob is the natural fit) then wire `attachmentIds`.
6. **Sync invites** are bearer tokens: whoever holds a pending link, from a user in a household that isn't the inviter, can answer it; the invite email is only a label.
7. Real-time messaging is a 5s poll via `router.refresh()`; fine at this scale.
8. Not covered by browser tests yet: drag-reorder and pairwise ranking in Lists, list CSV import, the live 5-second message polling, archive/unarchive, private contact notes, and touch-drag reordering on a real phone (the browser tests only check layout at 375px, not a real iOS/Android device).

## Verify by hand (not yet done in a browser)

1. Run the adopt script, then log in at `/login`. Check Contacts/Lists/Messages show your existing data.
2. **Second user:** in a private window sign up at `/signup`; you should land on `/onboarding` and be blocked from everything else. Create a household there (separate directory: it must NOT see the first household's contacts), or join the first one via an invite link (`/household` → Create invite link) or via its join code + owner approval.
3. **Lists**: create a list, add items, drag to reorder, check items off, import a CSV, flip **Sort: Pairwise** and use **Prioritize**, search/filter.
3a. **Households**: Add household, edit its name/address/tags/notes, remove and restore a passive one; your own household has no Remove.
3b. **Contacts**: Add contact (Family & Friend needs a household; others show an Address field), edit it, check the activity log shows the change, remove it and restore it from Removed; a household member's own profile can't be removed.
4. **Messages**: group chat, send a message (shows your own name), archive/unarchive, a "Note about a contact".
5. **Sync, end to end**: two separate households. In one, open a contact and **Request sync**, copy the link, open it as a user of the other household, **Accept**. Both see a shared conversation; messages arrive within ~5s labelled with their household.

## Mobile / responsive

The shell is responsive through classes in `app/globals.css` (not inline styles, so media queries work): `.app-nav` / `.app-nav-top` (top bar wraps; the household name hides under 480px), `.tab-strip` (a horizontally scrolling, never-wrapping tab row used by the main nav and the Contacts/Lists sub-navs; "coming soon" tabs get `.tab-soon` and are hidden under 640px), `.app-container` (padding 24px, 16/12px on phones), `.fill-on-mobile` (filter controls fill the row), `.mobile-only` (extra summary line under a contact's name where table columns are hidden), `.home-grid` (cards: 1 column on a phone). On phones inputs are forced to 16px so iOS Safari doesn't zoom on focus, and `pointer: coarse` devices get 40px buttons / 44px tabs. The drag handle in lists has `touch-action: none`. `e2e/home-and-mobile.e2e.ts` loads every screen at 375px and fails if any is wider than the screen; keep that green when adding pages (add the new path to its list).

## Gotchas and workflow notes (hard-won)

- **Migrations on Windows/Node 24**: `prisma migrate dev` and `prisma init` fail. The working method used for migrations 0003–0005: edit `schema.prisma`, run `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/NNNN_name/migration.sql` (this compares the live DB to the schema and prints the SQL), review it, apply with `npx prisma db execute --file <that file> --schema prisma/schema.prisma`, then re-run the diff to confirm it prints "empty migration". Remember the database is production.
- **`prisma generate` fails with `EPERM ... query_engine-windows.dll.node`** while `next dev` (or anything) holds the engine file. Stop the dev server first. Types may still regenerate even when this error prints.
- **Ant Design in server components**: dotted members (`Typography.Title`, `Form.Item`, `Space.Compact`, ...) are `undefined` in Server Components and cause a 500 only at request time. Use plain elements there (or put the UI in a `"use client"` component). `tests/lib/serverComponents.test.ts` fails if any server component uses a dotted JSX tag. Top-level antd components (Card, Button, Alert, Table, ...) are fine.
- **antd in jsdom tests**: responsive table columns need a `matchMedia` that returns `matches: true`; loading buttons keep a spinner in their accessible name (match with a regex like `/Apply 8 changes/`); `userEvent.click` installs its own clipboard stub (use `userEvent.setup()` then spy on `navigator.clipboard`); `required` file inputs block jsdom form submit (use `fireEvent.submit`).
- **Test harness**: component tests opt into jsdom with a `// @vitest-environment jsdom` docblock; shared setup is `tests/setup.tsx` (antd browser-API shims, a `Blob.text` polyfill, `next/link` stub). Mock `@/lib/db`, `iron-session`, `next/headers`, `next/navigation` per file. Pattern for server actions: mock prisma, make `$transaction` run the callback with the mock as `tx`.
- **Environment quirks** (from the Windows machine; may not apply elsewhere): `git add` prints CRLF warnings (harmless). Git Bash rewrites arguments that look like `/paths` in `echo`/`printf` labels. `sleep` followed by a command is blocked by the harness; poll with a loop or a background command instead. `next dev` rewrites a "This is NOT the Next.js you know" block into `CLAUDE.md`; it is committed and harmless.
- **Auto-mode permission classifier**: once it denied a harmless read-only `git diff`/`grep` (labelled "Production Deploy"). If that recurs, do not route around it; ask the owner to allow it (or confirm) and retry.
- **Coverage tip**: to list uncovered lines/branches, run `npx vitest run --coverage --coverage.reporter=lcov` and read `coverage/lcov.info` (`DA:` lines with 0, `BRDA:` entries with 0).
- **Production check after deploy**: `npx vercel ls` (status), `npx vercel logs <deployment-url> --no-follow` (runtime errors), and `curl` a few routes. Component tests will not reveal server-component or env problems; a real request will.

## How to resume in a new session

1. `git clone https://github.com/technichor/home-management-app.git` (or `git pull`), `npm install`.
2. Copy `.env.local.example` to `.env.local` and fill `DATABASE_URL` and `SESSION_SECRET` (pull them from Vercel: `npx vercel login`, then `npx vercel env pull .env.local`; Remember the DB is shared with production.
3. `npx prisma generate`, then `npm test` (expect ~600 passing) and `npm run dev`.
4. Tell Claude: "Read docs/HANDOFF.md and continue", then pick from the suggestions above, or say what you want next.
