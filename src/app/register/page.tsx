import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentSession } from "@/lib/auth-session";

export default async function RegisterPage() {
  if (await getCurrentSession()) {
    redirect("/");
  }

  return (
    <main className="auth-page">
      <AuthForm mode="register" />
    </main>
  );
}
