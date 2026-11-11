"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { AuthForm } from "@/components/auth-form";
import { ProfileNameForm } from "@/components/profile-name-form";
import { SignOutButton } from "@/components/sign-out-button";
import { simulateDelayedSuccess } from "./simulations";
import styles from "./ui-showcase.module.css";

interface ShowcaseRow {
  id: string;
  code: string;
  status: string;
  amount: number;
  updatedAt: string;
}

const rows: ShowcaseRow[] = [
  { id: "row-1", code: "LEDGER-2401", status: "Active", amount: 42180, updatedAt: "2026-10-02" },
  { id: "row-2", code: "LEDGER-2402", status: "Active", amount: 8940, updatedAt: "2026-10-04" },
  { id: "row-3", code: "LEDGER-2403", status: "Revoked", amount: 17620, updatedAt: "2026-10-06" },
  { id: "row-4", code: "LEDGER-2404", status: "Active", amount: 3410, updatedAt: "2026-10-09" },
  { id: "row-5", code: "LEDGER-2405", status: "Active", amount: 61205, updatedAt: "2026-10-11" },
  { id: "row-6", code: "LEDGER-2406", status: "Revoked", amount: 20980, updatedAt: "2026-10-14" },
  { id: "row-7", code: "LEDGER-2407", status: "Active", amount: 15375, updatedAt: "2026-10-16" },
  { id: "row-8", code: "LEDGER-2408", status: "Active", amount: 9860, updatedAt: "2026-10-19" },
  { id: "row-9", code: "LEDGER-2409", status: "Active", amount: 7540, updatedAt: "2026-10-21" },
  { id: "row-10", code: "LEDGER-2410", status: "Revoked", amount: 5620, updatedAt: "2026-10-24" },
  { id: "row-11", code: "LEDGER-2411", status: "Active", amount: 42990, updatedAt: "2026-10-27" },
  { id: "row-12", code: "LEDGER-2412", status: "Active", amount: 18420, updatedAt: "2026-10-29" },
  { id: "row-13", code: "LEDGER-2413", status: "Active", amount: 33110, updatedAt: "2026-11-02" },
  { id: "row-14", code: "LEDGER-2414", status: "Active", amount: 27640, updatedAt: "2026-11-05" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatDate(value: string): { dateTime: string; label: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { dateTime: date.toISOString(), label: dateFormatter.format(date) };
}

type DemoState = "ready" | "loading" | "empty";

const demoStates: { id: DemoState; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Empty" },
];

const statusChips: { label: string; tone: "info" | "success" | "warning" | "danger" }[] = [
  { label: "Info", tone: "info" },
  { label: "Success", tone: "success" },
  { label: "Warning", tone: "warning" },
  { label: "Danger", tone: "danger" },
];

const chipClass: Record<"info" | "success" | "warning" | "danger", string> = {
  info: styles.chipInfo,
  success: styles.chipSuccess,
  warning: styles.chipWarning,
  danger: styles.chipDanger,
};

interface UiShowcaseViewProps {
  organizationId: string;
}

export function UiShowcaseView({ organizationId }: UiShowcaseViewProps) {
  const [demoState, setDemoState] = useState<DemoState>("ready");

  const columns = useMemo<ColumnDef<ShowcaseRow>[]>(() => [
    { accessorKey: "code", header: "Code" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue<string>();
        return (
          <span className={status === "Revoked" ? styles.statusRevoked : styles.statusActive}>
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ getValue }) => (
        <span className={styles.numeric}>{currencyFormatter.format(getValue<number>())}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ getValue }) => {
        const updatedAt = formatDate(getValue<string>());
        return updatedAt
          ? <time dateTime={updatedAt.dateTime}>{updatedAt.label}</time>
          : "Date unavailable";
      },
    },
  ], []);

  return (
    <section aria-labelledby="ui-showcase-title" className={styles.page}>
      <div className={styles.heading}>
        <p className="eyebrow">Design system</p>
        <h1 id="ui-showcase-title">UI component showcase</h1>
        <p className={styles.context}>
          Organization <code>{organizationId}</code> · Live components on the PR #91
          design tokens. Interactive demos below run the real components. The auth
          form performs its real sign-in; the profile save and sign-out demos are
          simulated locally and never touch the authenticated account.
        </p>
      </div>

      <section aria-labelledby="showcase-table-title" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 id="showcase-table-title">DataTable</h2>
          <div className={styles.demoControls} role="group" aria-label="Demo state controls">
            {demoStates.map((state) => (
              <button
                aria-pressed={demoState === state.id}
                className={styles.demoButton}
                key={state.id}
                onClick={() => setDemoState(state.id)}
                type="button"
              >
                {state.label}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.note}>
          Real component with working search, sort, and pagination. The buttons above
          switch this demo between ready, forced loading, and empty fixture data.
        </p>
        <DataTable
          ariaLabel="Showcase assignments"
          columns={columns}
          data={demoState === "empty" ? [] : rows}
          emptyState={<span>No rows to display.</span>}
          filterPlaceholder="Filter rows…"
          getRowId={(row) => row.id}
          isLoading={demoState === "loading"}
          loadingState="Loading showcase rows…"
        />
      </section>

      <section aria-labelledby="showcase-forms-title" className={styles.card}>
        <h2 id="showcase-forms-title">Live forms</h2>
        <p className={styles.note}>
          Real components. Submitting the auth form performs a real sign-in; the
          profile save and sign-out below are simulated locally — they never call
          the authentication API and cannot change your account or session.
        </p>
        <div className={styles.formGrid}>
          <div className={styles.formCell}>
            <p className={styles.note}>
              Real sign-in form — submitting performs a real sign-in attempt with
              Better Auth.
            </p>
            <AuthForm headingLevel={3} mode="sign-in" />
          </div>
          <div className={styles.formCell}>
            <h3>ProfileNameForm (simulated save)</h3>
            <p className={styles.note}>
              Simulated demo — resolves locally and never calls the profile API.
            </p>
            <ProfileNameForm
              initialName="Showcase User"
              onSave={() => simulateDelayedSuccess(600)}
            />
          </div>
          <div className={styles.formCell}>
            <h3>SignOutButton (simulated)</h3>
            <p className={styles.note}>
              Simulated demo — keeps your real session active.
            </p>
            <SignOutButton
              label="Sign out (simulated)"
              onSignOut={() => simulateDelayedSuccess(600)}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="showcase-tokens-title" className={styles.card}>
        <h2 id="showcase-tokens-title">Semantic status tokens (light)</h2>
        <p className={styles.note}>
          Future components consume these semantic tokens; raw palette colors are
          never a public interface.
        </p>
        <div className={styles.chipGrid}>
          {statusChips.map((chip) => (
            <span className={`${styles.chip} ${chipClass[chip.tone]}`} key={chip.tone}>
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="showcase-dark-title" className={styles.card} data-theme="dark">
        <h2 id="showcase-dark-title">Dark token scope</h2>
        <p className={styles.note}>
          The same DataTable and status chips inside a scoped
          <code> data-theme=&quot;dark&quot; </code>
          container. Token-driven components adapt automatically; no theme toggle,
          persistence, or runtime state is involved.
        </p>
        <div className={styles.chipGrid}>
          {statusChips.map((chip) => (
            <span className={`${styles.chip} ${chipClass[chip.tone]}`} key={`dark-${chip.tone}`}>
              {chip.label}
            </span>
          ))}
        </div>
        <DataTable
          ariaLabel="Showcase assignments (dark scope)"
          columns={columns}
          data={rows.slice(0, 4)}
          emptyState={<span>No rows to display.</span>}
          filterPlaceholder="Filter rows…"
          getRowId={(row) => row.id}
        />
      </section>
    </section>
  );
}
