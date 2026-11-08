#!/usr/bin/env bash
# STATUS: PREPARED / NOT EXECUTED / NOT RUNTIME-VERIFIED.
# D14 remains UNRESOLVED. This setup is restricted to a unique tmpfs-backed disposable PostgreSQL container.
# Source this file from a Bash session, from the Sap Core repository root.
# It provisions an ephemeral PostgreSQL 17.6 container and applies only migrations 1-7.
# The D14 fixture and migration-8/test phase is an explicit second command.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf '%s\n' 'Source this file into Bash; do not execute it as a child process.' >&2
  exit 2
fi

set -Eeuo pipefail
set +x

REPO="$(git rev-parse --show-toplevel)"
REPO="$(cd "$REPO" && pwd -P)"
D14_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
test -f "$D14_SCRIPT_DIR/d14-fixtures.sql"
test -f "$D14_SCRIPT_DIR/d14-tests.sql"

# Refuse local migration edits or unexpected migration sets: the procedure must
# replay the checked-in SQL, not an uncommitted variant.
git -C "$REPO" diff --quiet HEAD -- prisma/migrations
MIGRATIONS=(
  '20261106000513_phase_0_3_v01_initial'
  '20261106001500_create_schemas_prerequisite'
  '20261106002304_phase_0_3_v02_cross_schema_relation'
  '20261106010425_phase_0_3_v03_better_auth_identity'
  '20261106080734_create_remaining_schemas'
  '20261106090000_p05_x06_restrict_auth_user_deletion'
  '20261107112700_v0451_tenant_scope_schema'
)
ALL_SOURCE_MIGRATIONS=(
  "${MIGRATIONS[@]}"
  '20261107130000_d7_typed_role_assignments'
  '20261108130000_d8_role_definition_governance'
)
EXPECTED_SOURCE_DIRS="$(printf '%s\n' "${ALL_SOURCE_MIGRATIONS[@]}" | LC_ALL=C sort)"
SOURCE_DIRS="$(find "$REPO/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort)"
test "$SOURCE_DIRS" = "$EXPECTED_SOURCE_DIRS"
test "$(node --version)" = 'v26.0.0'
test "$(pnpm --version)" = '10.20.0'
grep -F '"@prisma/client": "7.10.1"' "$REPO/package.json" >/dev/null
grep -F '"prisma": "7.10.1"' "$REPO/package.json" >/dev/null

umask 077
TMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
RUN_ID="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')"
test "${#RUN_ID}" -eq 32
WORKSPACE="$(mktemp -d "$TMP_BASE/sap-core-d14.$RUN_ID.XXXXXXXX")"
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)"
WORKSPACE_BASENAME="$(basename "$WORKSPACE")"
[[ "$WORKSPACE_BASENAME" =~ ^sap-core-d14\.${RUN_ID}\.[[:alnum:]]{8}$ ]]
case "$WORKSPACE/" in
  "$REPO/"*) printf '%s\n' 'STOP: workspace is inside the repository.' >&2; exit 1 ;;
esac
test "$WORKSPACE" != "$REPO"
printf '%s\n' "$RUN_ID" > "$WORKSPACE/.run-id"
printf '%s\n' "$(git -C "$REPO" rev-parse HEAD)" > "$WORKSPACE/.source-commit"

if ! docker image inspect postgres:17.6 >/dev/null 2>&1; then
  docker pull postgres:17.6
fi
IMAGE_ID="$(docker image inspect --format '{{.Id}}' postgres:17.6)"
CONTAINER_NAME="sapcore-d14-$RUN_ID"
POSTGRES_USER="d14_$RUN_ID"
POSTGRES_DB="d14_$RUN_ID"
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
test "${#POSTGRES_PASSWORD}" -eq 64
export POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  printf '%s\n' 'STOP: generated container name already exists; do not reuse it.' >&2
  exit 1
fi

CONTAINER_ID="$(docker run --detach \
  --name "$CONTAINER_NAME" \
  --label "com.sapcore.d14.run-id=$RUN_ID" \
  --label 'com.sapcore.d14.purpose=role-assignment-history' \
  --publish '127.0.0.1::5432/tcp' \
  --tmpfs '/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=1g' \
  --env POSTGRES_USER \
  --env POSTGRES_PASSWORD \
  --env POSTGRES_DB \
  postgres:17.6)"
test -n "$CONTAINER_ID"
printf '%s\n' "$CONTAINER_ID" > "$WORKSPACE/.container-id"
printf '%s\n' "$CONTAINER_NAME" > "$WORKSPACE/.container-name"

for attempt in {1..60}; do
  if docker exec "$CONTAINER_ID" pg_isready --quiet --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    printf '%s\n' 'STOP: disposable PostgreSQL did not become ready.' >&2
    exit 1
  fi
  sleep 1
done

