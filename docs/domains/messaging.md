# Domain: Messaging (channels)

Status: **Channels built** (replacing the earlier group chats, private contact notes and auto-created synced conversations). The earlier version of this spec was the owner's original brief; this one reflects the owner's request to work like Slack channels and the decisions made while building it.

## What this domain is

Messaging works like Slack channels. A **channel** has an explicit list of members, and only members can see it. Members are **user accounts**, from the person's own household and from households it is actively **synced** with. Syncing is the household-to-household handshake (unchanged); what it unlocks is that each household's people can be put in the other's channels.

## Rules

- **Visibility is membership only**, household owners included. One function decides it: `channelsFor(userId)` in `lib/messaging.ts`. Every messaging query and action goes through it; a channel the caller isn't in is reported as "not found".
- **Who can be added:** accounts in the creator's own household, and accounts in a household with an ACTIVE Sync to it (either side may have started it). A person with no account can't be in a channel.
- **Pairwise connection (added by us, not in the original request):** all households present in one channel must be the same household or have an ACTIVE Sync with each other. If A is synced with B and with C, but B and C aren't synced, a channel can't hold people from both B and C. This stops adding someone from exposing two households to each other. The check is `checkChannelMembers` in `lib/channels.ts`, run on create and on every add.
- **Creating:** any member can create a channel (a name and at least one other person). The creator becomes its **manager**.
- **Managing:** managers add and remove people and rename or archive/unarchive the channel. **Anyone can leave** a channel. If the last manager leaves, the longest-standing member becomes manager; if nobody is left the channel is archived.
- **General:** every household has one automatic `GENERAL` channel holding everyone in the household. People are added when they join (or found) the household and removed when they leave or are removed. It can't be left, renamed or archived, and it has no managers.
- **Leaving a household** removes the person from every channel they were in (including channels shared with other households).
- **Syncing creates no channel.** Accepting a sync only makes the two households eligible for each other's channels.
- **Senders** are the signed-in user (`Message.senderUserId`). A linked contact is no longer needed to send. A message whose sender account was deleted shows "Former member".
- Messages are text only, soft-delete only and never edited. Attachments are not built (no file storage).
- Email is only ever the sync/verification handshake; messages are never sent by email or SMS.

## Schema

**Sync**: unchanged (`initiatingHouseholdId`, `counterpartHouseholdId`, `relatedContactId`, `counterpartEmail`, `status` PENDING | ACTIVE | DECLINED | REVOKED, ...). A contact's "synced" status is derived from an ACTIVE Sync row.

**Conversation** (a channel): `id`, `kind` (CHANNEL | GENERAL), `householdId` (set for GENERAL), `createdById`, `name`, `archivedAt`, `createdAt`, `updatedAt`.

**ConversationMember**: `conversationId`, `userId`, `role` (MANAGER | MEMBER), `addedById`, `createdAt`; unique on (conversationId, userId).

**Message**: `id`, `conversationId`, `senderUserId` (nullable: set null if the account is deleted), `text`, `attachmentIds` (always empty), `deletedAt`, `createdAt`.

One General per household is enforced in code (`ensureGeneral`), not by a database constraint (Prisma can't express the partial unique index, and the migration diff would flag it).

## Where things are

- `lib/channels.ts`: candidates (`candidatesFor`), the connection rules (`allConnected`, `checkChannelMembers`), General (`ensureGeneral`, `addToGeneral`) and leaving (`leaveChannelTx`, `removeUserFromAllChannels`).
- `app/(app)/messages/actions.ts`: create, send, add/remove people, leave, rename, archive/unarchive. Expected failures come back as `{ ok: false, error }` (production builds hide the message of a thrown server-action error); only a missing session throws.
- UI: `/messages` (list, "New channel" with a household-grouped picker, `?archived=1`) and `/messages/[id]` (messages, People panel). The conversation view shows the latest 200 messages and polls every 5 seconds via `router.refresh()`.

## Explicitly out of scope

- Ending an **active** sync, and what happens to shared channels and history when it ends. (Revoking a *pending* invite is built.)
- Attachments, message editing, read receipts, typing indicators, reactions, @mentions, threading, search, push notifications.
- Per-household archiving of a shared channel (archiving is global).
- Messaging people without an account.

## Migration notes

Migrations 0017 (expand: new tables/columns and a backfill) and 0018 (contract: drop `scope`, `syncId`, `relatedContactId` and `senderContactId`) were split so the old code kept working until the new code was deployed. The backfill gave each household a General channel, turned old household conversations into channels of all their household's members (owners as managers), gave old synced conversations the members of both households, archived any private contact-note threads, and set `senderUserId` from each message's sender contact.
