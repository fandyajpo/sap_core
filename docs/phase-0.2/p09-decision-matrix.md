# P09 Technology Stack Decision Matrix

**P09 state:** P09.1–P09.17 `OWNER_APPROVED`; P09 `DECISION_COMPLETE`. All selections are Option B.

| ID | Decision area | Selected option | Approved policy |
|---|---|---|---|
| P09.1 | Dependency baseline | B | Core-first governed version lock; optional dependencies only for concrete features. |
| P09.2 | Runtime/package manager | B | Pin Node.js LTS and one package manager; same manager/lockfile policy across development, CI and deployment; frozen CI install. |
| P09.3 | Framework compatibility | B | Next.js-led compatibility; React/React DOM aligned; TypeScript follows framework and dependency support. |
| P09.4 | Prisma/PostgreSQL | B | Prisma CLI, Client and Migrate form one compatibility set against explicit PostgreSQL major/provider. |
| P09.5 | Security dependencies | B | Better Auth, Prisma adapter and Prisma compatibility-governed; CASL remains separate authorization engine. |
| P09.6 | Frontend dependencies | B | Frontend packages satisfy framework peer/engine ranges and pass integration/regression tests. |
| P09.7 | Toolchain | B | Governed hybrid toolchain; Next.js remains production build/runtime authority; Vite+ optional. |
| P09.8 | Optional dependencies | B | Feature-driven adoption with compatibility, security, license, resource and maintenance review. |
| P09.9 | Supply-chain security | B | Risk-based scanning/remediation for direct and transitive dependencies; controlled exceptions. |
| P09.10 | Upgrade validation | B | Reviewed upgrades with risk-based CI; major upgrades require broader compatibility/regression checks. |
| P09.11 | Observability | B | Layered monitoring of application, runtime, dependency, Prisma and database signals. |
| P09.12 | Environment parity | B | Governed parity, explicit differences, schema-validated config and isolated secrets/data. |
| P09.13 | Resilience | B | Layered health, shutdown, timeout, bounded retry, idempotency and database-aware recovery. |
| P09.14 | Technology lifecycle | B | Governed proposed/approved/active/deprecated/retired lifecycle and controlled replacement. |
| P09.15 | Change authority | B | Central architecture governance with domain proposals, security review and emergency audit. |
| P09.16 | Compatibility evidence | B | Evidence-based validation using reproducible installs, builds, tests and focused PoCs. |
| P09.17 | Closure/phase gate | B | Decision closure is separate from technical validation; Phase 1 remains gated. |

## Approval semantics

The owner explicitly selected Option B for P09.1–P09.17. No approver name or approval date is fabricated. These choices do not approve exact package versions or imply technical test pass.

See [P09 closure](p09-technology-stack-decision-closure.md), [traceability](p09-traceability-matrix.md) and [Phase 0.3 backlog](p09-phase-0.3-validation-backlog.md).
