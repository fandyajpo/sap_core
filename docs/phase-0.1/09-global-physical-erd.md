# Global Physical ERD — Draft

**Status: physical draft; not implementation-ready.** The diagram illustrates only a minimum identity/organization persistence skeleton and candidate keys. P06 separately owner-approves Finance CoA ownership and company scope, but the CoA physical structure is intentionally omitted pending Phase 0.3. This draft does not settle field names, Better Auth ID type, module company scope, retention, indexes, delete actions or all ten schemas' models. No Prisma schema, generated client, migration or database exists.

```mermaid
erDiagram
  CORE_ORGANIZATIONS {
    uuid id PK
  }
  CORE_COMPANIES {
    uuid id PK
    uuid organization_id FK
    string code_candidate
  }
  CORE_PLANTS {
    uuid id PK
    uuid organization_id FK
    uuid company_id FK
  }
  CORE_USERS {
    adapter_scalar id PK
    string email_candidate
  }
  CORE_AUTH_ACCOUNTS {
    adapter_scalar id PK
    adapter_scalar user_id FK
  }
  CORE_AUTH_SESSIONS {
    adapter_scalar id PK
    adapter_scalar user_id FK
  }
  CORE_ORGANIZATION_MEMBERSHIPS {
    uuid id PK
    adapter_scalar user_id FK
    uuid organization_id FK
  }
  CORE_COMPANY_MEMBERSHIPS {
    uuid id PK
    adapter_scalar user_id FK
    uuid organization_id FK
    uuid company_id FK
  }
  CORE_PLANT_ASSIGNMENTS {
    uuid id PK
    adapter_scalar user_id FK
    uuid company_id FK
    uuid plant_id FK
  }
  HR_EMPLOYEES {
    uuid id PK
    adapter_scalar user_id_optional_FK
  }

  CORE_ORGANIZATIONS ||--o{ CORE_COMPANIES : X01
  CORE_COMPANIES ||--o{ CORE_PLANTS : X02
  CORE_USERS ||--o{ CORE_AUTH_ACCOUNTS : X06
  CORE_USERS ||--o{ CORE_AUTH_SESSIONS : X06
  CORE_USERS ||--o{ CORE_ORGANIZATION_MEMBERSHIPS : X03
  CORE_ORGANIZATIONS ||--o{ CORE_ORGANIZATION_MEMBERSHIPS : X03
  CORE_USERS ||--o{ CORE_COMPANY_MEMBERSHIPS : X04
  CORE_COMPANIES ||--o{ CORE_COMPANY_MEMBERSHIPS : X04
  CORE_ORGANIZATION_MEMBERSHIPS ||--o{ CORE_COMPANY_MEMBERSHIPS : X04
  CORE_USERS ||--o{ CORE_PLANT_ASSIGNMENTS : X05
  CORE_PLANTS ||--o{ CORE_PLANT_ASSIGNMENTS : X05
  CORE_COMPANY_MEMBERSHIPS ||--o{ CORE_PLANT_ASSIGNMENTS : X05
  CORE_USERS o|--o{ HR_EMPLOYEES : X07
```

## Key and constraint interpretation

- UUIDs on proposed ERP-owned records follow the Phase 0 default identifier direction. The canonical Better Auth principal and dependent auth rows use `adapter_scalar`, deliberately not assumed to be UUID. The pinned adapter/generator determines the type; every reference must match it.
- `code_candidate`, email normalization/uniqueness and composite unique keys are not finalized. For X02, the target candidate is `companies.(organization_id,id)` and the source is `plants.(organization_id,company_id)`; for X09, the candidate target is `plants.(company_id,id)`. For X04, candidate targets are `companies.(organization_id,id)` and `organization_memberships.(user_id,organization_id)`; for X05, they are `company_memberships.(user_id,company_id)` and `plants.(company_id,id)`. These need matching unique constraints and exact Prisma/PostgreSQL validation.
- X01 recommends `companies.organization_id → organizations.id`. X02 requires the composite key above to prove the plant's company and organization are consistent. Exact key names and nullability remain undecided.
- X03–X05 are a proposed scope model, not approved membership inheritance. Candidate membership uniqueness is per user/scope only if owners choose one row per scope; effective-dated history may require a stable membership-row key instead. Composite constraints should prove that company membership matches its organization membership and plant assignment matches a company entitlement. A FK proves row association, not current membership status or authorization; enforce active entitlement in the owning transaction. If membership cardinality/policy differs, redesign before migration.
- X06 is same-schema auth persistence. X07 is an optional cross-schema employee-to-user FK candidate; employee may exist without a login. No uniqueness on employee `user_id` is proposed until owners decide identity/employment cardinality.
- No cascade deletion is implied by the diagram. Candidate deletion behavior is described per edge in [05](05-cross-schema-relationship-policy.md). The diagram's relationship lines do not encode compound FK column order; the edge matrix and the composite-key notes above are authoritative proposals.

## Intentionally omitted

The ten schemas remain exactly `core`, `master_data`, `procurement`, `inventory`, `sales`, `finance`, `production`, `human_resources`, `integration`, and `system`. P06 owner-approves Finance as sole CoA owner and company-level scope; `master_data` does not own a copy. The CoA's physical form remains intentionally omitted: approval does not settle fields, IDs beyond stable account identity, keys, indexes, FKs, version storage or migration strategy. Operational schema tables also omit unsupported columns and relationships. Extend this ERD only after P06/P02–P10 dependencies and Phase 0.3 validation are satisfied; see [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md).

## Prisma validation prerequisites

The official Prisma ORM 7 multi-schema guide documents one datasource schema list and model-level `@@schema` mappings, cross-schema relations and Prisma Migrate support. That establishes capability in principle only. Validate ten exact schema names, relation/compound-key support, Better Auth model mappings, generated SQL, fresh/upgrade migrations and `RESTRICT` behavior against the selected pinned Prisma version and a disposable PostgreSQL instance before marking any item `VALIDATED`.
