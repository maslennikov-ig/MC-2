#!/usr/bin/bash
set -Eeuo pipefail
export LC_ALL=C
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
readonly DOCKER='/usr/bin/docker'
readonly PSQL='/usr/lib/postgresql/17/bin/psql'
readonly PG_RESTORE='/usr/lib/postgresql/17/bin/pg_restore'
readonly RESTORE_TAG='public.ecr.aws/supabase/postgres:17.6.1.064'
readonly RESTORE_INDEX='sha256:4c6d67181e482549bab276e8ae933f807be59ea1c371c225d85c189b0c14b9de'
readonly RESTORE_CHILD='sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f'
readonly RESTORE_IMAGE='public.ecr.aws/supabase/postgres@sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f'
readonly REQUIRED_PG_VERSION='17.6'
readonly MANIFEST_TOOL="$SCRIPT_DIR/q12-source-manifest.ts"
readonly ROLE_TOOL="$SCRIPT_DIR/generate-role-bootstrap.ts"
readonly CLEANUP_HELPER="$SCRIPT_DIR/run-restore-cleanup.ts"
readonly TEMP_DIRECTORY_HELPER="$SCRIPT_DIR/create-private-temp-dir.py"
readonly PGTLE_ARCHIVE_SCANNER="$SCRIPT_DIR/scan-pgtle-archive.py"

GENERATION=''
RUN_ID=''
RUN_KIND=''
CAPABILITY_FILE=''
CLEANUP_RESULT=''
TEMP_ROOT=''
CONTAINER_ID=''
NETWORK_ID=''
VOLUME_NAME=''
CLEANUP_STARTED=0

fail() {
  printf 'Supabase restore drill failed: %s\n' "$1" >&2
  exit "${2:-1}"
}

# BEGIN authoritative Docker lifecycle
restore_docker_expected_name() {
  case "$1" in
    container) printf 'mc2-supabase-restore-%s\n' "$RUN_ID" ;;
    network) printf 'mc2-supabase-restore-net-%s\n' "$RUN_ID" ;;
    volume) printf 'mc2-supabase-restore-data-%s\n' "$RUN_ID" ;;
    *) return 64 ;;
  esac
}

restore_docker_metadata() {
  local kind=$1 identity=$2
  case "$kind" in
    container)
      "$DOCKER" inspect --format '{{index .Config.Labels "com.megacampus.q12.restore-run"}}|{{index .Config.Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    network)
      "$DOCKER" network inspect --format '{{index .Labels "com.megacampus.q12.restore-run"}}|{{index .Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    volume)
      "$DOCKER" volume inspect --format '{{index .Labels "com.megacampus.q12.restore-run"}}|{{index .Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    *) return 64 ;;
  esac
}

restore_docker_resource_matches() {
  local kind=$1 identity=$2 expected_name metadata
  expected_name=$(restore_docker_expected_name "$kind") || return 1
  metadata=$(restore_docker_metadata "$kind" "$identity") || return 1
  if [[ "$kind" == container ]]; then
    expected_name="/$expected_name"
  fi
  [[ "$metadata" == "$RUN_ID|$kind|$expected_name" ]]
}

restore_docker_discover() {
  local kind=$1 output identity='' line='' count=0
  case "$kind" in
    container)
      output=$("$DOCKER" ps --all --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=container') || return 1
      ;;
    network)
      output=$("$DOCKER" network ls --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=network') || return 1
      ;;
    volume)
      output=$("$DOCKER" volume ls --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=volume') || return 1
      ;;
    *) return 64 ;;
  esac
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    count=$((count + 1))
    [[ $count -eq 1 ]] || return 1
    identity=$line
  done <<<"$output"
  [[ $count -eq 1 ]] || return 2
  restore_docker_resource_matches "$kind" "$identity" || return 1
  printf '%s\n' "$identity"
}

cleanup_restore_docker_resources() {
  local status=0 identity='' discovery_status=0
  if [[ -n "${CONTAINER_ID:-}" ]]; then
    identity=$CONTAINER_ID
  elif identity=$(restore_docker_discover container); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches container "$identity"; then
      "$DOCKER" rm -f -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi

  identity=''
  if [[ -n "${NETWORK_ID:-}" ]]; then
    identity=$NETWORK_ID
  elif identity=$(restore_docker_discover network); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches network "$identity"; then
      "$DOCKER" network rm -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi

  identity=''
  if [[ -n "${VOLUME_NAME:-}" ]]; then
    identity=$VOLUME_NAME
  elif identity=$(restore_docker_discover volume); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches volume "$identity"; then
      "$DOCKER" volume rm --force -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi
  return "$status"
}

restore_docker_fault_after_create() {
  local kind=$1
  if [[ "${MC2_RESTORE_FAULT_AFTER_CREATE:-}" == "$kind" ]]; then
    printf 'synthetic restore Docker fault after %s create\n' "$kind" >&2
    return 97
  fi
}

