# V04 Transaction-Bound Tenant Context and RLS Design

**Status:** OWNER-APPROVED baseline; repository implementation and disposable-CI validation completed.  
**Owner approval:** 2026-11-09, explicit approval in the project conversation.  
**Implementation ref:** `main` at `3fae765a396d0aa62e62c700f526f4020c88d227`.  
**Scope:** Transaction boundary, tenant-context propagation, database role separation, RLS table classification, and validation strategy.  
**Database access:** Disposable PostgreSQL CI only. Hosted database access, provisioning, migration, and deployment remain separately gated.

## 1. Problem statement and implemented result

The original Organization member request resolved the Better Auth session, target context, persisted grants, policy, and protected query through separate global Prisma calls. Those calls could use different pool connections.

The approved design requires one interactive transaction for context resolution, persisted grant loading, policy evaluation, and the protected operation. The repository now implements that boundary in `src/lib/tenant-authorization.ts`, `src/lib/tenant-target-context.ts`, and the protected tenant readers.

## 2. Approved transaction-bound execution contract

The approved and implemented sequence is:

1. Resolve the Better Auth session before opening the tenant transaction. Actor identity comes only from the verified server session; identity/session operations remain outside tenant RLS context.
2. Open one interactive `prisma.$transaction(async tx => ...)`.
3. Set `app.user_id` using transaction-local `set_config(..., true)`.
4. Resolve the actor's active Organization membership using the same `tx`.
5. Validate the requested Organization/Company/Plant ancestry.
6. Only after each target ID is verified, set the corresponding `app.organization_id`, `app.company_id`, and `app.plant_id` values transaction-locally.
7. Load persisted role assignments and sealed permission grants using the same `tx`.
8. Evaluate policy and execute the protected operation using that same transaction client.
9. Commit or roll back; PostgreSQL clears all transaction-local GUC values on either outcome.

The callback must never fall back to the global Prisma singleton. Missing or inconsistent context, grants, scope, or policy identifiers fail closed.

### Approved context keys

| Key | Source | Implemented timing |
|---|---|---|
| `app.user_id` | Verified Better Auth session | At transaction start, after session validation |
| `app.organization_id` | Active Organization membership and verified target | After membership validation; incrementally installed during ancestry resolution |
| `app.company_id` | Verified descendant Company | Only after Company ancestry is validated |
| `app.plant_id` | Verified descendant Plant | Only after Plant ancestry is validated |

All values use transaction-local `set_config(..., true)`; session-level `SET` is not permitted for tenant context.

## 3. Approved database role model

- **Migration/owner role:** owns schemas/tables and applies migrations/policies; never used by application request handlers.
- **Runtime application role:** non-superuser, not a table owner, and no `BYPASSRLS`; receives only required runtime privileges.
- **CI test role:** mirrors the runtime role's RLS behavior in disposable PostgreSQL.

The repository supports separate `MIGRATION_DATABASE_URL` and runtime `DATABASE_URL`. CI verifies a disposable `sap_core_runtime` role is not superuser, does not have `BYPASSRLS`, and owns none of the RLS tables. Provider-specific hosted grants remain unverified and separately gated.

## 4. Implemented initial table classification

| Table group | Tables | Implemented treatment |
|---|---|---|
| Tenant roots | `core.organization`, `core.company`, `core.plant` | RLS enabled; visibility follows verified Organization and descendant target context. |
| Membership and assignment | `core.organization_membership`, `core.company_membership`, `core.plant_assignment` | RLS enabled; active self-membership bootstrap is narrowly scoped; parent consistency remains authoritative. |
| Role assignments | `core.organization_role_assignment`, `core.company_role_assignment`, `core.plant_role_assignment` | RLS enabled; rows are visible only through matching typed membership/assignment paths. |
| Role definitions and grants | `core.role_definition`, `core.role_permission_grant`, `core.role_definition_audit`, `core.break_glass_access_audit` | RLS enabled; SYSTEM catalog reads remain global; custom roles and audit are Organization-owned; immutable/append-only protections remain. |
| Permission catalog | `core.permission_definition` | Global read-only catalog; immutable. |
| Delegation policy | `core.permission_delegation_policy` | Global owner-controlled policy table; runtime SELECT-only; all permission rows default to non-delegable until owner approval. |
| Better Auth identity | `core.user`, `core.session`, `core.account`, `core.verification` | Excluded from initial tenant RLS so sign-in/session/account operations run without tenant GUCs. |
| Validation fixtures | `core.validation_records`, `master_data.validation_references` | Outside tenant RLS scope. |
| ERP schemas | Procurement, Inventory, Sales, Finance, Production, Human Resources, Integration, System | No tenant business-row models were included in this V04 increment; future models require explicit ownership and policy design. |

RLS is an additional data boundary, not a replacement for the application permission evaluator. It does not broaden policy semantics.

## 5. Policy semantics preserved

- No automatic Organization → Company → Plant operational permission inheritance.
- Explicit child-administration applies only after parent ancestry is verified.
- Company and Plant operational permissions require their own active typed membership/assignment paths.
- Applicable target-scope DENY overrides ALLOW.
- Custom roles are Organization-only and ALLOW-only; requested permissions must be within the creator's trusted delegable subset.
- Unsealed or disabled role definitions, unknown permissions, and missing context fail closed.
- Role grant snapshots and audit history retain their immutability/append-only protections.

## 6. Implemented same-connection and pool-isolation evidence

Disposable PostgreSQL CI now verifies:

1. `pg_backend_pid()` remains unchanged through context setup and protected query.
2. Tenant A context exposes A and not B.
3. Commit, rollback, and thrown exceptions clear transaction-local tenant context.
4. A reused connection can serve tenant B without tenant A context surviving.
5. Concurrent A/B transactions remain isolated.
6. Missing and malformed GUC values deny by default.
7. Direct SQL under the non-owner runtime role enforces RLS.
8. SYSTEM catalog reads, custom-role ownership, audit visibility, and Better Auth identity-table exclusion.
9. Runtime role cannot update the owner-controlled permission delegation policy.

Evidence is in `tests/v04-tenant-guc.integration.test.mjs`, `tests/v04-rls.integration.test.mjs`, and the pinned migration replay through all 12 migrations.

## 7. Owner decisions and remaining gates

The following design decisions are approved and implemented:

1. One interactive transaction per protected operation.
2. The `app.user_id`, `app.organization_id`, `app.company_id`, and `app.plant_id` keys and transaction-local semantics.
3. Separate non-owner, non-`BYPASSRLS` runtime role and migration/owner role.
4. Initial tenant root, membership, assignment, role, and audit RLS classification.
5. Better Auth identity tables excluded from the first increment.

Remaining owner-controlled decisions are separate from this approved design:

- Approve the exact permission codes that may be delegated to Organization custom roles. Until then, `permission_delegation_policy` remains all-false.
- Separately approve hosted provider role provisioning, grants, secret configuration, hosted migration, and production smoke testing. No hosted database was accessed or changed by this implementation.

## 8. Current conclusion

The approved repository design, RLS implementation, runtime-role contract, and disposable-CI isolation evidence are complete. Hosted/production acceptance remains BLOCKED until the separate gates above are approved and verified.
