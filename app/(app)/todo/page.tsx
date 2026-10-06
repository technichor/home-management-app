import { pageMember } from "@/lib/auth";
import { dateOr, utcDateString } from "@/lib/dates";
import { memberOptionsOf } from "@/lib/householdMembers";
import { loadTodo } from "@/lib/todo";
import LocalToday from "@/components/LocalToday";
import TodoClient from "./TodoClient";

export default async function TodoPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const me = await pageMember();
  // "Today" (for due dates) is the browser's; LocalToday puts it in the URL. Until then the server's date stands in.
  const today = dateOr((await searchParams).today, utcDateString());
  const [{ open, done }, members] = await Promise.all([loadTodo(me.householdId), memberOptionsOf(me.householdId)]);

  return (
    <>
      <LocalToday />
      <TodoClient open={open} done={done} members={members} myContactId={me.contactId ?? null} today={today} />
    </>
  );
}
