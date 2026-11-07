"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "sign-in" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegistration = mode === "register";
  const submitLabel = isRegistration
    ? { idle: "Create account", pending: "Creating account…" }
    : { idle: "Sign in", pending: "Signing in…" };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();

    try {
      const result = isRegistration
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(
          isRegistration
            ? "We couldn't create your account. Check the details or try signing in."
            : "We couldn't sign you in with those details.",
        );
        return;
      }

      if (!result.data) {
        setError("Authentication could not be completed. Please try again.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span className="brand-name">SAP Core</span>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">Secure workspace</p>
          <h1 id="auth-title">{isRegistration ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-description">
            {isRegistration
              ? "Register with your email to access the SAP Core workspace."
              : "Sign in to continue to the SAP Core workspace."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} aria-busy={isPending}>
          {isRegistration && (
            <label className="field-label" htmlFor="name">
              Full name
              <input
                autoComplete="name"
                className="text-input"
                disabled={isPending}
                id="name"
                name="name"
                required
                type="text"
              />
            </label>
          )}

          <label className="field-label" htmlFor="email">
            Email address
            <input
              autoComplete="email"
              className="text-input"
              disabled={isPending}
              id="email"
              name="email"
              required
              type="email"
            />
          </label>

          <label className="field-label" htmlFor="password">
            Password
            <input
              autoComplete={isRegistration ? "new-password" : "current-password"}
              className="text-input"
              disabled={isPending}
              id="password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button" disabled={isPending} type="submit">
            {isPending ? submitLabel.pending : submitLabel.idle}
          </button>
        </form>

        <p className="auth-switch">
          {isRegistration ? "Already have an account?" : "New to SAP Core?"}{" "}
          <Link href={isRegistration ? "/sign-in" : "/register"}>
            {isRegistration ? "Sign in" : "Create an account"}
          </Link>
        </p>

        <p className="auth-boundary">
          Signing in confirms your identity only. Organization membership and access to
          company or plant data are checked separately.
        </p>
      </section>
    </main>
  );
}
