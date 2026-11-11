"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export interface ProfileNameSaveResult {
  error: string | null;
}

export interface ProfileNameFormProps {
  initialName: string;
  /**
   * Optional save adapter. The default calls Better Auth
   * `authClient.updateUser()` and refreshes the route — the production
   * behavior on /account. The UI Showcase injects a simulator that
   * resolves locally and never touches the authenticated account.
   */
  onSave?: (name: string) => Promise<ProfileNameSaveResult>;
}

async function saveWithAuthClient(name: string): Promise<ProfileNameSaveResult> {
  const failure = "We couldn't update your display name. Please try again.";
  try {
    const result = await authClient.updateUser({ name });
    return result.error ? { error: failure } : { error: null };
  } catch {
    return { error: failure };
  }
}

export function ProfileNameForm({ initialName, onSave }: ProfileNameFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();

    if (!normalizedName) {
      setError("Enter a display name.");
      setIsSaved(false);
      return;
    }

    setIsPending(true);
    setError(null);
    setIsSaved(false);

    try {
      const result = await (onSave ?? saveWithAuthClient)(normalizedName);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Route refresh only matters for real saves (server state changed).
      if (!onSave) {
        router.refresh();
      }

      setName(normalizedName);
      setIsSaved(true);
    } catch {
      // A rejecting adapter (e.g. a broken demo) must degrade to a safe,
      // user-facing message instead of an unhandled rejection.
      setError("We couldn't update your display name. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={isPending}>
      <label className="field-label" htmlFor="display-name">
        Display name
        <input
          autoComplete="name"
          className="text-input"
          disabled={isPending}
          id="display-name"
          name="name"
          onChange={(event) => {
            setName(event.currentTarget.value);
            setError(null);
            setIsSaved(false);
          }}
          required
          type="text"
          value={name}
          aria-describedby={error ? "display-name-error" : undefined}
          aria-invalid={Boolean(error)}
        />
      </label>

      {error && (
        <p className="auth-error" id="display-name-error" role="alert">
          {error}
        </p>
      )}

      {isSaved && (
        <p className="status-row" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span>Display name updated.</span>
        </p>
      )}

      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save display name"}
      </button>
    </form>
  );
}
