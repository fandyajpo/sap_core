# Phase 1 Implementation Gates

**Gate result: NOT CLEARED.** These are proposed objective gates; they are not permission to start implementation. Phase 1 is not ready while platform-blocking owner decisions remain unapproved or technical behavior remains untested. See [decision register](01-decision-register.md) and [policy classification](12-erp-policy-classification.md).

## Required entry gates

| Gate | Blocking decision / evidence | Pass criterion before affected implementation |
|---|---|---|
| G01 — Canonical identity | P02 | Security/platform owner approves one principal and Better Auth mapping to `core.users`; account/session/verification placement and employee separation documented. Pinned generated schema is reviewed; test shows no duplicate identity. |
| G02 — Organization scope | P03 | Product/domain owners approve organization/company/plant meaning, hierarchy, membership boundaries, company/plant constraints and selection semantics. Tests reject cross-organization/company/plant references and unentitled reads. |
| G03 — Authentication and revocation | P10 | Session verification, account disablement, membership revocation and freshness requirements are explicitly selected. Tests prove direct server operation denial and revocation at agreed latency. Email/recovery operational gates are required before enabling those flows. |
| G04 — Authorization | P04 | Owners approve role/scope/inheritance and deny-by-default policy. Route Handler, Server Action, data-access and module-service tests prove action and row filtering, cross-tenant isolation, stale membership and cache separation. |
| G05 — Relationship governance | P05 | Every relation in Phase 1 has an approved row with typed FK/composite FK/application-reference enforcement, nullability, delete/update behavior, owning contract and test. Company/plant pair invariants are proven. |
| G06 — Entity ownership and minimum ERD | P07 | Each selected entity has one owner, stable key type, scope, fields, lifecycle, constraints, authorization and correction/snapshot behavior. Core logical and physical ERDs match the entity and relationship matrices. |
| G07 — Chart of accounts | P06 | If finance or any account reference is in Phase 1, finance/master-data owners approve the owner, scope, lifecycle and consumer contract; migration impact is documented. If deferred, no CoA model/reference may be silently implemented. |
| G08 — Prisma multi-schema and migrations | P08 | Exact Prisma major/provider/adapter set is pinned. Clean generation validates all ten exact schemas, approved relations and client ownership; fresh and upgrade migrations are tested on disposable PostgreSQL. Prisma Migrate remains the sole governed migration path. |
| G09 — Technology baseline | P09 | Node, Next/React, Prisma CLI/client, Better Auth/adapter, CASL and selected feature packages are locked together. Clean install, build, typecheck and representative security/build tests pass on the target deployment runtime. Registry peers alone do not pass this gate. |
| G10 — Database operations | Phase 0 ADR-OPEN-05 | Runtime/migration credentials/roles, pooled vs direct paths, provider/engine major, TLS/network controls and backup/recovery objectives are selected and verified before provisioning/production migration. |
| G11 — Phase 1 scope | P12–P13 | Product explicitly lists included modules/features. Any module-specific or jurisdiction policy required by those features is owner-approved; omitted policies stay `DEFERRED` and the corresponding feature remains excluded. |

## Technical evidence packet

For each technical gate, retain the pinned version/platform, exact repeatable commands, schema/migration artifacts, test fixtures and results, owner reviewer and date. At minimum, use two organizations, two companies and multiple plants with users/memberships that include authorized, unauthorized, revoked and unassigned cases. Verify generated Prisma schema and SQL rather than relying on diagrams or docs.

Do not count unit-only checks as tenant-isolation proof. Exercise the actual protected Route Handler, Server Action, service/use-case and query predicates. Verify that a malicious caller cannot change user ID, company, organization or plant in input to widen scope. Test migration creation/application from an empty database and upgrade from the prior migration history.

## Explicitly deferred unless Phase 1 scope changes

Payroll, tax, fiscal/legal requirements, accounting standard, FX/rounding, inventory valuation, production costing, legal record retention, number gaplessness, external integrations, Vite+, PDF/XLSX features and non-core workflows remain excluded until their qualified owners decide them. If Phase 1 includes any such feature, its decision becomes a module/jurisdiction gate before schema or code work.

## Decision rule

A gate can be considered satisfied only when its owner decision is `APPROVED` and required technical evidence is `VALIDATED`; a design recommendation marked `PROPOSED` or a deferral is not a pass. Do not report Phase 1 as ready while any applicable platform gate is unmet. Current aggregate outcome: **NOT READY — BLOCKING DECISIONS REMAIN**.
