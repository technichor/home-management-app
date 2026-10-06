import { prisma } from "@/lib/db";
import { UserError } from "@/lib/actionResult";
import { calendarName } from "@/lib/contactDates";

/**
 * The household's own members, for "assigned to" / "whose" pickers: its Family & Friend contacts in its own household,
 * not removed. `name` is the short calendar name (nickname first).
 */
export async function memberOptionsOf(householdId: string) {
  const rows = await prisma.contact.findMany({
    where: { ownerHouseholdId: householdId, householdId, category: "FAMILY_FRIEND", deletedAt: null },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: calendarName(r), fullName: `${r.firstName} ${r.lastName}` }));
}

export type MemberOption = Awaited<ReturnType<typeof memberOptionsOf>>[number];

/**
 * For a server action: whether the browser's choice of member is allowed. None (the whole household) always is, and so
 * is keeping the record's current member even after they were removed; anything else must be one of memberOptionsOf.
 */
export async function assertMemberChoice(householdId: string, chosen: string | null, current: string | null = null) {
  if (chosen === null || chosen === current) return;
  const options = await memberOptionsOf(householdId);
  if (!options.some((o) => o.id === chosen)) throw new UserError("Choose one of your household's members");
}
