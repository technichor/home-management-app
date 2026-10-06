# Domain: Accounts

Status: **MVP placeholder, on branch `accounts-inventory` (not merged).** Migration 0026 is additive. There is no full requirements doc yet.

## What this domain is

A directory of the accounts a household has, so none is forgotten: bank, credit card, loan or mortgage, investment, retirement, HSA/FSA, insurance, utility, subscription, other. Each record says what it is, which institution, whose it is (a household member or the whole household), and what to do about it. The motivating case: two HSAs with balances and two old 401ks that should be rolled into IRAs are easy to forget; once they are listed, they aren't.

**It deliberately holds no secrets and no money.** There is no field for a password or a balance, and the account number is capped at its last four characters (`lib/accounts.ts`, enforced in the Zod schema and shown as a warning on the form), so a full number can't be saved by accident. Passwords, balances and any stronger sensitive data should wait until the app's security is ready for them (encryption at rest, an audit trail, re-authentication to reveal).

Access is like every other domain: any signed-in household account reads and writes everything of its own household; the household comes from the session, and an id sent from the browser (the record, the owner) is checked against it. Deleting is a hard delete; to keep a record, set its status to Closed.

## Schema (migration 0026)

`AccountRecord`: `householdId`, `name`, `kind` (`AccountKind`), `status` (`AccountStatus` ACTIVE \| REVIEW \| CLOSED), `institution`, `lastFour`, `ownerContactId` (nullable, `onDelete: SetNull`; null = whole household), `website` (http/https only), `phone`, `notes`.

## Screens

`/accounts` (search by name, institution or owner; filter by kind and status; "Open accounts" is the default, hiding Closed; a note when any are marked to review), `/accounts/new`, `/accounts/[id]`, `/accounts/[id]/edit`. Accounts is the seventh module, so on a phone it is under More. Its nav label is "Accounts", next to the existing "Account" (your own login, under More); rename one if that is confusing.

## Key files

`lib/accounts.ts`, `lib/urls.ts` (`isHttpUrl`; Maintenance has its own copy on its branch, to merge into this one); `app/(app)/accounts/{page,actions,AccountsClient,AccountForm}`, `[id]/{page,AccountDetailClient}`, `[id]/edit/page`, `new/page`. Tests: `tests/lib/accounts.test.ts`, `tests/actions/accounts.test.ts`, `tests/pages/accountsPages.test.tsx`, `tests/components/accountsUi.test.tsx`, `e2e/accounts.e2e.ts`.

## Ideas for next (not built, not decided)

- A review date and a reminder on the Calendar ("review this account in March"), and a "last reviewed" stamp.
- Link an account to a Contact (the advisor or agent), and to a Maintenance item or a bill.
- Renewal dates for insurance and subscriptions, and a monthly cost, for a "what do we pay for" view.
- Beneficiaries and who-to-call-if-something-happens notes (the estate-planning use), likely a separate, more protected area.
- CSV import/export like Contacts and Lists; a printable summary.
