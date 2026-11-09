# V04 Permission Persistence Implementation Preflight

**Status:** Technical preflight complete; implementation sequencing approved under P14  
**Audited ref:** `main` after PR #28 merge (`6ed02fb879d0116a88d49b6c87b12a74ea11e373`)  
**Scope:** Prisma RoleDefinition model, D7/D8 migrations and services, authorization evaluator, D8 integration tests, and CI disposable-PostgreSQL workflow.  
**Database access:** No database was connected to, inspected, migrated, seeded, or modified for this audit.

## Executive finding

The approved persistence design can be implemented as a forward migration and server-side adapter, but the audit found policy drift in the existing custom-role service/tests and several enforcement gaps that must be addressed in the same implementation stream. No new owner policy decision is required: the approved v0.1 policy and P14 design approval already specify Organization-only custom-role authoring, immutable permission snapshots, rejection of unsealed roles for assignment, and disabled-role fail-closed behavior.

## Verified findings

| Area | Current repository evidence | Required implementation response |
|---|---|---|
| Custom-role scope drift | `v04-authorization-policy-v0.1.md` §5 says custom-role creation/revision is Organization-only and Company/Plant authoring is not approved. `role-definition-service.ts` currently permits ORGANIZATION, COMPANY and PLANT. D8 integration tests create custom roles at all three scopes. The pure evaluator accepts custom grants only at ORGANIZATION scope. | Restrict create/revise service inputs and database constraints to ORGANIZATION scope. Replace D8 Company/Plant custom-role fixtures with built-in SYSTEM roles and test rejection of COMPANY/PLANT custom authoring. |
| Permission snapshot absent | Prisma `RoleDefinition` has no permission lock timestamp or grant relation. D8 creates/revises RoleDefinition metadata only. | Add `permissions_locked_at`, permission catalog, version-specific grant rows, and atomic create/revise/seal transactions. |
| SYSTEM role governance absent | D8 protects Organization custom-role revision fields, but its trigger returns without protecting SYSTEM RoleDefinition rows. There is no partial unique SYSTEM identity index or built-in tenant-role seed. | Add a unique SYSTEM identity index; prevent in-place SYSTEM identity mutation/deletion and protect catalog identifiers. Seed the exact eight roles and 15 permissions with immutable ALLOW snapshots. |
| Assignment accepts incomplete definitions | D7 assignment lookup validates role existence, kind, scope and owner, but there is no permission snapshot/lock field to require a sealed definition. | Reject assignments unless the role definition is sealed and valid. Keep PLATFORM role assignment excluded. |
| Disabled role semantics | D7 effective assignment queries do not filter `disabled_at`; D8 test explicitly asserts this legacy listing behavior. The approved persistence proposal requires the production grant loader to reject disabled roles. | Keep role-assignment listing semantics separate from authorization. The trusted authorization loader must exclude disabled roles, and new role grants must not assign disabled definitions. Add explicit tests for both boundaries. |
| Deny source absent | The pure evaluator accepts target-scoped denies, but no persisted DENY source exists. | Persist ALLOW/DENY effects; only trusted server-side loader output may populate evaluator grants/denies. DENY applicability must follow the verified source assignment's scope and ancestry; it must not create inheritance. |
| Audit model | D8 audit is append-only and links each role version, but does not copy permission rows into audit columns. Permission grant rows will be immutable and version-bound to RoleDefinition IDs. | Preserve existing audit transaction. A role version's exact permission snapshot is reconstructable from its immutable grant rows; create/revise plus grants and seal must commit atomically. |
| CI database isolation | `.github/workflows/validation.yml` runs D8 and V04 replay against PostgreSQL service containers on loopback ports. D8 suite requires `D8_ALLOW_DISPOSABLE_DB=1`, localhost, port 55434 and database `sap_core_d8_test`. | Extend CI with the new migration, preflight guard, grant-loader integration suite and seed assertions. Do not add any hosted DB step. |

## Migration safety requirements

1. Add a new forward-only Prisma migration; do not rewrite migrations 1–9.
2. Before creating seeded rows, execute a transactional preflight that aborts if any pre-existing `core.role_definition` or role-assignment data would conflict with the approved baseline. Do not overwrite, reassign or silently reinterpret existing rows.
3. Create the 15 permission definitions, eight typed SYSTEM RoleDefinitions and their exact v0.1 ALLOW grants; seal every seeded definition before commit.
4. Add RESTRICT foreign keys, unique role/permission pair, lookup indexes, partial unique SYSTEM identity index, and immutable grant/catalog/system-role protections.
5. Permit only the one-way `permissions_locked_at: NULL → timestamp` transition in the D8 RoleDefinition immutability trigger. Reject clearing/changing a lock timestamp and reject mutation/deletion of sealed grants.
6. Preserve Better Auth, memberships, typed assignments and unrelated P05 relationship edges.
7. Do not introduce custom-role DENY authoring, Platform tenant roles, ERP operational permissions, or Company/Plant custom-role authoring.

## Application implementation sequence

1. Update Prisma schema and add the forward migration/seed.
2. Extend custom RoleDefinition create/revise service to accept a complete Organization-scoped ALLOW set, validate every permission code against the catalog and the actor's server-derived delegable set, insert grants, seal, and write the existing audit event in one transaction.
3. Add a server-only loader that derives the actor from the current Better Auth session; loads assignments only through active typed membership/assignment joins; loads only sealed, enabled role definitions and immutable grants; rejects unknown/mismatched data; and produces trusted evaluator input.
4. Bind the loader and verified target context to the pure evaluator. Confirm DENY-overrides-ALLOW for exact targets and explicit child-administration paths without operational inheritance.
5. Bind production authorization callbacks to role assignment and role definition services; reject unsealed/disabled role assignments.
6. Add a narrow protected administrative server operation and direct-invocation tests before claiming application-path enforcement.

## Required tests

- Fresh migration replay and exact seed count/content/matrix assertions.
- Migration aborts without mutation when pre-existing role/assignment rows are present.
- SYSTEM role identity and permission codes cannot be mutated/deleted.
- Role grants cannot be inserted after sealing, nor updated/deleted; lock timestamp is one-way.
- Create/revise persists complete snapshots atomically with audit; failure rolls back all rows.
- Organization-only custom-role authoring; custom ALLOW subset and unknown/unsupported permission rejection.
- Unsealed, disabled, unknown, mismatched-scope or invalid-owner roles fail closed.
- Active Organization, Company and Plant membership/assignment joins.
- Organization and Company child-administration grants only to verified descendants; no sibling or operational inheritance.
- Applicable DENY overrides all applicable ALLOW entries for the requested target, including multiple role assignments.
- Anonymous actor, cross-tenant target selectors, revoked/suspended/ended memberships, direct server-boundary invocation and audit attribution.
- CI uses only explicitly guarded disposable PostgreSQL service databases.

## Explicit safety boundary

P14 authorizes repository implementation and CI/disposable test coverage. This preflight does not authorize local or hosted database inspection, production connections, hosted migration/seed execution, destructive database actions, or deployment. Those remain subject to separate explicit owner approval. V04 acceptance remains **BLOCKED** until the complete application, RLS, pooled-connection isolation and end-to-end evidence is established.
