# V04 F-02 Production Role Assignment Adapter

**Status:** Implemented on a feature branch; pending CI and owner review  
**Base:** `8b3a5161f2c1c6fdbb23fb9f104b917ca2086e5d`

## Production boundary

- The adapter obtains the acting principal only from `getCurrentSession()`, which delegates to Better Auth's server-side `auth.api.getSession({ headers })` verification.
- Request bodies cannot supply `actorUserId`, recipient `userId`, or break-glass metadata. The recipient is resolved from the typed active membership/assignment parent.
- The domain service's actor argument is populated from the verified session; the transaction-bound authorization callback independently compares it with the captured verified actor.
- Authorization, target ancestry and membership checks, role-definition validation, and assignment persistence all run through the same `ScopedAccessSession` transaction.
- The production adapter validates that assignable role definitions are enabled, have a sealed permission snapshot, match the requested scope, and are either global SYSTEM definitions or Organization-owned custom definitions. Platform roles and break-glass remain unavailable.
- Effective-role reads require `roles.read` and verify that the requested target user owns the active typed membership/assignment.
- Production list queries exclude disabled or unsealed role definitions. The domain service keeps its legacy default for the pinned D7 migration-8 replay, which predates those governance columns.

## HTTP API

Base path: `/api/organizations/{organizationId}/roles/assignments`

- `POST`: JSON body `{ "scope": "ORGANIZATION|COMPANY|PLANT", "parentId": "...", "roleDefinitionId": "..." }`; the authenticated actor and target user are never accepted from the request.
- `GET`: query parameters `scope`, `parentId`, and `userId`; the target user is checked against the selected active membership/assignment.

Both endpoints fail closed for unauthenticated callers, actor mismatch, cross-Organization targets, inactive or mismatched typed membership, missing `roles.assign` / `roles.read`, and applicable target-scope DENY. The authorization policy continues to permit only the approved direct Organization-to-child administrative permission behavior; it does not add operational inheritance.

## Tests and limitations

- `test:v04-role-assignment-production` covers verified actor mismatch, same-Organization target authorization, cross-Organization/inactive target denial, target-scope DENY, and guarded effective-role reads.
- Existing role-assignment unit and D7 integration suites remain registered and retain their pinned migration compatibility.
- This adapter does not enable role revocation, Platform role assignment, break-glass, or service-principal assignment.
- V04 remains blocked pending CI, adversarial HTTP integration coverage, remaining V04 acceptance gates, and owner sign-off.
