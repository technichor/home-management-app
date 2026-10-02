import AuthPage from "@/components/AuthPage";
import { loginAction } from "./actions";

export default function LoginPage() {
  return <AuthPage mode="login" action={loginAction} />;
}
