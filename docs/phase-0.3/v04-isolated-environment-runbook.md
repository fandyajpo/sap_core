# V04.5.1 Isolated Environment Setup & Safety Verification Runbook

**Purpose:** Prepare and verify the disposable environment for the separately approved V04.4 feasibility spike.  
**Technical baseline:** `fandyajpo/sap_core`, branch `main`, commit `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a`. This is the verified technical-input baseline; later documentation-only commits are permitted if the technical-input diff remains empty.  
**Status:** Owner-executed preparation instructions only. This document is not evidence that an environment was created.

## 1. Preparation-only boundary

The repository-editing agent cannot run terminal commands. The commands below are for the owner to run manually, in one interactive Bash session so non-secret run identifiers and process-local credentials remain associated with the exact disposable resources.

This runbook ends at a verified environment handoff. Do not run Prisma validation, Client generation, migration commands, SQL, tests, builds, or any further database operation as part of V04.5.1. Those belong to a separately authorized V04.4 execution. No experiment schema or migration is to be added to this repository.

The existing Compose setup is explicitly out of scope: `docker-compose.yml` names service/container `postgres` / `sap-core-postgres`, binds host port `5433`, and mounts `sap_core_postgres_data`. The repository `.env.example` points to `localhost:5433/sap_core`. Do not load or copy either file, invoke Compose, or connect to that database. The repository `prisma.config.ts` imports `dotenv/config` and points at the repository schema/migration path; do not copy or use it. Stage F creates a separate config with no dotenv import and explicit workspace paths.

## 2. Verified source facts and pinned toolchain

At the expected baseline, the inspected values are:

- Technical-input baseline / branch: `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a` / `main`.
- Node.js: `.nvmrc` is `26.0.0`; `package.json` engine is `>=26.0.0 <27`.
- pnpm: `package.json` pins `pnpm@10.20.0`; `pnpm-lock.yaml` uses lockfile version `9.0`.
- Prisma CLI, `@prisma/client`, and `@prisma/adapter-pg`: `7.10.1` in the manifest and lockfile.
- PostgreSQL image: `postgres:17.6`.
- Current migration lock: PostgreSQL provider.
- Existing root scripts (do not run them in this runbook): `db:validate`, `db:generate`, `db:migrate:dev`, `db:migrate:deploy`, `db:status`, and `test:v03`. There is no tenant-spike script. In particular, do not use a root script that could discover the repository's Prisma config or environment.
- The only existing migration directories are the six listed in Stage C. Preserve their SQL and migration lock byte-for-byte.

The technical-input baseline is exact. Documentation-only commits after `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a` are allowed only when that baseline is an ancestor of `HEAD` and the diff for the pinned manifests, runtime pin, Prisma schema, and migration history is empty. The branch, remote, clean-tree check, runtime, and pinned values must still match; otherwise stop before creating anything.

## 3. Safety rules

- Use only a new workspace outside the repository and one new, uniquely named container created below. No Compose service/project, named volume, bind mount, shared database, or fixed host port.
- The only permitted host binding is `127.0.0.1` on Docker's dynamically assigned host port. Port `5433` is forbidden even if it appears available.
- Use a newly generated throwaway password. Never echo it, place it in a file, include it in evidence, use shell tracing, print the environment, or display the container's full `.Config.Env`.
- Do not copy `.env`, `.env.example`, `docker-compose.yml`, the repository `prisma.config.ts`, source code, tests, or generated artifacts.
- Never run `prisma migrate reset`, `prisma db push`, `docker compose down -v`, or broad Docker cleanup. Never drop, truncate, reset, or modify the current development database or its volume.
- If an identity, URL, port, mount, checksum, or target is uncertain, stop. Do not “try” a connection to find out.

## 4. Owner procedure

Run each stage in order. The shell snippets assume Bash and retain variables from one stage to the next. Disable tracing before handling credentials. Commands are labeled **read-only**, **creates/copies temporary resources**, or **verification**. A failed assertion means STOP; do not continue to the next stage.

### A. Confirm repository baseline and pinned versions — read-only

