import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentSession } from "@/lib/auth-session";

export default async function SignInPage() {
  if (await getCurrentSession()) {
    redirect("/");
  }

  return (
    <main className="auth-page">
      <AuthForm mode="sign-in" />
    </main>
  );
}
