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
# tsx is a devDependency of packages/course-gen-platform only and is NOT hoisted to
# the workspace root, so `pnpm exec tsx` from PROJECT_ROOT is unresolvable
# (ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL). The package's own pnpm-generated shim resolves
# tsx deterministically without workspace resolution; it is a /bin/sh script that execs
# `node` (found on PATH — /usr/bin/node on the server) with tsx's cli.mjs.
readonly TSX_SHIM="$PROJECT_ROOT/packages/course-gen-platform/node_modules/.bin/tsx"

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
# Opt-in Q12 plan persist seam. When MC2_Q12_RESTORE_PERSIST_HANDLE names a safe
# owner-only output path (q12 mode only), a successful restore writes an
# owner-only 0400 handle (container/network/volume/loopback port + restore_test
# connection) and hands the live resources to the caller instead of tearing them
# down; the caller then owns teardown. When the env is unset the drill is
# byte-for-byte its previous self. Invalid values fail closed.
PERSIST_HANDLE=''
PERSIST_ENGAGED=0

fail() {
  printf 'Supabase restore drill failed: %s\n' "$1" >&2
  exit "${2:-1}"
}

# mc2-rjy9k, the mc2-94mmf lesson applied here: every log this script captures lives under TEMP_ROOT,
# which `on_exit` reclaims unconditionally, so a failure that names only its own step throws the
# reason away. Inside a window that is the worst possible place to lose it — the writers are already
# stopped. Carry the tail of the captured log, with anything credential-shaped scrubbed, exactly as
# `backup-supabase.sh`'s `fail_command` does. Log paths only; no file content is ever echoed whole.
fail_with_log() {
  local message=$1 log=$2 tail_lines=${3:-40} detail=''
  if [[ -s "$log" ]]; then
    detail=$(/usr/bin/tail -n "$tail_lines" -- "$log" |
      /usr/bin/sed -E "s#postgres(ql)?://[^[:space:]\"']+#<redacted>#g; s#[0-9a-f]{64}#<redacted>#g")
  fi
  if [[ -n "$detail" ]]; then
    printf 'Supabase restore drill failed: %s\n--- %s (last %s lines, secrets scrubbed) ---\n%s\n' \
      "$message" "${log##*/}" "$tail_lines" "$detail" >&2
    exit 1
  fi
  fail "$message"
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
  # Persist seam (opt-in): once a successful restore has published its handle and
  # transferred ownership to the caller, the container/network/volume must survive
  # for the caller to migrate/capture. PERSIST_ENGAGED is set to 1 only on that
  # exact success path; on any failure it stays 0 and full cleanup runs, so the
  # seam can never become a silent leak. TEMP_ROOT is still reclaimed by
  # cleanup_resources regardless. Default (unset) behavior is unchanged.
  if [[ "${PERSIST_ENGAGED:-0}" == 1 ]]; then
    return 0
  fi
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
  # Fail closed with a named cause if the workspace tsx runner is missing, rather
  # than surfacing an opaque ERR_PNPM later mid-restore.
  [[ -x "$TSX_SHIM" ]] || fail "tsx runner is unavailable: $TSX_SHIM is missing or not executable (run pnpm install in the workspace)"
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
  # mc2-1cxna: the frozen pg.restore manifest env pins HOME=/root while this drill runs as the
  # deploy operator, and /root is 0700 root-owned. The docker CLI aborts loading
  # $HOME/.docker/config.json with EACCES and then never discovers its CLI plugins, so
  # `docker buildx imagetools inspect` degrades into "unknown flag: --raw" and C4 died on "restore
  # image index lookup failed" (window attempt #16, 2026-07-29) after the writers were stopped and
  # the backup had already committed. Proven on the host: the identical command succeeds and
  # returns the OCI image index under a HOME this process can stat. The adopted private temp root
  # is owned by this process, holds no .docker, and is removed with the rest of the drill state —
  # so the CLI falls back to its system plugin directory and its anonymous registry path, which is
  # what this public.ecr.aws lookup needs.
  export HOME="$TEMP_ROOT"
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
if source.get("schema") != "megacampus.supabase-source-manifest/v2":
    raise SystemExit("source manifest schema mismatch")
PY
  "$PG_RESTORE" --list "$GENERATION/database.dump" >"$TEMP_ROOT/archive.toc" 2>"$TEMP_ROOT/pg-restore-list.stderr" || fail 'archive TOC validation failed'
  [[ ! -s "$TEMP_ROOT/pg-restore-list.stderr" ]] || fail 'archive TOC validation emitted stderr'
  /usr/bin/grep -Eq '^[[:space:]]*[0-9]+;' "$TEMP_ROOT/archive.toc" || fail 'archive TOC is empty'
  # Exact package/control pairs: basejump-supabase_test_helpers=0.0.6 and supabase-dbdev=0.0.5.
  "$PG_RESTORE" --file=- "$GENERATION/database.dump" 2>"$TEMP_ROOT/pg-restore-traversal.stderr" | \
    /usr/bin/python3 "$PGTLE_ARCHIVE_SCANNER" || fail 'archive full offline traversal or pgtle package validation failed'
  [[ ! -s "$TEMP_ROOT/pg-restore-traversal.stderr" ]] || fail 'archive full traversal emitted stderr'
  build_restore_toc
}

