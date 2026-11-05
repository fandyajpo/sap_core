# P10 Session Governance Decision Closure

**Status: `DECISION_COMPLETE`.** P10.1–P10.18 are `OWNER_APPROVED`. This closes the bounded owner-decision stream for session governance. It does not certify Better Auth behavior, select exact timeout values, create implementation, or clear Phase 0.3 / Phase 1 gates.

## Scope and architecture boundaries

P10 governs authentication session lifecycle and security behavior for the SAP Core modular monolith. It is subordinate to and consistent with:

- **P02:** Better Auth owns authentication, accounts and sessions; `core.users` remains the canonical ERP identity.
- **P03:** organization/company membership and plant assignment remain authoritative access-scope inputs.
- **P04:** CASL and server-side authorization remain separate from authentication and session validity.
- **P08:** database, transaction, pooling, session-context, error, observability and incident controls remain governed by the approved database architecture.
- **P09:** exact runtime, package and adapter compatibility must be established before technical certification.

A valid session does not grant business permission. Every protected server operation must enforce current account state, session validity, authorization and organization/company/plant scope. UI visibility is not an authorization boundary.

## Consolidated approved architecture

- **Revocation and disablement:** server-enforced revocation. Account disablement revokes all active sessions. Membership and scope changes affect protected operations on the next request under a bounded, tested propagation policy. Cookie expiry alone is not revocation.
- **Expiration:** governed absolute lifetime and idle timeout. Activity cannot extend absolute lifetime. Exact durations and refresh behavior remain Phase 0.3 implementation parameters.
- **Step-up authentication:** risk-based reauthentication for designated sensitive operations. Proof is bound to user, session, purpose and a limited validity window; server-side authorization remains independently required.
- **Concurrent sessions:** multiple sessions are allowed under governed limits. Each has an independently revocable identity and device/session metadata. Users can inspect and revoke their sessions; administrators act only within granted scope.
- **Token and request protection:** secure cookie attributes, cryptographically strong opaque session tokens, appropriate rotation, CSRF defenses, origin validation where applicable, anomaly handling and strict token confidentiality. Exact mechanisms must match verified Better Auth capabilities and deployment topology.
- **Session administration:** user-visible session inventory and self-service revocation; scoped administrative investigation and revocation with audit.
- **Security event audit:** structured, append-only security events with actor, event, outcome, timestamp and correlation identifier. Exclude credentials, raw tokens and unnecessary sensitive data.
- **Distributed consistency:** authoritative shared session state, bounded revocation propagation, governed cache TTL/invalidation and fail-closed behavior for protected operations when validity cannot be established.
- **Compromise response:** report, contain, revoke, restrict/disable, investigate and recover through verified identity procedures. Revoked sessions are never reactivated.
- **Account lifecycle integration:** account state governs session eligibility. Disablement/suspension applies according to policy; reactivation never restores old sessions. Membership and scope changes remain governed by P03.
- **Clock semantics:** UTC timestamps, synchronized server clocks, server-side expiration decisions and explicit clock-skew tolerance.
- **Policy configuration:** centrally governed, versioned, authorized and audited session policies with effective times and secure defaults. Policy changes cannot silently revive expired or revoked sessions.
- **Privacy and retention:** collect only necessary session metadata; classify it and govern active session data, session history and security audit events separately. Retention, deletion, anonymization and legal hold follow applicable approved policy; no jurisdiction-specific duration is invented here.
- **Availability and failure:** risk-based fail-closed validation for protected operations. Classify dependencies and failures; use bounded retry/circuit-breaker behavior under P08. Recovery cannot revive revoked sessions.
- **Testing and assurance:** layered unit, integration, security, negative, concurrency and regression tests. Evidence is required in deployment quality gates.
- **Observability and incidents:** monitor creation, validation, expiration, revocation, step-up failures and anomalies; correlate events and use governed severity, escalation, mitigation, recovery and post-incident review.
- **Credential changes:** apply risk-based revalidation/revocation to password, email, MFA and linked-account changes. Suspected compromise triggers stronger containment than routine changes.
- **Exceptions:** controlled, scoped, time-limited and auditable exceptions with authorized approval, reason and expiry. P04.5 break-glass controls apply. No exception bypasses tenant isolation, financial integrity or immutable audit controls.

## Decision matrix

All 18 decisions selected Option B:

| ID | Approved decision |
|---|---|
| P10.1 | Immediate Server-Enforced Revocation |
| P10.2 | Governed Absolute & Idle Expiration |
| P10.3 | Risk-Based Step-Up Authentication |
| P10.4 | Governed Concurrent Sessions |
| P10.5 | Layered Session Protection |
| P10.6 | Governed Session Administration & Visibility |
| P10.7 | Governed Security Event Audit |
| P10.8 | Authoritative Shared Session State |
| P10.9 | Governed Compromise Response |
| P10.10 | Centrally Governed Lifecycle Integration |
| P10.11 | Governed UTC & Clock Consistency |
| P10.12 | Centrally Governed Session Policies |
| P10.13 | Governed Session Data Lifecycle |
| P10.14 | Risk-Based Fail-Closed Governance |
| P10.15 | Layered Session Security Assurance |
| P10.16 | Governed Session Observability & Incident Response |
| P10.17 | Governed Credential-Triggered Session Revalidation |
| P10.18 | Controlled & Auditable Exceptions |

## Explicitly unselected implementation parameters

The owner decisions intentionally do not invent numeric or provider-specific settings. Phase 0.3 must select and test: absolute and idle durations; idle refresh cadence; session-count limits; step-up validity and assurance method; revocation propagation SLO; cache TTL/invalidation; clock-skew tolerance; metadata fields and retention periods; anomaly thresholds; event taxonomy/severity; and exact Better Auth hooks, adapter mappings, cookie/token and CSRF behavior. These values must be justified by risk, supported deployment behavior and reproducible evidence.

## Closure boundary

P10 is decision-complete, not technically validated. G03 is not cleared until the P10 backlog is evidenced alongside P02/P03/P04/P08/P09 dependencies. No authentication provider configuration, Prisma model, migration, application code, package manifest, lockfile, security control or runtime behavior is claimed to exist. Phase 1 remains **NOT READY** until all applicable gates pass.
