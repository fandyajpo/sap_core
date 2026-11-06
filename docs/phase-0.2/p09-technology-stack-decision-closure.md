# P09 Technology Stack & Runtime Compatibility Decision Closure

**Status: `DECISION_COMPLETE`.** P09.1–P09.17 are `OWNER_APPROVED`. This closes the owner-decision stream only. It does not select exact package versions, create a package manifest or lockfile, certify compatibility, authorize implementation, or establish production readiness.

## Consolidated approved architecture

- **Core-first dependency baseline:** lock core dependencies first; optional packages are installed only for concrete approved features.
- **Runtime/package manager:** pin a supported Node.js LTS and exactly one package manager. Use the same manager and lockfile policy in development, CI and deployment; CI uses frozen/immutable install. Exact manager and versions were not selected by this owner-decision closure. The later repository declarations are recorded in the reconciliation addendum below; their support and deployment validation remain pending.
- **Framework compatibility:** Next.js is the framework and production build/runtime authority. React and React DOM must align with its supported range; TypeScript must be supported by Next.js and the selected dependencies.
- **Database compatibility:** Prisma CLI, Prisma Client and Prisma Migrate form one version set against an explicit PostgreSQL major/provider. Actual Prisma Postgres behavior must be tested.
- **Security dependencies:** Better Auth and its Prisma adapter must match the selected Prisma set. CASL remains a separate authorization engine; authentication does not grant authorization.
- **Frontend/toolchain:** frontend packages must satisfy peer/engine constraints. Next.js owns app build/runtime; TypeScript owns static checking; lint/format tools are selected explicitly; Playwright is the E2E framework. Vite+ is optional and cannot replace Next.js without proven approval.
- **Optional capabilities:** Storybook, Tiptap, ECharts, PDF creation/viewing, Sharp and XLSX are feature-driven. Each requires peer, security, resource, maintenance, deployment and license/edition review.
- **Security/upgrades:** scan direct and transitive dependencies; prioritize by severity, exploitability and exposure. Exceptions need owner, rationale, mitigation and expiry. Upgrades are reviewed and risk-tested; major upgrades require broader regression testing.
- **Observability/environment/resilience:** monitor application/runtime/dependency/database signals; use structured logs and correlation IDs; validate configuration and isolate secrets/data; use health checks, graceful shutdown, bounded retries/timeouts, idempotency and database-aware recovery.
- **Lifecycle/change authority:** track `PROPOSED`, `APPROVED`, `ACTIVE`, `DEPRECATED`, `RETIRED`. Architecture Owner approves core changes; domain owners propose domain dependencies; cross-domain changes require impact review; security-sensitive changes require security review; emergency changes require audit and retrospective review. Record ADRs.
- **Evidence gate:** docs and package metadata are initial evidence only. `TECHNICALLY_VALIDATED` requires reproducible install/build/tests and focused integration PoCs. `DECISION_COMPLETE` does not clear G09 or authorize Phase 1.

## Decision matrix

All 17 decisions selected Option B:

| ID | Approved decision |
|---|---|
| P09.1 | Core-First Governed Version Lock |
| P09.2 | Governed Node.js + Package Manager |
| P09.3 | Framework-Led Compatibility |
| P09.4 | Unified Prisma Compatibility Set |
| P09.5 | Governed Security Compatibility Set |
| P09.6 | Framework-Compatible Frontend Set |
| P09.7 | Governed Hybrid Toolchain |
| P09.8 | Feature-Driven Dependency Adoption |
| P09.9 | Risk-Based Dependency Security Governance |
| P09.10 | Governed Upgrade & Validation Pipeline |
| P09.11 | Layered Runtime & Dependency Observability |
| P09.12 | Governed Environment Parity |
| P09.13 | Layered Runtime Resilience |
| P09.14 | Governed Technology Lifecycle |
| P09.15 | Central Architecture Governance |
| P09.16 | Evidence-Based Compatibility Validation |
| P09.17 | Governed Architecture Closure with Technical Validation Gate |

## Traceability

