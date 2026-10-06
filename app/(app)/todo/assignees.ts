import type { MemberOption } from "@/lib/householdMembers";

/** The Select value for "anyone" (unassigned). */
export const ANYONE = "";

/**
 * Who a to-do can be for: Anyone, then the household's members. A member since removed stays on an item that already
 * has them, marked as removed, but isn't offered for anything new.
 */
export function assigneeOptions(members: MemberOption[], current?: { assigneeContactId: string | null; assigneeName: string | null }) {
  const removed =
    current?.assigneeContactId && !members.some((m) => m.id === current.assigneeContactId)
      ? [{ value: current.assigneeContactId, label: `${current.assigneeName ?? "Former member"} (removed)` }]
      : [];
  return [{ value: ANYONE, label: "Anyone" }, ...members.map((m) => ({ value: m.id, label: m.name })), ...removed];
}
