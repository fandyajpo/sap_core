# P09 Phase 0.3 Technology Compatibility Validation Backlog

**Status:** All P09 owner decisions are complete; every item below is pending until reproducible evidence is attached. No item is pre-passed by package metadata or documentation.

| ID | Validation area | Required evidence / acceptance criteria | Priority |
|---|---|---|---|
| V01 | Runtime/package manager | Reconcile and verify the repository-declared Node.js 26.0.0 and pnpm 10.20.0 against current support and deployment requirements; record the resolved versions/configuration. The package manager is declared in `package.json` and both CI jobs; `pnpm-lock.yaml` records lockfile format, not the pnpm version. See the later repository-pin reconciliation in the [P09 closure](p09-technology-stack-decision-closure.md). | P0 |
| V02 | Lockfile reproducibility | Clean checkout install with frozen/immutable lockfile succeeds in CI without unreviewed lockfile mutation. | P0 |
| V03 | Core dependency resolution | Exact Next, React/DOM, TypeScript, Prisma CLI/Client, Better Auth/adapter and CASL resolve without peer/engine conflicts. | P0 |
| V04 | Next.js runtime | Production build and representative App Router, SSR, Server Components, Server Actions and protected Proxy/DAL paths work on pinned Node. | P0 |
| V05 | React/TypeScript | React/DOM alignment, compiler support, typecheck, hydration and client-boundary tests pass. | P0 |
| V06 | Prisma toolchain | CLI/Client alignment; schema validation and client generation succeed for all ten schemas. | P0 |
| V07 | PostgreSQL/provider | Actual Prisma Postgres engine major, pooled/direct URLs, TLS and provider capabilities verified. | P0 |
| V08 | Migrations | Fresh and upgrade migrations apply to disposable PostgreSQL; inspect SQL, drift and recovery. | P0 |
| V09 | Better Auth adapter | Adapter initialization, canonical `core.users` mapping, generated models and migration validated. | P0 |
| V10 | Authentication | Account linking, sign-in, session creation/expiry/revocation and disabled-account behavior tested with P10 semantics. | P0 |
| V11 | CASL/server authorization | Allow/deny, scoped conditions, query filtering, tenant isolation and direct-operation denial tested. | P0 |
| V12 | Frontend peers | Selected Tailwind/Motion/TanStack/forms/Zod/Lucide resolve and pass representative UI/SSR/hydration tests. | P1 |
| V13 | Toolchain roles | Next.js remains build authority; lint/formatter/typecheck/tests run in CI; Vite+ optional unless separately proven. | P1 |
| V14 | Optional capabilities | Conditional per-feature Storybook/Tiptap/ECharts/PDF/Sharp/XLSX integration, worker/native runtime, resource and license review. | Conditional |
| V15 | Dependency security | CI scans direct/transitive dependencies and produces actionable severity/exploitability report. | P0 |
| V16 | Upgrade gates | Reviewed patch/minor/major changes trigger risk-based checks and required CI gates. | P1 |
| V17 | Supply-chain integrity | Lockfile integrity, source policy and exception owner/mitigation/expiry evidenced. | P1 |
| V18 | Observability | Structured logs, correlation IDs, runtime/deployment versions, app/database signals, alerting and redaction. | P1 |
| V19 | Environment parity | Config schema validation, explicit differences, secret isolation/rotation and separate DB credentials. | P0 |
| V20 | Resilience | Health checks, graceful shutdown, bounded timeout/retry, idempotency and DB-aware deploy recovery. | P1 |
| V21 | Lifecycle governance | Technology inventory, owner/status, deprecation/replacement process and emergency ADR workflow. | P1 |
| V22 | Evidence packet | Exact versions, OS/runtime, commands, artifacts, results, limitations and reviewer for each pass. | P0 |
| V23 | P09/G09 exit review | Review P0 evidence, conditional scope, risks and owner sign-off; no gate pass from decision closure alone. | P0 |

## Execution rules

Start V01–V09 before integration tests. Run V10–V11 only against approved P02/P04/P10 semantics and actual protected server operations. V14 is conditional and does not block the baseline until the feature is in scope. Failures require remediation and recorded evidence; they do not silently change owner-approved principles. Phase 1 remains NOT READY until applicable G01–G11 gates pass.
