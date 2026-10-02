import AuthPage from "@/components/AuthPage";
import { signupAction } from "./actions";

export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <AuthPage mode="signup" action={signupAction} searchParams={searchParams} />;
}
