import { redirect } from "next/navigation";
import { getSessionUser, homePathFor } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import AuthForm from "@/components/AuthForm";
import type { AuthState } from "@/app/signup/actions";

// Shared by /login and /signup: signed-in users go straight to where they belong.
export default async function AuthPage({
  mode,
  action,
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const next = safeNext((await searchParams).next);
  const user = await getSessionUser();
  if (user) redirect(next ?? homePathFor(user));
  return <AuthForm mode={mode} action={action} next={next} />;
}