create_restore_docker_resources() {
  local container_name network_name volume_name output
  container_name=$(restore_docker_expected_name container)
  network_name=$(restore_docker_expected_name network)
  volume_name=$(restore_docker_expected_name volume)

  # A Docker --internal network never publishes ports, so host loopback
  # access is provided by a dedicated bridge with IP masquerade disabled:
  # the kernel-assigned 127.0.0.1 publish stays reachable while container
  # egress is dropped without NAT.
  "$DOCKER" network create --opt com.docker.network.bridge.enable_ip_masquerade=false \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=network' "$network_name" \
    >"$TEMP_ROOT/network-create.identity"
  restore_docker_fault_after_create network
  IFS= read -r output <"$TEMP_ROOT/network-create.identity"
  [[ "$output" =~ ^[0-9a-f]{64}$ ]] || return 1
  restore_docker_resource_matches network "$output" || return 1
  NETWORK_ID=$output

  "$DOCKER" volume create \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=volume' "$volume_name" \
    >"$TEMP_ROOT/volume-create.identity"
  restore_docker_fault_after_create volume
  IFS= read -r output <"$TEMP_ROOT/volume-create.identity"
  [[ "$output" == "$volume_name" ]] || return 1
  restore_docker_resource_matches volume "$output" || return 1
  VOLUME_NAME=$output

  "$DOCKER" run --detach --name "$container_name" --platform linux/amd64 \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=container' --network "$NETWORK_ID" \
    --publish 127.0.0.1::5432 \
    --mount "type=volume,src=$VOLUME_NAME,dst=/var/lib/postgresql/data" \
    --mount "type=bind,src=$TEMP_ROOT/initial-password,dst=/run/secrets/initial-password,readonly" \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/initial-password \
    "$RESTORE_IMAGE" >"$TEMP_ROOT/container-create.identity"
  restore_docker_fault_after_create container
  IFS= read -r output <"$TEMP_ROOT/container-create.identity"
  [[ "$output" =~ ^[0-9a-f]{64}$ ]] || return 1
  restore_docker_resource_matches container "$output" || return 1
  CONTAINER_ID=$output
}
# END authoritative Docker lifecycle

cleanup_resources() {
  local status=0
  CLEANUP_STARTED=1
  cleanup_restore_docker_resources || status=1
  if [[ -n "$TEMP_ROOT" ]]; then
    case "$TEMP_ROOT" in
      /tmp/mc2-supabase-restore-*) /usr/bin/rm -rf --one-file-system -- "$TEMP_ROOT" || status=1 ;;
      *) status=1 ;;
    esac
  fi
  return "$status"
}

on_exit() {
  local primary_status=$?
  trap - EXIT HUP INT TERM
  if ! cleanup_resources; then
    printf 'Supabase restore drill failed: cleanup failure overrides restore success\n' >&2
    exit 90
  fi
  exit "$primary_status"
}

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

