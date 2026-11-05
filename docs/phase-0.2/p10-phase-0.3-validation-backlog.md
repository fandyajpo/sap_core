# P10 Phase 0.3 Session Governance Validation Backlog

**Status:** P10 owner decisions are complete. Every item below remains pending until reproducible evidence is attached. No Better Auth behavior or security control is pre-certified by this document.

| ID | Validation area | Required evidence / acceptance criteria | Priority |
|---|---|---|---|
| V01 | Better Auth/Prisma compatibility | Pin exact runtime, Better Auth, adapter and Prisma versions; validate generated models, mappings and migrations against the ten-schema design. | P0 |
| V02 | Canonical identity | Prove Better Auth account/session identity maps to canonical `core.users`; no duplicate ERP login identity. | P0 |
| V03 | Server-side session validation | Protected Route Handlers, Server Actions and service/use-case entry points reject missing, invalid, expired and revoked sessions. | P0 |
| V04 | Account disablement | Disabling an account revokes all active sessions; no protected operation succeeds afterward. | P0 |
| V05 | Membership/scope revocation | Organization/company/plant membership or assignment changes are enforced on the next protected request within measured propagation bounds. | P0 |
| V06 | Absolute and idle expiration | Test independent limits, refresh rules, boundary conditions and no activity-based extension beyond absolute lifetime. | P0 |
| V07 | Step-up authentication | Sensitive operations require valid, purpose-bound, user/session-bound reauthentication proof; expired/replayed proof is rejected. | P0 |
| V08 | Concurrent sessions | Enforce configured limits and prove session-specific and all-other-session revocation without cross-user impact. | P1 |
| V09 | Cookie/token protection | Verify cookie attributes, entropy, token storage/handling, rotation and absence from URLs/logs/telemetry. | P0 |
| V10 | CSRF/origin | Exercise state-changing cookie-authenticated operations with valid/invalid CSRF tokens and origin cases. | P0 |
| V11 | Session administration | Verify user self-service inventory/revocation and admin investigation/revocation under P04 permission and P03 scope. | P1 |
| V12 | Audit integrity/redaction | Prove append-only event behavior, actor/correlation completeness, restricted access and credential/token redaction. | P0 |
| V13 | Shared-state consistency | Test revocation across multiple app instances, cache TTL/invalidation, bounded propagation and stale-cache denial. | P0 |
| V14 | Fail-closed behavior | Simulate session-store/database/cache/provider failures; protected operations deny safely while unrelated public operations remain available. | P0 |
| V15 | Compromise/recovery | Exercise report, containment, revoke-all, restricted/disabled account, verified recovery and no session resurrection. | P0 |
| V16 | Account/credential lifecycle | Test suspension, disablement, reactivation, password/email/MFA/linked-account changes and risk-based revocation. | P0 |
| V17 | UTC/clock skew | Test synchronized clocks, skew tolerance, expiration boundary behavior and server-only time authority. | P1 |
| V18 | Policy change governance | Test policy authorization/versioning/effective time, rollback/recovery and no silent extension or revival of existing sessions. | P1 |
| V19 | Privacy/retention | Verify metadata minimization, classification, access controls, retention, deletion/anonymization and legal hold once qualified periods are approved. | P1 |
| V20 | Exceptions/break-glass | Test approval, reason, scope, expiry, audit, P04.5 alignment and prohibition on bypassing tenant/financial/audit invariants. | P1 |
| V21 | Security assurance | Add negative, concurrency, replay, CSRF, regression and cross-tenant isolation tests to repeatable CI quality gates. | P0 |
| V22 | Observability/incident operations | Verify metrics, alerts, correlation, redaction, severity, escalation, recovery and post-incident review. | P1 |
| V23 | Operational secrets/availability | Validate session signing/secrets lifecycle, rotation, deployment topology, clock source, backup/recovery and incident runbooks. | P0 |
| V24 | P10/G03 exit review | Review all applicable P0 evidence, residual risks, exact parameters and owner sign-off; do not infer gate pass from decision closure. | P0 |

## Execution order

1. Complete V01–V02 and establish canonical identity/session mapping.
2. Complete V03–V07, V09–V10 and V12–V16 before exposing protected ERP workflows.
3. Complete V08, V11, V17–V20 and V22–V23 before enabling their corresponding administrative/operational capabilities.
4. Integrate V21 into reproducible CI; close V24 only after required evidence is reviewed.
5. Coordinate with P03/P04/P08/P09 validation. A P10 pass cannot compensate for a failed identity, authorization, database or runtime gate.

Numeric durations, propagation SLOs, cache TTLs, retention periods, anomaly thresholds and exact vendor APIs are implementation decisions to be selected with evidence in Phase 0.3. Phase 1 remains **NOT READY** until all applicable G01–G11 gates pass.
