"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsPending(true);
    setError(null);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setError("Unable to sign out. Please try again.");
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="sign-out-area">
      <button
        className="secondary-button"
        disabled={isPending}
        onClick={handleSignOut}
        type="button"
      >
        {isPending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
