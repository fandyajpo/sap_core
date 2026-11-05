# P07 Entity Ownership Decision Closure

**Status: DECISION_COMPLETE.** P07.1–P07.10 are owner-approved. This closes the P07 owner-decision stream; it does not assert that every entity, aggregate, field, relationship, policy or implementation detail is technically validated or implementation-ready.

## Decision outcome

The project owner selected Option B for all ten P07 decisions:

1. Logical Domain Ownership with Controlled Access.
2. Aggregate-Based Ownership.
3. Centralized Enterprise Entity Ownership Registry.
4. Governed Ownership Transfer.
5. Stable Technical Identity + Governed Business Identity.
6. Domain-Owned Lifecycle with Shared Governance Standards.
7. Authoritative Source Ownership with Consumer-Owned Projections.
8. Explicit Domain Contracts with Governed Dependencies.
9. Automated Architecture Governance.
10. Canonical Ownership with Governed Shared Reference Contracts.

The detailed selection and rationale for each decision are recorded in the [decision matrix](p07-decision-matrix.md). The mapping to architecture records and validation work is in the [traceability matrix](p07-traceability-matrix.md) and [Phase 0.3 validation backlog](p07-phase-0.3-validation-backlog.md).

## Consolidated architecture

### 1. One authoritative logical owner

Every persistent business entity has exactly one authoritative logical domain owner. The owner controls authoritative writes, invariants, lifecycle transitions and domain behavior. Other domains may consume approved contracts, read models or database-enforced references without acquiring write ownership. A foreign key, shared query, reporting projection or UI surface does not transfer ownership.

The ten PostgreSQL schemas remain the namespaces selected in Phase 0. The ownership decision does not add schemas, authorize microservices, or change the modular-monolith deployment.

### 2. Aggregate-based write authority

Ownership is assigned at aggregate-root level where entities participate in one consistency and lifecycle boundary. The aggregate root controls invariants and writes for its dependent entities. A child normally inherits its root's owner and lifecycle; it receives independent ownership only when it has a genuinely independent identity, lifecycle, invariants and business authority.

Aggregate boundaries must be documented per entity before implementation. This decision does not declare every header/line, revision, balance or detail record to be an aggregate without evaluating its invariants and transaction boundary.

### 3. Central ownership registry

Maintain a centralized, version-controlled enterprise entity ownership registry as the authoritative architecture catalog. At minimum, each registered entity records:

- stable entity name and owning domain/schema;
- aggregate root and ownership granularity;
- authoritative write owner and approved read consumers/contracts;
- lifecycle owner and classification;
- technical identity and business identity strategy;
- organization/company/plant scope, when applicable;
- cross-schema relationships and the applicable P05 edge reference;
- authorization boundary and relevant P04 policy;
- projection/derived-data status and source provenance;
- decision status, version, rationale and change history.

The registry is architecture governance metadata. It is not a runtime authorization engine, database catalog, permission grant or substitute for CASL, database constraints, service contracts or tests.

### 4. Governed ownership transfer

Ownership changes require an explicit, reviewed transfer plan. The plan identifies current and future owners, reason, affected aggregates/contracts/consumers, identity and history preservation, data reconciliation, migration and cutover, rollback/forward-recovery approach, effective point and approvals.

There must be one authoritative write owner at any point in the transfer. Temporary dual-write authority is not the default and requires a separately approved, bounded migration protocol if ever unavoidable. Ownership transfer must not silently recreate entities, change stable identifiers or erase audit/history.

### 5. Stable technical and governed business identity

Technical identifiers are stable internal identities and are not repurposed when a business code, name, classification or external identifier changes. Business identifiers are separate, human-facing or domain-facing values with explicit owner, scope, normalization, uniqueness and lifecycle rules. External identifiers are separately namespaced by source/provider and must not become canonical identity by accident.

UUID remains the Phase 0 default direction for ERP-owned technical identifiers, but P07 does not choose a UUID version, generation mechanism, database default or Better Auth identifier type. Those require P08/P02 technical validation and the relevant entity contract. Natural/business-key constraints are specified per entity, not inferred globally.

### 6. Domain-owned lifecycle under shared standards

The owning domain controls entity states, valid transitions, activation, retirement, correction and archival semantics. Shared platform standards govern the minimum lifecycle metadata, auditability, retention hooks and safe deletion patterns. Shared standards do not create a central platform owner for domain lifecycle decisions.

