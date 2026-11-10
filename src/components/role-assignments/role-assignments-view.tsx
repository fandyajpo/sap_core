"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import type {
  OrganizationMemberDto,
  OrganizationRoleDto,
  RoleAssignmentDto,
  TenantAssignableScope,
} from "@/lib/client-data/contracts";
import { HttpApiError } from "@/lib/client-data/http";
import { useOrganizationMembers } from "@/lib/client-data/queries/use-organization-members";
import { useOrganizationRoles } from "@/lib/client-data/queries/use-organization-roles";
import { useRoleAssignments } from "@/lib/client-data/queries/use-role-assignments";
import styles from "./role-assignments.module.css";

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

function isAuthorizationRejection(error: unknown): boolean {
  return error instanceof HttpApiError
    && (error.status === 401 || error.status === 403);
}

const scopes: TenantAssignableScope[] = ["ORGANIZATION", "COMPANY", "PLANT"];

const emptyMembers: OrganizationMemberDto[] = [];
const emptyRoles: OrganizationRoleDto[] = [];
const emptyAssignments: RoleAssignmentDto[] = [];

interface RoleAssignmentsViewProps {
  organizationId: string;
}

function MembersLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section aria-label="Organization members error" className={styles.errorState} role="alert">
      <p>Unable to load organization members. Please try again.</p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

function AssignmentsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section aria-label="Role assignments error" className={styles.errorState} role="alert">
      <p>Unable to load role assignments. Please try again.</p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

interface AssignmentDetailsProps {
  assignment: RoleAssignmentDto;
  onDismiss: () => void;
  roleLabel: string;
}

