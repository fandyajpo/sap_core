"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 160) {
      setError("Organization name must contain 1 to 160 characters.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const result = await response.json() as {
        organization?: { id?: string };
        organizationId?: string;
        error?: string;
      };

      if (response.status === 409 && result.error === "ALREADY_HAS_ORGANIZATION") {
        if (result.organizationId) {
          router.push(`/organizations/${encodeURIComponent(result.organizationId)}`);
          router.refresh();
          return;
        }
        setError("Your account already has an organization membership that prevents creating another workspace. Contact an administrator if you need help accessing it.");
        return;
      }

      if (!response.ok || !result.organization?.id) {
        setError(result.error === "OWNER_ROLE_UNAVAILABLE"
          ? "Organization setup is temporarily unavailable. Please try again later."
          : "We couldn't create the organization. Check the name and try again.");
        return;
      }
      router.push(`/organizations/${encodeURIComponent(result.organization.id)}`);
      router.refresh();
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="organization-create-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="organization-name">Organization name</label>
      <div className="organization-create-controls">
        <input
          id="organization-name"
          name="name"
          autoComplete="organization"
          maxLength={160}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Acme Manufacturing"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "organization-create-error" : undefined}
          disabled={pending}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create organization"}
        </button>
      </div>
      {error ? <p id="organization-create-error" role="alert">{error}</p> : null}
      <p className="organization-create-hint">You will become the initial organization owner.</p>
    </form>
  );
}
