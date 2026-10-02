import AuthPage from "@/components/AuthPage";
import { signupAction } from "./actions";

export default function SignupPage() {
  return <AuthPage mode="signup" action={signupAction} />;
}
