"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function OrganizationWorkspaceLink() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = organizationId.trim();

    if (!value) {
      setError("Enter an organization ID to continue.");
      return;
    }

    setError(null);
    router.push(`/organizations/${encodeURIComponent(value)}`);
  }

  return (
    <form className="workspace-entry" onSubmit={handleSubmit} noValidate>
      <label className="workspace-entry-label" htmlFor="organization-id">
        Organization ID
      </label>
      <div className="workspace-entry-controls">
        <input
          autoComplete="off"
          aria-describedby={error ? "organization-id-error organization-id-hint" : "organization-id-hint"}
          aria-invalid={Boolean(error)}
          className="workspace-entry-input"
          id="organization-id"
          name="organizationId"
          onChange={(event) => {
            setOrganizationId(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste your organization ID"
          value={organizationId}
        />
        <button className="primary-button workspace-entry-button" type="submit">
          Open workspace
        </button>
      </div>
      {error ? <p className="workspace-entry-error" id="organization-id-error" role="alert">{error}</p> : null}
      <p className="workspace-entry-hint" id="organization-id-hint">
        Access is verified by the server. Knowing an ID does not grant access.
      </p>
    </form>
  );
}