Start at the root of the `Sap Core` repository in Bash:

```bash
set -Eeuo pipefail
set +x
REPO="$(git rev-parse --show-toplevel)"
REPO="$(cd "$REPO" && pwd -P)"
TECHNICAL_BASELINE="a1cfa848ea3686ce04ddc77ea8042c257e9ef15a"
test "$(git -C "$REPO" branch --show-current)" = "main"
git -C "$REPO" merge-base --is-ancestor "$TECHNICAL_BASELINE" HEAD
git -C "$REPO" diff --exit-code "$TECHNICAL_BASELINE" HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc prisma/schema.prisma prisma/migrations
test "$(git -C "$REPO" remote get-url origin)" = "https://github.com/fandyajpo/sap_core"
test -z "$(git -C "$REPO" status --porcelain)"
test "$(cat "$REPO/.nvmrc")" = "26.0.0"
test "$(node --version)" = "v26.0.0"
test "$(pnpm --version)" = "10.20.0"
grep -F '"packageManager": "pnpm@10.20.0"' "$REPO/package.json"
grep -F '"node": ">=26.0.0 <27"' "$REPO/package.json"
grep -F '"@prisma/adapter-pg": "7.10.1"' "$REPO/package.json"
grep -F '"@prisma/client": "7.10.1"' "$REPO/package.json"
grep -F '"prisma": "7.10.1"' "$REPO/package.json"
grep -F "lockfileVersion: '9.0'" "$REPO/pnpm-lock.yaml"
grep -F "  '@prisma/adapter-pg@7.10.1':" "$REPO/pnpm-lock.yaml"
grep -F "  '@prisma/client@7.10.1':" "$REPO/pnpm-lock.yaml"
grep -F "  prisma@7.10.1:" "$REPO/pnpm-lock.yaml"
```

Expected invariants (not fabricated command output): every `test` succeeds; `node --version` is `v26.0.0`; `pnpm --version` is `10.20.0`; the exact Prisma package entries are present in the lockfile; Git reports no source changes. The origin URL must exactly match the asserted URL; if it differs, stop and resolve the repository-identity discrepancy rather than weakening the expected repository/commit check.

### B. Create and verify an external workspace — creates temporary directory

```bash
umask 077
TMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
RUN_ID="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')"
test "${#RUN_ID}" -eq 32
WORKSPACE="$(mktemp -d "$TMP_BASE/sap-core-v0451.$RUN_ID.XXXXXXXX")"
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)"
case "$WORKSPACE/" in
  "$REPO/"*) rmdir "$WORKSPACE"; printf '%s\n' 'STOP: workspace resolved inside repository.' >&2; exit 1 ;;
esac
test "$WORKSPACE" != "$REPO"
printf '%s\n' "$RUN_ID" > "$WORKSPACE/.run-id"
printf 'Run ID: %s\nWorkspace: %s\n' "$RUN_ID" "$WORKSPACE"
```

The printed run ID and absolute workspace path contain no credentials. Confirm the resolved workspace is outside the repository and is a new temporary directory. If not, stop; only remove it with `rmdir` while it is still empty and only after verifying its exact path.

### C. Copy only required manifests/schema/history and verify checksums — creates temporary files

The following is the complete expected migration-directory list; do not use a wildcard copy:

```bash
MIGRATIONS=(
  '20261106000513_phase_0_3_v01_initial'
  '20261106001500_create_schemas_prerequisite'
  '20261106002304_phase_0_3_v02_cross_schema_relation'
  '20261106010425_phase_0_3_v03_better_auth_identity'
  '20261106080734_create_remaining_schemas'
  '20261106090000_p05_x06_restrict_auth_user_deletion'
)
mkdir -p "$WORKSPACE/prisma/migrations"
cp -p "$REPO/package.json" "$REPO/pnpm-lock.yaml" "$REPO/pnpm-workspace.yaml" "$REPO/.nvmrc" "$WORKSPACE/"
cp -p "$REPO/prisma/schema.prisma" "$WORKSPACE/prisma/schema.prisma"
cp -p "$REPO/prisma/migrations/migration_lock.toml" "$WORKSPACE/prisma/migrations/migration_lock.toml"
for migration in "${MIGRATIONS[@]}"; do
  mkdir -p "$WORKSPACE/prisma/migrations/$migration"
  cp -p "$REPO/prisma/migrations/$migration/migration.sql" \
    "$WORKSPACE/prisma/migrations/$migration/migration.sql"
done
```

