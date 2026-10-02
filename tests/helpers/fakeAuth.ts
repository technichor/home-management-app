import { getIronSession } from "iron-session";

// A stand-in for the household helpers in @/lib/auth for tests that already mock iron-session:
// the household id comes from the mocked session's `householdId`, so a test signs a household in
// (or out) by mocking getIronSession; `contactId` is the contact the user acts as. (lib/auth itself is tested in tests/lib/auth.test.ts.)
async function sessionHouseholdId(): Promise<string | null> {
  const session: any = await getIronSession(undefined as any, {} as any);
  return session?.householdId || null;
}

async function required(): Promise<string> {
  const id = await sessionHouseholdId();
  if (!id) throw new Error("Not authenticated");
  return id;
}

async function sessionUser() {
  const session: any = await getIronSession(undefined as any, {} as any);
  if (!session?.householdId) return null;
  return {
    id: "u1",
    householdId: session.householdId,
    household: { id: session.householdId, displayName: "H", deletedAt: null },
  };
}

async function member() {
  const session: any = await getIronSession(undefined as any, {} as any);
  if (!session?.householdId) throw new Error("Not authenticated");
  return { id: "u1", email: "me@x.co", role: "OWNER", householdId: session.householdId, contactId: session.contactId ?? null };
}

export const fakeAuth = {
  requireMember: member,
  pageMember: member,
  getSessionUser: sessionUser,
  getHouseholdId: sessionHouseholdId,
  requireHouseholdId: required,
  pageHouseholdId: required,
};
