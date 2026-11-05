# Internal REST API Standards

## Scope and boundaries

REST is the approved internal application interface. Next.js Route Handlers adapt HTTP to owner application use cases; they do not contain domain rules or issue arbitrary ORM operations. Server Actions are a UI transport convenience, not a substitute for the REST contract or server-side enforcement. No external public API/versioning promise is made in Phase 0.

## Resource and command design

- Use resource-oriented, plural, stable URL paths under a documented API prefix (candidate `/api/v1`; exact prefix is an implementation decision).
- Use HTTP methods consistently: safe reads for GET; commands that change state use POST/PATCH/DELETE only where lifecycle semantics justify them. Do not expose generic CRUD that bypasses document transitions.
- State-changing operations carry explicit command intent and expected version where concurrent edits matter. Use idempotency keys for retryable create/post commands, with owner-approved scope and behavior.
- Keep route schemas, domain commands and response DTOs distinct. Reject unknown or unbounded input fields where appropriate; never mass-assign persistence models.

## Security on every operation

Authenticate the session server-side, validate action/resource/company authorization, scope reads/writes in the query, and minimize returned fields. Proxy/layout checks and client abilities are presentation only. Validate all path, query, body, sort/filter, file and pagination inputs at runtime with Zod or equivalent; TypeScript alone is not validation. Protect cookie-authenticated mutations using the pinned Better Auth/Next origin/CSRF mechanism and verify its exact behavior.

## Responses and errors

Use consistent status semantics and a stable error representation aligned to RFC 9457 Problem Details (`application/problem+json`) or a separately approved equivalent. Include a safe machine-readable code and correlation identifier; do not return SQL, stack traces, Prisma internals, sensitive field values or inaccessible record details. Distinguish malformed/invalid input, unauthenticated, forbidden, not found, stale/conflict, duplicate/idempotent replay, and unexpected server failure without leaking existence across company boundaries.

## Pagination and filtering

All ERP lists are bounded. Prefer cursor/seek pagination with stable sort and tie-breaker; offset may be allowed only for known bounded use cases. Allowlist filter/sort columns and operators, cap page size, enforce company/policy predicates in the database, and return continuation metadata. TanStack Table/Virtual does not make unbounded server queries safe.

## Contracts and observability

Version contract changes deliberately and document request, response, auth scope, error cases and idempotency. Validate responses before serialization where useful. Include request/correlation ID and safe timing/error telemetry; avoid logging tokens, cookies, credentials or whole finance/HR payloads. CORS is not assumed for a same-origin internal API; if cross-origin clients are introduced, approve origins and policies explicitly.

## Validation gate

Use OpenAPI or another contract representation only after selecting a source-of-truth workflow. Test authentication/authorization, direct route invocation, pagination bounds, error privacy, idempotency and company isolation. No routes or API implementation exist yet.