Verify the exact six directories and six SQL files, then compare source and destination bytes and hashes:

```bash
EXPECTED_DIRS="$(printf '%s\n' "${MIGRATIONS[@]}" | LC_ALL=C sort)"
SOURCE_DIRS="$(find "$REPO/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort)"
ACTUAL_DIRS="$(find "$WORKSPACE/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort)"
test "$SOURCE_DIRS" = "$EXPECTED_DIRS"
test "$ACTUAL_DIRS" = "$EXPECTED_DIRS"
test "$(printf '%s\n' "$SOURCE_DIRS" | wc -l | tr -d '[:space:]')" = "6"
test "$(printf '%s\n' "$ACTUAL_DIRS" | wc -l | tr -d '[:space:]')" = "6"
test "$(find "$WORKSPACE/prisma/migrations" -type f -name migration.sql | wc -l | tr -d '[:space:]')" = "6"
test ! -e "$WORKSPACE/prisma.config.ts"
test ! -e "$WORKSPACE/.env"
test ! -e "$WORKSPACE/.postgres-password"
test -z "$(find "$WORKSPACE" -type f \( -name .env -o -name .postgres-password \) -print -quit)"

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf '%s\n' 'STOP: install/use an approved SHA-256 utility; do not skip checksum verification.' >&2
    return 1
  fi
}
CHECK_FILES=('prisma/migrations/migration_lock.toml')
for migration in "${MIGRATIONS[@]}"; do
  CHECK_FILES+=("prisma/migrations/$migration/migration.sql")
  test "$(find "$WORKSPACE/prisma/migrations/$migration" -maxdepth 1 -type f | wc -l | tr -d '[:space:]')" = "1"
done
for relative_path in "${CHECK_FILES[@]}"; do
  cmp -s "$REPO/$relative_path" "$WORKSPACE/$relative_path"
  source_hash="$(sha256_file "$REPO/$relative_path")"
  copy_hash="$(sha256_file "$WORKSPACE/$relative_path")"
  test "$source_hash" = "$copy_hash"
  printf '%s  %s\n' "$source_hash" "$relative_path"
done
```

Record the printed SHA-256 values. The workspace at this point contains only the four copied manifests/runtime pin, copied schema, migration lock, six migration directories/SQL files, and non-secret run-ID marker. Do not copy `docker-compose.yml`, `.env.example`, `.env`, or the existing `prisma.config.ts`. No package installation is part of V04.5.1.

### D. Create the new disposable PostgreSQL container — creates temporary container

First inspect Docker's server version and the exact image tag. If the image is absent locally, pull only `postgres:17.6`; record the image ID/digest. Do not remove the shared image cache during cleanup.