# mc2-wl5vn. C3 dumps a database C1 has already guarded, so the archive carries the q12_guard
# schema, its function, and — fatally — the event trigger that binds them. Replaying that as the
# image superuser reverses the ownership pairing supautils demands: mc2-ipwyc deliberately keeps
# q12_guard owned by the managed non-superuser `postgres` so the barrier can disarm what it armed,
# and supautils refuses a superuser-owned event trigger whose function is not:
#   ERROR: Superuser owned event trigger must execute a superuser owned function
# Sixteen window attempts died before C4, so this is the first time a guarded dump has ever been
# restored. The remedy is to skip exactly that one archive entry, and to say so rather than let a
# quieter restore pass for a complete one.
#
# STATE THE NARROWING. The isolate is no longer a full replay of the archive: the guard's event
# trigger is present in the dump and is not executed against restore_test. What is NOT narrowed:
#  * archive completeness — the offline full traversal above still reads every entry, this one
#    included, and the pgTLE scanner still sees the entire stream;
#  * the cutover and baseline comparisons — q12-source-manifest.ts captures pg_trigger, never
#    pg_event_trigger, and q12-structural-catalog.sql already excludes this event trigger by name
#    (:975), so neither view ever observed the object being skipped;
#  * the activation cleanup — its DROP SCHEMA q12_guard CASCADE is what deletes this trigger on a
#    full replay anyway, moments later, so the end state of the isolate is unchanged.
#
# DERIVE, NEVER DECLARE (the mc2-lzft4 discipline). The entry is not named in this script. Each
# EVENT TRIGGER entry is extracted from the archive through a one-entry list and skipped only if
# the archive's own SQL says it executes a q12_guard function. An unguarded archive (scheduled
# mode) therefore excludes nothing, a guard renamed upstream is still caught, and a production
# event trigger that is not the guard's is still restored. An entry whose SQL cannot be parsed
# fails closed.
build_restore_toc() {
  /usr/bin/python3 - "$PG_RESTORE" "$GENERATION/database.dump" "$TEMP_ROOT/archive.toc" \
    "$TEMP_ROOT/restore.toc" "$TEMP_ROOT/restore-exclusions.json" "$TEMP_ROOT/one-entry.toc" <<'PY'
import json, pathlib, re, subprocess, sys

pg_restore, dump, toc_path, list_path, report_path, scratch_path = sys.argv[1:7]
toc = pathlib.Path(toc_path).read_text(encoding="utf-8").splitlines()
scratch = pathlib.Path(scratch_path)

GUARD_SCHEMA = "q12_guard"
# `pg_restore --list`: "<dumpId>; <tableoid> <oid> <DESC> <schema> <tag...> <owner>".
ENTRY = re.compile(r"^\s*(\d+);\s+\d+\s+\d+\s+([A-Z][A-Z ]*[A-Z])\s+(\S+)\s+(.*\S)\s*$")
EXECUTES = re.compile(
    r"CREATE\s+EVENT\s+TRIGGER\s+(?P<trigger>\"[^\"]+\"|[^\s(]+)\b"
    r".*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?P<schema>\"[^\"]+\"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.",
    re.IGNORECASE | re.DOTALL,
)


def unquote(token):
    return token[1:-1].replace('""', '"') if token.startswith('"') else token


def entry_sql(line):
    scratch.write_text(line + "\n", encoding="utf-8")
    scratch.chmod(0o600)
    done = subprocess.run(
        [pg_restore, "--use-list", str(scratch), "--file=-", dump],
        capture_output=True, text=True, check=False,
    )
    if done.returncode != 0 or done.stderr.strip():
        raise SystemExit("single-entry archive extraction failed")
    return done.stdout


excluded_rows, excluded_names = [], set()
for index, line in enumerate(toc):
    match = ENTRY.match(line)
    if match is None or match.group(2) != "EVENT TRIGGER":
        continue
    sql = EXECUTES.search(entry_sql(line))
    if sql is None:
        raise SystemExit("event trigger entry carries no parsable CREATE EVENT TRIGGER")
    schema = unquote(sql.group("schema"))
    if schema != GUARD_SCHEMA:
        continue
    name = unquote(sql.group("trigger"))
    excluded_names.add(name)
    excluded_rows.append({"line": index, "dump_id": match.group(1), "trigger": name,
                          "function_schema": schema, "reason": "supautils ownership pairing (mc2-wl5vn)"})

# A COMMENT or SECURITY LABEL on a skipped event trigger would fail on an object that is no longer
# there, so it follows the entry it describes. Nothing else may ride along.
for index, line in enumerate(toc):
    match = ENTRY.match(line)
    if match is None or match.group(2) not in ("COMMENT", "SECURITY LABEL"):
        continue
    tag = match.group(4)
    dependent = next((name for name in excluded_names
                      if re.match(r"^EVENT TRIGGER\s+(\"?)" + re.escape(name) + r"\1(\s|$)", tag)), None)
    if dependent is None:
        continue
    excluded_rows.append({"line": index, "dump_id": match.group(1), "trigger": dependent,
                          "function_schema": GUARD_SCHEMA, "reason": f"depends on skipped {dependent}"})

skipped = {row["line"] for row in excluded_rows}
restore_list = [(";" + line) if index in skipped else line for index, line in enumerate(toc)]
# Fail closed on the rewrite itself: same length, and the only difference anywhere is a leading
# semicolon on exactly the derived lines. A use-list that silently lost an entry would restore a
# quietly smaller database and every comparison downstream would still be measuring the archive.
if len(restore_list) != len(toc):
    raise SystemExit("restore list cardinality drift")
for index, (before, after) in enumerate(zip(toc, restore_list)):
    if index in skipped:
        if after != ";" + before:
            raise SystemExit("restore list exclusion is not a pure comment-out")
    elif after != before:
        raise SystemExit("restore list altered an entry it must not touch")

pathlib.Path(list_path).write_text("\n".join(restore_list) + "\n", encoding="utf-8")
pathlib.Path(report_path).write_text(
    json.dumps({"schema": "megacampus.q12.restore-exclusions/v1",
                "total_entries": len(toc), "excluded": excluded_rows}, indent=2, sort_keys=True) + "\n",
    encoding="utf-8")
scratch.unlink(missing_ok=True)
print(f"restore list built: {len(toc)} archive entries, {len(excluded_rows)} skipped"
      + ("" if not excluded_rows else ": " + ", ".join(sorted({row["trigger"] for row in excluded_rows}))))
PY
  /usr/bin/chmod 600 -- "$TEMP_ROOT/restore.toc" "$TEMP_ROOT/restore-exclusions.json"
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
  # Resolve tsx via the package shim, not pnpm workspace resolution; cwd stays
  # PROJECT_ROOT so the invoked scripts see their expected relative paths.
  (cd "$PROJECT_ROOT" && TMPDIR=/tmp "$TSX_SHIM" "$@")
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
  # The json type renders array elements with a space after each comma.
  [[ "$settings" == '["on", "restore_test", "off"]' ]] || \
    fail "isolated setting proof mismatch: observed $settings"
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
# pg_dump never carries ALTER DATABASE SET values, so the captured database
# settings are replayed here; search_path is a list-input GUC and stays
# verbatim while scalars keep exact literal quoting.
for name, value in database.get("settings", []):
    rendered = value if name == "search_path" else literal(value)
    post.append(f"ALTER DATABASE restore_test SET {ident(name)} TO {rendered};")
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
def decode_copy_text(text):
    # COPY TO STDOUT text format escapes backslash and control characters.
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            mapping = {"\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
            nxt = text[i + 1] if i + 1 < len(text) else None
            if nxt not in mapping:
                raise SystemExit("unsupported COPY escape in query output")
            out.append(mapping[nxt])
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)

source = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["cutover_snapshot"]["extensions"]
available = json.loads(decode_copy_text(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").strip()))
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
def decode_copy_text(text):
    # COPY TO STDOUT text format escapes backslash and control characters.
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            mapping = {"\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
            nxt = text[i + 1] if i + 1 < len(text) else None
            if nxt not in mapping:
                raise SystemExit("unsupported COPY escape in query output")
            out.append(mapping[nxt])
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)

value = json.loads(decode_copy_text(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").strip()))
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

validate_persist_handle() {
  PERSIST_HANDLE="${MC2_Q12_RESTORE_PERSIST_HANDLE:-}"
  [[ -n "$PERSIST_HANDLE" ]] || return 0
  # Q12 mode: the live-cutover activation path. Scheduled mode: the Q12 plan's
  # read-only PRE-cutover restore, which has no q12_guard and therefore must not run
  # the activation cleanup; it still needs the live isolate handed back to capture
  # and migrate. Both publish the same handle over the isolated loopback resources.
  [[ "$RUN_KIND" == q12 || "$RUN_KIND" == scheduled ]] ||
    fail 'persist seam requires q12 or scheduled mode' 64
  [[ "$PERSIST_HANDLE" == /* && "$PERSIST_HANDLE" != *$'\n'* && "$PERSIST_HANDLE" != *$'\r'* ]] ||
    fail 'persist handle must be an absolute control-free path' 64
  local parent="${PERSIST_HANDLE%/*}"
  [[ -n "$parent" ]] || parent='/'
  require_absolute_directory 'persist handle parent' "$parent" '700'
  [[ ! -e "$PERSIST_HANDLE" || ( -f "$PERSIST_HANDLE" && ! -L "$PERSIST_HANDLE" ) ]] ||
    fail 'persist handle path is not a plain non-symlink file' 64
  [[ ! -e "$PERSIST_HANDLE" ]] || /usr/bin/rm -f -- "$PERSIST_HANDLE"
}

write_persist_handle() {
  local port=$1 password=$2
  /usr/bin/python3 - "$PERSIST_HANDLE" "$CONTAINER_ID" "$NETWORK_ID" "$VOLUME_NAME" "$port" "$password" "$RUN_ID" <<'PY'
import json, os, sys
path, container, network, volume, port, password, run_id = sys.argv[1:8]
handle = {
    "schema_version": "megacampus.q12.restore-persist-handle/v1",
    "run_id": run_id,
    "container": container,
    "network": network,
    "volume": volume,
    "host": "127.0.0.1",
    "port": int(port),
    "database": "restore_test",
    "user": "postgres",
    "password": password,
}
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
try:
    os.write(descriptor, (json.dumps(handle, sort_keys=True) + "\n").encode("utf-8"))
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
}

main() {
  parse_arguments "$@"
  validate_persist_handle
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
  # Custom-GUC database settings (app.*) require superuser to set, so the
  # database-post replay runs as supabase_admin.
  write_pgpass "$TEMP_ROOT/database-post.pgpass" "$port" restore_test supabase_admin "$restore_password"
  write_service "$TEMP_ROOT/database-post.service" mc2_restore_database_post "$port" restore_test supabase_admin "$TEMP_ROOT/database-post.pgpass"
  run_service_psql "$TEMP_ROOT/database-post.service" mc2_restore_database_post --file "$TEMP_ROOT/database-post.sql" >/dev/null
  verify_extensions_and_toc "$TEMP_ROOT/cleanup-restore-test.service" mc2_restore_cleanup

  # Required isolated cluster overrides: cron.database_name=restore_test and cron.launch_active_jobs=off.
  # One multi-statement command string runs as a single implicit transaction
  # and ALTER SYSTEM refuses transaction blocks, so each override is issued
  # as its own statement.
  # mc2-rjy9k: this statement must carry the read-only override the rest of this script already
  # carries (:822, :828, :836, :848). `database-post.sql` above replays the SOURCE's captured
  # `ALTER DATABASE … SET` values, and a Q12 generation is dumped at C3 — AFTER C1's barrier has set
  # `default_transaction_read_only = on` on production. The replay therefore hands restore_test that
  # very default, every session opened afterwards inherits it, and this ALTER DATABASE dies with
  #   ERROR: cannot execute ALTER DATABASE in a read-only transaction
  # The value being set is the same one already in force, so the statement is a no-op in that case —
  # but a fail-closed no-op still fails the window. Found 2026-07-29 by the isolate dry run, against
  # attempt #16's own generation, with no writer stopped and no run-id burnt; the window had never
  # reached this line because C4 died earlier on the buildx lookup. This connection is a direct
  # loopback one to the isolate, not the pooled DSN, so the startup option is genuinely delivered.
  # Spelled out rather than routed through run_service_psql: in bash an assignment preceding a
  # FUNCTION call stays in effect after the call returns, which would leak the override into every
  # later statement in this script — including the ones that must observe the read-only default.
  PGSERVICEFILE="$TEMP_ROOT/cleanup-restore-test.service" PGSERVICE=mc2_restore_cleanup \
    PGOPTIONS='-c default_transaction_read_only=off' \
    "$PSQL" -X --no-psqlrc --no-password --set ON_ERROR_STOP=on --command \
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
    --exit-on-error --single-transaction --use-list "$TEMP_ROOT/restore.toc" \
    "$GENERATION/database.dump" \
    >"$TEMP_ROOT/restore.stdout" 2>"$TEMP_ROOT/restore.stderr" ||
    fail_with_log 'strict archive restore failed' "$TEMP_ROOT/restore.stderr"
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
  if [[ -n "$PERSIST_HANDLE" ]]; then
    write_persist_handle "$port" "$cleanup_password" || fail 'failed to publish persist handle'
    # Ownership of the live container/network/volume transfers to the caller only
    # now, after a fully successful restore and durable handle publication.
    PERSIST_ENGAGED=1
  fi
  # The exclusion is derived far above, before any container exists; restate it beside the verdict
  # so a run log never reads as a full replay when it was not one (mc2-wl5vn).
  local skipped
  skipped=$(/usr/bin/python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["excluded"]))' \
    "$TEMP_ROOT/restore-exclusions.json")
  printf 'Supabase isolated restore passed: %s (archive entries skipped: %s)\n' \
    "${GENERATION##*/}" "$skipped"
}

main "$@"
