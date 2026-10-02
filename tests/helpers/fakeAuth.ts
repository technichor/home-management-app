import { getIronSession } from "iron-session";

// A stand-in for the household helpers in @/lib/auth for tests that already mock iron-session:
// the household id comes from the mocked session's `householdId`, so a test signs a household in
// (or out) by mocking getIronSession. (lib/auth itself is tested in tests/lib/auth.test.ts.)
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
    household: { id: session.householdId, urlSlug: session.householdSlug, displayName: "H", deletedAt: null },
  };
}

export const fakeAuth = {
  getSessionUser: sessionUser,
  getHouseholdId: sessionHouseholdId,
  requireHouseholdId: required,
  pageHouseholdId: required,
};