```bash
docker version --format 'Docker server={{.Server.Version}}'
if ! docker image inspect postgres:17.6 >/dev/null 2>&1; then
  docker pull postgres:17.6
fi
docker image inspect --format 'Image ID={{.Id}} RepoDigests={{json .RepoDigests}}' postgres:17.6

CONTAINER_NAME="sapcore-v0451-$RUN_ID"
POSTGRES_USER="v0451_$RUN_ID"
DB_FRESH="v0451_${RUN_ID}_fresh"
DB_UPGRADE="v0451_${RUN_ID}_upgrade"
DB_SHADOW="v0451_${RUN_ID}_shadow"
POSTGRES_DB="$DB_FRESH"
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
test "${#POSTGRES_PASSWORD}" -eq 64
export POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD

test "$DB_FRESH" != "$DB_UPGRADE"
test "$DB_FRESH" != "$DB_SHADOW"
test "$DB_UPGRADE" != "$DB_SHADOW"
case "$DB_FRESH $DB_UPGRADE $DB_SHADOW" in
  *sap_core*) printf '%s\n' 'STOP: database name conflicts with development database.' >&2; exit 1 ;;
esac
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  printf '%s\n' 'STOP: generated container name already exists; do not reuse or remove it.' >&2
  exit 1
fi

CONTAINER_ID="$(docker run --detach \
  --name "$CONTAINER_NAME" \
  --label "com.sapcore.v04.run-id=$RUN_ID" \
  --label 'com.sapcore.v04.purpose=v04.5.1' \
  --publish '127.0.0.1::5432/tcp' \
  --tmpfs '/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=1g' \
  --env POSTGRES_USER \
  --env POSTGRES_PASSWORD \
  --env POSTGRES_DB \
  postgres:17.6)"
test -n "$CONTAINER_ID"
printf '%s\n' "$CONTAINER_ID" > "$WORKSPACE/.container-id"
printf '%s\n' "$CONTAINER_NAME" > "$WORKSPACE/.container-name"
printf '%s\n' "$DB_FRESH" "$DB_UPGRADE" "$DB_SHADOW" > "$WORKSPACE/.database-names"
printf 'Created temporary container ID: %s\nName: %s\n' "$CONTAINER_ID" "$CONTAINER_NAME"
```

The password is generated as URL-safe hex and passed to Docker by environment-variable name; its value is never printed by these commands. Do not enable `set -x`, run `env`/`printenv`, or inspect `.Config.Env`. Docker stores container environment for the local Docker administrator, so keep access to this disposable container/workspace appropriately restricted. `DB_FRESH` is created by the image initialization; `DB_UPGRADE` and `DB_SHADOW` are unique reserved names, not created by this runbook.

### E. Verify this exact container, image, mapping, and mounts — read-only inspection

Use only the captured ID or the unique name generated above; do not use broad selection/cleanup commands.

```bash
test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
test "$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")" = "/$CONTAINER_NAME"
test "$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID")" = "running"
test "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")" = 'postgres:17.6'
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.v04.run-id"}}' "$CONTAINER_ID")" = "$RUN_ID"
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.v04.purpose"}}' "$CONTAINER_ID")" = 'v04.5.1'

docker exec "$CONTAINER_ID" postgres --version
PORT_LINE="$(docker port "$CONTAINER_ID" 5432/tcp)"
printf 'Exact container port mapping: %s\n' "$PORT_LINE"
if [[ "$PORT_LINE" =~ ^127\.0\.0\.1:([0-9]{1,5})$ ]]; then
  HOST_PORT="${BASH_REMATCH[1]}"
else
  printf '%s\n' 'STOP: mapping is not exactly one 127.0.0.1 host port.' >&2
  exit 1
fi
test "$HOST_PORT" != '5433'
(( HOST_PORT >= 1 && HOST_PORT <= 65535 ))
printf 'Host port bindings JSON: %s\n' "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$CONTAINER_ID")"
test "$(docker inspect --format '{{len .HostConfig.Tmpfs}}' "$CONTAINER_ID")" = '1'
test "$(docker inspect --format '{{index .HostConfig.Tmpfs "/var/lib/postgresql/data"}}' "$CONTAINER_ID")" = 'rw,nosuid,nodev,noexec,size=1g'
test "$(docker inspect --format '{{len .HostConfig.Binds}}' "$CONTAINER_ID")" = '0'
MOUNTS_JSON="$(docker inspect --format '{{json .Mounts}}' "$CONTAINER_ID")"
printf 'Docker .Mounts representation: %s\nHostConfig.Tmpfs: %s\nHostConfig.Binds count: %s\n' \
  "$MOUNTS_JSON" \
  "$(docker inspect --format '{{json .HostConfig.Tmpfs}}' "$CONTAINER_ID")" \
  "$(docker inspect --format '{{len .HostConfig.Binds}}' "$CONTAINER_ID")"
# Docker Desktop may report .Mounts as [] for a container tmpfs.
# Require the tmpfs declaration and verify the actual mount inside the container.
docker exec "$CONTAINER_ID" sh -c "awk '\$2 == \"/var/lib/postgresql/data\" && \$3 == \"tmpfs\" { found=1 } END { exit !found }' /proc/mounts"
docker exec "$CONTAINER_ID" df -P /var/lib/postgresql/data
```

