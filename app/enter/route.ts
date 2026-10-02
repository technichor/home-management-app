import { redirect } from "next/navigation";
import { getSessionUser, homePathFor, startSession } from "@/lib/auth";

// Refreshes a signed-in user's session after their household changed (they were approved, or
// accepted an invite on another device), then sends them home. Needed only while the /[slug]
// routes still read household fields from the session.
export async function GET() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await startSession(user);
  redirect(homePathFor(user));
}
