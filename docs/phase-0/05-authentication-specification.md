# Authentication Specification

## Purpose and responsibility

Authentication establishes the identity and session of the caller. Better Auth is the accepted authentication/session component. It does not decide whether the caller may read or mutate a company-scoped ERP resource; that is authorization, specified in [06](06-authorization-specification.md).

## Boundary requirements

- All protected Route Handlers, Server Actions, data-access operations, and background/server entry points derive the actor from a server-verified session. Never accept a user ID, company scope, role, or trusted actor claim from an untrusted request body as proof of identity.
- Use Better Auth's supported Next.js catch-all Route Handler integration and supported server API for session retrieval after pinning versions. The exact route/file convention must be validated against the chosen Next.js release.
- Next.js `proxy.ts` may optimistically redirect unauthenticated-looking browser navigation. Cookie presence alone is not validation; Proxy is not the security boundary and must not replace per-operation session verification.
- Keep auth configuration, secrets and Prisma access server-only. Return only the minimum user/session data needed by the UI.

## Identity and persistence ownership

The skills context includes an initial `core.users` reference; Better Auth's adapter also owns identity/session model mechanics. Do not create a second user record or adopt generated adapter schema blindly. The owner must decide the canonical identity model, mapping between authentication identity and ERP user/employee, adapter-model schema placement, migration ownership, and how account deactivation affects ERP access. `core` is a candidate location, not an approved placement. See ADR-OPEN-02.

## Session/cookie requirements to decide and configure

- Explicit session lifetime, refresh/rotation, freshness/step-up requirement, revocation and account-deactivation semantics.
- Cookie attributes appropriate to actual deployment: Secure in production, HttpOnly, deliberate SameSite, Path/domain scope, trusted origins and CSRF/origin validation.
- Cookie-cache use and expiry must match the approved revocation latency; if immediate revocation is required, do not rely on a stale cached session.
- Define password reset, email verification, account enumeration behavior, rate/abuse controls and recovery operations before enabling those flows.
- No MFA policy, password policy beyond library-supported safe defaults, or retention duration is invented here; product/security owners must approve them.

## Email and recovery

Better Auth verification/reset callbacks require an email delivery path. No provider, sender domain, secrets, monitoring, service level, or delivery fallback has been selected. Until those are approved and tested, do not describe signup verification or password recovery as operational. No external email integration is added by this document.

## Failure and audit expectations

Unauthenticated operations fail closed with a stable unauthenticated result. Invalid/expired/revoked session behavior is tested. Security/audit events record only necessary actor/action/context without passwords, raw cookies, tokens, or reset links. Authentication events do not become an alternate authorization source.

## Evidence gate

Pinned Better Auth/adapter/Next versions; reviewed adapter model mapping; cookie/trusted-origin configuration; session revocation and direct-action tests; recovery-delivery tests and operational owner; and an approved persistence placement are required before auth is called production-ready. Current compatibility evidence is summarized in [02](02-technology-compatibility-matrix.md); none of those application tests have been run.