require_absolute_file() {
  local label=$1 path=$2 allowed_modes=$3
  [[ "$path" == /* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || fail "$label must be an absolute path"
  [[ -f "$path" && ! -L "$path" ]] || fail "$label must be a regular non-symlink file"
  [[ "$(/usr/bin/readlink -f -- "$path")" == "$path" ]] || fail "$label has canonical path drift"
  local identity uid gid mode
  identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$path")
  IFS=: read -r uid gid mode <<<"$identity"
  [[ "$uid" == "$(/usr/bin/id -u)" && "$gid" == "$(/usr/bin/id -g)" ]] || fail "$label owner mismatch"
  case ":$allowed_modes:" in
    *":$mode:"*) ;;
    *) fail "$label mode mismatch" ;;
  esac
}

require_absolute_directory() {
  local label=$1 path=$2 mode=$3
  [[ "$path" == /* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || fail "$label must be an absolute path"
  [[ -d "$path" && ! -L "$path" ]] || fail "$label must be a regular non-symlink directory"
  [[ "$(/usr/bin/readlink -f -- "$path")" == "$path" ]] || fail "$label has canonical path drift"
  [[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$path")" == "$(/usr/bin/id -u):$(/usr/bin/id -g):$mode" ]] || fail "$label metadata mismatch"
}

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --generation) GENERATION=${2:-}; shift 2 ;;
      --run-id) [[ -z "$RUN_KIND" ]] || fail 'restore run mode must be selected exactly once' 64; RUN_KIND=q12; RUN_ID=${2:-}; shift 2 ;;
      --scheduled-run-id) [[ -z "$RUN_KIND" ]] || fail 'restore run mode must be selected exactly once' 64; RUN_KIND=scheduled; RUN_ID=${2:-}; shift 2 ;;
      --q12-db-capability-file) CAPABILITY_FILE=${2:-}; shift 2 ;;
      *) fail 'unsupported restore argument' 64 ;;
    esac
  done
  [[ "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || fail 'run id must be a lowercase UUID' 64
  [[ "$RUN_KIND" == q12 || "$RUN_KIND" == scheduled ]] || fail 'restore run mode is required' 64
  require_absolute_directory 'immutable generation' "$GENERATION" 700
  [[ "${GENERATION##*/}" =~ ^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || fail 'generation basename is invalid'
  if [[ "$RUN_KIND" == q12 ]]; then
    require_absolute_file 'database barrier capability' "$CAPABILITY_FILE" '400'
    local expected_capability="/opt/megacampus/backups/q12/$RUN_ID/secrets/db-capability"
    [[ "$CAPABILITY_FILE" == "$expected_capability" ]] || fail 'database barrier capability path mismatch' 64
    CLEANUP_RESULT="/opt/megacampus/backups/q12/$RUN_ID/database-barrier-cleanup-result.json"
  else
    [[ -z "$CAPABILITY_FILE" ]] || fail 'scheduled restore must not receive a Q12 capability' 64
  fi
  [[ -x "$DOCKER" && -x "$PSQL" && -x "$PG_RESTORE" ]] || fail 'required Docker or PostgreSQL 17 command is unavailable'
  [[ -f "$MANIFEST_TOOL" && ! -L "$MANIFEST_TOOL" && -f "$ROLE_TOOL" && ! -L "$ROLE_TOOL" && -f "$CLEANUP_HELPER" && ! -L "$CLEANUP_HELPER" && -f "$TEMP_DIRECTORY_HELPER" && ! -L "$TEMP_DIRECTORY_HELPER" && -f "$PGTLE_ARCHIVE_SCANNER" && ! -L "$PGTLE_ARCHIVE_SCANNER" ]] || fail 'tracked restore helper is unavailable'
}

create_temp_root() {
  local candidate temp_input temp_output temp_pid
  coproc MC2_PRIVATE_TEMP {
    /usr/bin/python3 "$TEMP_DIRECTORY_HELPER" --parent /tmp --prefix "mc2-supabase-restore-$RUN_ID-"
  }
  temp_output=${MC2_PRIVATE_TEMP[0]}
  temp_input=${MC2_PRIVATE_TEMP[1]}
  temp_pid=$MC2_PRIVATE_TEMP_PID
  IFS= read -r candidate <&"$temp_output" || fail 'private temp directory creation failed'
  [[ "$candidate" =~ ^/tmp/mc2-supabase-restore-$RUN_ID-[A-Za-z0-9_-]+$ ]] || fail 'private temp directory path is invalid'
  TEMP_ROOT=$candidate
  printf 'adopt\n' >&"$temp_input"
  exec {temp_input}>&-
  wait "$temp_pid" || fail 'private temp directory adoption failed'
  require_absolute_directory 'private temp directory' "$TEMP_ROOT" 700
}

validate_generation() {
  /usr/bin/python3 - "$GENERATION" "${GENERATION##*/}" "$(/usr/bin/id -u)" "$(/usr/bin/id -g)" <<'PY'
import hashlib
import json
import pathlib
import stat
import sys

root = pathlib.Path(sys.argv[1])
expected_name = sys.argv[2]
uid, gid = int(sys.argv[3]), int(sys.argv[4])
if sorted(path.name for path in root.iterdir()) != ["checksums.json", "database.dump", "roles.sql", "source-manifest.json"]:
    raise SystemExit("generation does not contain exactly four files")
for path in root.iterdir():
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != uid or metadata.st_gid != gid or stat.S_IMODE(metadata.st_mode) != 0o600:
        raise SystemExit("generation file metadata mismatch")
manifest = json.loads((root / "checksums.json").read_text(encoding="utf-8"))
if manifest.get("schema") != "megacampus.supabase-backup-checksums/v1" or manifest.get("generation") != expected_name:
    raise SystemExit("checksum manifest identity mismatch")
if set(manifest.get("files", {})) != {"database.dump", "roles.sql", "source-manifest.json"}:
    raise SystemExit("checksum manifest exact set mismatch")
for name, expected in manifest["files"].items():
    data = (root / name).read_bytes()
    if expected != {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}:
        raise SystemExit("generation file checksum mismatch")
source = json.loads((root / "source-manifest.json").read_text(encoding="utf-8"))
if source.get("schema") != "megacampus.supabase-source-manifest/v1":
    raise SystemExit("source manifest schema mismatch")
PY
  "$PG_RESTORE" --list "$GENERATION/database.dump" >"$TEMP_ROOT/archive.toc" 2>"$TEMP_ROOT/pg-restore-list.stderr" || fail 'archive TOC validation failed'
  [[ ! -s "$TEMP_ROOT/pg-restore-list.stderr" ]] || fail 'archive TOC validation emitted stderr'
  /usr/bin/grep -Eq '^[[:space:]]*[0-9]+;' "$TEMP_ROOT/archive.toc" || fail 'archive TOC is empty'
  # Exact package/control pairs: basejump-supabase_test_helpers=0.0.6 and supabase-dbdev=0.0.5.
  "$PG_RESTORE" --file=- "$GENERATION/database.dump" 2>"$TEMP_ROOT/pg-restore-traversal.stderr" | \
    /usr/bin/python3 "$PGTLE_ARCHIVE_SCANNER" || fail 'archive full offline traversal or pgtle package validation failed'
  [[ ! -s "$TEMP_ROOT/pg-restore-traversal.stderr" ]] || fail 'archive full traversal emitted stderr'
}

verify_image_identity() {
  local raw="$TEMP_ROOT/restore-image-index.json"
  "$DOCKER" buildx imagetools inspect "$RESTORE_TAG" --raw >"$raw" 2>"$TEMP_ROOT/image-index.stderr" || fail 'restore image index lookup failed'
  [[ ! -s "$TEMP_ROOT/image-index.stderr" ]] || fail 'restore image index lookup emitted stderr'
  local index_hash
  index_hash=$(/usr/bin/sha256sum "$raw")
  index_hash="sha256:${index_hash%% *}"
  [[ "$index_hash" == "$RESTORE_INDEX" ]] || fail 'restore OCI index digest drift'
  "$DOCKER" pull --quiet --platform linux/amd64 "$RESTORE_IMAGE" >/dev/null 2>"$TEMP_ROOT/image-pull.stderr" || fail 'restore child image pull failed'
  [[ ! -s "$TEMP_ROOT/image-pull.stderr" ]] || fail 'restore image pull emitted stderr'
  [[ "$("$DOCKER" image inspect --format '{{.Os}}/{{.Architecture}}' "$RESTORE_IMAGE")" == 'linux/amd64' ]] || fail 'restore image platform drift'
}

random_secret() {
  /usr/bin/openssl rand -hex 32
}

write_secret() {
  local path=$1 value=$2
  ( umask 077; printf '%s\n' "$value" >"$path" )
  /usr/bin/chmod 600 -- "$path"
  /usr/bin/sync -f "$path"
}

write_pgpass() {
  local path=$1 port=$2 database=$3 user=$4 password=$5
  [[ "$password" =~ ^[0-9a-f]{64}$ ]] || fail 'synthetic password shape is invalid'
  ( umask 077; printf '127.0.0.1:%s:%s:%s:%s\n' "$port" "$database" "$user" "$password" >"$path" )
  /usr/bin/chmod 600 -- "$path"
}

write_service() {
  local path=$1 name=$2 port=$3 database=$4 user=$5 passfile=$6
  ( umask 077; printf '[%s]\nhost=127.0.0.1\nport=%s\ndbname=%s\nuser=%s\npassfile=%s\nsslmode=disable\n' \
    "$name" "$port" "$database" "$user" "$passfile" >"$path" )
  /usr/bin/chmod 600 -- "$path"
}

wait_ready() {
  # The image entrypoint first runs a socket-only temporary initialization
  # server, so an in-container unix-socket probe reports ready while the
  # published TCP port still refuses connections. Readiness is proven on the
  # kernel-assigned loopback port that the drill actually uses.
  local attempt port
  for attempt in $(/usr/bin/seq 1 120); do
    if port=$("$DOCKER" port "$CONTAINER_ID" 5432/tcp 2>/dev/null) \
      && [[ "$port" =~ ^127\.0\.0\.1:([0-9]+)$ ]] \
      && /usr/lib/postgresql/17/bin/pg_isready -q -h 127.0.0.1 -p "${BASH_REMATCH[1]}" -U postgres -d postgres; then
      return 0
    fi
    /usr/bin/sleep 1
  done
  fail 'isolated restore target did not become ready'
}

run_ts() {
  (cd "$PROJECT_ROOT" && TMPDIR=/tmp /usr/bin/pnpm exec tsx "$@")
}

run_service_psql() {
  local service_file=$1 service=$2
  shift 2
  PGSERVICEFILE="$service_file" PGSERVICE="$service" "$PSQL" -X --no-psqlrc --no-password --set ON_ERROR_STOP=on "$@"
}

prove_isolated_settings() {
  local service_file=$1 service=$2 settings
  settings=$(run_service_psql "$service_file" "$service" --tuples-only --no-align --command \
    "SELECT json_build_array(current_setting('default_transaction_read_only'), current_setting('cron.database_name'), current_setting('cron.launch_active_jobs'))") || \
    fail 'isolated setting proof query failed'
  [[ "$settings" == '["on","restore_test","off"]' ]] || fail 'isolated setting proof mismatch'
}

create_database_sql() {
  /usr/bin/python3 - "$GENERATION/source-manifest.json" "$TEMP_ROOT/create-database.sql" "$TEMP_ROOT/database-post.sql" <<'PY'
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
database = manifest["cutover_snapshot"]["database"]
if database["name"] != "postgres":
    raise SystemExit("source database identity mismatch")

def ident(value):
    if not isinstance(value, str) or "\x00" in value:
        raise SystemExit("invalid identifier")
    return '"' + value.replace('"', '""') + '"'

def literal(value):
    if not isinstance(value, str) or any(char in value for char in "\x00\n\r"):
        raise SystemExit("invalid literal")
    return "'" + value.replace("'", "''") + "'"

providers = {"c": "libc", "i": "icu", "b": "builtin"}
provider = providers.get(database["locale_provider"])
if provider is None:
    raise SystemExit("unsupported locale provider")
parts = [
    "CREATE DATABASE restore_test WITH TEMPLATE template0",
    f"OWNER {ident(database['owner'])}",
    f"ENCODING {literal(database['encoding'])}",
    f"LOCALE_PROVIDER {provider}",
    f"LC_COLLATE {literal(database['collate'])}",
    f"LC_CTYPE {literal(database['ctype'])}",
    # Explicitly naming even the default tablespace demands CREATE on it,
    # which the non-superuser creator lacks; omitting the clause lands the
    # database in pg_default identically.
    *([f"TABLESPACE {ident(database['tablespace'])}"] if database["tablespace"] != "pg_default" else []),
    f"CONNECTION LIMIT {int(database['connection_limit'])}",
    f"ALLOW_CONNECTIONS {'true' if database['allow_connections'] else 'false'}",
    f"IS_TEMPLATE {'true' if database['is_template'] else 'false'}",
]
for key, sql_name in (("provider_locale", "LOCALE"), ("builtin_locale", "BUILTIN_LOCALE"), ("icu_locale", "ICU_LOCALE"), ("icu_rules", "ICU_RULES"), ("collation_version", "COLLATION_VERSION")):
    if database.get(key) is not None:
        parts.append(f"{sql_name} {literal(database[key])}")
pathlib.Path(sys.argv[2]).write_text(" ".join(parts) + ";\n", encoding="utf-8")

post = ["REVOKE ALL ON DATABASE restore_test FROM PUBLIC;"]
for acl in database.get("acl", []):
    post.append(f"SET ROLE {ident(acl['grantor'])};")
    target = "PUBLIC" if acl["grantee"] == "PUBLIC" else ident(acl["grantee"])
    grant = f"GRANT {acl['privilege']} ON DATABASE restore_test TO {target}"
    if acl["grantable"]:
        grant += " WITH GRANT OPTION"
    post.extend([grant + ";", "RESET ROLE;"])
if database.get("comment") is not None:
    post.append(f"COMMENT ON DATABASE restore_test IS {literal(database['comment'])};")
for label in database.get("security_labels", []):
    post.append(f"SECURITY LABEL FOR {ident(label['provider'])} ON DATABASE restore_test IS {literal(label['label'])};")
for setting in manifest["cutover_snapshot"].get("role_settings", []):
    if setting.get("database") is not None:
        post.append(f"ALTER ROLE {ident(setting['role'])} IN DATABASE restore_test SET {ident(setting['name'])} TO {literal(setting['value'])};")
pathlib.Path(sys.argv[3]).write_text("\n".join(post) + "\n", encoding="utf-8")
PY
  /usr/bin/chmod 600 -- "$TEMP_ROOT/create-database.sql" "$TEMP_ROOT/database-post.sql"
}

verify_extensions_and_toc() {
  local service_file=$1 service=$2
  run_service_psql "$service_file" "$service" --tuples-only --no-align --command \
    "COPY (SELECT jsonb_object_agg(name, versions ORDER BY name) FROM (SELECT name, jsonb_agg(version ORDER BY version) versions FROM pg_available_extension_versions GROUP BY name) available) TO STDOUT" \
    >"$TEMP_ROOT/available-extensions.json" 2>"$TEMP_ROOT/extensions.stderr" || fail 'extension availability inventory failed'
  [[ ! -s "$TEMP_ROOT/extensions.stderr" ]] || fail 'extension inventory emitted stderr'
  /usr/bin/python3 - "$GENERATION/source-manifest.json" "$TEMP_ROOT/available-extensions.json" <<'PY'
import json, pathlib, sys
source = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["cutover_snapshot"]["extensions"]
available = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
# The two frozen pgTLE packages become available only when pg_restore has
# replayed their pgtle.* functions (which precede CREATE EXTENSION in the
# archive), so the fresh image cannot list them before the restore; the
# offline archive scan already pinned their control/default versions.
PGTLE_PACKAGES = {"basejump-supabase_test_helpers", "supabase-dbdev"}
for extension in source:
    if extension["name"] in PGTLE_PACKAGES:
        continue
    if extension["version"] not in available.get(extension["name"], []):
        raise SystemExit(f"extension version unavailable: {extension['name']}={extension['version']}")
for name, version in {"pg_net":"0.19.5","pgtap":"1.2.0","pg_cron":"1.6.4","pg_tle":"1.4.0"}.items():
    if version not in available.get(name, []):
        raise SystemExit(f"required image default unavailable: {name}={version}")
PY
}

verify_restored_pgtle_packages() {
  local service_file=$1 service=$2
  run_service_psql "$service_file" "$service" --tuples-only --no-align --command \
    "COPY (SELECT jsonb_build_object(
      'basejump-supabase_test_helpers',jsonb_build_object(
        'versions',(SELECT jsonb_agg(version ORDER BY version) FROM pgtle.available_extension_versions() WHERE name='basejump-supabase_test_helpers'),
        'control',pgtle.\"basejump-supabase_test_helpers.control\"()),
      'supabase-dbdev',jsonb_build_object(
        'versions',(SELECT jsonb_agg(version ORDER BY version) FROM pgtle.available_extension_versions() WHERE name='supabase-dbdev'),
        'control',pgtle.\"supabase-dbdev.control\"())
    )) TO STDOUT" >"$TEMP_ROOT/restored-pgtle.json" 2>"$TEMP_ROOT/restored-pgtle.stderr" || fail 'restored pgTLE package query failed'
  [[ ! -s "$TEMP_ROOT/restored-pgtle.stderr" ]] || fail 'restored pgTLE package query emitted stderr'
  /usr/bin/python3 - "$TEMP_ROOT/restored-pgtle.json" <<'PY'
import json, pathlib, re, sys
value = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = {"basejump-supabase_test_helpers":"0.0.6", "supabase-dbdev":"0.0.5"}
if set(value) != set(expected):
    raise SystemExit("restored pgTLE package set mismatch")
for name, version in expected.items():
    item = value[name]
    # pg_tle exposes the whole installed version chain; the frozen default
    # version must be present, and the exact chain is pinned by the
    # source-versus-restored catalog equality.
    if version not in (item.get("versions") or []):
        raise SystemExit(f"restored pgTLE available version mismatch: {name}")
    versions = re.findall(r"(?m)^\s*default_version\s*=\s*'([^']+)'\s*$", item.get("control", ""))
    if versions != [version]:
        raise SystemExit(f"restored pgTLE control version mismatch: {name}")
PY
}

generate_cleanup_sql() {
  /usr/bin/python3 - "$GENERATION/source-manifest.json" "$TEMP_ROOT/activation-cleanup.sql" <<'PY'
import json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
baseline, cutover = manifest["baseline"], manifest["cutover_snapshot"]

def ident(value):
    return '"' + str(value).replace('"', '""') + '"'

base_triggers = {json.dumps(item, sort_keys=True, separators=(",", ":")) for item in baseline.get("catalog", {}).get("triggers", [])}
extra_triggers = [item for item in cutover.get("catalog", {}).get("triggers", []) if json.dumps(item, sort_keys=True, separators=(",", ":")) not in base_triggers]
if any(not item["name"].startswith("q12_guard_") for item in extra_triggers):
    raise SystemExit("unexpected transient trigger")
sql = ["BEGIN;"]
for item in sorted(extra_triggers, key=lambda x: (x["schema"], x["table"], x["name"])):
    sql.append(f"DROP TRIGGER {ident(item['name'])} ON {ident(item['schema'])}.{ident(item['table'])};")

base_jobs = baseline.get("cron_jobs", [])
cutover_jobs = cutover.get("cron_jobs", [])
if len(base_jobs) != 8 or len(cutover_jobs) != 8:
    raise SystemExit("cron job cardinality drift")
base_by_id = {int(item["jobid"]): item for item in base_jobs}
cutover_by_id = {int(item["jobid"]): item for item in cutover_jobs}
if set(base_by_id) != set(cutover_by_id):
    raise SystemExit("cron job identity drift")
for jobid in sorted(base_by_id):
    before, after = base_by_id[jobid], cutover_by_id[jobid]
    before_shape = {key:value for key,value in before.items() if key != "active"}
    after_shape = {key:value for key,value in after.items() if key != "active"}
    if before_shape != after_shape or before["active"] is not True or after["active"] is not False:
        raise SystemExit("cron transient delta drift")
    sql.append(f"UPDATE cron.job SET active=true WHERE jobid={jobid} AND active=false;")
sql.append("DROP SCHEMA q12_guard CASCADE;")
baseline_settings = dict(baseline["database"].get("settings", []))
if "default_transaction_read_only" in baseline_settings:
    value = str(baseline_settings["default_transaction_read_only"]).replace("'", "''")
    sql.append(f"ALTER DATABASE restore_test SET default_transaction_read_only TO '{value}';")
else:
    sql.append("ALTER DATABASE restore_test RESET default_transaction_read_only;")
sql.extend(["COMMIT;", "SHOW transaction_read_only;"])
pathlib.Path(sys.argv[2]).write_text("\n".join(sql) + "\n", encoding="utf-8")
PY
  /usr/bin/chmod 600 -- "$TEMP_ROOT/activation-cleanup.sql"
}

main() {
  parse_arguments "$@"
  create_temp_root
  validate_generation
  verify_image_identity

  local initial_password restore_password cleanup_password
  initial_password=$(random_secret)
  restore_password=$(random_secret)
  cleanup_password=$(random_secret)
  write_secret "$TEMP_ROOT/initial-password" "$initial_password"
  write_secret "$TEMP_ROOT/restore-password" "$restore_password"
  write_secret "$TEMP_ROOT/cleanup-password" "$cleanup_password"

  # Exact isolation contract: masquerade-free dedicated network, 127.0.0.1::5432,
  # POSTGRES_PASSWORD_FILE=/run/secrets/initial-password, and one data mount.
  create_restore_docker_resources || fail 'isolated Docker resource creation failed'
  wait_ready

  local port
  port=$("$DOCKER" port "$CONTAINER_ID" 5432/tcp)
  [[ "$port" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail 'kernel-selected loopback port is invalid'
  port=${BASH_REMATCH[1]}
  "$DOCKER" inspect "$CONTAINER_ID" >"$TEMP_ROOT/container-inspect.json"
  /usr/bin/python3 - "$TEMP_ROOT/container-inspect.json" "$VOLUME_NAME" "$TEMP_ROOT/initial-password" "$port" "$CONTAINER_ID" <<'PY'
import json, pathlib, sys
item = json.loads(pathlib.Path(sys.argv[1]).read_text())[0]
if item["Id"] != sys.argv[5]:
    raise SystemExit("container identity mismatch")
mounts = item["Mounts"]
data = [m for m in mounts if m["Destination"] == "/var/lib/postgresql/data"]
secret = [m for m in mounts if m["Destination"] == "/run/secrets/initial-password"]
if len(data) != 1 or data[0]["Type"] != "volume" or data[0]["Name"] != sys.argv[2]:
    raise SystemExit("data volume mount mismatch")
if len(secret) != 1 or secret[0]["Type"] != "bind" or pathlib.Path(secret[0]["Source"]).resolve() != pathlib.Path(sys.argv[3]).resolve() or secret[0]["RW"]:
    raise SystemExit("password bind mount mismatch")
ports = item["NetworkSettings"]["Ports"]["5432/tcp"]
if ports != [{"HostIp":"127.0.0.1","HostPort":sys.argv[4]}]:
    raise SystemExit("loopback port mapping mismatch")
PY

  # supautils reserves the supabase_* platform roles, so the bootstrap must
  # run as the image superuser supabase_admin; the entrypoint assigns it the
  # same initial password.
  write_pgpass "$TEMP_ROOT/init.pgpass" "$port" postgres supabase_admin "$initial_password"
  write_service "$TEMP_ROOT/init.service" mc2_restore_init "$port" postgres supabase_admin "$TEMP_ROOT/init.pgpass"
  PGSERVICEFILE="$TEMP_ROOT/init.service" PGSERVICE=mc2_restore_init run_ts "$MANIFEST_TOOL" inventory --output "$TEMP_ROOT/image-roles.json"
  run_ts "$ROLE_TOOL" --manifest "$GENERATION/source-manifest.json" \
    --image-inventory "$TEMP_ROOT/image-roles.json" --target-database restore_test \
    --output "$TEMP_ROOT/role-bootstrap.sql"
  run_service_psql "$TEMP_ROOT/init.service" mc2_restore_init --file "$TEMP_ROOT/role-bootstrap.sql" >/dev/null
  PGSERVICEFILE="$TEMP_ROOT/init.service" PGSERVICE=mc2_restore_init run_ts "$MANIFEST_TOOL" inventory --output "$TEMP_ROOT/post-bootstrap-roles.json"
  run_ts "$MANIFEST_TOOL" verify-inventory --source "$GENERATION/source-manifest.json" \
    --inventory "$TEMP_ROOT/post-bootstrap-roles.json"

  local escaped_restore=${restore_password//\'/\'\'} escaped_cleanup=${cleanup_password//\'/\'\'}
  (umask 077; printf "ALTER ROLE supabase_admin PASSWORD '%s';\nALTER ROLE postgres PASSWORD '%s';\n" \
    "$escaped_restore" "$escaped_cleanup" >"$TEMP_ROOT/synthetic-passwords.sql")
  run_service_psql "$TEMP_ROOT/init.service" mc2_restore_init --file "$TEMP_ROOT/synthetic-passwords.sql" >/dev/null
  /usr/bin/rm -- "$TEMP_ROOT/synthetic-passwords.sql"

  write_pgpass "$TEMP_ROOT/cleanup.pgpass" "$port" postgres postgres "$cleanup_password"
  write_service "$TEMP_ROOT/cleanup-postgres.service" mc2_restore_cleanup_postgres "$port" postgres postgres "$TEMP_ROOT/cleanup.pgpass"
  create_database_sql
  run_service_psql "$TEMP_ROOT/cleanup-postgres.service" mc2_restore_cleanup_postgres --file "$TEMP_ROOT/create-database.sql" >/dev/null
  write_pgpass "$TEMP_ROOT/cleanup-restore-test.pgpass" "$port" restore_test postgres "$cleanup_password"
  write_service "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup "$port" restore_test postgres "$TEMP_ROOT/cleanup-restore-test.pgpass"
  run_service_psql "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup --file "$TEMP_ROOT/database-post.sql" >/dev/null
  verify_extensions_and_toc "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup

  # Required isolated cluster overrides: cron.database_name=restore_test and cron.launch_active_jobs=off.
  # One multi-statement command string runs as a single implicit transaction
  # and ALTER SYSTEM refuses transaction blocks, so each override is issued
  # as its own statement.
  run_service_psql "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup --command \
    "ALTER DATABASE restore_test SET default_transaction_read_only='on';" >/dev/null
  # ALTER SYSTEM requires superuser rights, which only supabase_admin holds.
  write_pgpass "$TEMP_ROOT/system-overrides.pgpass" "$port" postgres supabase_admin "$restore_password"
  write_service "$TEMP_ROOT/system-overrides.service" mc2_restore_system "$port" postgres supabase_admin "$TEMP_ROOT/system-overrides.pgpass"
  run_service_psql "$TEMP_ROOT/system-overrides.service" mc2_restore_system --command \
    "ALTER SYSTEM SET cron.database_name='restore_test';" >/dev/null
  run_service_psql "$TEMP_ROOT/system-overrides.service" mc2_restore_system --command \
    "ALTER SYSTEM SET cron.launch_active_jobs='off';" >/dev/null
  [[ "$("$DOCKER" inspect --format '{{.Id}}' "$CONTAINER_ID")" == "$CONTAINER_ID" ]] || fail 'isolated container identity drift'
  "$DOCKER" restart "$CONTAINER_ID" >/dev/null
  wait_ready
  # A restart reassigns the kernel-selected loopback port, so every service
  # file written before the restart must be regenerated against the new port.
  port=$("$DOCKER" port "$CONTAINER_ID" 5432/tcp)
  [[ "$port" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail 'kernel-selected loopback port is invalid after restart'
  port=${BASH_REMATCH[1]}
  write_pgpass "$TEMP_ROOT/cleanup.pgpass" "$port" postgres postgres "$cleanup_password"
  write_service "$TEMP_ROOT/cleanup-postgres.service" mc2_restore_cleanup_postgres "$port" postgres postgres "$TEMP_ROOT/cleanup.pgpass"
  write_pgpass "$TEMP_ROOT/cleanup-restore-test.pgpass" "$port" restore_test postgres "$cleanup_password"
  write_service "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup "$port" restore_test postgres "$TEMP_ROOT/cleanup-restore-test.pgpass"
  prove_isolated_settings "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup

  write_pgpass "$TEMP_ROOT/restore.pgpass" "$port" restore_test supabase_admin "$restore_password"
  write_service "$TEMP_ROOT/restore.service" mc2_restore_actor "$port" restore_test supabase_admin "$TEMP_ROOT/restore.pgpass"
  PGSERVICEFILE="$TEMP_ROOT/restore.service" PGSERVICE=mc2_restore_actor \
    PGOPTIONS='-c default_transaction_read_only=off' \
    "$PSQL" -X --no-psqlrc --no-password --tuples-only --no-align --set ON_ERROR_STOP=on \
    --command "SELECT session_user = current_user AND session_user = 'supabase_admin' AND current_setting('transaction_read_only') = 'off'" \
    | /usr/bin/grep -Fxq t || fail 'direct supabase_admin restore actor proof failed'

  PGSERVICEFILE="$TEMP_ROOT/restore.service" PGSERVICE=mc2_restore_actor \
    PGOPTIONS='-c default_transaction_read_only=off' \
    "$PG_RESTORE" --dbname=restore_test --username=supabase_admin --no-password \
    --exit-on-error --single-transaction "$GENERATION/database.dump" \
    >"$TEMP_ROOT/restore.stdout" 2>"$TEMP_ROOT/restore.stderr" || fail 'strict archive restore failed'
  [[ ! -s "$TEMP_ROOT/restore.stderr" ]] || fail 'strict archive restore emitted stderr'
  verify_restored_pgtle_packages "$TEMP_ROOT/restore.service" mc2_restore_actor

  PGSERVICEFILE="$TEMP_ROOT/restore.service" PGSERVICE=mc2_restore_actor \
    PGOPTIONS='-c default_transaction_read_only=off' \
    run_ts "$MANIFEST_TOOL" capture-target --output "$TEMP_ROOT/target-cutover.json"
  run_ts "$MANIFEST_TOOL" compare --source "$GENERATION/source-manifest.json" \
    --target "$TEMP_ROOT/target-cutover.json" --view cutover_snapshot --target-database restore_test

  if [[ "$RUN_KIND" == q12 ]]; then
    generate_cleanup_sql
    run_ts "$CLEANUP_HELPER" --service-file "$TEMP_ROOT/cleanup-restore-test.service" \
      --capability-file "$CAPABILITY_FILE" --cleanup-sql "$TEMP_ROOT/activation-cleanup.sql" \
      --run-id "$RUN_ID" --result "$CLEANUP_RESULT" || fail 'isolated activation cleanup failed'

    PGSERVICEFILE="$TEMP_ROOT/cleanup-restore-test.service" PGSERVICE=mc2_restore_cleanup \
      PGOPTIONS='-c default_transaction_read_only=off' \
      run_ts "$MANIFEST_TOOL" capture-target --output "$TEMP_ROOT/target-baseline.json"
  else
    /usr/bin/cp -- "$TEMP_ROOT/target-cutover.json" "$TEMP_ROOT/target-baseline.json"
  fi
  run_ts "$MANIFEST_TOOL" compare --source "$GENERATION/source-manifest.json" \
    --target "$TEMP_ROOT/target-baseline.json" --view baseline --target-database restore_test

  /usr/bin/python3 - "$GENERATION/source-manifest.json" "$TEMP_ROOT/target-baseline.json" <<'PY'
import json, pathlib, sys
source = json.loads(pathlib.Path(sys.argv[1]).read_text())["baseline"]["database"]["size_bytes"]
target = json.loads(pathlib.Path(sys.argv[2]).read_text())["baseline"]["database"]["size_bytes"]
ratio = target / source
if source <= 0 or not 0.25 <= ratio <= 2.0:
    raise SystemExit("restored database size ratio is outside 25%-200%")
print(f"restore size ratio={ratio:.6f}")
PY
  printf 'Supabase isolated restore passed: %s\n' "${GENERATION##*/}"
}

main "$@"
