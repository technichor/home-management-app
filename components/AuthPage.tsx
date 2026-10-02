import { redirect } from "next/navigation";
import { getSessionUser, homePathFor } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import type { AuthState } from "@/app/signup/actions";

// Shared by /login and /signup: signed-in users go straight to where they belong.
export default async function AuthPage({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user));
  return <AuthForm mode={mode} action={action} />;
}