Expected invariants: `postgres --version` reports PostgreSQL `17.6`; Docker reports the same unique ID/name and `postgres:17.6` image; the port line is exactly `127.0.0.1:<assigned-port>` and is not port `5433`; the bindings JSON contains exactly one host binding for container `5432/tcp`, with host IP `127.0.0.1` and that assigned port; `HostConfig.Tmpfs` declares exactly `/var/lib/postgresql/data` with the requested options; `HostConfig.Binds` is empty; and `/proc/mounts` inside the container confirms that the data directory is actually `tmpfs`. Docker Desktop may render `.Mounts` as `[]` even when `HostConfig.Tmpfs` and the runtime mount prove tmpfs; record that representation as a platform deviation, not a failure. Any actual named/bind mount, missing runtime tmpfs, extra binding, non-loopback address, version/tag mismatch, or uncertainty means STOP.

An optional liveness-only check may be used; it does not execute SQL or prove migration readiness:

```bash
docker exec "$CONTAINER_ID" pg_isready --quiet --username "$POSTGRES_USER" --dbname "$DB_FRESH"
```

### F. Prepare process-local URLs and temporary Prisma config — creates temporary config

The existing config imports `dotenv/config`; this temporary config intentionally does not. Do not source an env file. Clear any inherited database URL variables, then set URLs from the verified container mapping and unique names. The hex password has no URL-reserved characters. Never print these variables or their expanded values.

```bash
unset DATABASE_URL SHADOW_DATABASE_URL UPGRADE_DATABASE_URL
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_FRESH}?schema=public"
UPGRADE_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_UPGRADE}?schema=public"
SHADOW_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_SHADOW}?schema=public"
export DATABASE_URL UPGRADE_DATABASE_URL SHADOW_DATABASE_URL

cat > "$WORKSPACE/prisma.config.ts" <<'EOF'
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
EOF

test -f "$WORKSPACE/prisma.config.ts"
test ! -e "$WORKSPACE/.env"
test ! -e "$WORKSPACE/.postgres-password"
test -z "$(find "$WORKSPACE" -type f \( -name .env -o -name .postgres-password \) -print -quit)"
grep -F 'schema: "prisma/schema.prisma"' "$WORKSPACE/prisma.config.ts"
grep -F 'path: "prisma/migrations"' "$WORKSPACE/prisma.config.ts"
grep -F 'env("DATABASE_URL")' "$WORKSPACE/prisma.config.ts"
grep -F 'env("SHADOW_DATABASE_URL")' "$WORKSPACE/prisma.config.ts"
cd "$WORKSPACE"
```

Do not copy the repository config or any `.env` file. The temporary config names only the copied schema and migration directory and reads process-local variables. The config is preparation only; do not invoke Prisma to validate or load it in this runbook.

### G. Verify the URL destinations without connecting — verification only

The host and port must match the verified port binding for the exact container ID. Database names must be distinct, run-ID-specific, and not `sap_core`. These string assertions do not connect to a database and do not prove migration readiness.

```bash
EXPECTED_FRESH_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_FRESH}?schema=public"
EXPECTED_UPGRADE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_UPGRADE}?schema=public"
EXPECTED_SHADOW_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${DB_SHADOW}?schema=public"
test "$DATABASE_URL" = "$EXPECTED_FRESH_URL"
test "$UPGRADE_DATABASE_URL" = "$EXPECTED_UPGRADE_URL"
test "$SHADOW_DATABASE_URL" = "$EXPECTED_SHADOW_URL"
test "$DB_FRESH" != "$DB_UPGRADE" && test "$DB_FRESH" != "$DB_SHADOW" && test "$DB_UPGRADE" != "$DB_SHADOW"
for destination in "$DATABASE_URL" "$UPGRADE_DATABASE_URL" "$SHADOW_DATABASE_URL"; do
  [[ "$destination" == *"@127.0.0.1:${HOST_PORT}/"* ]]
  [[ "$destination" != *':5433/'* ]]
  [[ "$destination" != *'/sap_core?'* ]]
done
printf 'URL targets verified (credentials redacted): host=127.0.0.1 port=%s; databases=%s,%s,%s\n' \
  "$HOST_PORT" "$DB_FRESH" "$DB_UPGRADE" "$DB_SHADOW"
```

