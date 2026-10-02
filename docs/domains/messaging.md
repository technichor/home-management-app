# Domain: Messaging & Group Chat

Status: **Stages 1–3 built and deployed** (see "Decisions made while building" at the bottom for where the build departs from or adds to this spec). This is the owner's original spec, kept so a new session has the requirements.

## What this domain is

A Household is like a Slack workspace: household members can always message each other. An external contact (someone in a different household) is only reachable once the two households mutually agree to "Sync": a household-to-household handshake, not a per-contact setting. Before sync, you can keep a private one-sided note thread against that contact; once synced, a real two-way conversation opens.

## Schema

**Sync**: `id`, `initiatingHouseholdId` (FK Household), `counterpartHouseholdId` (FK Household, nullable until the counterpart household is a real activated account), `relatedContactId` (FK Contact, required: the Contact in the initiating household's directory this sync is attached to), `counterpartEmail` (required: the email the invite was sent to), `status` (PENDING | ACTIVE | DECLINED | REVOKED), `createdAt`, `respondedAt`.
A contact's "synced" status is derived from an ACTIVE Sync row pointing at it. Never store it redundantly on Contact.

**Conversation**: `id`, `scope` (HOUSEHOLD | SYNCED), `householdId` (required if HOUSEHOLD), `syncId` (required if SYNCED), `relatedContactId` (nullable; set when it is a thread against one specific contact), `name` (required), `archivedAt` (nullable), `createdAt`, `updatedAt`.

**Message**: `id`, `conversationId`, `senderContactId` (FK Contact; always the Contact linked to whoever is logged in; no sender picker anywhere in the UI), `text`, `attachmentIds` (reuse an existing attachment model, or a simple array of uploaded-file references), `deletedAt` (soft delete only: never hard-delete a message, never allow editing after send), `createdAt`.

## Behavior rules

- Household-scope conversations: normal household access applies; anyone logged into that household can read/write.
- Synced-scope conversations: both households' members get full read/write once the Sync is ACTIVE. This is the one explicit exception to "a household only sees its own data."
- A household member with no account (e.g. a kid with no login) has no messaging access at all, same as every other domain.
- Starting a sync: initiated from an existing Contact record, by confirming/entering their email. Cannot sync with someone who is not already a Contact.
- Accepting/declining an incoming sync is a head-of-household action.
- When sync activates, create a brand-new SYNCED conversation. Do not convert or expose the pre-sync HOUSEHOLD-scope thread tied to that contact. That old private thread stays exactly as private as it was.
- Email is only ever the sync invitation handshake. All actual messaging is in-app/real-time. Never send messages by email or SMS.

## Features, in build order

1. Prisma schema + migration for Sync, Conversation, Message. **Done.**
2. Request sync from a Contact detail page (enter/confirm email, create a PENDING Sync, invite with accept/decline link). **Done** (copyable link instead of email; see below).
3. Accept/decline flow for the counterpart household (head of household only). On accept: set both household IDs, status ACTIVE, create the new SYNCED conversation. **Done.**
4. Conversation list: HOUSEHOLD and SYNCED conversations for the logged-in household, most-recent-message preview, sorted by recency. **Done.**
5. Start a private HOUSEHOLD-scope thread against an unsynced contact. **Done.**
6. Create a household group conversation (named; multiple can exist concurrently). **Done.**
7. Conversation detail: message list + composer; for SYNCED conversations, label which household each message came from, not just the sender's name. **Done.**
8. Send message (text + optional attachment); sender auto-set from session. **Text done; attachments NOT built** (no file storage exists).
9. Archive/unarchive a conversation (global, not per-household). **Done.**
10. Near-real-time delivery; polling is fine at this scale. **Done** (5s poll via `router.refresh()`).

## Explicitly out of scope (do not build)

- Per-contact or per-message-category privacy controls on sync (it is all-or-nothing)
- Actual email/SMS delivery of messages to non-users
- Any behavior for what happens to conversation history on REVOKED (the status exists in the schema, nothing more)
- Message editing, read receipts, typing indicators, reactions, @mentions, threading/replies, search
- Push notifications
- Per-household archiving of a shared synced conversation

## Decisions made while building

- **Who is "the logged-in Contact"?** The app has one shared password per household and no per-person identity, so the spec's "sender is the Contact linked to whoever is logged in" had nothing to resolve to. Decision (owner's choice): each household account links to **one Contact** (`Household.accountContactId`). Every message from that household shows that contact as sender, and that contact is the "head" who answers sync invites. Because everyone sharing the password acts as that one person, **any logged-in member of the counterpart household can accept/decline**. Setup now asks for the owner's first/last name and creates + links that contact; existing accounts link one on the **Account** page (`/[slug]/account`, "Account" button in the top bar).
- **Email:** no email provider exists. Decision (owner's choice): **no email is sent.** Requesting a sync shows a one-time copyable link (`/invite/<token>`) for the owner to send themselves. Only a SHA-256 hash of the token is stored (`Sync.inviteTokenHash`); "Get a new link" replaces it and invalidates the old one. The invite email is only a label; whoever holds the link, from a logged-in household that is not the inviter, can answer it.
- **Attachments:** not built (no storage). `Message.attachmentIds` exists and is always empty. Next step would be Vercel Blob.
- **Scope/FK pairing** (HOUSEHOLD needs householdId; SYNCED needs syncId) and "one open sync per contact" are enforced in application code, not DB constraints (`prisma db push` would drop constraints Prisma cannot express).
- **Visibility** is a single function, `conversationsVisibleTo(householdId)` in `lib/messaging.ts`: own HOUSEHOLD conversations, plus SYNCED ones whose Sync is ACTIVE and names the household on either side. Every messaging query and server action goes through it; a conversation the caller cannot see is reported as "not found".
- A pre-sync private note thread is only offered for contacts **outside** the household that are **not currently synced**; starting one for the same contact again reuses the open thread.
- Conversation view shows the latest 200 messages.
