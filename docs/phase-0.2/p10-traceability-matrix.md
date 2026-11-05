# P10 Session Governance Traceability Matrix

| Decision | Architecture dependency / source of truth | Required technical evidence |
|---|---|---|
| P10.1, P10.8, P10.14 | P02 Better Auth session ownership; P08 shared database, pooling, transaction context and failure governance | Revocation propagation, cache invalidation, fail-closed behavior, multi-instance consistency and ambiguous dependency failure tests |
| P10.2, P10.11, P10.12 | P08 UTC/time/database standards; P09 pinned runtime and adapter compatibility | Absolute/idle expiration, clock skew, policy version/effective time, secure defaults and no-expiry-extension regression tests |
| P10.3, P10.5, P10.17 | P02 authentication; P04 authorization and separation of duties; P09 Better Auth/adapter compatibility | Step-up proof binding, sensitive operation enforcement, CSRF/origin, token rotation, credential change and account-linking behavior |
| P10.4, P10.6 | P03 membership/scope; P04 permission boundaries; P02 canonical identity | Session inventory, per-session revocation, concurrent login limits, user/admin access isolation and device metadata minimization |
| P10.7, P10.13, P10.16 | P08 audit, observability, retention and incident governance; P04 privileged access | Append-only audit, correlation, redaction, access control, retention/legal hold and alert/incident workflow tests |
| P10.9, P10.10, P10.18 | P02 account lifecycle; P03 membership; P04 break-glass; P08 recovery/idempotency | Compromise containment/recovery, account suspension/reactivation, membership revocation, exception expiry and approval/audit tests |
| All P10 | P09 exact package/runtime selection; G03 authentication and revocation; G04 authorization; G08 Prisma/database; G09 technology; G10 operations | Reproducible Phase 0.3 evidence packet; no documentation-only pass |

## Cross-domain enforcement boundaries

- Better Auth session validity and account authentication do not replace CASL permission evaluation or P03 tenant/company/plant scope enforcement.
- Session and security-event data ownership must be assigned explicitly during P07 entity/aggregate mapping; this decision packet does not silently assign new authoritative entities to a schema.
- Database transaction-local context under P08 must not become a substitute for independently verified session identity or authorization.
- Cache state is derived and cannot become the sole authority for revocation or access grants.
- Break-glass is governed by P04.5; P10 exceptions cannot bypass immutable finance/audit or tenant-isolation controls.
- Better Auth APIs, adapter models, token rotation, cookie configuration and revocation semantics must be verified against the exact pinned release and actual deployment topology.

## Gate mapping

| Gate | P10 contribution | Exit evidence |
|---|---|---|
| G01 | P02 canonical identity/session integration | Better Auth adapter mapping and session lifecycle evidence |
| G02 | P03 membership and explicit plant scope | Scope change takes effect on protected requests; unassigned access denied |
| G03 | All P10 decisions | Revocation, expiration, step-up, concurrent sessions, compromise, lifecycle, failure, privacy, audit and recovery tests |
| G04 | Step-up is separate from authorization; exceptions respect P04 | CASL and server-side permission checks remain required after successful authentication |
| G08 | Shared state, UTC, transaction/pool/cache behavior | PostgreSQL/Prisma integration and connection-context isolation |
| G09 | Pinned Better Auth, adapter, runtime and frontend/server compatibility | Reproducible install/build/integration evidence |
| G10 | Session-state availability, clock, secrets, observability and incident operations | Deployment topology, secret/key lifecycle, monitoring, recovery and operational evidence |

