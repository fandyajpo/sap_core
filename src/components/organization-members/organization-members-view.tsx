"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import type { OrganizationMemberDto } from "@/lib/client-data/contracts";
import { HttpApiError } from "@/lib/client-data/http";
import { useOrganizationMembers } from "@/lib/client-data/queries/use-organization-members";
import styles from "./organization-members.module.css";

const createdDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatCreatedAt(value: unknown): { dateTime: string; label: string } | null {
  if (typeof value !== "string") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    dateTime: date.toISOString(),
    label: createdDateFormatter.format(date),
  };
}

function formatStatus(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "Status unavailable";
}

const emptyMembers: OrganizationMemberDto[] = [];

const columns: ColumnDef<OrganizationMemberDto>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "status",
    header: "Membership status",
    cell: ({ getValue }) => (
      <span className={styles.status}>{formatStatus(getValue())}</span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ getValue }) => {
      const createdAt = formatCreatedAt(getValue());
      return createdAt
        ? <time dateTime={createdAt.dateTime}>{createdAt.label}</time>
        : "Date unavailable";
    },
  },
];

interface OrganizationMembersViewProps {
  organizationId: string;
}

interface MembersLoadErrorProps {
  onRetry: () => void;
}

function MembersLoadError({ onRetry }: MembersLoadErrorProps) {
  return (
    <section aria-label="Organization members error" className={styles.errorState} role="alert">
      <p>Unable to load organization members. Please try again.</p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

export function OrganizationMembersView({ organizationId }: OrganizationMembersViewProps) {
  const query = useOrganizationMembers(organizationId);
  const isAuthorizationError = query.error instanceof HttpApiError
    && (query.error.status === 401 || query.error.status === 403);
  const tableProps = {
    ariaLabel: "Organization members",
    columns,
    data: emptyMembers,
    getRowId: (member: OrganizationMemberDto) => member.membershipId,
  };

  // Never keep protected member rows visible after the server rejects access.
  // Transient failures may retain stale rows, but 401/403 must hide them.
  if (query.isError && (!query.data || isAuthorizationError)) {
    return (
      <section aria-labelledby="members-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <MembersLoadError onRetry={() => void query.refetch()} />
      </section>
    );
  }

  // Only the initial load replaces the table with a loading state; a
  // background refetch keeps the already-loaded rows visible.
  if (query.isLoading) {
    return (
      <section aria-labelledby="members-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <div className={styles.tableCard}>
          <DataTable
            {...tableProps}
            isLoading
            loadingState="Loading organization members…"
          />
        </div>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section aria-labelledby="members-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <MembersLoadError onRetry={() => void query.refetch()} />
      </section>
    );
  }

  return (
    <section aria-labelledby="members-title" className={styles.pageContent}>
      <PageHeading organizationId={organizationId} />
      <div className={styles.tableCard}>
        <DataTable
          ariaLabel="Organization members"
          columns={columns}
          data={query.data.members}
          emptyState={<span>No members to display.</span>}
          filterPlaceholder="Filter members…"
          getRowId={(member) => member.membershipId}
        />
      </div>
    </section>
  );
}

function PageHeading({ organizationId }: OrganizationMembersViewProps) {
  return (
    <div className={styles.heading}>
      <p className="eyebrow">Organization access</p>
      <h1 id="members-title">Organization members</h1>
      <p className={styles.organizationContext}>
        Organization ID: <code>{organizationId}</code>
      </p>
    </div>
  );
}
