import { pageMember } from "@/lib/auth";
import { pageTodayOrUtc } from "@/lib/today";
import { memberOptionsOf } from "@/lib/householdMembers";
import { loadTodo } from "@/lib/todo";
import { syncMaintenanceTodos } from "@/lib/maintenanceTodos";
import LocalToday from "@/components/LocalToday";
import TodoClient from "./TodoClient";

export default async function TodoPage() {
  const me = await pageMember();
  // "Today" (for due dates) is the browser's (lib/today.ts); on a first visit the server's date stands in until LocalToday
  // has saved the browser's time zone.
  const today = await pageTodayOrUtc();
  // Maintenance services that have come due join the list first.
  await syncMaintenanceTodos(me.householdId, today);
  const [{ open, done }, members] = await Promise.all([loadTodo(me.householdId), memberOptionsOf(me.householdId)]);

  return (
    <>
      <LocalToday today={today} />
      <TodoClient open={open} done={done} members={members} myContactId={me.contactId ?? null} today={today} />
    </>
  );
}