function AssignmentDetails({ assignment, onDismiss, roleLabel }: AssignmentDetailsProps) {
  const createdAt = formatDate(assignment.createdAt);
  const revokedAt = formatDate(assignment.revokedAt);

  return (
    <section aria-labelledby="assignment-details-title" className={styles.detailsCard}>
      <div className={styles.detailsHeader}>
        <h2 id="assignment-details-title">Assignment details</h2>
        <button className={styles.detailsButton} onClick={onDismiss} type="button">
          Close
        </button>
      </div>
      <dl className={styles.detailsGrid}>
        <div className={styles.detailsItem}>
          <dt>Assignment ID</dt>
          <dd><code>{assignment.id}</code></dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Scope</dt>
          <dd>{assignment.scope}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Parent ID</dt>
          <dd><code>{assignment.parentId}</code></dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Role</dt>
          <dd>{roleLabel}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Role definition ID</dt>
          <dd><code>{assignment.roleDefinitionId}</code></dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Grant actor user ID</dt>
          <dd>{assignment.grantActorUserId ?? "Not recorded"}</dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Break-glass</dt>
          <dd>{assignment.isBreakGlass ? "Yes" : "No"}</dd>
        </div>
        {assignment.isBreakGlass && assignment.breakGlassReason
          ? (
            <div className={styles.detailsItem}>
              <dt>Break-glass reason</dt>
              <dd>{assignment.breakGlassReason}</dd>
            </div>
          )
          : null}
        <div className={styles.detailsItem}>
          <dt>Created</dt>
          <dd>
            {createdAt
              ? <time dateTime={createdAt.dateTime}>{createdAt.label}</time>
              : "Date unavailable"}
          </dd>
        </div>
        <div className={styles.detailsItem}>
          <dt>Status</dt>
          <dd>
            {assignment.revokedAt == null
              ? "Active"
              : (revokedAt
                ? <>Revoked on <time dateTime={revokedAt.dateTime}>{revokedAt.label}</time></>
                : "Revoked (date unavailable)")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function RoleAssignmentsView({ organizationId }: RoleAssignmentsViewProps) {
  const membersQuery = useOrganizationMembers(organizationId);
  const rolesQuery = useOrganizationRoles(organizationId);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [scope, setScope] = useState<TenantAssignableScope>("ORGANIZATION");
  const [parentIdInput, setParentIdInput] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const parentId = scope === "ORGANIZATION"
    ? organizationId.trim()
    : parentIdInput.trim();
  const assignmentsQuery = useRoleAssignments(organizationId, {
    parentId,
    scope,
    userId: selectedUserId,
  });

  const members = membersQuery.data?.members ?? emptyMembers;
  const roles = rolesQuery.data?.roles ?? emptyRoles;
  const roleByDefinitionId = new Map(roles.map((role) => [role.id, role]));
  const selectedAssignment = assignmentsQuery.data?.assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  ) ?? null;

  const membersAuthError = isAuthorizationRejection(membersQuery.error);
  const assignmentsAuthError = isAuthorizationRejection(assignmentsQuery.error);
  const filtersComplete = Boolean(organizationId.trim())
    && Boolean(selectedUserId)
    && Boolean(parentId);

  function resolveRoleLabel(assignment: RoleAssignmentDto): string {
    return roleByDefinitionId.get(assignment.roleDefinitionId)?.code
      ?? assignment.roleDefinitionId;
  }

  const columns = useMemo<ColumnDef<RoleAssignmentDto>[]>(() => [
    {
      accessorKey: "scope",
      header: "Scope",
    },
    {
      accessorKey: "parentId",
      header: "Parent ID",
      cell: ({ getValue }) => (
        <code className={styles.monoValue}>{getValue<string>()}</code>
      ),
    },
    {
      id: "role",
      accessorFn: (assignment) =>
        roleByDefinitionId.get(assignment.roleDefinitionId)?.code
        ?? assignment.roleDefinitionId,
      header: "Role",
    },
    {
      accessorKey: "revokedAt",
      header: "Status",
      cell: ({ getValue }) => {
        const revokedAt = getValue<string | null>();
        return revokedAt == null
          ? <span className={styles.status}>Active</span>
          : <span className={styles.statusRevoked}>Revoked</span>;
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ getValue }) => {
        const createdAt = formatDate(getValue<string | null>());
        return createdAt
          ? <time dateTime={createdAt.dateTime}>{createdAt.label}</time>
          : "Date unavailable";
      },
    },
    {
      accessorKey: "grantActorUserId",
      header: "Grant actor",
      cell: ({ getValue }) => {
        const grantActorUserId = getValue<string | null>();
        return grantActorUserId ?? "Not recorded";
      },
    },
    {
      accessorKey: "isBreakGlass",
      header: "Break-glass",
      cell: ({ getValue }) => {
        const isBreakGlass = getValue<boolean>();
        return isBreakGlass
          ? <span className={styles.breakGlass}>Break-glass</span>
          : "No";
      },
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => (
        <button
          aria-expanded={row.original.id === selectedAssignmentId}
          className={styles.detailsButton}
          onClick={() => setSelectedAssignmentId(row.original.id)}
          type="button"
        >
          View details
        </button>
      ),
    },
  ], [roleByDefinitionId, selectedAssignmentId]);

  const tableProps = {
    ariaLabel: "Role assignments",
    columns,
    data: emptyAssignments,
    getRowId: (assignment: RoleAssignmentDto) => assignment.id,
  };

  // Never keep protected assignment data visible after the server rejects
  // access from either the members or the assignments request.
  if ((membersQuery.isError && membersAuthError) || (assignmentsQuery.isError && assignmentsAuthError)) {
    return (
      <section aria-labelledby="assignments-title" className={styles.pageContent}>
        <PageHeading organizationId={organizationId} />
        <AssignmentsLoadError
          onRetry={() => {
            void membersQuery.refetch();
            void assignmentsQuery.refetch();
          }}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="assignments-title" className={styles.pageContent}>
      <PageHeading organizationId={organizationId} />

      <div aria-labelledby="assignment-filters-title" className={styles.filterCard}>
        <h2 id="assignment-filters-title">Assignment filters</h2>
        <div className={styles.filterGrid}>
          <label className={styles.filterField}>
            <span>Member</span>
            <select
              aria-label="Member"
              className={styles.select}
              disabled={membersQuery.isLoading}
              onChange={(event) => setSelectedUserId(event.currentTarget.value)}
              value={selectedUserId}
            >
              <option value="">Select a member…</option>
              {members.map((member) => (
                <option key={member.membershipId} value={member.userId}>
                  {member.name} ({member.email})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Scope</span>
            <select
              aria-label="Assignment scope"
              className={styles.select}
              onChange={(event) => {
                const nextScope = event.currentTarget.value as TenantAssignableScope;
                setScope(nextScope);
                setParentIdInput("");
              }}
              value={scope}
            >
              {scopes.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          {scope === "ORGANIZATION"
            ? (
              <p className={styles.filterHint}>
                Target parent: this organization (<code>{organizationId}</code>)
              </p>
            )
            : (
              <label className={styles.filterField}>
                <span>{scope === "COMPANY" ? "Company ID" : "Plant ID"}</span>
                <input
                  aria-label={scope === "COMPANY" ? "Company ID" : "Plant ID"}
                  className={styles.input}
                  onChange={(event) => setParentIdInput(event.currentTarget.value)}
                  placeholder={scope === "COMPANY"
                    ? "Enter an existing Company ID"
                    : "Enter an existing Plant ID"}
                  type="text"
                  value={parentIdInput}
                />
              </label>
            )}
        </div>
        <p className={styles.filterHint}>
          Assignments are listed for one member at a time: select a member, pick the
          target scope, and provide the existing Company ID or Plant ID when required.
          The ID must already exist in the organization; it is not created here.
        </p>
        {membersQuery.isLoading
          ? <p className={styles.filterHint} role="status">Loading members…</p>
          : null}
        {membersQuery.isError && !membersAuthError
          ? <MembersLoadError onRetry={() => void membersQuery.refetch()} />
          : null}
        {!membersQuery.isLoading && !membersQuery.isError && members.length === 0
          ? (
            <p className={styles.filterHint} role="status">
              No members are available for this organization.
            </p>
          )
          : null}
      </div>

      {!filtersComplete
        ? (
          <section className={styles.waitingState} role="status">
            <p>Select a member and provide the target parent to load assignments.</p>
          </section>
        )
        : null}

      {filtersComplete && assignmentsQuery.isLoading
        ? (
          <div className={styles.tableCard}>
            <DataTable
              {...tableProps}
              isLoading
              loadingState="Loading assignments…"
            />
          </div>
        )
        : null}

      {filtersComplete && assignmentsQuery.isError && !assignmentsQuery.data
        ? <AssignmentsLoadError onRetry={() => void assignmentsQuery.refetch()} />
        : null}

      {assignmentsQuery.data
        ? (
          <>
            {assignmentsQuery.isError
              ? (
                <section aria-label="Refresh failure" className={styles.refreshNotice} role="status">
                  <p>Couldn&apos;t refresh assignments. Showing the last loaded list.</p>
                  <button
                    className={styles.retryButton}
                    onClick={() => void assignmentsQuery.refetch()}
                    type="button"
                  >
                    Retry
                  </button>
                </section>
              )
              : null}
            <div className={styles.tableCard}>
              <DataTable
                ariaLabel="Role assignments"
                columns={columns}
                data={assignmentsQuery.data.assignments}
                emptyState={<span>No assignments to display.</span>}
                filterPlaceholder="Filter assignments…"
                getRowId={(assignment) => assignment.id}
              />
            </div>
          </>
        )
        : null}

      {selectedAssignment
        ? (
          <AssignmentDetails
            assignment={selectedAssignment}
            onDismiss={() => setSelectedAssignmentId(null)}
            roleLabel={resolveRoleLabel(selectedAssignment)}
          />
        )
        : null}
    </section>
  );
}

function PageHeading({ organizationId }: RoleAssignmentsViewProps) {
  return (
    <div className={styles.heading}>
      <p className="eyebrow">Organization access</p>
      <h1 id="assignments-title">Role assignments</h1>
      <p className={styles.organizationContext}>
        Organization ID: <code>{organizationId}</code>
      </p>
    </div>
  );
}
