# V04 F-04 Legacy Tenant Resolver Disposition

**Date:** 2026-11-09  
**Base revision:** `25b1b271064723015b6ad8a512b52b598abdf7b4`  
**Change branch:** `chore/v04-f04-remove-legacy-tenant-resolver`  
**Finding:** F-04 — legacy non-transactional tenant context resolver  
**Disposition:** Remove unused production adapter and its obsolete pure resolver; retain only the shared tenant-scope request type.  
**Database impact:** None. No migration, hosted database access, or database mutation.

## 1. Audit evidence

The base revision was inspected before changes. The complete checked-in `src/` tree contained 33 TypeScript/JavaScript source files. The legacy adapter `src/lib/tenant-context.ts` was not imported by any production route, page, component, or other production library module.

The adapter called the root Prisma singleton for Organization membership, Company membership, and Plant assignment queries. Those independent queries did not share the protected operation's interactive transaction and did not evaluate an operation permission. It was therefore not an acceptable entry point for protected tenant operations.

The associated pure implementation `src/lib/tenant-context-core.ts` exported `createTenantContextResolver`, `TenantContext`, `TenantContextError`, and repository interfaces. Its only consumer was the legacy adapter and its dedicated unit test `tests/tenant-context.unit.test.mjs`. No production path depended on that resolver or its result types.

## 2. Changes

- Deleted `src/lib/tenant-context.ts`, removing the root-Prisma legacy adapter and `resolveTenantContext` export.
- Deleted `src/lib/tenant-context-core.ts`, removing the unused membership/assignment resolver and its now-unused result/error/repository types.
- Deleted `tests/tenant-context.unit.test.mjs`, which tested only the retired resolver.
- Removed the obsolete `test:tenant-context` package script.
- Added `src/lib/tenant-scope-types.ts` containing only the shared discriminated-union `TenantScopeRequest` type.
- Updated `tenant-authorization.ts`, `organization-members-reader-core.ts`, and `tenant-target-context-core.ts` to import the shared type from `tenant-scope-types.ts`.

## 3. Required authorization path

Protected tenant operations must use the transaction-bound `requireTenantPermission(tx, session, request, permission)` boundary in `src/lib/tenant-authorization.ts`. Target ancestry is resolved by `resolveTenantTargetContext(tx, session, request)` using the same interactive transaction client. Authorization grant loading and the protected operation must remain on that same transaction.

Custom-role create/revision retains its separately documented session-bound authorization adapter and transaction boundary. This F-04 cleanup does not alter that exception.

The pure `tenant-target-context-core.ts` remains because it is used by the transaction-bound target-context adapter and its dedicated unit tests. It validates target ancestry but does not itself grant permission.

## 4. Safety and evidence boundaries

- No production import/callsite of the legacy adapter was found in the inspected source tree at the base revision.
- The removed resolver was not the active authorization boundary.
- The new shared type is type-only and contains no database access or authorization behavior.
- No schema, migration, permission policy, RLS policy, database role, or hosted resource was changed.
- This is a static source audit and code change; it does not prove hosted-provider security or complete production acceptance.
- The historical source-audit document is retained as an immutable record of the finding at its original audited revision. This disposition supplements it rather than rewriting historical evidence.

## 5. Acceptance status

F-04's identified legacy resolver surface is removed from the production source tree. Mark F-04 **implementation CLOSED, pending CI and review evidence**. Do not infer that V04 as a whole is accepted: F-02 production adapter wiring, hosted database/provider verification, and all other owner-controlled acceptance gates remain independently governed.