Posted finance facts remain immutable and corrected through reversal/adjustment. Inventory movement facts remain traceable and are not casually rewritten. Consumer projections can be rebuilt from their authoritative source when the source contract and retained history permit it. Entity-specific legal retention and deletion remain subject to qualified policy decisions.

### 7. Authoritative sources and consumer-owned projections

An authoritative entity has one source owner. A consuming domain may own a projection/read model optimized for its own query and workflow needs. Such a projection is non-authoritative and must record source identity, provenance, version/ordering or effective-time semantics where needed, refresh/consistency expectations, failure handling and reconciliation/rebuild procedure.

A projection must not become an independent source of truth through uncontrolled writes. If a consumer needs to correct source data, it uses the source owner's command/contract. A snapshot intentionally preserves historical facts and is not treated as a live projection.

### 8. Explicit cross-domain contracts and dependency governance

Cross-domain interaction uses explicit, versioned domain contracts: in-process application interfaces/commands, events or controlled read models as justified. A consumer depends on the owner's published contract, not on another domain's internal Prisma model or unrestricted tables.

Dependencies must be discoverable, directionally valid and non-circular. Cross-domain writes are coordinated through the owning domain's contract and an application-orchestrated transaction only where the architecture and consistency boundary permit it. Transactional outbox or asynchronous workflow is selected when justified by delivery/reliability needs; P07 does not mandate a broker, microservices or distributed transactions.

### 9. Automated architecture governance

Enforce ownership and dependency rules through repeatable architecture checks in local/CI workflows. Checks should detect, as the codebase becomes available:

- unauthorized cross-domain writes/imports;
- dependencies on another domain's internal persistence types;
- cycles and forbidden dependency directions;
- unregistered entities or missing ownership metadata;
- projection/source ownership ambiguity;
- contract versioning and compatibility violations where machine-checkable.

Exceptions require a named owner, rationale, affected boundary, compensating control, approval, expiry/review date and removal plan. Automated checks are governance controls, not proof that business semantics are correct; human review and runtime tests remain necessary.

### 10. Canonical shared and reference entities

Shared/reference data retains one canonical owner. Consumers use the canonical contract or a governed local projection/snapshot; they do not create competing authoritative master records. Shared use does not mean shared write authority.

Reference records that change over time require effective dating or versioned snapshots when historical documents must preserve the value used at the time. The owner, scope, change authority, consumer semantics and historical treatment must be explicit. P07 does not assign unresolved reference concepts such as Currency or Tax Code to a domain; those remain owner decisions.

## Current ownership map

The ten-schema ownership map in [07 Entity Ownership Finalization](../phase-0.1/07-entity-ownership-finalization.md) is the current conceptual baseline, subject to the entity-level registry and unresolved boundaries in the decision/traceability records. In particular:

- core owns canonical platform identity and organization/company/plant concepts.
- master_data owns reusable non-accounting business reference data; it does not own CoA/account definitions.
- procurement, inventory, sales, finance, production and human_resources own their respective domain facts and lifecycles.
- system owns only approved cross-cutting platform concerns.
- integration remains reserved and entity-free in the initial scope.

The list of entity groups is not a final physical table catalog. Currency, Tax Code, fiscal calendar and other shared/reference ownership must not be guessed. Finance remains the sole owner of CoA/account identity under P06.

## Dependencies and non-goals

P07 composes with, but does not replace:

- P02 canonical identity and Better Auth persistence mapping;
- P03 organization/company/plant membership and scope;
- P04 authorization, CASL enforcement and service identities;
- P05 per-relationship FK/composite-FK/application-reference choices;
- P06 Finance-owned CoA and its consumer contracts;
- P08 Prisma multi-schema and database implementation governance;
- P09 pinned technology baseline and P10 session/revocation semantics.

P07 does not approve concrete columns, Prisma models, SQL constraints, FK actions, API payloads, event schemas, runtime authorization, data migration, package versions or deployment topology. Those require the applicable decisions and reproducible Phase 0.3 evidence.

## Closure assessment

- Owner decisions: P07.1–P07.10 OWNER_APPROVED.
- Decision stream: DECISION_COMPLETE.
- Documentation: this closure, decision matrix, traceability and validation backlog form the P07 decision packet; related architecture records require reconciliation as tracked by D01.
- Technical validation: pending Phase 0.3.
- Implementation readiness: not granted by this closure.
- Phase 1: remains blocked by the applicable gates and other open P02–P10 decisions/evidence.

No P07.11 is required to close the enumerated owner-decision stream. Remaining entity-level assignments and implementation details belong in the ownership registry and validation backlog, not an invented extra owner decision.