Do not run `psql`, `createdb`, any Prisma command, or any URL-based connection probe in Stage G. If the host/port cannot be tied unambiguously to the exact container, any name is not unique, or any URL contains port `5433` or database `sap_core`, STOP. The only database initialized at this point is the unique `$DB_FRESH` specified at container startup; the upgrade and shadow names are reserved for the later, separately authorized spike.

### H. Stop and hand control back — no Prisma/SQL work

Before handoff, review every item in the checklist below. Record the evidence fields in Section 7 without passwords or full URLs. Keep the Bash session and process-local secret alive only if the owner intends to proceed under the separate V04.4 authorization. If the session is lost, do not recover a password from Docker inspection; stop and dispose of only the exact verified temporary container/workspace, then start a new run with a new run ID.

**Handoff rule:** stop here. Do not run `pnpm db:validate`, `pnpm db:generate`, `pnpm db:migrate:dev`, `pnpm db:migrate:deploy`, `pnpm db:status`, `pnpm test:v03`, `pnpm exec prisma`, SQL, tests, builds, or migration commands. The V04.4 plan governs any later execution after owner approval.

## 5. Preflight checklist

Every item must be confirmed before handoff; any failed or ambiguous item is STOP:

- [ ] Repository origin, branch `main`, clean working tree, technical baseline ancestor `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a`, and empty technical-input diff from that baseline verified.
- [ ] Node.js is exactly `26.0.0`; pnpm is exactly `10.20.0`; manifest/lock pins Prisma CLI, Client, and adapter-pg `7.10.1`; PostgreSQL tag is `postgres:17.6`.
- [ ] Workspace absolute path is outside the repository; run ID is unique and recorded.
- [ ] Exactly the six named migration directories and six `migration.sql` files exist in the copy; migration lock and SQL checksums match the repository byte-for-byte.
- [ ] No `.env` was copied or loaded; no `.env.example`, Compose file, repository Prisma config, source, test, or generated file was copied.
- [ ] The new exact container ID/name and run-ID label match; image tag and binary report PostgreSQL `17.6`.
- [ ] `HostConfig.Tmpfs` declares only `/var/lib/postgresql/data` with the specified options; `HostConfig.Binds` is empty; `/proc/mounts` inside the container confirms runtime `tmpfs`; Docker `.Mounts` representation is recorded (it may be `[]` on Docker Desktop).
- [ ] One dynamic host port is bound only to `127.0.0.1`; the port is not `5433`.
- [ ] Fresh, upgrade, and shadow database names are unique throwaway names; URL host/port/name assertions pass without printing credentials; no URL references `5433` or `sap_core`.
- [ ] The existing Compose service, current development database, and `sap_core_postgres_data` volume have not been used or touched.
- [ ] No Prisma validation/generation/migration, SQL, tests, builds, or technical experiments have been executed.
- [ ] Owner is ready to take over for the separately authorized V04.4 execution; no further operation is authorized by this runbook.

## 6. Stop conditions and recovery