| Decisions | References/dependencies | Validation |
|---|---|---|
| P09.1–P09.2 | [Stack](../phase-0/01-technology-stack.md), [tooling](../phase-0/18-development-tooling.md), [compatibility resolution](../phase-0.1/13-technology-compatibility-resolution.md), P08/G09 | V01–V03 |
| P09.3–P09.4 | [Compatibility matrix](../phase-0/02-technology-compatibility-matrix.md), [Prisma architecture](../phase-0/13-prisma-architecture.md), P08/G08/G09 | V04–V08 |
| P09.5 | [Identity](../phase-0.1/02-better-auth-identity-architecture.md), [authorization](../phase-0.1/04-authorization-scope-model.md), P02/P04/P08/P10 | V09–V11 |
| P09.6–P09.8 | Stack/tooling/compatibility resolution, feature scope | V12–V14 |
| P09.9–P09.10 | Tooling and Phase 1 gates, security policy | V15–V17 |
| P09.11–P09.13 | Tooling, database operations, G10 | V18–V20 |
| P09.14–P09.15 | Architecture decisions and decision register | V21 |
| P09.16–P09.17 | Phase 1 gates and validation report, P02–P10/G01–G11 | V22–V23 |

Cross-decision boundaries: P02 owns canonical identity; P04 owns authorization architecture; P05/P07 govern relation integrity and domain ownership; P08 governs the single Prisma client/migration baseline; P10 session freshness/revocation remains open; G10 database roles, connection paths, TLS/network and recovery objectives remain separate.

## Phase 0.3 validation backlog

All items are pending; no item is passed by this document.

| ID | Validation | Acceptance evidence | Priority |
|---|---|---|---|
| V01 | Runtime/package manager | Verify the repository-declared Node.js 26.0.0 and pnpm 10.20.0 against current support and deployment requirements; record resolved versions/configuration. `package.json` and both CI jobs declare pnpm; `pnpm-lock.yaml` records lockfile format, not the pnpm version. | P0 |
| V02 | Lockfile reproducibility | Clean frozen/immutable install from checkout in CI without lockfile mutation. | P0 |
| V03 | Core dependency resolution | Exact Next/React/React DOM/TypeScript/Prisma/Better Auth adapter/CASL resolve without peer or engine conflicts. | P0 |
| V04 | Next runtime | Production build plus App Router, SSR, Server Components, Server Actions and protected Proxy/DAL paths. | P0 |
| V05 | React/TypeScript | React/DOM alignment, compiler support, typecheck, hydration and client-boundary tests. | P0 |
| V06 | Prisma toolchain | CLI/Client alignment; schema validation and client generation for all ten schemas. | P0 |
| V07 | PostgreSQL/provider | Actual provider/engine major, pooled/direct URLs, TLS and provider capabilities verified. | P0 |
| V08 | Migrations | Fresh and upgrade migrations on disposable PostgreSQL; inspect SQL, drift and recovery. | P0 |
| V09 | Better Auth adapter | Adapter initialization, canonical `core.users` mapping, generated models and migration. | P0 |
| V10 | Authentication | Account linking, sign-in, session creation/expiry/revocation and disabled-account behavior with P10 semantics. | P0 |
| V11 | CASL/server authorization | Allow/deny, scoped conditions, query filtering, tenant isolation and direct-operation denial. | P0 |
| V12 | Frontend peers | Selected Tailwind/Motion/TanStack/forms/Zod/Lucide versions resolve and pass UI/SSR/hydration tests. | P1 |
| V13 | Toolchain roles | Next.js remains build authority; lint/formatter/typecheck/tests run in CI; Vite+ optional unless proven. | P1 |
| V14 | Optional capabilities | Conditional per-feature Storybook/Tiptap/ECharts/PDF/Sharp/XLSX integration, native/worker, resource and license review. | Conditional |
| V15 | Dependency security | CI scans direct/transitive dependencies and produces actionable severity/exploitability report. | P0 |
| V16 | Upgrade gates | Reviewed patch/minor/major changes trigger risk-based checks and required CI gates. | P1 |
| V17 | Supply-chain integrity | Lockfile integrity, source policy and exception owner/mitigation/expiry evidenced. | P1 |
| V18 | Observability | Structured logs, correlation IDs, runtime/deployment versions, app/database signals, alerting and redaction. | P1 |
| V19 | Environment parity | Config schema validation, explicit differences, secret isolation/rotation and separate DB credentials. | P0 |
| V20 | Resilience | Health checks, graceful shutdown, bounded timeout/retry, idempotency and DB-aware deploy recovery. | P1 |
| V21 | Lifecycle governance | Technology inventory, owner/status, deprecation/replacement process and emergency ADR workflow. | P1 |
| V22 | Evidence packet | Exact versions, OS/runtime, commands, artifacts, results, limitations and reviewer for each pass. | P0 |
| V23 | P09/G09 exit review | Review P0 evidence, conditional scope, risks and owner sign-off; no gate pass from decision closure alone. | P0 |

