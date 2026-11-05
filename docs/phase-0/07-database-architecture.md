# Database Architecture (Highest-Priority Foundation)

## Accepted topology

- **Database:** one logical database named `sap_core`.
- **Managed platform:** Prisma Postgres (accepted platform choice; not provisioned by this work).
- **Engine:** PostgreSQL. Current Prisma Postgres documentation describes PostgreSQL 17, but the deployed major must be confirmed when an instance is selected.
- **Schemas:** exactly ten governed logical namespaces: `core`, `master_data`, `procurement`, `inventory`, `sales`, `finance`, `production`, `human_resources`, `integration`, `system`.
- **Application shape:** one modular monolith, one relational database, no distributed transaction boundary.
- **Data access/evolution:** Prisma ORM and Prisma Migrate, with server-only client access and reviewable migration history.

```text
Next.js modular monolith
  └─ owner modules / application contracts
      └─ server-only Prisma Client
          └─ Prisma Postgres managed service
              └─ PostgreSQL database: sap_core
                  ├─ core             ├─ master_data
                  ├─ procurement      ├─ inventory
                  ├─ sales            ├─ finance
                  ├─ production       ├─ human_resources
                  ├─ integration      └─ system
```

The ten schemas are ownership namespaces in one database, not ten databases, deployment units, or authorization boundaries by themselves.

## Data rules

Use relational columns and constraints for durable business facts. Use UUID internal identifiers by default; human-readable document numbers are separate, scoped business identifiers allocated safely. Money/precision-sensitive quantities use exact decimal representations with scale/currency/unit policies decided before modeling. Persist instants with timezone-aware semantics and business dates as date-only values where appropriate; an instant does not retain an original named timezone. JSON/JSONB is limited to bounded variable payloads, not a substitute for relationships or ownership.

The database protects row-local and relational invariants with NOT NULL, CHECK, UNIQUE, FK and indexes. PostgreSQL CHECK is row-local and accepts NULL, so required values also need NOT NULL. Unique NULL behavior, FK delete/update actions, referencing-column indexes, precise numerics and timezone mapping are chosen deliberately. Cross-row rules (balanced journals, stock availability) need a transactional/concurrency protocol and reconciliation; they cannot be guaranteed by a normal row CHECK.

## Connection and privilege boundaries

Prisma Postgres documentation distinguishes pooled application connections from direct migration connections. Actual URLs, TLS, credentials, network controls, plans and database major are unconfigured. Define least-privilege runtime and migration identities separately, keep credentials in the deployment secret facility, and never expose connection strings to client code. Verify pooling, session/transaction semantics and any future RLS context before relying on them.

## Cross-schema governance

Ownership remains with the referenced module regardless of FK. Prisma/PostgreSQL documentation supports cross-schema relations in specified configurations, but project policy requires explicit per-edge approval. P05 now `OWNER_APPROVED` a hybrid per-relationship policy, selective composite FKs, per-entity lifecycle/deletion choices and a hybrid typed-FK/application-reference strategy; this is not blanket approval for any X01–X16 edge. Until each in-scope edge is selected and tested, do not silently add a cross-schema FK; define the approved owner contract and transaction-level validation instead. CoA ownership is resolved by P06 in favor of Finance; account consumers use Finance contracts/read models, while any physical relation remains governed by P05 and Phase 0.3 tests.

## Operational non-claims

No instance, schema, database user, network policy, backup plan, restore objective, migration, or query has been created or validated. The schema policy and operational exit gates are expanded in [08](08-schema-ownership-matrix.md), [11](11-database-standards.md), and [12](12-database-integrity.md).


## Phase 0.1 relationship reconciliation

The no-blanket-FK rule above remains in force. P05 now `OWNER_APPROVED` a hybrid per-relationship strategy with selective composite FKs, per-entity lifecycle/deletion choices and a hybrid typed-FK/application-reference approach. The X01–X16 entries remain candidate edge recommendations; no individual FK or migration is approved by that strategy alone. Validate every in-scope selection against pinned versions before `TECHNICALLY_VALIDATED`. See [cross-schema relationship policy](../phase-0.1/05-cross-schema-relationship-policy.md), [global physical ERD](../phase-0.1/09-global-physical-erd.md) and [dependency map](../phase-0.1/11-cross-schema-dependency-map.md).
