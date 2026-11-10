"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { OrganizationRoleDto } from "@/lib/client-data/contracts";
import { HttpApiError } from "@/lib/client-data/http";
import { useOrganizationRoles } from "@/lib/client-data/queries/use-organization-roles";
import styles from "./organization-roles.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: unknown): { dateTime: string; label: string } | null {
  if (typeof value !== "string") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    dateTime: date.toISOString(),
    label: dateFormatter.format(date),
  };
}

interface OrganizationRolesViewProps {
  organizationId: string;
}

interface RolesLoadErrorProps {
  onRetry: () => void;
}

function RolesLoadError({ onRetry }: RolesLoadErrorProps) {
  return (
    <section aria-label="Organization roles error" className={styles.errorState} role="alert">
      <p>Unable to load organization roles. Please try again.</p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

interface RoleDetailsProps {
  onDismiss: () => void;
  role: OrganizationRoleDto;
}

function RoleDetails({ onDismiss, role }: RoleDetailsProps) {
  const disabledAt = formatDate(role.disabledAt);

  return (
    <section aria-labelledby="role-details-title" className={styles.detailsCard}>
      <div className={styles.detailsHeader}>
        <h2 id="role-details-title">Role details</h2>
        <button className={styles.detailsButton} onClick={onDismiss} type="button">
          Close
        </button>
      </div>
      <dl className={styles.detailsGrid}>
        <div className={styles.detailsItem}>
          <dt>Role code</dt>
          <dd>{role.code}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Role ID</dt>
          <dd><code>{role.id}</code></dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Role kind</dt>
          <dd>{role.kind}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Scope</dt>
          <dd>{role.scope}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Version</dt>
          <dd>{role.version}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Owner organization ID</dt>
          <dd>{role.ownerOrganizationId ?? "Not applicable (system role)"}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Status</dt>
          <dd>
            {disabledAt
              ? <>Disabled since <time dateTime={disabledAt.dateTime}>{disabledAt.label}</time></>
              : "Active"}
          </dd>
        </div>
      </dl>
      <h3 id="role-permissions-title">Permission codes ({role.permissions.length})</h3>
      {role.permissions.length === 0
        ? <p className={styles.revisionNote}>No permission codes are listed for this role.</p>
        : (
          <ul aria-labelledby="role-permissions-title" className={styles.permissionList}>
            {role.permissions.map((permission) => (
              <li key={permission}><code>{permission}</code></li>
            ))}
          </ul>
        )}
      <p className={styles.revisionNote}>
        Revision history is not available yet: the API currently exposes only the
        current role version shown above.
      </p>
    </section>
  );
}

const emptyRoles: OrganizationRoleDto[] = [];

export function OrganizationRolesView({ organizationId }: OrganizationRolesViewProps) {
  const query = useOrganizationRoles(organizationId);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const isAuthorizationError = query.error instanceof HttpApiError
    && (query.error.status === 401 || query.error.status === 403);
  const selectedRole = query.data?.roles.find((role) => role.id === selectedRoleId) ?? null;

  const columns = useMemo<ColumnDef<OrganizationRoleDto>[]>(() => [
    {
      accessorKey: "code",
      header: "Role code",
    },
    {
      accessorKey: "kind",
      header: "Role kind",
    },
    {
      accessorKey: "scope",
      header: "Scope",
    },
    {
      accessorKey: "version",
      header: "Version",
    },
    {
      id: "permissionCount",
      accessorFn: (role) => role.permissions.length,
      header: "Permissions",
      cell: ({ row }) => row.original.permissions.length,
    },
    {
      accessorKey: "disabledAt",
      header: "Status",
      cell: ({ getValue }) => {
        const disabledAt = getValue<string | null>();
        return disabledAt == null
          ? <span className={styles.status}>Active</span>
          : <span className={styles.statusDisabled}>Disabled</span>;
      },
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <button
          aria-expanded={row.original.id === selectedRoleId}
          className={styles.detailsButton}
          onClick={() => setSelectedRoleId(row.original.id)}
          type="button"
        >
          View details
        </button>
      ),
    },
  ], [selectedRoleId]);

  const tableProps = {
    ariaLabel: "Organization roles",
    columns,
    data: emptyRoles,
    getRowId: (role: OrganizationRoleDto) => role.id,
  };

  // Never keep protected role data visible after the server rejects access.
  // Transient failures may retain the last loaded rows, but 401/403 must hide them.
  if (query.isError && (!query.data || isAuthorizationError)) {
    return (
      <section aria-labelledby="roles-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <RolesLoadError onRetry={() => void query.refetch()} />
      </section>
    );
  }

  // Only the initial load replaces the table with a loading state; a
  // background refetch keeps the already-loaded rows visible.
  if (query.isLoading) {
    return (
      <section aria-labelledby="roles-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <div className={styles.tableCard}>
          <DataTable
            {...tableProps}
            isLoading
            loadingState="Loading organization roles…"
          />
        </div>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section aria-labelledby="roles-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <RolesLoadError onRetry={() => void query.refetch()} />
      </section>
    );
  }

  return (
    <section aria-labelledby="roles-title" className={styles.pageContent}>
      <PageHeading organizationId={organizationId} />
      {query.isError
        ? (
          <section aria-label="Role refresh failed" className={styles.refreshNotice} role="status">
            <p>Couldn&apos;t refresh roles. Showing the last loaded list.</p>
            <button
              className={styles.retryButton}
              onClick={() => void query.refetch()}
              type="button"
            >
              Retry
            </button>
          </section>
        )
        : null}
      <div className={styles.tableCard}>
        <DataTable
          ariaLabel="Organization roles"
          columns={columns}
          data={query.data.roles}
          emptyState={<span>No roles to display.</span>}
          filterPlaceholder="Filter roles…"
          getRowId={(role) => role.id}
        />
      </div>
      {selectedRole
        ? <RoleDetails onDismiss={() => setSelectedRoleId(null)} role={selectedRole} />
        : null}
    </section>
  );
}

function PageHeading({ organizationId }: OrganizationRolesViewProps) {
  return (
    <div className={styles.heading}>
      <p className="eyebrow">Organization access</p>
      <h1 id="roles-title">Organization roles</h1>
      <p className={styles.organizationContext}>
        Organization ID: <code>{organizationId}</code>
      </p>
    </div>
  );
}
