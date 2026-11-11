// Shared, strict target guards for the V04 integration suites.
//
// Every suite that imports this module refuses to run unless:
//   1. its own opt-in environment variable is set to exactly "1", and
//   2. every database or HTTP URL matches, exactly, the disposable target
//      that CI (`.github/workflows/validation.yml`) provisions for that job.
//
// There is no fallback, no inference and no silent default: a missing,
// malformed or remote target is a hard error at module load. The dev Compose
// service (localhost:5433/sap_core in docker-compose.yml) is never a valid
// target — the V04 isolated-environment runbook forbids it, along with any
// persistent, shared or remote database.

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Only query parameters explicitly provisioned by CI are allowed. Anything
// else — notably the connection-overriding pg-connection-string parameters
// (host, port, db, user, password) — is rejected before the URL is used.
const ALLOWED_QUERY_PARAMS = new Set(["schema"]);

function assertOptIn(envName, suiteLabel) {
  if (process.env[envName] !== "1") {
    throw new Error(
      `${suiteLabel} refuse to run: disposable database access is opt-in. Set ${envName}=1 (CI sets this per job) to approve running against the disposable integration database.`,
    );
  }
}

/**
 * Validates a PostgreSQL connection URL against the exact disposable target a
 * suite is allowed to touch. Throws unless the suite's opt-in variable is set,
 * the URL parses, the host is loopback, the port, database name and username
 * match the values CI provisions for this suite, the URL carries no
 * password, and the query string contains no unapproved connection
 * parameters (pg-connection-string lets query parameters override the
 * parsed authority, so they are restricted by allow-list).
 */
export function assertDisposablePostgresUrl({
  value,
  suiteLabel,
  optInEnvName,
  expectedPort,
  expectedDatabase,
  expectedUsers,
}) {
  assertOptIn(optInEnvName, suiteLabel);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${suiteLabel}: database URL is missing. Provide the exact disposable target postgresql://<user>@127.0.0.1:${expectedPort}/${expectedDatabase}.`,
    );
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${suiteLabel}: database URL is not a valid URL; refusing to guess the target.`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${suiteLabel}: database URL must use the postgresql: protocol, got "${parsed.protocol}".`);
  }
  if (!LOCAL_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      `${suiteLabel}: database host must be loopback (localhost, 127.0.0.1 or [::1]), got "${parsed.hostname}". Remote or shared databases are never valid integration targets.`,
    );
  }
  if (parsed.password !== "") {
    throw new Error(`${suiteLabel}: database URL must not embed a password; the disposable CI target authenticates without one.`);
  }
  // pg-connection-string accepts connection settings as query parameters
  // (host, port, db, user, password, ...) which would override the authority
  // validated above. Only approved parameters are accepted, and no parameter
  // may appear twice.
  const seenQueryKeys = new Set();
  for (const [key, queryValue] of parsed.searchParams.entries()) {
    if (seenQueryKeys.has(key)) {
      throw new Error(`${suiteLabel}: database URL has duplicate query parameter "${key}".`);
    }
    seenQueryKeys.add(key);
    if (!ALLOWED_QUERY_PARAMS.has(key)) {
      throw new Error(
        `${suiteLabel}: database URL query parameter "${key}" is not approved. Query parameters could override the validated host, port, database or username; only ${[...ALLOWED_QUERY_PARAMS].map((name) => `"${name}"`).join(", ")} (as provisioned by CI) is allowed.`,
      );
    }
    if (key === "schema" && queryValue !== "public") {
      throw new Error(`${suiteLabel}: database URL schema query parameter must be exactly "public", got "${queryValue}".`);
    }
  }
  if (parsed.port !== String(expectedPort)) {
    throw new Error(`${suiteLabel}: database port must be ${expectedPort}, got "${parsed.port || "(none)"}".`);
  }
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error(`${suiteLabel}: database URL pathname contains malformed percent encoding.`);
  }
  if (database !== expectedDatabase) {
    throw new Error(`${suiteLabel}: database name must be "${expectedDatabase}", got "${database}".`);
  }
  const username = decodeURIComponent(parsed.username);
  if (!expectedUsers.includes(username)) {
    throw new Error(
      `${suiteLabel}: database username must be one of ${expectedUsers.map((user) => `"${user}"`).join(", ")}, got "${username}".`,
    );
  }
}

/**
 * Validates a Better Auth HTTP base URL for the HTTP integration suites.
 * Throws unless the suite's opt-in variable is set and the URL is exactly the
 * loopback origin CI uses: no remote hosts, no credentials, no path, query or
 * fragment. Returns { origin, baseUrl } for request building.
 */
export function assertLocalHttpOrigin({ value, suiteLabel, optInEnvName, expectedOrigin }) {
  assertOptIn(optInEnvName, suiteLabel);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${suiteLabel}: auth base URL is missing. Provide ${expectedOrigin} exactly.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${suiteLabel}: auth base URL is not a valid URL; refusing to guess the target.`);
  }
  if (parsed.protocol !== "http:") {
    throw new Error(`${suiteLabel}: auth base URL must use http: against a loopback test server, got "${parsed.protocol}".`);
  }
  if (!LOCAL_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      `${suiteLabel}: auth host must be loopback (localhost, 127.0.0.1 or [::1]), got "${parsed.hostname}". The suites must never send requests to a remote server.`,
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${suiteLabel}: auth base URL must not contain credentials.`);
  }
  if (parsed.origin !== expectedOrigin) {
    throw new Error(`${suiteLabel}: auth base URL must be exactly ${expectedOrigin}, got "${parsed.origin}".`);
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error(`${suiteLabel}: auth base URL must not carry a path, got "${parsed.pathname}".`);
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error(`${suiteLabel}: auth base URL must not carry a query string or fragment.`);
  }
  return { origin: parsed.origin, baseUrl: parsed.origin };
}