- **Baseline, runtime, or source checksum mismatch:** stop before starting Docker. Do not edit the repository or accept changed migration bytes. Reconcile the commit/toolchain or create a new approved runbook revision.
- **Workspace resolves inside the repository:** stop and remove only that still-empty directory with `rmdir` after verifying its absolute path; recreate outside the repository.
- **Container name collision:** do not reuse, stop, or remove the existing container. Generate a new run ID and workspace. If a container was created before an error, inspect only the recorded exact name/ID and verify both runbook labels before considering cleanup.
- **Wrong image/version, mount, extra/non-loopback binding, or port `5433`:** do not connect. Verify the exact container ID/name/labels, then use the cleanup procedure below for that container only. Start a new run with a new run ID if needed.
- **URL mismatch or uncertain destination:** unset the temporary URLs and do not use them. Do not use the repository `.env.example`, any inherited environment value, or a guessed host/port as fallback.
- **Credentials accidentally printed or written:** treat the disposable credential as exposed. Do not reuse it. Stop and remove only the exact runbook container after identity verification; delete only its exact workspace; restart with a new random password and run ID.
- **Docker command fails before returning an ID:** do not run `docker ps`-based cleanup or select by image. If cleanup is necessary, use the unique recorded name and verify the run-ID and purpose labels before any removal. If identity cannot be verified, stop and ask the Docker administrator/owner to inspect it.
- **Any uncertainty about the target:** STOP. Never probe the existing development database to diagnose a setup failure.

## 7. Evidence capture template

Complete with sanitized values only. Do not paste passwords, `POSTGRES_PASSWORD`, full `DATABASE_URL`/`SHADOW_DATABASE_URL`/upgrade URLs, or Docker `.Config.Env`.

- Baseline commit SHA: `________________________________`
- Branch / repository origin verified: `________________________________`
- Owner preflight result (`PASS` only if all checklist items pass): `________________________________`
- Preflight timestamp and time zone: `________________________________`
- Node.js / pnpm versions: `________________________________`
- Prisma CLI / Client / adapter-pg pinned versions (manifest/lock only): `________________________________`
- Workspace absolute path: `________________________________`
- Run ID: `________________________________`
- Temporary container name and ID: `________________________________`
- PostgreSQL image tag, binary version, image ID/digest: `________________________________`
- Host binding and dynamically assigned port: `________________________________`
- Mount inspection result (`HostConfig.Tmpfs`, runtime `/proc/mounts`, `df -P`, `.Mounts` representation, and zero binds): `________________________________`
- Historical migration directories/count (`6`) and migration SQL + lock SHA-256 values: `________________________________`
- Temporary database names (fresh / upgrade / shadow): `________________________________`
- Temporary Prisma config points to copied schema/migrations; no dotenv import: `________________________________`
- Repository `.env` was not loaded/copied: `YES / NO`
- Existing development DB, port `5433`, Compose service, and named volume were not touched: `YES / NO`
- No Prisma/SQL/tests/builds/database experiments have run: `YES / NO`
- Cleanup timestamp, exact container removal, and exact workspace removal (when applicable): `________________________________`

## 8. Cleanup — exact resources only

Cleanup is performed only when the owner is finished and has recorded the evidence above. It is not part of the handoff if the owner is about to continue into the separately authorized V04.4 spike. Use the same shell variables or read their non-secret values from the exact workspace markers. Never delete anything based only on an image name, wildcard, or broad listing.

First verify the recorded workspace and container identity. The commands below require the original `REPO`, `TMP_BASE`, `WORKSPACE`, `RUN_ID`, `CONTAINER_NAME`, and `CONTAINER_ID` variables; if they are unavailable, recover the non-secret ID/name from the specific workspace markers only after verifying the workspace path. Do not retrieve or print the password.

```bash
case "$WORKSPACE/" in
  "$REPO/"*) printf '%s\n' 'STOP: refusing workspace cleanup inside repository.' >&2; exit 1 ;;
esac
case "$WORKSPACE" in
  "$TMP_BASE"/sap-core-v0451.*) ;;
  *) printf '%s\n' 'STOP: workspace is outside the recorded runbook temp prefix.' >&2; exit 1 ;;
esac
test "$(cat "$WORKSPACE/.run-id")" = "$RUN_ID"
test "$(cat "$WORKSPACE/.container-name")" = "$CONTAINER_NAME"
test "$(cat "$WORKSPACE/.container-id")" = "$CONTAINER_ID"
test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
test "$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")" = "/$CONTAINER_NAME"
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.v04.run-id"}}' "$CONTAINER_ID")" = "$RUN_ID"
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.v04.purpose"}}' "$CONTAINER_ID")" = 'v04.5.1'
STATE="$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID")"
case "$STATE" in
  running) docker stop "$CONTAINER_ID" ;;
  exited|created) ;;
  *) printf '%s\n' 'STOP: unexpected container state; do not remove.' >&2; exit 1 ;;
esac
test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
docker rm "$CONTAINER_ID"
rm -rf "$WORKSPACE"
```

