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
  searchParams: Promise<{ next?: string; reset?: string; verified?: string }>;
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const notice =
    mode !== "login"
      ? undefined
      : params.reset === "1"
        ? "Password changed. Log in with your new password."
        : params.verified === "1"
          ? "Email confirmed. Log in to continue."
          : undefined;
  const user = await getSessionUser();
  if (user) redirect(next ?? homePathFor(user));
  return <AuthForm mode={mode} action={action} next={next} notice={notice} />;
}
