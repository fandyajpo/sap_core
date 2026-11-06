# Global Physical ERD — Draft

**Status: physical draft; not implementation-ready.** The diagram illustrates only a minimum identity/organization persistence skeleton and candidate keys. P06 separately owner-approves Finance CoA ownership and company scope, but the CoA physical structure is intentionally omitted pending Phase 0.3. This draft does not settle field names, Better Auth ID type, module company scope, retention, indexes, delete actions or all ten schemas' models. The original statement that no Prisma schema or migration existed described the earlier draft baseline; the current repository has a limited validation/Better Auth schema and six migrations, but no tenant entity model or tenant migration (see the [validation register](../phase-0.3/01-validation-execution-register.md)). The diagram remains conceptual; see the current decision overlay below for later P05 approvals, which are not implementation or compatibility evidence.

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
- `code_candidate`, email normalization/uniqueness and composite unique keys are not finalized. The X02/X04/X05 tuples in the original ERD were candidate proposals, not approved physical mappings. In particular, the older X04 candidates `(user_id, organization_id)` and `(organization_id, company_id)`, and X05 candidates `(user_id, company_id)` and `(company_id, plant_id)`, are not the current approved membership/assignment tuples. See the current decision overlay below; all target-key requirements remain subject to PostgreSQL/Prisma validation.
- D9 now approves X01's required `companies.organization_id → organizations.id` FK with `NOT NULL`, `ON DELETE RESTRICT`, and `ON UPDATE RESTRICT`. D10 now approves X02's required `(plants.organization_id, plants.company_id) → companies(organization_id, id)` composite relationship with both actions `RESTRICT`, or its approved Core same-transaction fallback and wrong-parent negative test when Prisma/provider cannot represent it safely.
- D5 preserves zero-to-many Companies per Organization and forbids a permanent unique constraint on `Company.organizationId`; single-company-first remains a provisioning/UI policy. D6 approves only the stated active/current User–Company and User–Plant duplicate/history semantics. It does not select a full status vocabulary or index predicate. D11–D13 later approve X03–X05 policy as specified below; their physical mapping, migrations, and technical validation remain outstanding. A FK proves structural association, not current membership effectiveness or authorization.
- X06 remains separately owner-approved and validated under V03; see the [V03/X06 evidence](../phase-0.3/01-validation-execution-register.md#v03-evidence-and-x06-implementation-reconciliation). X07 is still an optional employee-to-user FK candidate; no X07–X16 edge is approved by this reconciliation unless another explicit approval is separately recorded. D2 does not approve Invitation edges, and D15 approves no additional P05 edge.
- The ERD relationship lines encode conceptual cardinality, not delete actions or compound-FK column order. See the [P05 matrix](05-cross-schema-relationship-policy.md) and the [V04.2 tenant-scope design](../phase-0.3/v04-tenant-scope-model-design.md) for the later approved policy; neither diagram is implementation or compatibility evidence.

### Current owner-decision overlay (V04.3.1)

| Decision | Edge | Current `OWNER_APPROVED` policy only; physical implementation/validation pending |
|---|---|---|
| D9 | X01 Company → Organization | Required direct FK `Company.organizationId → Organization.id`; `NOT NULL`; `ON DELETE RESTRICT`; `ON UPDATE RESTRICT`. No permanent unique `Company.organizationId` constraint. |
| D10 | X02 Plant → Company | Required composite relationship `(Plant.organizationId, Plant.companyId) → Company(organizationId, id)`; `ON DELETE RESTRICT`; `ON UPDATE RESTRICT`. If unsafe/unrepresentable in Prisma/provider, use Core-owned same-transaction validation and a negative wrong-parent test. |
| D11 | X03 Organization Membership | Required direct FKs `userId → User.id` and `organizationId → Organization.id`; each uses `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`; stable episode ID and preserved history. |
| D12 | X04 Company Membership | Direct User FK; `(organizationMembershipId, userId, organizationId) → OrganizationMembership(id, userId, organizationId)` and `(organizationId, companyId) → Company(organizationId, id)` composite FKs; every FK uses `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`. PostgreSQL-required target keys only; approved same-transaction Core fallback and negative wrong-parent tests if Prisma/provider cannot safely map them. |
| D13 | X05 Plant Assignment | Direct User FK; `(companyMembershipId, userId, organizationId, companyId) → CompanyMembership(id, userId, organizationId, companyId)` and `(organizationId, companyId, plantId) → Plant(organizationId, companyId, id)` composite FKs; every FK uses `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`. PostgreSQL-required target keys only; approved same-transaction Core fallback and negative wrong-parent tests if Prisma/provider cannot safely map them. |

D14 separately approves `RESTRICT` delete/update actions for Role Assignment edges to exactly matching typed scope parents and Role Definitions. Role-record primary keys are immutable; used Role Definitions are retired/disabled rather than hard-deleted; revoked Role Assignments and role-grant history are preserved without cascade deletion. D14 does not change X01–X05. X06's separately approved behavior remains as recorded in the P05 matrix and V03 evidence. Invitation edges and X07–X16 remain individually unapproved absent separate explicit approval. None of these FKs proves current status, membership effectiveness, role permission, or authorization.

## Intentionally omitted

The ten schemas remain exactly `core`, `master_data`, `procurement`, `inventory`, `sales`, `finance`, `production`, `human_resources`, `integration`, and `system`. P06 owner-approves Finance as sole CoA owner and company-level scope; `master_data` does not own a copy. The CoA's physical form remains intentionally omitted: approval does not settle fields, IDs beyond stable account identity, keys, indexes, FKs, version storage or migration strategy. Operational schema tables also omit unsupported columns and relationships. Extend this ERD only after P06/P02–P10 dependencies and Phase 0.3 validation are satisfied; see [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md).

## Prisma validation prerequisites

The official Prisma ORM 7 multi-schema guide documents one datasource schema list and model-level `@@schema` mappings, cross-schema relations and Prisma Migrate support. That establishes capability in principle only. Validate ten exact schema names, relation/compound-key support, Better Auth model mappings, generated SQL, fresh/upgrade migrations and `RESTRICT` behavior against the selected pinned Prisma version and a disposable PostgreSQL instance before marking any item `TECHNICALLY_VALIDATED`.