After `docker rm`, do not run a Docker command that could select a replacement container by the former name. Record successful removal in the evidence template before deleting the workspace, or preserve the template elsewhere without secrets. The container uses only an ephemeral tmpfs mount; never remove a volume, and do not remove the pulled PostgreSQL image cache.

## 9. Handoff and status boundary

Handoff is complete only when all preflight items pass, the evidence template is filled without secrets, and the owner explicitly accepts control of the verified temporary workspace/container. Otherwise stop and follow the recovery section. This runbook does not authorize the V04.4 Prisma/SQL/test phase.

This runbook is not evidence that the environment has been created. No database operations or technical experiments have been performed while authoring it. Gate states remain unchanged: V01–V03 `PASS`; V04–V10 `BLOCKED`; Phase 1 `BLOCKED`. D6 guard testing remains blocked pending explicit status vocabulary and physical predicate resolution.

## 10. Reconciliation record — 2026-11-07

This record documents the observed V04.5.1 preparation attempt and its disposition. It does not authorize or report V04.4 execution.

- **Source baseline deviation:** preparation ran from commit `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a`, not the original expected `64bf956648360b4ae9ea53ecd6605c9b309261da`. The intervening change was documentation-only; the pinned manifests, runtime pin, Prisma schema, and six migration histories were verified unchanged. Future Stage A therefore validates ancestry from the technical-input baseline plus an empty diff for those technical paths, rather than requiring HEAD to equal an obsolete documentation baseline.
- **Credential handling incident:** the first disposable run wrote its throwaway PostgreSQL password to a workspace file named `.postgres-password` (mode 0600). Treat that credential as exposed and never reuse it. The exact old container and workspace were subsequently removed after verifying the full container ID/name, run-ID and purpose labels, and workspace markers. No password value is recorded here.
- **Retirement evidence:** container `f00dfa66e19bdcf734e5a239e4e8dbefbde0f08e0e5634901a8096415fa9623b` and workspace Run ID `d3b4280839ca831ec15e2ce8ee61cde2` were removed on 2026-11-07; the owner terminal printed `RETIREMENT COMPLETE`. The development volume, repository, and image were not targeted by the cleanup procedure.
- **Docker Desktop tmpfs representation:** Docker inspection returned an empty `.Mounts` array, while `HostConfig.Tmpfs` declared the requested data-directory tmpfs and in-container `/proc/mounts` plus `df` confirmed the runtime tmpfs. Stage E now checks the configuration and runtime mount instead of requiring `.Mounts` to contain one entry.
- **Development resource observation:** no `sap-core-postgres` container was present during the check. The Compose-created volume `sap_core_sap_core_postgres_data` (logical Compose volume `sap_core_postgres_data`) existed and was not modified. Its database contents/integrity were not verified.
- **Abandoned preliminary workspace:** an earlier incomplete workspace associated with Run ID `2e9e7a88a02fa2fc0f2d7320d1a2ce2d` was observed separately and was not part of the approved retirement. It was not removed or reused; its current state must be checked by the owner before any future cleanup.
- **Execution boundary:** no V04.4 Prisma validation/generation, SQL, migration, database test, application test, or build was run. V04 remains `BLOCKED`; V05–V10 and Phase 1 remain `BLOCKED`. D6 guard experiments remain `BLOCKED / NOT RUN` pending the exact status vocabulary and physical predicate.

For any new preparation attempt, generate a new Run ID and password. Never reuse the retired identity or credential. Keep the password only in process memory; never write it to the workspace, a dotenv file, shell history, evidence, or terminal output. Docker necessarily retains the environment value in container metadata accessible to a Docker administrator; do not inspect or print `.Config.Env`. If the shell session is lost, do not recover the password from Docker metadata: retire only the exact verified disposable resources and start over with a new Run ID.
