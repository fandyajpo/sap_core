"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_MIN_LENGTH,
} from "@/lib/organization-provisioning-core";
import styles from "./organization-onboarding.module.css";

interface ProvisioningResponseBody {
  organization?: { id?: unknown; name?: unknown };
  error?: unknown;
  code?: unknown;
}

/**
 * Organization onboarding form.
 *
 * Client-side validation exists only for fast feedback; the server re-validates
 * the trimmed name and derives the owner from the verified session, so nothing
 * here can influence identity, membership or the granted role.
 */
export function OrganizationOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmed = name.trim();
    if (trimmed.length < ORGANIZATION_NAME_MIN_LENGTH) {
      setError(`Enter an organization name of at least ${ORGANIZATION_NAME_MIN_LENGTH} characters.`);
      return;
    }
    if (trimmed.length > ORGANIZATION_NAME_MAX_LENGTH) {
      setError(`An organization name must be at most ${ORGANIZATION_NAME_MAX_LENGTH} characters.`);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/organizations", {
        body: JSON.stringify({ name: trimmed }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as ProvisioningResponseBody | null;

      if (response.ok) {
        const organizationId = payload?.organization?.id;
        if (typeof organizationId !== "string") {
          setError("The organization was created, but the workspace could not be opened. Reload to continue.");
          return;
        }
        router.replace(`/organizations/${encodeURIComponent(organizationId)}`);
        router.refresh();
        return;
      }

      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }

      setError(
        typeof payload?.error === "string"
          ? payload.error
          : "Unable to create the organization. Please try again.",
      );

      // A conflict means the account already holds a current membership:
      // reload so the server offers the existing workspace instead.
      if (response.status === 409) {
        router.refresh();
      }
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="onboarding-title" className={styles.card}>
      <p className="eyebrow">Organization onboarding</p>
      <h1 id="onboarding-title">Create your organization</h1>
      <p className={styles.lede}>
        An organization is the top-level workspace for your company, its plants and its access
        rules. You will become its first owner as soon as it is created.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label className={styles.label} htmlFor="organization-name">
          Organization name
        </label>
        <input
          aria-describedby="organization-name-hint"
          autoComplete="organization"
          autoFocus
          className={styles.input}
          id="organization-name"
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          minLength={ORGANIZATION_NAME_MIN_LENGTH}
          name="organizationName"
          onChange={(event) => setName(event.target.value)}
          placeholder="Northwind Manufacturing"
          required
          type="text"
          value={name}
        />
        <p className={styles.hint} id="organization-name-hint">
          {ORGANIZATION_NAME_MIN_LENGTH}–{ORGANIZATION_NAME_MAX_LENGTH} characters. Leading and
          trailing spaces are ignored.
        </p>

        {error ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : null}

        <button className={styles.submit} disabled={pending} type="submit">
          {pending ? "Creating organization…" : "Create organization"}
        </button>
      </form>
    </section>
  );
}
