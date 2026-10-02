import AuthPage from "@/components/AuthPage";
import { loginAction } from "./actions";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  return <AuthPage mode="login" action={loginAction} searchParams={searchParams} />;
}
