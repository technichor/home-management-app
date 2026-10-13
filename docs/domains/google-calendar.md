# Google Calendar integration (experiment)

Status: **built, tested against a stand-in Google; waiting for the Google Cloud client** (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, see "Setting up Google" below). Until they are set, everything Google stays hidden: the Account and Household pages say "Google Calendar isn't set up for Domata yet", and the calendar works as before. Migration 0031 is additive.

## What it does

1. **Members' Google calendars on the household calendar.** Each member links their own Google account (Account page) and ticks which of their calendars the household sees. Their events then show on the Domata calendar, read-only, in the calendar's colour, with the owner's name. Clicking one opens it in Google. In a member's view (`?who=`), only that member's calendars show.
2. **Domata's events go to a household Google calendar.** An owner chooses one of their own Google calendars, or has Domata create one named "Domata · <household>" (Household page). Every event saved in Domata is then created in it, as that owner, with invitations sent by Google:
   - an event assigned to a member invites that member;
   - a whole-household event invites every member;
   - the calendar's owner is never invited (it is already their calendar).
   An invitee's address is their linked Google address, or the email they sign in with.
3. **"Create Google Calendar event"** is a checkbox on the event form, ticked by default. It only appears once the household has a Google calendar. Unticking it later removes the event from Google.

**Domata is the source.** Each save sends the whole event, so changes made in Google are overwritten by the next save in Domata. Deleting an event in Domata deletes it in Google. If someone deletes it in Google, the next save in Domata creates it again. Nothing is read back from the household calendar.

## Design

| Piece | Where |
|---|---|
| OAuth sign-in (authorization code, `access_type=offline`, `prompt=consent`), token renewal, Calendar API calls | `lib/google.ts` |
| Start and return of linking: a one-time `state` in the iron-session, compared in constant time and used up either way | `app/api/google/connect/route.ts`, `app/api/google/callback/route.ts` |
| Tokens are encrypted with AES-256-GCM under `TOKEN_ENCRYPTION_KEY`; the stored form is `v1:` + base64(iv, tag, ciphertext) | `lib/secretBox.ts` |
| What the Account and Household pages show | `lib/googleCalendar.ts`, `components/GoogleAccountCard.tsx`, `components/HouseholdGoogleCard.tsx` |
| Server actions (each checks the caller: a member for their own link, an owner for the household calendar and time zone) | `app/(app)/account/googleActions.ts`, `app/(app)/household/googleActions.ts` |
| Reading members' calendars for the calendar page | `lib/googleEvents.ts` |
| Sending Domata's events | `lib/googlePush.ts`, called from `app/(app)/calendar/actions.ts` after each create, update or delete |

Scopes asked for (never full calendar access):
- `openid` and `userinfo.email`, for which account it is;
- `calendar.calendarlist.readonly`, for the list of calendars;
- `calendar.events`, to read events and to write the household's;
- `calendar.app.created`, to create the household calendar (it covers only calendars Domata made).

### Schema (migration 0031, additive)

| Model / field | Notes |
|---|---|
| `GoogleConnection` | One per user (`userId` is the key; deleted with the user): `googleEmail`, `refreshToken` (encrypted), `accessToken` (encrypted), `accessTokenExpiresAt`, `needsReconnect`. |
| `GoogleSharedCalendar` | The calendars a member shows: `userId`, `calendarId`, `name` and `color`, copied from Google when saved. |
| `CalendarSettings.timeZone` | IANA zone, default `America/Chicago`. Domata's times are wall-clock times; Google needs a zone. Owners change it on the Household page. |
| `CalendarSettings.googleCalendarId/Name/UserId` | The household's Google calendar and whose account it is in. |
| `CalendarItem.toGoogle` | The checkbox, default true. |
| `CalendarItem.googleEventId` | The event Domata made. |
| `CalendarItem.googleSyncError` | Google's last error for this item (max 300 characters), shown on the item. |

### Rules and edge cases

- **Failures never block Domata.**
  - A failed send keeps the save and records the error on the item, where the detail dialog shows it.
  - A calendar that can't be read is named in a warning above the calendar, and the rest still show.
  - A refused refresh token sets `needsReconnect`. The member is then asked to connect again, and their calendars are skipped until they do.
- **No duplicates.** Events Domata made are left out of the members' calendars. They are matched by the stored `googleEventId` and by a private extended property `domataItemId` on the event. Invitees' copies share the event id. An event in two members' shared calendars shows once, by its `iCalUID`.
- **Times.**
  - An event without a time becomes an all-day Google event.
  - A timed event without an end lasts half an hour, as on the grid.
  - Repeats become an `RRULE` (`FREQ`/`INTERVAL`/`UNTIL`).
  - Google events are placed in the household's time zone.
  - A timed event that crosses midnight shows on its first day, ending at 23:59.
  - Multi-day all-day events show on each day.
- **Caching.** Reads are cached in memory for 60 seconds per calendar and range; the calendar polls every 30. Any send from Domata clears the cache.
- **Unlinking.** It revokes the token at Google (best effort) and deletes the tokens and shared calendars. If the household calendar was in that account, Domata stops sending events until an owner chooses another. Events already in Google stay.

## Setting up Google (owner, once)

1. At <https://console.cloud.google.com>, create a project (e.g. "Domata").
2. **APIs & Services → Library**: enable **Google Calendar API**.
3. **Google Auth Platform → Branding / Audience**: user type **External**, app name "Domata", your support email, authorized domain `domata.app`.
4. **Data access**: add the scopes listed above.
5. **Audience → publishing status**:
   - While it is **Testing**, add each member's Google address as a test user. Google expires refresh tokens after 7 days in Testing, so everyone would have to reconnect weekly.
   - For lasting links, **publish** the app. Without Google's verification, people see a "Google hasn't verified this app" screen they can click through ("Advanced → Go to Domata"). That is fine for a household.
6. **Clients → Create client → Web application**. Authorized redirect URIs:
   - `https://domata.app/api/google/callback`
   - `http://localhost:3000/api/google/callback` (for local development)
7. Put the client ID and secret in Vercel (Production) as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and in `.env.local`. `TOKEN_ENCRYPTION_KEY` is already set in both. Redeploy.

## Tests

- **Unit tests** cover every module with `fetch` mocked: `tests/lib/{secretBox,google,googleCalendar,googleEvents,googlePush}.test.ts`, `tests/routes/google.test.ts`, `tests/actions/google.test.ts`, `tests/components/googleCards.test.tsx`, plus the calendar UI and page tests.
- **Browser test** (`e2e/google.e2e.ts`) runs against a stand-in Google (`scripts/fakeGoogle.mjs`, started by `scripts/e2e.mjs`, reached through the `GOOGLE_*_URL` overrides). It covers:
  - linking, and cancelling a link;
  - sharing a calendar, and its event showing;
  - creating the household calendar;
  - an event sent with the right invitee, shown once;
  - unticking, which removes it from Google;
  - unlinking.

## Verify by hand (once the client is set)

1. Account page → **Connect Google Calendar** → sign in → tick a calendar → Save. Its events should show on the calendar within a minute.
2. Household page (owner) → create the household calendar. Add an event in Domata, assigned to another member. It should appear in Google, and that member should get an invitation.
3. Edit the event in Domata; Google should follow. Untick the box; the event should leave Google.
4. Unlink; the calendars should disappear from Domata.

## Not built

- Reading changes back from Google (two-way sync).
- Per-member choice of where their own events go.
- Push notifications from Google (the calendar polls instead).
- Per-occurrence exceptions.
