# Application Architecture

## Accepted shape

One deployable Next.js application is a modular monolith. It uses one Prisma Postgres-managed PostgreSQL database named `sap_core` with ten schemas. A module owns its domain rules, application services, and write paths. Deployment together does not mean shared business ownership. No microservices, distributed transactions, message broker, integration engine, or external ERP/accounting/payment/CRM synchronization is in initial scope.

## Request path

1. Browser submits a bounded request to a Next.js Route Handler or invokes a Server Action for a UI interaction.
2. The transport boundary parses input as untrusted data using a runtime schema, resolves the server-verified Better Auth actor/session, and invokes a module application use case.
3. The use case applies CASL-based authorization with trusted organization/company/resource context; it owns lifecycle and transaction coordination.
4. The module's repository/data-access boundary uses the server-only Prisma Client and its owned tables. Other modules are reached through explicit in-process contracts/application services, not arbitrary table access.
5. The response maps domain outcomes to a stable REST/UI DTO and safe error. It never serializes unrestricted ORM records.

A central data-access layer may provide session/actor derivation and narrow shared primitives, but must not become a business-logic or cross-module persistence layer. Next.js Proxy is optional for optimistic redirects, never the sole security boundary. Server Actions are directly callable and re-check authentication and authorization internally.

## Dependency direction

`transport (Next.js) → application use case → domain policy → module-owned repository → Prisma/PostgreSQL`.

Cross-module interactions use named contracts and a coordinator when one local transaction spans owners. Shared kernel code contains only genuinely business-neutral primitives. Modules must not import each other's private repositories or modify each other's tables. Avoid circular dependencies; refactor a cycle to a stable contract or correct ownership.

## Module list

The business/platform owners are: core organization/platform; master data; procurement; inventory; sales; finance; production; human resources; system administration/audit/numbering. `integration` is reserved and contains no active module in Phase 0. See [module ownership](04-module-ownership.md) and [schema ownership](08-schema-ownership-matrix.md).

## Server/client boundaries

Prisma, Better Auth secret-bearing configuration, authorization decisions, and privileged business logic remain server-only. Client checks are presentation. The browser receives only minimal DTOs. Remote data is managed by TanStack Query; Zustand is for shared transient UI state; local React state for local concerns; URL parameters for shareable navigation/filter state; React Hook Form for form lifecycle. Do not make multiple caches authoritative for the same data.

## Consistency and failure

Single-business-fact changes use bounded PostgreSQL transactions. Multi-module local work has a coordinator and explicit rollback/failure mapping. External calls do not occur inside a database transaction. A workflow too long for one local transaction must not be represented as a distributed workflow without a separate decision; Phase 0 flows are local-only or remain unimplemented. Retries require classified retryable errors, idempotency, and bounded attempts.

## Deployment and environment assumptions

No hosting provider or database instance has been selected or provisioned by this specification. Runtime and migration connection paths, secrets, observability backend, file storage, and email delivery must be configured and verified before production. Next.js owns its supported build/deploy path; Vite+ is not presumed to replace it.


## P06 Finance ownership boundary

The owner-approved P06 decision assigns the CoA, account identity and account governance solely to Finance. Other modules use Finance contracts or controlled read models and do not mutate Finance-owned tables. Company CoAs remain independent; plant scope follows its company. This decision does not add a broker, microservice or a physical schema design. See [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and its [consumer/validation traceability](../phase-0.2/p06-traceability-matrix.md).
