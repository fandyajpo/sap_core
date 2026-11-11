import assert from "node:assert/strict";
import test from "node:test";
import { assertDisposablePostgresUrl, assertLocalHttpOrigin, assertLocalHttpRequestUrl } from "./v04-integration-safety.mjs";

// The unit tests approve their own disposable-database opt-in; nothing here
// touches a database.
process.env.V04_SAFETY_UNIT_ALLOW_DISPOSABLE_DB = "1";

const base = {
  suiteLabel: "V04 integration safety unit tests",
  optInEnvName: "V04_SAFETY_UNIT_ALLOW_DISPOSABLE_DB",
};

const dbGuard = (value) =>
  assertDisposablePostgresUrl({
    ...base,
    value,
    expectedPort: 55432,
    expectedDatabase: "sap_core_v03_test",
    expectedUsers: ["sap_core"],
  });

const ciDatabaseUrl = "postgresql://sap_core@127.0.0.1:55432/sap_core_v03_test?schema=public";

test("accepts the exact disposable database URL CI provisions, including ?schema=public", () => {
  dbGuard(ciDatabaseUrl);
  dbGuard("postgresql://sap_core@127.0.0.1:55432/sap_core_v03_test");
  dbGuard("postgresql://sap_core@localhost:55432/sap_core_v03_test?schema=public");
});

test("rejects pg-connection-string query parameters that override the validated target", () => {
  for (const override of ["host=attacker.example.net", "port=5433", "db=sap_core", "user=sap_core_runtime", "password=hunter2"]) {
    assert.throws(
      () => dbGuard(`${ciDatabaseUrl}&${override}`),
      new RegExp(`query parameter "${override.split("=")[0]}" is not approved`),
    );
  }
});

test("rejects duplicate query parameters", () => {
  assert.throws(() => dbGuard(`${ciDatabaseUrl}&schema=public`), /duplicate query parameter "schema"/);
});

test("rejects URLs that do not match the exact disposable target", () => {
  assert.throws(() => dbGuard("postgresql://sap_core@10.0.0.5:55432/sap_core_v03_test?schema=public"), /loopback/);
  assert.throws(() => dbGuard("postgresql://sap_core@127.0.0.1:5433/sap_core_v03_test?schema=public"), /port must be 55432/);
  assert.throws(() => dbGuard("postgresql://sap_core@127.0.0.1:55432/sap_core?schema=public"), /database name must be/);
  assert.throws(() => dbGuard("postgresql://sap_core_runtime@127.0.0.1:55432/sap_core_v03_test?schema=public"), /username must be one of/);
  assert.throws(() => dbGuard("postgresql://sap_core:pw@127.0.0.1:55432/sap_core_v03_test?schema=public"), /must not embed a password/);
  assert.throws(() => dbGuard("mysql://sap_core@127.0.0.1:55432/sap_core_v03_test?schema=public"), /postgresql: protocol/);
  assert.throws(() => dbGuard(`${ciDatabaseUrl}&application_name=sap_core_tests`), /is not approved/);
  assert.throws(
    () => dbGuard("postgresql://sap_core@127.0.0.1:55432/sap_core_v03_test?schema=private"),
    /schema query parameter must be exactly "public"/,
  );
  assert.throws(
    () => dbGuard("postgresql://sap_core@127.0.0.1:55432/sap_core_v03_test?schema="),
    /schema query parameter must be exactly "public"/,
  );
  assert.throws(
    () => dbGuard("postgresql://sap_core@127.0.0.1:55432/sap_core_v03_test%ZZ?schema=public"),
    /pathname contains malformed percent encoding/,
  );
  assert.throws(() => dbGuard("postgresql://%ZZ@127.0.0.1:55432/sap_core_v03_test"), /username contains malformed percent encoding/);
  assert.throws(() => dbGuard("not a url"), /not a valid URL/);
});

test("requires the per-suite disposable database opt-in", () => {
  const previous = process.env.V04_SAFETY_UNIT_ALLOW_DISPOSABLE_DB;
  process.env.V04_SAFETY_UNIT_ALLOW_DISPOSABLE_DB = "0";
  try {
    assert.throws(() => dbGuard(ciDatabaseUrl), /refuse to run/);
  } finally {
    process.env.V04_SAFETY_UNIT_ALLOW_DISPOSABLE_DB = previous;
  }
});

const httpGuard = (value) =>
  assertLocalHttpOrigin({
    ...base,
    value,
    expectedOrigin: "http://127.0.0.1:3000",
  });

test("accepts the exact loopback Better Auth origin CI provisions", () => {
  assert.deepEqual(httpGuard("http://127.0.0.1:3000"), { origin: "http://127.0.0.1:3000", baseUrl: "http://127.0.0.1:3000" });
  assert.deepEqual(httpGuard("http://127.0.0.1:3000/"), { origin: "http://127.0.0.1:3000", baseUrl: "http://127.0.0.1:3000" });
});

test("rejects HTTP origins that are not the validated loopback origin", () => {
  assert.throws(() => httpGuard("http://127.0.0.1:3000/admin"), /must not carry a path/);
  assert.throws(() => httpGuard("http://127.0.0.1:3000/?next=/x"), /query string or fragment/);
  assert.throws(() => httpGuard("http://user:pw@127.0.0.1:3000"), /must not contain credentials/);
  assert.throws(() => httpGuard("https://127.0.0.1:3000"), /must use http:/);
  assert.throws(() => httpGuard("http://api.attacker.example:3000"), /must be loopback/);
  assert.throws(() => httpGuard("http://127.0.0.1:4000"), /must be exactly http:\/\/127\.0\.0\.1:3000/);
  assert.throws(() => httpGuard(""), /auth base URL is missing/);
});


test("HTTP request guard accepts same-origin relative and absolute URLs", () => {
  const baseUrl = "http://127.0.0.1:3000";
  const expectedOrigin = baseUrl;
  assert.equal(
    assertLocalHttpRequestUrl({ value: "/api/auth/get-session", baseUrl, expectedOrigin, suiteLabel: base.suiteLabel }).href,
    "http://127.0.0.1:3000/api/auth/get-session",
  );
  assert.equal(
    assertLocalHttpRequestUrl({ value: "http://127.0.0.1:3000/api/auth/sign-out", baseUrl, expectedOrigin, suiteLabel: base.suiteLabel }).origin,
    expectedOrigin,
  );
});

test("HTTP request guard rejects cross-origin URLs and embedded credentials before fetch", () => {
  const options = { baseUrl: "http://127.0.0.1:3000", expectedOrigin: "http://127.0.0.1:3000", suiteLabel: base.suiteLabel };
  assert.throws(() => assertLocalHttpRequestUrl({ ...options, value: "https://attacker.example/steal" }), /must stay on validated origin/);
  assert.throws(() => assertLocalHttpRequestUrl({ ...options, value: "http://user:pw@127.0.0.1:3000/path" }), /without URL credentials/);
  assert.throws(() => assertLocalHttpRequestUrl({ ...options, value: "http://127.0.0.1:3001/path" }), /must stay on validated origin/);
});