Start V01–V09 before integration tests. V14 is conditional and does not block baseline until the feature is in scope. Failures require remediation and recorded evidence; they do not silently change an owner-approved principle. Phase 1 remains NOT READY until all applicable G01–G11 gates pass.

## Closure assessment

- P09.1–P09.17: `OWNER_APPROVED`.
- P09: `DECISION_COMPLETE`.
- The P09 owner-decision closure did not select exact package/runtime versions. The repository-declared core-harness pins are recorded in the later reconciliation below; full support, compatibility, and deployment evidence remain pending.
- Technical validation: pending Phase 0.3; G09 not cleared.
- Implementation readiness: not granted.
- Phase 1: **NOT READY**.

At the time this owner-decision closure was prepared, it created or changed no source code, package manifest, lockfile, Prisma schema/client/migration, database or CI workflow. The package registry observations in the existing compatibility report remain a historical 2026-11-05 snapshot, not refreshed certification.



## Later repository pin and validation-evidence reconciliation

This addendum records the later repository state; it does not retroactively change P09 owner decisions or certify the complete stack. P09's approved governance required a pinned runtime and one package manager, but the owner-decision closure itself did not choose concrete versions. Current repository declarations are:

| Component | Current repository declaration | What existing evidence establishes |
|---|---|---|
| Node.js | `.nvmrc`: `26.0.0`; `package.json` engine: `>=26.0.0 <27`; both CI jobs use `.nvmrc`. | The V01/V03 register does not separately report the resolved Node version. The CI workflow records the configured version source. |
| pnpm | `package.json` `packageManager`: `pnpm@10.20.0`; both CI jobs configure pnpm `10.20.0`. `pnpm-lock.yaml` records `lockfileVersion: '9.0'`, which is lockfile-format metadata, not a pnpm version declaration. | V03's recorded GitHub Actions run passed its frozen-lockfile workflow. The lockfile and workflow identify the repository configuration; they do not prove all P09 compatibility criteria. |
| Prisma | `prisma`, `@prisma/client`, and `@prisma/adapter-pg`: `7.10.1`. | V01 records Prisma 7.10.1 schema validation and Client generation on PostgreSQL 17.6. V03 records the six-migration replay and integration evidence on PostgreSQL 17.6. |
| PostgreSQL | V01/V03 disposable database and CI service: `17.6`. | V01 records the ten-schema validation; V03 records the clean six-migration replay and auth integration evidence. |
| Better Auth | `better-auth`: `1.7.17`; `@better-auth/prisma-adapter`: `1.7.17`. | The V03 register records Better Auth 1.7.17 and the passing identity suite; the exact adapter pin is in the current manifest/lockfile. V03 evidence is limited to the authentication/X06 scope described in the execution register. |
| Next.js | `next`: `16.4.5`. | V03 records that the Next.js server reached Better Auth readiness; the execution register does not separately identify that readiness check as a tenant or general framework compatibility certification. |
| PostgreSQL client packages | `pg`: `8.16.3`, alongside `@prisma/adapter-pg@7.10.1`. | These exact package declarations are in the manifest/lockfile; V01/V03 do not separately claim tenant-feature compatibility for them. |

The current CI configuration is in the [validation workflow](../../.github/workflows/validation.yml); V01–V03 evidence and their exact scope are in the [execution register](../phase-0.3/01-validation-execution-register.md). Existing validation proves only the recorded ten-schema, cross-schema fixture and Better Auth/X06 behavior. It does not prove the compatibility or implementation of tenant relations, D10/D12/D13 compound keys, D1/D6 partial unique indexes, tenant migrations, authorization, or tenant isolation. The full P09/G09 compatibility and deployment work remains incomplete; do not infer P09 clearance from declarations or V01–V03.

Earlier Phase 0 and Phase 0.1 stack/compatibility documents, including the [compatibility resolution](../phase-0.1/13-technology-compatibility-resolution.md), remain historical research records. Their statements that exact pins were unselected, no package manifest/lockfile existed, or technical checks had not run describe those earlier baselines, not the current repository state. They are left unchanged; their historical registry observations are not refreshed or certified by this reconciliation. The P09 closure/backlog validation IDs have their own acceptance scope: the execution register's V01–V03 `PASS` results do not satisfy every P09 compatibility/deployment criterion, including Node support/deployment verification or the full P09/G09 exit review.

The execution register remains unchanged: V01–V03 `PASS`; V04–V10 `BLOCKED`; Phase 1 `BLOCKED`. This addendum changes no owner decision and grants no implementation readiness.