test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
test "$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")" = "/$CONTAINER_NAME"
test "$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID")" = 'running'
test "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")" = 'postgres:17.6'
test "$(docker inspect --format '{{.Image}}' "$CONTAINER_ID")" = "$IMAGE_ID"
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.d14.run-id"}}' "$CONTAINER_ID")" = "$RUN_ID"
test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.d14.purpose"}}' "$CONTAINER_ID")" = 'role-assignment-history'
test "$(docker inspect --format '{{len .HostConfig.Binds}}' "$CONTAINER_ID")" = '0'
test "$(docker inspect --format '{{len .HostConfig.Tmpfs}}' "$CONTAINER_ID")" = '1'
docker exec "$CONTAINER_ID" sh -c "awk '\$2 == \"/var/lib/postgresql/data\" && \$3 == \"tmpfs\" { found=1 } END { exit !found }' /proc/mounts"
PORT_LINE="$(docker port "$CONTAINER_ID" 5432/tcp)"
if [[ "$PORT_LINE" =~ ^127\.0\.0\.1:([0-9]{1,5})$ ]]; then
  HOST_PORT="${BASH_REMATCH[1]}"
else
  printf '%s\n' 'STOP: the only database port must bind to 127.0.0.1.' >&2
  exit 1
fi
test "$HOST_PORT" != '5433'
(( HOST_PORT >= 1 && HOST_PORT <= 65535 ))

# Copy only the inputs Prisma needs and exactly the seven pre-D7 migrations.
mkdir -p "$WORKSPACE/prisma/migrations"
cp -p "$REPO/package.json" "$REPO/pnpm-lock.yaml" "$REPO/pnpm-workspace.yaml" "$REPO/.nvmrc" "$WORKSPACE/"
cp -p "$REPO/prisma/schema.prisma" "$WORKSPACE/prisma/schema.prisma"
cp -p "$REPO/prisma/migrations/migration_lock.toml" "$WORKSPACE/prisma/migrations/migration_lock.toml"
for migration in "${MIGRATIONS[@]}"; do
  mkdir -p "$WORKSPACE/prisma/migrations/$migration"
  cp -p "$REPO/prisma/migrations/$migration/migration.sql" \
    "$WORKSPACE/prisma/migrations/$migration/migration.sql"
  cmp -s "$REPO/prisma/migrations/$migration/migration.sql" \
    "$WORKSPACE/prisma/migrations/$migration/migration.sql"
done
ACTUAL_DIRS="$(find "$WORKSPACE/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort)"
EXPECTED_DIRS="$(printf '%s\n' "${MIGRATIONS[@]}" | LC_ALL=C sort)"
test "$ACTUAL_DIRS" = "$EXPECTED_DIRS"
test ! -e "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments"
test ! -e "$WORKSPACE/prisma/migrations/20261108130000_d8_role_definition_governance"

cat > "$WORKSPACE/prisma.config.ts" <<'EOF'
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
EOF

unset DATABASE_URL SHADOW_DATABASE_URL
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${HOST_PORT}/${POSTGRES_DB}?schema=public"
export DATABASE_URL
cd "$WORKSPACE"
pnpm install --frozen-lockfile 2>&1 | tee "$WORKSPACE/pnpm-install.log"
pnpm exec prisma migrate deploy --config "$WORKSPACE/prisma.config.ts" 2>&1 | tee "$WORKSPACE/migrate-1-7.log"
pnpm exec prisma migrate status --config "$WORKSPACE/prisma.config.ts" 2>&1 | tee "$WORKSPACE/status-1-7.log"

