# P10 Session Governance Decision Matrix

**P10 state:** P10.1–P10.18 `OWNER_APPROVED`; P10 `DECISION_COMPLETE`. All selections are Option B. Technical validation remains pending.

| ID | Decision area | Selected option | Approved policy |
|---|---|---|---|
| P10.1 | Revocation/disablement | B | Immediate server-enforced revocation; account disablement revokes all sessions; scope revocation applies to protected operations on next request under bounded propagation. |
| P10.2 | Expiration | B | Absolute lifetime plus idle timeout; exact durations remain technical parameters. |
| P10.3 | Sensitive operations | B | Risk-based step-up authentication, bound to user/session/purpose and limited validity. |
| P10.4 | Concurrent sessions | B | Multiple governed sessions, per-session identity, visibility and revocation. |
| P10.5 | Hijacking/replay protection | B | Secure cookies, strong tokens, rotation, CSRF/origin controls, anomaly handling and token confidentiality. |
| P10.6 | Session administration | B | User self-service visibility/revocation and permission-scoped administrative investigation. |
| P10.7 | Security audit | B | Structured append-only security events, correlation and sensitive-data redaction. |
| P10.8 | Distributed consistency | B | Authoritative shared state, bounded revocation propagation, cache governance and fail-closed protected operations. |
| P10.9 | Compromise response | B | Report, contain, revoke, restrict, investigate and verified recovery; never reactivate revoked sessions. |
| P10.10 | Account lifecycle | B | Account state governs session eligibility; reactivation does not restore old sessions; scope changes follow P03. |
| P10.11 | Clock | B | UTC timestamps, synchronized server clocks, server-side expiration and clock-skew tolerance. |
| P10.12 | Policy configuration | B | Centralized, versioned, authorized and audited policies with effective time and secure defaults. |
| P10.13 | Privacy/retention | B | Data minimization, classification, separate lifecycle and governed retention/legal hold. |
| P10.14 | Availability/failure | B | Risk-based fail-closed validation for protected operations; bounded recovery under P08. |
| P10.15 | Security assurance | B | Layered unit, integration, security, negative, concurrency and regression tests. |
| P10.16 | Monitoring/incidents | B | Session observability, correlation, alerting, incident response and post-incident review. |
| P10.17 | Credential changes | B | Risk-based session revalidation/revocation for credential and linked-authentication changes. |
| P10.18 | Exceptions | B | Scoped, approved, time-limited and auditable exceptions; P04.5 break-glass applies. |

## Approval semantics

The project owner explicitly delegated the P10 decision stream to the assistant's recommended options and confirmed continuation. All 18 recommendations were Option B; P10.18 was included in that delegation. This records the owner's authorization to use the recommended baseline, not a fabricated approver name or date. No numeric timeout, retention duration, propagation SLO, token algorithm or vendor-specific behavior is approved by implication.

See [P10 closure](p10-session-governance-decision-closure.md), [traceability](p10-traceability-matrix.md) and [Phase 0.3 backlog](p10-phase-0.3-validation-backlog.md).
