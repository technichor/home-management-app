// A stand-in for Google (sign-in, tokens and the Calendar API) for the browser tests, so the Google Calendar
// integration can be tested without a real Google account. Only what Domata uses is here, kept in memory.
//
// Sign-in shows a page asking which email to sign in as (the test types it); every account has its main calendar
// (id = the email), a "Work" calendar it owns and a read-only "Holidays" one. Access tokens are "at:<email>". An event
// with attendees is copied to each attendee's main calendar under the same id, as Google does with invitations.
// /_test/... lets a test add an event to a calendar and find events by title.
import { createServer } from "node:http";

export function startFakeGoogle(port) {
  const calendars = new Map(); // email -> Map(calendarId -> { id, summary, accessRole, primary?, backgroundColor })
  const events = new Map(); // calendarId -> Map(eventId -> event)
  const revoked = new Set();
  let next = 1;

  const account = (email) => {
    if (!calendars.has(email)) {
      calendars.set(
        email,
        new Map([
          [email, { id: email, summary: email, accessRole: "owner", primary: true, backgroundColor: "#4285f4" }],
          [`work.${email}`, { id: `work.${email}`, summary: "Work", accessRole: "owner", backgroundColor: "#0b8043" }],
          ["holidays", { id: "holidays", summary: "Holidays", accessRole: "reader", backgroundColor: "#7986cb" }],
        ]),
      );
    }
    return calendars.get(email);
  };
  const eventsOf = (calendarId) => {
    if (!events.has(calendarId)) events.set(calendarId, new Map());
    return events.get(calendarId);
  };
  // Invitations: a copy (without the organizer's private properties) on each attendee's main calendar.
  const invite = (event) => {
    for (const { email } of event.attendees ?? []) {
      const copy = { ...event };
      delete copy.extendedProperties;
      eventsOf(email).set(event.id, copy);
    }
  };
  const uninvite = (event) => {
    for (const { email } of event?.attendees ?? []) eventsOf(email).delete(event.id);
  };

  const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.x`;
  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const fail = (res, status, message) => json(res, status, { error: { code: status, message } });
  const read = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;
    const body = await read(req);

    // Sign-in: which account, then back to Domata with a code (or with error=access_denied).
    if (path === "/o/oauth2/v2/auth") {
      const p = url.searchParams;
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!doctype html><title>Sign in - Google</title>
        <form action="/o/oauth2/v2/approve">
          <label>Email <input name="email" /></label>
          <input type="hidden" name="redirect_uri" value="${p.get("redirect_uri")}" />
          <input type="hidden" name="state" value="${p.get("state")}" />
          <button name="answer" value="allow">Allow</button>
          <button name="answer" value="deny">Cancel</button>
        </form>`);
    }
    if (path === "/o/oauth2/v2/approve") {
      const p = url.searchParams;
      const back = new URL(p.get("redirect_uri"));
      back.searchParams.set("state", p.get("state"));
      if (p.get("answer") === "allow") back.searchParams.set("code", `code:${p.get("email").toLowerCase()}`);
      else back.searchParams.set("error", "access_denied");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (path === "/token" && req.method === "POST") {
      const p = new URLSearchParams(body);
      if (p.get("client_id") !== "e2e-client" || p.get("client_secret") !== "e2e-secret") return json(res, 401, { error: "invalid_client" });
      if (p.get("grant_type") === "authorization_code") {
        const email = p.get("code")?.replace(/^code:/, "");
        if (!email) return json(res, 400, { error: "invalid_grant" });
        account(email);
        revoked.delete(`rt:${email}`);
        return json(res, 200, { access_token: `at:${email}`, refresh_token: `rt:${email}`, expires_in: 3600, id_token: idToken(email) });
      }
      const refresh = p.get("refresh_token");
      if (!refresh || revoked.has(refresh)) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, { access_token: `at:${refresh.replace(/^rt:/, "")}`, expires_in: 3600 });
    }
    if (path === "/revoke") {
      revoked.add(new URLSearchParams(body).get("token"));
      return json(res, 200, {});
    }

    // For the tests: add an event to a calendar; find events by title (with the calendars they are on).
    if (path === "/_test/events" && req.method === "POST") {
      const { calendarId, event } = JSON.parse(body);
      const stored = { id: `seed${next++}`, status: "confirmed", htmlLink: `http://localhost:${port}/event`, ...event };
      eventsOf(calendarId).set(stored.id, stored);
      return json(res, 200, stored);
    }
    if (path === "/_test/events") {
      const summary = url.searchParams.get("summary");
      const found = [];
      for (const [calendarId, list] of events) for (const e of list.values()) if (e.summary === summary) found.push({ calendarId, event: e });
      return json(res, 200, found);
    }

    // The Calendar API, as the account the access token is for.
    if (!path.startsWith("/calendar/v3/")) return fail(res, 404, "Not Found");
    const email = (req.headers.authorization ?? "").replace(/^Bearer at:/, "");
    if (!email || !calendars.has(email)) return fail(res, 401, "Invalid Credentials");
    const mine = account(email);
    const api = path.slice("/calendar/v3".length);

    if (api === "/users/me/calendarList") return json(res, 200, { items: [...mine.values()] });
    if (api === "/calendars" && req.method === "POST") {
      const { summary } = JSON.parse(body);
      const id = `household${next++}@group.calendar.google.com`;
      mine.set(id, { id, summary, accessRole: "owner", backgroundColor: "#f4511e" });
      return json(res, 200, { id, summary });
    }
    const match = api.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!match) return fail(res, 404, "Not Found");
    const calendarId = decodeURIComponent(match[1]);
    const eventId = match[2] && decodeURIComponent(match[2]);
    const calendar = mine.get(calendarId);
    if (!calendar) return fail(res, 404, "Not Found");
    const list = eventsOf(calendarId);
    const canWrite = calendar.accessRole === "owner" || calendar.accessRole === "writer";

    if (req.method === "GET" && !eventId) return json(res, 200, { items: [...list.values()] });
    if (!canWrite) return fail(res, 403, "Forbidden");
    if (req.method === "POST" && !eventId) {
      const event = { ...JSON.parse(body), id: `ev${next++}`, status: "confirmed", htmlLink: `http://localhost:${port}/event` };
      list.set(event.id, event);
      invite(event);
      return json(res, 200, event);
    }
    if (!list.has(eventId)) return fail(res, 404, "Not Found");
    if (req.method === "PUT") {
      uninvite(list.get(eventId));
      const event = { ...JSON.parse(body), id: eventId, status: "confirmed", htmlLink: `http://localhost:${port}/event` };
      list.set(eventId, event);
      invite(event);
      return json(res, 200, event);
    }
    if (req.method === "DELETE") {
      uninvite(list.get(eventId));
      list.delete(eventId);
      res.writeHead(204);
      return res.end();
    }
    return fail(res, 405, "Method Not Allowed");
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
