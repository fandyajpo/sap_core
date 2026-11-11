"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export interface SignOutResult {
  error: string | null;
}

export interface SignOutButtonProps {
  /**
   * Optional sign-out adapter. The default calls Better Auth
   * `authClient.signOut()` and redirects to /sign-in — the production
   * behavior. The UI Showcase injects a simulator that resolves locally
   * and never ends the real session.
   */
  onSignOut?: () => Promise<SignOutResult>;
  /** Button label override (e.g. the showcase marks its demo as simulated). */
  label?: string;
}

export function SignOutButton({ onSignOut, label }: SignOutButtonProps = {}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLabel = label ? `${label}…` : "Signing out…";

  async function handleSignOut() {
    setIsPending(true);
    setError(null);

    try {
      const result = await (onSignOut ?? signOutWithAuthClient)();

      if (result.error) {
        setError(result.error);
        return;
      }
    } catch {
      // A rejecting adapter (e.g. a broken demo) must degrade to a safe,
      // user-facing message instead of an unhandled rejection.
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function signOutWithAuthClient(): Promise<SignOutResult> {
    const unreachable = "Unable to reach the authentication service. Please try again.";
    try {
      const result = await authClient.signOut();
      if (result.error) {
        return { error: "Unable to sign out. Please try again." };
      }

      router.replace("/sign-in");
      router.refresh();
      return { error: null };
    } catch {
      return { error: unreachable };
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
        {isPending ? pendingLabel : label ?? "Sign out"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
