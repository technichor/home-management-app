import { getAgenda } from "@/lib/agenda";
import { orderAgenda, type AgendaEntry } from "@/lib/agendaOrder";
import { googleConfigured } from "@/lib/google";
import { googleAgenda } from "@/lib/googleEvents";

/**
 * Everything the calendar shows between two dates (inclusive), in order: Domata's events and contact dates, planned
 * meals if asked for, and the members' shared Google calendars (once Google is set up). The calendar page and the home
 * page's week both read it, so they show the same things. For a member's view (`assigneeContactId`), their own items
 * and the household's, and their own Google calendars only.
 */
export async function calendarEntries(
  householdId: string,
  range: { start: string; end: string },
  options: { timeZone: string; includeMeals: boolean; assigneeContactId?: string | null },
): Promise<{ entries: AgendaEntry[]; googleProblems: string[] }> {
  const { timeZone, includeMeals, assigneeContactId = null } = options;
  const [agenda, google] = await Promise.all([
    getAgenda(householdId, range.start, range.end, { assigneeContactId, includeMeals }),
    // Read live (cached briefly); none until Google is set up.
    googleConfigured() ? googleAgenda(householdId, range, timeZone) : null,
  ]);
  if (!google) return { entries: agenda.entries, googleProblems: [] };
  const googleEntries = assigneeContactId ? google.entries.filter((e) => e.ownerContactId === assigneeContactId) : google.entries;
  return {
    entries: googleEntries.length > 0 ? orderAgenda([...agenda.entries, ...googleEntries]) : agenda.entries,
    googleProblems: google.problems,
  };
}
