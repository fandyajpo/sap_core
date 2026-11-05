# P07 Phase 0.3 Validation Backlog

**Purpose:** convert P07's ten owner-approved decisions into reproducible architecture and implementation evidence. All items are pending; none is marked passed. P07 decision completion is not technical validation or implementation readiness.

| ID | Validation | Required evidence / method | Acceptance criteria | Priority / gate |
|---|---|---|---|---|
| P07-V01 | Single authoritative owner coverage | Audit the selected entity catalog against a version-controlled ownership registry; enumerate all persistent entities and detect missing/multiple owners. | Every in-scope entity has exactly one authoritative owner; reserved/deferred entities are explicitly marked; no implicit ownership. | P0; G06 |
| P07-V02 | Aggregate ownership and transaction boundaries | Review each selected aggregate root, dependent entity, invariants, lifecycle and transaction boundary against logical/per-schema ERDs and module contracts. | Every implemented aggregate has one root owner; dependent writes remain inside owner boundary; independent lifecycle is explicitly justified. | P0; G06 |
| P07-V03 | Registry completeness and governance | Validate required registry metadata, version history, review workflow and link integrity. | Registry includes owner, aggregate, lifecycle, identity, scope, consumers/contracts, relationships, authorization reference and status; it is versioned and reviewable. | P0; G06 |
| P07-V04 | Ownership transfer safety | Design/test a representative transfer plan using disposable fixtures or migration rehearsal; verify cutover and rollback/forward-recovery. | No ungoverned dual writer; stable IDs/history/audit preserved; reconciliation and cutover evidence recorded. | P1; before any ownership transfer |
| P07-V05 | Technical/business/external identity separation | Review generated Prisma/SQL and tests for representative core, master-data and finance identifiers. | Technical IDs are stable; business keys have explicit owner/scope/normalization/uniqueness; external IDs are source-namespaced; no accidental identity mutation. | P0; G06/G08 |
| P07-V06 | Domain lifecycle and shared standards | Test representative lifecycle transitions, immutable posted finance facts, inventory movement traceability, retention hooks and deletion restrictions. | Only owning domain changes authoritative lifecycle; shared standards are applied; corrections preserve history and audit. | P0 for selected workflows; G06 |
| P07-V07 | Projection provenance and reconciliation | Build or test one representative consumer projection/read model after source change, duplicate delivery, delay and rebuild. | Projection is non-authoritative; source/provenance/version and consistency semantics are observable; rebuild/reconciliation restores expected state. | P1; before projection implementation |
| P07-V08 | Contract and dependency boundary | Inspect imports and call paths; test representative domain contract and forbidden dependency cases. | Consumers use explicit owner contracts; no circular dependency or unauthorized direct write/internal Prisma model coupling. | P0; G06/G09 |
| P07-V09 | Automated architecture governance | Run boundary/dependency/entity-registry checks locally and in CI, including deliberate violation fixtures. | Checks fail on forbidden dependencies/unregistered ownership; exceptions require owner, rationale, scope, control and expiry. | P0; G09 |
| P07-V10 | Canonical shared-reference governance | For each selected shared reference, verify owner, consumer contract, change/effective-time behavior and historical snapshot requirements. | One canonical owner; no competing master copies; historical consumers preserve the reference semantics applicable at transaction time. | P0 when shared references are in scope; G06 |

## Cross-decision dependencies

- P02: canonical identity and Better Auth adapter mapping.
- P03: organization/company/plant scope and membership cardinality.
- P04: authorization and service identity; registry is not authorization.
- P05: per-edge FK/composite-FK/application-reference and lifecycle/delete choices.
- P06: Finance-owned CoA/account boundary.
- P08: Prisma model/migration and multi-schema enforcement.
- P09: pinned runtime/tooling for architecture checks.
- P10: session/revocation semantics for protected operations.

## Blocking classification

The minimum ownership, aggregate, identity and domain-contract evidence (P07-V01, V02, V03, V05, V06 and V08) is blocking before implementing affected entities or cross-domain writes. P07-V09 is a Phase 1 architecture-quality gate. Transfer and projection tests (V04/V07) are required before implementing those capabilities, not a reason to invent transfer/projection infrastructure in the initial platform. V10 is required before shared-reference entities are implemented or consumed as authoritative data.

No implementation or CI result is implied by this backlog. Exact tests should be selected against the actual Phase 1 scope and codebase.