d14_psql() {
  docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

HISTORY_QUERY='SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM public."_prisma_migrations" ORDER BY started_at, migration_name;'
d14_psql -A -P pager=off -P footer=off -F $'\t' -c "$HISTORY_QUERY" | tee "$WORKSPACE/migration-history-1-7.tsv"
APPLIED_COUNT="$(d14_psql -At -c 'SELECT COUNT(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')"
test "$APPLIED_COUNT" = '7'
APPLIED_NAMES="$(d14_psql -At -c 'SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
test "$APPLIED_NAMES" = "$EXPECTED_DIRS"

printf '\nD14 checkpoint: migrations 1-7 applied and recorded.\n'
printf 'Source commit: %s\nRun ID: %s\nWorkspace: %s\nContainer ID: %s\nContainer name: %s\nPostgreSQL: postgres:17.6, host binding 127.0.0.1:%s\nDatabase: %s (credentials redacted)\n' \
  "$(cat "$WORKSPACE/.source-commit")" "$RUN_ID" "$WORKSPACE" "$CONTAINER_ID" "$CONTAINER_NAME" "$HOST_PORT" "$POSTGRES_DB"
printf 'Migration history: %s/migration-history-1-7.tsv\n' "$WORKSPACE"
printf '%s\n' 'STOP HERE: review the seven-row migration history before creating fixtures.'

# Call only after reviewing the checkpoint output and history file.
d14_apply_migration8_and_test() {
  set -Eeuo pipefail
  set +x
  test "$(cat "$WORKSPACE/.run-id")" = "$RUN_ID"
  test "$(git -C "$REPO" rev-parse HEAD)" = "$(cat "$WORKSPACE/.source-commit")"
  git -C "$REPO" diff --quiet HEAD -- prisma/migrations
  test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
  test "$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")" = "/$CONTAINER_NAME"
  test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.d14.run-id"}}' "$CONTAINER_ID")" = "$RUN_ID"
  test "$(docker inspect --format '{{len .HostConfig.Binds}}' "$CONTAINER_ID")" = '0'
  test ! -e "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments"
  test ! -e "$WORKSPACE/prisma/migrations/20261108130000_d8_role_definition_governance"
  test "$(d14_psql -At -c 'SELECT COUNT(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')" = '7'

  # This is deliberately before migration 8: these are true pre-D7 fixtures.
  d14_psql < "$D14_SCRIPT_DIR/d14-fixtures.sql" 2>&1 | tee "$WORKSPACE/fixtures-1-7.log"

  mkdir -p "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments"
  cp -p "$REPO/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql" \
    "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql"
  cmp -s "$REPO/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql" \
    "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql"
  test ! -e "$WORKSPACE/prisma/migrations/20261108130000_d8_role_definition_governance"
  pnpm exec prisma migrate deploy --config "$WORKSPACE/prisma.config.ts" 2>&1 | tee "$WORKSPACE/migrate-8.log"
  pnpm exec prisma migrate status --config "$WORKSPACE/prisma.config.ts" 2>&1 | tee "$WORKSPACE/status-8.log"

  HISTORY_QUERY='SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM public."_prisma_migrations" ORDER BY started_at, migration_name;'
  d14_psql -A -P pager=off -P footer=off -F $'\t' -c "$HISTORY_QUERY" | tee "$WORKSPACE/migration-history-1-8.tsv"
  APPLIED_COUNT="$(d14_psql -At -c 'SELECT COUNT(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')"
  test "$APPLIED_COUNT" = '8'
  APPLIED_NAMES="$(d14_psql -At -c 'SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')"
  EXPECTED_NAMES_8="$(printf '%s\n' "${MIGRATIONS[@]}" '20261107130000_d7_typed_role_assignments' | LC_ALL=C sort)"
  test "$APPLIED_NAMES" = "$EXPECTED_NAMES_8"
  test ! -e "$WORKSPACE/prisma/migrations/20261108130000_d8_role_definition_governance"

  d14_psql < "$D14_SCRIPT_DIR/d14-tests.sql" 2>&1 | tee "$WORKSPACE/d14-test-results.log"
  printf 'D14 SQL test output: %s/d14-test-results.log\n' "$WORKSPACE"
  printf '%s\n' 'Migration 9 was not copied or applied. Review every output row; this procedure itself does not establish PASS.'
}

# Removes only the exact recorded, labeled D14 container and its workspace.
# Preserve/copy the non-secret logs first if they are needed as evidence.
d14_cleanup() {
  set -Eeuo pipefail
  set +x
  test -d "$WORKSPACE"
  test ! -L "$WORKSPACE"
  test "$WORKSPACE" != "$REPO"
  WORKSPACE_BASENAME="$(basename "$WORKSPACE")"
  [[ "$WORKSPACE_BASENAME" =~ ^sap-core-d14\.${RUN_ID}\.[[:alnum:]]{8}$ ]]
  case "$WORKSPACE/" in
    "$REPO/"*) printf '%s\n' 'STOP: refusing to remove a workspace inside the repository.' >&2; return 1 ;;
  esac
  test "$(cd "$(dirname "$WORKSPACE")" && pwd -P)" = "$TMP_BASE"
  test "$(cat "$WORKSPACE/.run-id")" = "$RUN_ID"
  test "$(cat "$WORKSPACE/.container-id")" = "$CONTAINER_ID"
  test "$(cat "$WORKSPACE/.container-name")" = "$CONTAINER_NAME"
  test "$(docker inspect --format '{{.Id}}' "$CONTAINER_ID")" = "$CONTAINER_ID"
  test "$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")" = "/$CONTAINER_NAME"
  test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.d14.run-id"}}' "$CONTAINER_ID")" = "$RUN_ID"
  test "$(docker inspect --format '{{index .Config.Labels "com.sapcore.d14.purpose"}}' "$CONTAINER_ID")" = 'role-assignment-history'
  case "$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID")" in
    running) docker stop "$CONTAINER_ID" ;;
    exited|created) ;;
    *) printf '%s\n' 'STOP: unexpected container state; do not remove.' >&2; return 1 ;;
  esac
  docker rm "$CONTAINER_ID"
  rm -rf -- "$WORKSPACE"
  test ! -e "$WORKSPACE"
  unset DATABASE_URL POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB
  printf '%s\n' 'Exact disposable container and workspace removed; no volumes or images were removed.'
}
