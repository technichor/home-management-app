// Contacts and households are private to the account household whose directory they are in.
// Every query for them goes through these filters, and every lookup by id re-checks ownership.

/** Contacts in this household's directory (its own members and everyone it has recorded). */
export const contactsOf = (householdId: string) => ({ ownerHouseholdId: householdId });

/** The household itself plus the passive households it has recorded. */
export const householdsOf = (householdId: string) => ({
  OR: [{ id: householdId }, { ownerHouseholdId: householdId }],
});

export const contactIsIn = (contact: { ownerHouseholdId: string | null }, householdId: string) =>
  contact.ownerHouseholdId === householdId;

export const householdIsIn = (household: { id: string; ownerHouseholdId: string | null }, householdId: string) =>
  household.id === householdId || household.ownerHouseholdId === householdId;
