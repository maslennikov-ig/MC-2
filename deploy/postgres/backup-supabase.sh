#!/usr/bin/bash
set -Eeuo pipefail
export LC_ALL=C

umask 077

readonly TEST_MODE_TOKEN='mc2-synthetic-local-backup-test-only'
readonly DEFAULT_URL_FILE='/opt/megacampus/secrets/supabase_db_url'
readonly DEFAULT_CA_FILE='/opt/megacampus/secrets/prod-ca-2021.crt'
readonly DEFAULT_BACKUP_DIR='/opt/megacampus/backups/supabase'
readonly MINIMUM_ARCHIVE_BYTES=1024
readonly REQUIRED_PG_MAJOR='17'
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly RENAME_NOREPLACE_HELPER="$SCRIPT_DIR/rename-noreplace.py"
readonly TEMP_CREATOR_HELPER="$SCRIPT_DIR/create-private-temp-dir.py"
readonly NOFOLLOW_OPEN_HELPER="$SCRIPT_DIR/open-nofollow.py"
readonly APPROVED_DATABASE_HOST='aws-1-us-east-2.pooler.supabase.com'
readonly APPROVED_DATABASE_USER='postgres.diqooqbuchsliypgwksu'
readonly REQUIRED_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'

URL_FILE="${SUPABASE_BACKUP_URL_FILE:-$DEFAULT_URL_FILE}"
CA_FILE="${SUPABASE_BACKUP_CA_FILE:-$DEFAULT_CA_FILE}"
BACKUP_DIR="${SUPABASE_BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
RETENTION_DAYS="${SUPABASE_BACKUP_RETENTION_DAYS:-14}"
PG_DUMP='/usr/lib/postgresql/17/bin/pg_dump'
PG_DUMPALL='/usr/lib/postgresql/17/bin/pg_dumpall'
PG_RESTORE='/usr/lib/postgresql/17/bin/pg_restore'
PSQL='/usr/lib/postgresql/17/bin/psql'
MANIFEST_GENERATOR="$SCRIPT_DIR/q12-source-manifest.ts"
TEST_MODE_ACTIVE=0
TRUST_BOUNDARY='/'
PRE_DUMP_HOOK=''
POST_GENERATION_HOOK=''
TEST_FINAL_NAME=''
RETENTION_NOW_EPOCH=''

TEMP_GENERATION=''
TEMP_POINTER=''
generation_committed=0
URL_FD=''
CA_FD=''
URL_OPEN_IDENTITY=''
CA_OPEN_IDENTITY=''
BASELINE_FD=''
BASELINE_OPEN_IDENTITY=''
EXPECTED_CATALOG_FD=''
EXPECTED_CATALOG_OPEN_IDENTITY=''
SNAPSHOT_COORDINATOR_PID=''
SNAPSHOT_COORDINATOR_IN=''
SNAPSHOT_COORDINATOR_OUT=''

fail() {
  local message=$1
  local status=${2:-1}
  printf 'Supabase backup failed: %s\n' "$message" >&2
  exit "$status"
}

cleanup_temp() {
  if [[ -n "$TEMP_POINTER" ]]; then
    case "$TEMP_POINTER" in
      "$BACKUP_DIR"/latest.json.*.tmp.*)
        [[ ! -L "$TEMP_POINTER" ]] && /usr/bin/rm -f -- "$TEMP_POINTER"
        ;;
    esac
  fi
  if [[ $generation_committed -eq 0 && -n "$TEMP_GENERATION" ]]; then
    case "$TEMP_GENERATION" in
      "$BACKUP_DIR"/.generation.*)
        [[ -d "$TEMP_GENERATION" && ! -L "$TEMP_GENERATION" ]] && \
          /usr/bin/rm -rf --one-file-system -- "$TEMP_GENERATION"
        ;;
    esac
  fi
  if [[ -n "$SNAPSHOT_COORDINATOR_IN" ]]; then
    printf 'ROLLBACK;\n\\q\n' >&"$SNAPSHOT_COORDINATOR_IN" 2>/dev/null || true
  fi
  if [[ -n "$SNAPSHOT_COORDINATOR_PID" ]]; then
    wait "$SNAPSHOT_COORDINATOR_PID" 2>/dev/null || true
  fi
}

trap cleanup_temp EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

require_absolute_path() {
  local label=$1
  local path=$2
  [[ "$path" == /* ]] || fail "$label must be an absolute path"
  [[ "$path" != *$'\n'* && "$path" != *$'\r'* ]] || fail "$label contains a control character"
}

file_identity() {
  # GNU/uutils stat is lstat-by-default; intentionally do not add -L/--dereference.
  /usr/bin/stat -c '%d:%i:%u:%g:%a:%F' -- "$1"
}

fd_identity() {
  /usr/bin/stat -L -c '%d:%i:%u:%g:%a:%F' -- "/proc/self/fd/$1"
}

require_owned_directory() {
  local label=$1
  local path=$2
  require_absolute_path "$label" "$path"
  [[ -d "$path" && ! -L "$path" ]] || fail "$label must be a regular non-symlink directory"
  local expected="$(/usr/bin/id -u):$(/usr/bin/id -g):700"
  local identity
  identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$path")
  [[ "$identity" == "$expected" ]] || fail "$label must be owned by the current user and mode 0700"
}

require_test_command() {
  local label=$1
  local path=$2
  local root=$3
  require_absolute_path "$label" "$path"
  case "$path" in
    "$root"/bin/*) ;;
    *) fail "$label test override must be below the protected test root" ;;
  esac
  [[ "$path" != *'/../'* && "$path" != */.. ]] || fail "$label test override contains traversal"
  [[ -f "$path" && ! -L "$path" ]] || fail "$label test override must be a regular non-symlink file"
  local expected="$(/usr/bin/id -u):$(/usr/bin/id -g):700"
  local identity
  identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$path")
  [[ "$identity" == "$expected" ]] || fail "$label test override must be owned by the current user and mode 0700"
}

read_postgresql_command_major() {
  local label=$1
  local path=$2
  local -n major_result=$3
  local version_output version_value

  if ! version_output=$("$path" --version 2>/dev/null); then
    fail "$label --version failed"
  fi
  [[ "$version_output" != *$'\n'* && "$version_output" != *$'\r'* ]] || fail "$label version output is invalid"
  local prefix="$label (PostgreSQL) "
  [[ "$version_output" == "$prefix"* ]] || fail "$label version output is invalid"
  version_value=${version_output#"$prefix"}
  [[ "$version_value" =~ ^([0-9]+)(\.[0-9]+)*([[:blank:]].*)?$ ]] || fail "$label version output is invalid"
  major_result=${BASH_REMATCH[1]}
}

configure_commands() {
  local test_mode=${MC2_SUPABASE_BACKUP_TEST_MODE:-}
  if [[ -z "$test_mode" ]]; then
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_ROOT:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_DUMP:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_DUMPALL:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_RESTORE:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_MANIFEST_GENERATOR:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK:-}" ]] || fail 'test hook requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_POST_GENERATION_HOOK:-}" ]] || fail 'test hook requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_FINAL_NAME:-}" ]] || fail 'test final name requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_BASELINE_FILE:-}" ]] || fail 'test baseline override requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_EXPECTED_CATALOG_FILE:-}" ]] || fail 'test expected catalog override requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_NOW_EPOCH:-}" ]] || fail 'test retention clock requires the exact protected test mode'
  else
    [[ "$test_mode" == "$TEST_MODE_TOKEN" ]] || fail 'invalid protected test mode token'
    TEST_MODE_ACTIVE=1
    local test_root=${MC2_SUPABASE_BACKUP_TEST_ROOT:-}
    [[ "$test_root" == /tmp/mc2-supabase-backup-* ]] || fail 'protected test root must be an absolute mc2 temporary directory'
    require_owned_directory 'protected test root' "$test_root"
    TRUST_BOUNDARY=$test_root
    for path in "$URL_FILE" "$CA_FILE"; do
      case "$path" in
        "$TRUST_BOUNDARY"/*) ;;
        *) fail 'protected test credential inputs must be below the protected test root' ;;
      esac
    done

    PG_DUMP=${MC2_SUPABASE_BACKUP_TEST_PG_DUMP:-}
    PG_RESTORE=${MC2_SUPABASE_BACKUP_TEST_PG_RESTORE:-}
    PG_DUMPALL=${MC2_SUPABASE_BACKUP_TEST_PG_DUMPALL:-}
    MANIFEST_GENERATOR=${MC2_SUPABASE_BACKUP_TEST_MANIFEST_GENERATOR:-}
    require_test_command 'pg_dump' "$PG_DUMP" "$test_root"
    require_test_command 'pg_restore' "$PG_RESTORE" "$test_root"
    require_test_command 'pg_dumpall' "$PG_DUMPALL" "$test_root"
    require_test_command 'manifest generator' "$MANIFEST_GENERATOR" "$test_root"

    PRE_DUMP_HOOK=${MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK:-}
    if [[ -n "$PRE_DUMP_HOOK" ]]; then
      require_test_command 'pre-dump hook' "$PRE_DUMP_HOOK" "$test_root"
    fi
    POST_GENERATION_HOOK=${MC2_SUPABASE_BACKUP_TEST_POST_GENERATION_HOOK:-}
    if [[ -n "$POST_GENERATION_HOOK" ]]; then
      require_test_command 'post-generation hook' "$POST_GENERATION_HOOK" "$test_root"
    fi
    TEST_FINAL_NAME=${MC2_SUPABASE_BACKUP_TEST_FINAL_NAME:-}
    if [[ -n "$TEST_FINAL_NAME" ]]; then
      [[ "$TEST_FINAL_NAME" =~ ^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || fail 'protected test final name is invalid'
    fi
    RETENTION_NOW_EPOCH=${MC2_SUPABASE_BACKUP_TEST_NOW_EPOCH:-}
    if [[ -n "$RETENTION_NOW_EPOCH" ]]; then
      [[ "$RETENTION_NOW_EPOCH" =~ ^[1-9][0-9]{0,10}$ ]] || fail 'protected test retention epoch is invalid'
    fi
  fi

  [[ -x "$PG_DUMP" ]] || fail 'absolute pg_dump command is unavailable'
  [[ -x "$PG_RESTORE" ]] || fail 'absolute pg_restore command is unavailable'
  [[ -x "$PG_DUMPALL" ]] || fail 'absolute pg_dumpall command is unavailable'
  if [[ $TEST_MODE_ACTIVE -eq 0 ]]; then
    [[ -x '/usr/bin/pnpm' ]] || fail 'absolute pnpm command is unavailable'
    [[ -f "$MANIFEST_GENERATOR" && ! -L "$MANIFEST_GENERATOR" ]] || fail 'source manifest generator is unavailable'
  fi
  [[ -f "$RENAME_NOREPLACE_HELPER" && ! -L "$RENAME_NOREPLACE_HELPER" ]] || fail 'RENAME_NOREPLACE helper is unavailable'
  [[ -f "$TEMP_CREATOR_HELPER" && ! -L "$TEMP_CREATOR_HELPER" ]] || fail 'private temp helper is unavailable'
  [[ -f "$NOFOLLOW_OPEN_HELPER" && ! -L "$NOFOLLOW_OPEN_HELPER" ]] || fail 'no-follow open helper is unavailable'

  local pg_dump_major pg_restore_major pg_dumpall_major
  read_postgresql_command_major 'pg_dump' "$PG_DUMP" pg_dump_major
  read_postgresql_command_major 'pg_restore' "$PG_RESTORE" pg_restore_major
  read_postgresql_command_major 'pg_dumpall' "$PG_DUMPALL" pg_dumpall_major
  [[ "$pg_dump_major" == "$pg_restore_major" ]] || \
    fail 'pg_dump and pg_restore must report the same PostgreSQL major'
  [[ "$pg_dump_major" == "$REQUIRED_PG_MAJOR" ]] || \
    fail "pg_dump must report required PostgreSQL major $REQUIRED_PG_MAJOR"
  [[ "$pg_restore_major" == "$REQUIRED_PG_MAJOR" ]] || \
    fail "pg_restore must report required PostgreSQL major $REQUIRED_PG_MAJOR"
  [[ "$pg_dump_major" == "$pg_dumpall_major" ]] || \
    fail 'pg_dump and pg_dumpall must report the same PostgreSQL major'
  [[ "$pg_dumpall_major" == "$REQUIRED_PG_MAJOR" ]] || \
    fail "pg_dumpall must report required PostgreSQL major $REQUIRED_PG_MAJOR"
}

require_safe_parent_chain() {
  local label=$1
  local path=$2
  local current=${path%/*}
  [[ -n "$current" ]] || current='/'
  local canonical identity uid mode mode_value

  while true; do
    [[ -d "$current" && ! -L "$current" ]] || fail "$label parent directory must be a non-symlink directory"
    canonical=$(/usr/bin/readlink -f -- "$current") || fail "$label parent directory cannot be canonicalized"
    [[ "$canonical" == "$current" ]] || fail "$label parent directory has symlink/canonical drift"
    identity=$(/usr/bin/stat -c '%u:%a' -- "$current")
    IFS=: read -r uid mode <<< "$identity"
    [[ "$uid" == '0' || "$uid" == "$(/usr/bin/id -u)" ]] || fail "$label parent directory must be owned by root or the current user"
    mode_value=$((8#$mode))
    (( (mode_value & 8#022) == 0 )) || fail "$label parent directory must not be group/world writable"

    [[ "$current" == "$TRUST_BOUNDARY" ]] && break
    [[ "$current" != '/' ]] || fail "$label path is outside the trusted directory boundary"
    current=${current%/*}
    [[ -n "$current" ]] || current='/'
  done
}

validate_input_path() {
  local label=$1
  local path=$2
  local allowed_modes=$3
  local mode_error=$4
  require_absolute_path "$label file" "$path"
  require_safe_parent_chain "$label" "$path"
  [[ -f "$path" && ! -L "$path" ]] || fail "$label file must be a regular non-symlink file"
  local canonical
  canonical=$(/usr/bin/readlink -f -- "$path") || fail "$label file cannot be canonicalized"
  [[ "$canonical" == "$path" ]] || fail "$label file has symlink/canonical drift"

  local identity device inode uid gid mode kind
  identity=$(file_identity "$path")
  IFS=: read -r device inode uid gid mode kind <<< "$identity"
  [[ "$kind" == 'regular file' ]] || fail "$label file must be a regular non-symlink file"
  [[ "$uid" == "$(/usr/bin/id -u)" && "$gid" == "$(/usr/bin/id -g)" ]] || fail "$label file must be owned by the current user"
  case ":$allowed_modes:" in
    *":$mode:"*) ;;
    *) fail "$mode_error" ;;
  esac
}

open_validated_input() {
  local label=$1
  local path=$2
  local allowed_modes=$3
  local mode_error=$4
  local -n fd_result=$5
  local -n identity_result=$6
  validate_input_path "$label" "$path" "$allowed_modes" "$mode_error"

  local opened_fd helper_path helper_identity
  coproc MC2_NOFOLLOW_OPEN { /usr/bin/python3 "$NOFOLLOW_OPEN_HELPER" --path "$path"; }
  IFS= read -r helper_path <&"${MC2_NOFOLLOW_OPEN[0]}" || fail "$label file could not be opened without following links"
  IFS= read -r helper_identity <&"${MC2_NOFOLLOW_OPEN[0]}" || fail "$label helper identity was unavailable"
  exec {opened_fd}<"$helper_path" || fail "$label helper descriptor could not be adopted"
  printf 'adopt\n' >&"${MC2_NOFOLLOW_OPEN[1]}"
  wait "$MC2_NOFOLLOW_OPEN_PID" || fail "$label no-follow open helper failed"
  local opened_identity current_identity
  opened_identity=$(fd_identity "$opened_fd")
  current_identity=$(file_identity "$path")
  if [[ "${opened_identity%:regular file}" != "$helper_identity" || "$opened_identity" != "$current_identity" || "$current_identity" != *':regular file' ]]; then
    exec {opened_fd}<&-
    fail "$label file path identity changed during open"
  fi
  fd_result=$opened_fd
  identity_result=$opened_identity
}

recheck_open_input() {
  local label=$1
  local path=$2
  local allowed_modes=$3
  local mode_error=$4
  local fd=$5
  local opened_identity=$6
  validate_input_path "$label" "$path" "$allowed_modes" "$mode_error"
  local current_identity current_fd_identity
  current_identity=$(file_identity "$path")
  current_fd_identity=$(fd_identity "$fd")
  [[ "$current_identity" == "$opened_identity" && "$current_fd_identity" == "$opened_identity" ]] || fail "$label file path identity changed after open"
}

validate_backup_directory() {
  require_absolute_path 'backup directory' "$BACKUP_DIR"
  require_safe_parent_chain 'backup directory' "$BACKUP_DIR"
  [[ -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" ]] || fail 'backup directory must be a regular non-symlink directory'
  local canonical
  canonical=$(/usr/bin/readlink -f -- "$BACKUP_DIR") || fail 'backup directory cannot be canonicalized'
  [[ "$canonical" == "$BACKUP_DIR" ]] || fail 'backup directory has symlink/canonical drift'

  local identity device inode uid gid mode kind
  identity=$(file_identity "$BACKUP_DIR")
  IFS=: read -r device inode uid gid mode kind <<< "$identity"
  [[ "$kind" == 'directory' ]] || fail 'backup directory must be a regular non-symlink directory'
  [[ "$uid" == "$(/usr/bin/id -u)" && "$gid" == "$(/usr/bin/id -g)" && "$mode" == '700' ]] || fail 'backup directory must be owned by the current user and mode 0700'
}

open_locked_backup_directory() {
  local -n fd_result=$1
  local -n identity_result=$2
  validate_backup_directory
  local opened_fd
  exec {opened_fd}<"$BACKUP_DIR" || fail 'backup directory could not be opened'
  local opened_identity current_identity
  opened_identity=$(fd_identity "$opened_fd")
  current_identity=$(file_identity "$BACKUP_DIR")
  if [[ "$opened_identity" != "$current_identity" ]]; then
    exec {opened_fd}<&-
    fail 'backup directory path identity changed during lock open'
  fi
  fd_result=$opened_fd
  identity_result=$opened_identity
}

recheck_locked_backup_directory() {
  local fd=$1
  local opened_identity=$2
  validate_backup_directory
  local current_identity current_fd_identity
  current_identity=$(file_identity "$BACKUP_DIR")
  current_fd_identity=$(fd_identity "$fd")
  [[ "$current_identity" == "$opened_identity" && "$current_fd_identity" == "$opened_identity" ]] || fail 'backup directory path identity changed after lock'
}

cleanup_stale_temporaries() {
  local candidate name identity removed=0
  shopt -s nullglob
  for candidate in "$BACKUP_DIR"/.supabase-backup.tmp.*; do
    name=${candidate##*/}
    [[ "$name" =~ ^\.supabase-backup\.tmp\.(archive|list|stderr)\.[A-Za-z0-9]{6}$ ]] || continue
    [[ -f "$candidate" && ! -L "$candidate" ]] || continue
    identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || continue
    /usr/bin/rm -- "$candidate"
    removed=1
  done
  for candidate in "$BACKUP_DIR"/.generation.*; do
    name=${candidate##*/}
    [[ "$name" =~ ^\.generation\.[0-9a-f-]{36}\.[A-Za-z0-9]{6}$ ]] || continue
    [[ -d "$candidate" && ! -L "$candidate" ]] || continue
    identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):700" ]] || continue
    /usr/bin/rm -rf --one-file-system -- "$candidate"
    removed=1
  done
  for candidate in "$BACKUP_DIR"/latest.json.*.tmp.*; do
    name=${candidate##*/}
    [[ "$name" =~ ^latest\.json\.[0-9a-f-]{36}\.tmp\.[A-Za-z0-9]{6}$ ]] || continue
    [[ -f "$candidate" && ! -L "$candidate" ]] || continue
    identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || continue
    /usr/bin/rm -- "$candidate"
    removed=1
  done
  shopt -u nullglob
  if [[ $removed -eq 1 ]]; then
    /usr/bin/sync -d "$BACKUP_DIR"
  fi
}

read_database_url() {
  local fd=$1
  local ca_fd_path=$2
  local -n original_result=$3
  local -n effective_result=$4
  local -a lines=()
  mapfile -t lines <&"$fd"
  [[ ${#lines[@]} -eq 1 && -n "${lines[0]}" ]] || fail 'URL credential file must contain exactly one non-empty line'
  original_result=${lines[0]}
  [[ "$original_result" == postgresql://* ]] || fail 'URL credential must use exact postgresql:// protocol'
  [[ ! "$original_result" =~ [[:space:]] ]] || fail 'URL credential contains whitespace'

  if ! /usr/bin/python3 - "$TEST_MODE_ACTIVE" "$CA_FILE" "$APPROVED_DATABASE_HOST" "$APPROVED_DATABASE_USER" 3<<<"$original_result" <<'PY'
import os
import sys
from urllib.parse import unquote, urlsplit

test_mode, ca_path, approved_host, approved_user = sys.argv[1:]
with os.fdopen(3, encoding="utf-8") as credential:
    value = credential.readline().rstrip("\n")
try:
    parsed = urlsplit(value)
    port = parsed.port
except ValueError:
    raise SystemExit(1)
if parsed.scheme != "postgresql" or parsed.fragment or parsed.path != "/postgres":
    raise SystemExit(1)
if not parsed.password or unquote(parsed.username or "") == "":
    raise SystemExit(1)
if test_mode == "0" and (port != 5432 or parsed.hostname != approved_host or unquote(parsed.username or "") != approved_user):
    raise SystemExit(1)
PY
  then
    fail 'URL credential source identity or exact query contract mismatch'
  fi

  local base query parameter joined='' separator=''
  [[ "$original_result" == *\?* ]] || fail 'URL must contain exact sslmode=verify-full'
  base=${original_result%%\?*}
  query=${original_result#*\?}
  local sslmode_count=0 root_count=0
  local -a parameters=()
  IFS='&' read -r -a parameters <<< "$query"
  for parameter in "${parameters[@]}"; do
    if [[ "$parameter" == sslmode=* ]]; then
      [[ "$parameter" == 'sslmode=verify-full' ]] || fail 'URL must contain exact sslmode=verify-full'
      ((sslmode_count += 1))
    elif [[ "$parameter" == sslrootcert=* ]]; then
      [[ "$parameter" == "sslrootcert=$CA_FILE" ]] || fail 'URL sslrootcert must equal the explicit CA file path'
      ((root_count += 1))
      parameter="sslrootcert=$ca_fd_path"
    else
      fail 'URL contains an unknown query parameter'
    fi
    joined+="$separator$parameter"
    separator='&'
  done
  [[ $sslmode_count -eq 1 ]] || fail 'URL must contain exact sslmode=verify-full'
  [[ $root_count -eq 1 ]] || fail 'URL must contain the exact explicit sslrootcert path'
  effective_result="$base?$joined"
}

create_adopted_temp() {
  local kind=$1
  local prefix=$2
  local -n result=$3
  coproc MC2_TEMP_CREATOR {
    /usr/bin/python3 "$TEMP_CREATOR_HELPER" --parent "$BACKUP_DIR" --prefix "$prefix" --kind "$kind"
  }
  IFS= read -r result <&"${MC2_TEMP_CREATOR[0]}" || fail 'private temporary creation failed'
  printf 'adopt\n' >&"${MC2_TEMP_CREATOR[1]}"
  wait "$MC2_TEMP_CREATOR_PID" || fail 'private temporary adoption failed'
}

parse_arguments() {
  local mode=''
  RUN_ID=''
  SNAPSHOT=''
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --q12-run-id)
        [[ "$mode" != scheduled ]] || fail 'backup invocation modes cannot be combined' 64
        mode=q12
        RUN_ID=${2:-}
        shift 2
        ;;
      --scheduled-run-id)
        [[ "$mode" != q12 ]] || fail 'backup invocation modes cannot be combined' 64
        mode=scheduled
        RUN_ID=${2:-}
        shift 2
        ;;
      --snapshot)
        SNAPSHOT=${2:-}
        shift 2
        ;;
      *) fail 'unsupported backup argument' 64 ;;
    esac
  done
  [[ "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || \
    fail 'run id must be a lowercase UUID' 64
  if [[ "$mode" == q12 ]]; then
    [[ "$SNAPSHOT" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$ ]] || \
      fail 'Q12 backup requires one exported PostgreSQL snapshot identifier' 64
  else
    [[ -z "$SNAPSHOT" ]] || fail 'scheduled backup cannot accept an external snapshot' 64
  fi
  BACKUP_MODE=$mode
}

create_service_file() {
  local effective_database_url=$1
  local service_file=$2
  # libpq never URI-expands dbname inside a service file, so the effective URL
  # must be decomposed into discrete connection parameters.
  ( umask 077; : >"$service_file" )
  /usr/bin/chmod 600 -- "$service_file"
  /usr/bin/python3 - "$service_file" 3<<<"$effective_database_url" <<'PY' || \
    fail 'connection service file composition failed'
import os
import sys
from urllib.parse import parse_qs, unquote, urlsplit

service_path = sys.argv[1]
with os.fdopen(3, encoding="utf-8") as source:
    value = source.readline().rstrip("\n")
parsed = urlsplit(value)
query = parse_qs(parsed.query, keep_blank_values=True)


def decoded(keyword, encoded):
    try:
        return unquote(encoded, errors="strict")
    except UnicodeDecodeError:
        raise SystemExit(f"service parameter {keyword} is not valid UTF-8")


entries = (
    ("host", parsed.hostname or ""),
    ("port", str(parsed.port or "")),
    ("user", decoded("user", parsed.username or "")),
    ("password", decoded("password", parsed.password or "")),
    ("dbname", decoded("dbname", parsed.path.lstrip("/"))),
    ("sslmode", (query.get("sslmode") or [""])[0]),
    ("sslrootcert", (query.get("sslrootcert") or [""])[0]),
)
lines = ["[mc2_supabase_backup]"]
for keyword, parameter in entries:
    if not parameter:
        raise SystemExit(f"service parameter {keyword} is empty")
    if parameter != parameter.strip() or any(ch in parameter for ch in "\n\r"):
        raise SystemExit(f"service parameter {keyword} is unsafe")
    lines.append(f"{keyword}={parameter}")
fd = os.open(service_path, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    stream.write("\n".join(lines) + "\n")
    stream.flush()
    os.fsync(stream.fileno())
PY
}

run_manifest_generator() {
  local output=$1
  local snapshot=$2
  local service_file=$3
  local ca_fd_path=$4
  local -a args=(capture --snapshot "$snapshot" --output "$output")
  if [[ "$BACKUP_MODE" == q12 ]]; then
    local expected_hash
    expected_hash=$(/usr/bin/sha256sum "/proc/self/fd/$EXPECTED_CATALOG_FD")
    expected_hash=${expected_hash%% *}
    args+=(
      --baseline "/proc/self/fd/$BASELINE_FD"
      --expected-catalog "/proc/self/fd/$EXPECTED_CATALOG_FD"
      --expected-catalog-sha256 "$expected_hash"
      --q12-run-id "$RUN_ID"
    )
  fi
  if [[ $TEST_MODE_ACTIVE -eq 1 ]]; then
    PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
      PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
      "$MANIFEST_GENERATOR" "${args[@]}"
  else
    PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
      PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
      /usr/bin/pnpm exec tsx "$MANIFEST_GENERATOR" "${args[@]}"
  fi
}

normalize_roles_export() {
  local input=$1
  local output=$2
  /usr/bin/python3 - "$input" "$output" <<'PY'
import pathlib
import re
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
lines = source.splitlines()
if not lines:
    raise SystemExit("empty roles export")
while lines and lines[-1] == "":
    lines.pop()
openings = [(index, match.group(1)) for index, line in enumerate(lines) if (match := re.fullmatch(r"\\restrict ([A-Za-z0-9]+)", line))]
closings = [(index, match.group(1)) for index, line in enumerate(lines) if (match := re.fullmatch(r"\\unrestrict ([A-Za-z0-9]+)", line))]
if len(openings) != 1 or len(closings) != 1:
    raise SystemExit("roles export must contain exactly one PostgreSQL 17 restrict/unrestrict pair")
opening_index, opening_nonce = openings[0]
closing_index, closing_nonce = closings[0]
if opening_index >= closing_index or opening_nonce != closing_nonce:
    raise SystemExit("roles export has a missing or mismatched unrestrict marker")
normalized = "\n".join(line for index, line in enumerate(lines) if index not in (opening_index, closing_index))
if normalized:
    normalized += "\n"
pathlib.Path(sys.argv[2]).write_text(normalized, encoding="utf-8")
PY
  /usr/bin/chmod 600 -- "$output"
}

validate_manifest() {
  local manifest=$1
  local snapshot=$2
  /usr/bin/python3 - "$manifest" "$snapshot" <<'PY'
import json
import pathlib
import sys

value = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if value.get("schema") != "megacampus.supabase-source-manifest/v1":
    raise SystemExit("invalid source manifest schema")
if value.get("snapshot_id") != sys.argv[2]:
    raise SystemExit("source manifest snapshot mismatch")
if not isinstance(value.get("baseline"), dict) or not isinstance(value.get("cutover_snapshot"), dict):
    raise SystemExit("source manifest is missing baseline or cutover_snapshot")
PY
}

scan_generation_secrets() {
  local credential_path=$1
  shift
  /usr/bin/python3 - "$credential_path" "$@" <<'PY'
import pathlib
import re
import sys
from urllib.parse import unquote, urlsplit

credential = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").strip()
password = unquote(urlsplit(credential).password or "")
needles = [credential.encode()]
if len(password) >= 8:
    needles.append(password.encode())
uri_pattern = re.compile(rb"postgres(?:ql)?://[^\s/:]+:[^\s@]+@", re.IGNORECASE)
token_pattern = re.compile(rb"(?:eyJ[A-Za-z0-9_-]{20,}\.|sbp_[A-Za-z0-9_-]{16,})")
for name in sys.argv[2:]:
    data = pathlib.Path(name).read_bytes()
    if any(needle and needle in data for needle in needles) or uri_pattern.search(data) or token_pattern.search(data):
        raise SystemExit("credential-shaped content detected in generation")
PY
}

create_checksums() {
  local directory=$1
  local generation_name=$2
  local snapshot=$3
  /usr/bin/python3 - "$directory" "$generation_name" "$snapshot" <<'PY'
import hashlib
import json
import os
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
files = {}
for name in ("database.dump", "roles.sql", "source-manifest.json"):
    path = directory / name
    data = path.read_bytes()
    files[name] = {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
value = {
    "schema": "megacampus.supabase-backup-checksums/v1",
    "generation": sys.argv[2],
    "snapshot_id": sys.argv[3],
    "consumers": {"database_dump": "passed", "source_manifest": "passed", "roles_stable": "passed"},
    "files": files,
}
path = directory / "checksums.json"
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    json.dump(value, stream, sort_keys=True, separators=(",", ":"))
    stream.write("\n")
PY
}

validate_complete_generation() {
  local directory=$1
  local expected_name=$2
  /usr/bin/python3 - "$directory" "$expected_name" "$(/usr/bin/id -u)" "$(/usr/bin/id -g)" <<'PY'
import hashlib
import json
import os
import pathlib
import stat
import sys

directory = pathlib.Path(sys.argv[1])
expected_name = sys.argv[2]
uid, gid = int(sys.argv[3]), int(sys.argv[4])
st = directory.lstat()
if not stat.S_ISDIR(st.st_mode) or st.st_uid != uid or st.st_gid != gid or stat.S_IMODE(st.st_mode) != 0o700:
    raise SystemExit("generation directory metadata mismatch")
names = sorted(path.name for path in directory.iterdir())
required = ["checksums.json", "database.dump", "roles.sql", "source-manifest.json"]
if names != required:
    raise SystemExit("generation must contain exactly four files")
for name in names:
    path = directory / name
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != uid or st.st_gid != gid or stat.S_IMODE(st.st_mode) != 0o600:
        raise SystemExit("generation file metadata mismatch")
checksums = json.loads((directory / "checksums.json").read_text(encoding="utf-8"))
if checksums.get("schema") != "megacampus.supabase-backup-checksums/v1" or checksums.get("generation") != expected_name:
    raise SystemExit("checksum manifest identity mismatch")
entries = checksums.get("files")
if set(entries or {}) != {"database.dump", "roles.sql", "source-manifest.json"}:
    raise SystemExit("checksum manifest exact file set mismatch")
for name, expected in entries.items():
    data = (directory / name).read_bytes()
    if expected != {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}:
        raise SystemExit("generation checksum mismatch")
PY
}

write_latest_pointer() {
  local generation_name=$1
  local checksums_hash=$2
  create_adopted_temp file "latest.json.$RUN_ID.tmp." TEMP_POINTER
  /usr/bin/python3 - "$TEMP_POINTER" "$generation_name" "$checksums_hash" <<'PY'
import json
import os
import sys

fd = os.open(sys.argv[1], os.O_WRONLY | os.O_TRUNC)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    json.dump({"checksums_sha256": sys.argv[3], "generation": sys.argv[2], "schema": "megacampus.supabase-backup-pointer/v1"}, stream, sort_keys=True, separators=(",", ":"))
    stream.write("\n")
PY
  /usr/bin/chmod 600 -- "$TEMP_POINTER"
  /usr/bin/sync -f "$TEMP_POINTER"
  /usr/bin/mv --no-target-directory --force -- "$TEMP_POINTER" "$BACKUP_DIR/latest.json"
  TEMP_POINTER=''
  /usr/bin/sync -d "$BACKUP_DIR"
}

validate_latest_pointer() {
  local pointer="$BACKUP_DIR/latest.json"
  [[ -f "$pointer" && ! -L "$pointer" ]] || fail 'latest pointer must be a regular non-symlink file'
  [[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$pointer")" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || \
    fail 'latest pointer metadata mismatch'
  local generation_name
  generation_name=$(/usr/bin/python3 - "$BACKUP_DIR" "$pointer" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
value = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
if set(value) != {"checksums_sha256", "generation", "schema"}:
    raise SystemExit("latest pointer exact field set mismatch")
name = value.get("generation")
if value.get("schema") != "megacampus.supabase-backup-pointer/v1" or not isinstance(name, str):
    raise SystemExit("latest pointer schema mismatch")
if not re.fullmatch(r"generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}", name) or "/" in name:
    raise SystemExit("latest pointer generation is invalid")
if not isinstance(value.get("checksums_sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", value["checksums_sha256"]):
    raise SystemExit("latest pointer checksum shape mismatch")
checksums = root / name / "checksums.json"
if hashlib.sha256(checksums.read_bytes()).hexdigest() != value.get("checksums_sha256"):
    raise SystemExit("latest pointer checksum mismatch")
print(name)
PY
  )
  validate_complete_generation "$BACKUP_DIR/$generation_name" "$generation_name" || \
    fail 'latest pointer generation completeness validation failed'
}

run_retention() {
  local latest_name candidate name identity now_epoch retention_cutoff_epoch
  if [[ -n "$RETENTION_NOW_EPOCH" ]]; then
    now_epoch=$RETENTION_NOW_EPOCH
  else
    now_epoch=$(/usr/bin/date +%s)
  fi
  [[ "$now_epoch" =~ ^[1-9][0-9]{0,10}$ ]] || fail 'retention clock epoch is invalid'
  retention_cutoff_epoch=$((now_epoch - RETENTION_DAYS * 86400))
  [[ $retention_cutoff_epoch -gt 0 ]] || fail 'retention cutoff epoch is invalid'
  latest_name=$(/usr/bin/python3 - "$BACKUP_DIR/latest.json" <<'PY'
import json, pathlib, sys
print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)
  shopt -s nullglob
  for candidate in "$BACKUP_DIR"/generation-*; do
    name=${candidate##*/}
    [[ "$name" =~ ^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || continue
    [[ "$name" != "$latest_name" ]] || continue
    [[ -d "$candidate" && ! -L "$candidate" ]] || continue
    identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):700" ]] || continue
    # An unpointed post-rename incident has no durable pointer-commit receipt and is retained.
    [[ -f "$BACKUP_DIR/.committed/$name" && ! -L "$BACKUP_DIR/.committed/$name" ]] || continue
    validate_complete_generation "$candidate" "$name" || continue
    # An integer epoch avoids calendar-day and DST shifts: retention is exactly
    # RETENTION_DAYS * 86400 elapsed seconds.
    if [[ -n "$(/usr/bin/find "$candidate" -maxdepth 0 -type d ! -newermt "@$retention_cutoff_epoch" -print -quit)" ]]; then
      /usr/bin/rm -rf --one-file-system -- "$candidate"
      /usr/bin/rm -- "$BACKUP_DIR/.committed/$name"
    fi
  done
  shopt -u nullglob
  /usr/bin/sync -d "$BACKUP_DIR"
  /usr/bin/sync -d "$BACKUP_DIR/.committed"
}

record_pointer_commit() {
  local generation_name=$1
  local receipt="$BACKUP_DIR/.committed/$generation_name"
  [[ ! -e "$receipt" && ! -L "$receipt" ]] || return 0
  ( umask 077; printf '%s\n' "$generation_name" >"$receipt" )
  /usr/bin/chmod 600 -- "$receipt"
  /usr/bin/sync -f "$receipt"
  /usr/bin/sync -d "$BACKUP_DIR/.committed"
}

reconcile_previous_latest_receipt() {
  [[ ! -e "$BACKUP_DIR/latest.json" ]] || validate_latest_pointer
  [[ -f "$BACKUP_DIR/latest.json" && ! -L "$BACKUP_DIR/latest.json" ]] || return 0
  local generation_name
  generation_name=$(/usr/bin/python3 - "$BACKUP_DIR/latest.json" <<'PY'
import json, pathlib, sys
print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)
  record_pointer_commit "$generation_name"
}

start_scheduled_snapshot() {
  local service_file=$1
  local ca_fd_path=$2
  [[ -x "$PSQL" ]] || fail 'absolute psql command is unavailable'
  coproc MC2_SNAPSHOT {
    PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
      PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
      "$PSQL" -X --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=on
  }
  SNAPSHOT_COORDINATOR_OUT=${MC2_SNAPSHOT[0]}
  SNAPSHOT_COORDINATOR_IN=${MC2_SNAPSHOT[1]}
  SNAPSHOT_COORDINATOR_PID=$MC2_SNAPSHOT_PID
  printf "SELECT current_database()||'|'||session_user||'|'||current_user||'|'||(current_setting('server_version_num')::int/10000)::text;\n" \
    >&"$SNAPSHOT_COORDINATOR_IN"
  local connection_identity
  IFS= read -r connection_identity <&"$SNAPSHOT_COORDINATOR_OUT" || fail 'scheduled source connection identity proof failed'
  if [[ $TEST_MODE_ACTIVE -eq 0 && "$connection_identity" != 'postgres|postgres|postgres|17' ]]; then
    fail 'scheduled source connection identity mismatch'
  fi
  printf 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n' \
    >&"$SNAPSHOT_COORDINATOR_IN"
  IFS= read -r SNAPSHOT <&"$SNAPSHOT_COORDINATOR_OUT" || fail 'scheduled snapshot export failed'
  [[ "$SNAPSHOT" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$ ]] || fail 'scheduled snapshot identifier is invalid'
}

finish_scheduled_snapshot() {
  [[ -n "$SNAPSHOT_COORDINATOR_IN" ]] || return 0
  printf 'COMMIT;\n\\q\n' >&"$SNAPSHOT_COORDINATOR_IN"
  exec {SNAPSHOT_COORDINATOR_IN}>&-
  SNAPSHOT_COORDINATOR_IN=''
  wait "$SNAPSHOT_COORDINATOR_PID" || fail 'scheduled snapshot coordinator failed'
  SNAPSHOT_COORDINATOR_PID=''
}

main() {
  parse_arguments "$@"
  configure_commands
  [[ "$RETENTION_DAYS" == '14' || $TEST_MODE_ACTIVE -eq 1 ]] || fail 'scheduled retention must remain exactly 14 days'
  [[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || fail 'retention days must be a positive integer'

  local lock_fd lock_identity
  open_locked_backup_directory lock_fd lock_identity
  /usr/bin/flock --nonblock "$lock_fd" || fail 'backup already running' 75
  cleanup_stale_temporaries
  /usr/bin/mkdir -p -m 700 -- "$BACKUP_DIR/.committed"
  [[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$BACKUP_DIR/.committed")" == "$(/usr/bin/id -u):$(/usr/bin/id -g):700" ]] || \
    fail 'pointer commit receipt directory metadata mismatch'
  reconcile_previous_latest_receipt

  open_validated_input 'URL credential' "$URL_FILE" '400:600' \
    'URL credential file must be owner-only mode 0400 or 0600' URL_FD URL_OPEN_IDENTITY
  open_validated_input 'CA' "$CA_FILE" '400:440:444:600:640:644' \
    'CA file must not be group/world writable' CA_FD CA_OPEN_IDENTITY
  if [[ $TEST_MODE_ACTIVE -eq 0 ]]; then
    local actual_ca_sha256
    actual_ca_sha256=$(/usr/bin/sha256sum "/proc/self/fd/$CA_FD")
    actual_ca_sha256=${actual_ca_sha256%% *}
    [[ "$actual_ca_sha256" == "$REQUIRED_CA_SHA256" ]] || fail 'CA trust anchor SHA-256 mismatch'
  fi
  local baseline_file='' expected_catalog_file=''
  if [[ "$BACKUP_MODE" == q12 ]]; then
    if [[ $TEST_MODE_ACTIVE -eq 1 ]]; then
      baseline_file=${MC2_SUPABASE_BACKUP_TEST_BASELINE_FILE:-}
      expected_catalog_file=${MC2_SUPABASE_BACKUP_TEST_EXPECTED_CATALOG_FILE:-}
      case "$baseline_file:$expected_catalog_file" in "$TRUST_BOUNDARY"/*:"$TRUST_BOUNDARY"/*) ;; *) fail 'protected Q12 manifest inputs must be below the test root' ;; esac
    else
      baseline_file="/opt/megacampus/backups/q12/$RUN_ID/baseline.json"
      expected_catalog_file="/opt/megacampus/backups/q12/$RUN_ID/expected-post-migration-catalog.json"
    fi
    open_validated_input 'Q12 baseline' "$baseline_file" '400:600' \
      'Q12 baseline must be owner-only mode 0400 or 0600' BASELINE_FD BASELINE_OPEN_IDENTITY
    open_validated_input 'Q12 expected catalog' "$expected_catalog_file" '400' \
      'Q12 expected catalog must be owner-only mode 0400' EXPECTED_CATALOG_FD EXPECTED_CATALOG_OPEN_IDENTITY
  fi

  if [[ -n "$PRE_DUMP_HOOK" ]]; then
    "$PRE_DUMP_HOOK" >/dev/null 2>&1 || fail 'protected pre-dump test hook failed'
  fi

  local database_url='' effective_database_url=''
  read_database_url "$URL_FD" "/proc/self/fd/$CA_FD" database_url effective_database_url
  recheck_open_input 'URL credential' "$URL_FILE" '400:600' \
    'URL credential file must be owner-only mode 0400 or 0600' "$URL_FD" "$URL_OPEN_IDENTITY"
  recheck_open_input 'CA' "$CA_FILE" '400:440:444:600:640:644' \
    'CA file must not be group/world writable' "$CA_FD" "$CA_OPEN_IDENTITY"
  if [[ "$BACKUP_MODE" == q12 ]]; then
    recheck_open_input 'Q12 baseline' "$baseline_file" '400:600' \
      'Q12 baseline must be owner-only mode 0400 or 0600' "$BASELINE_FD" "$BASELINE_OPEN_IDENTITY"
    recheck_open_input 'Q12 expected catalog' "$expected_catalog_file" '400' \
      'Q12 expected catalog must be owner-only mode 0400' "$EXPECTED_CATALOG_FD" "$EXPECTED_CATALOG_OPEN_IDENTITY"
  fi
  recheck_locked_backup_directory "$lock_fd" "$lock_identity"

  local timestamp final_name final_path
  if [[ $TEST_MODE_ACTIVE -eq 1 && -n "$TEST_FINAL_NAME" ]]; then
    final_name=$TEST_FINAL_NAME
  else
    timestamp=$(/usr/bin/date -u '+%Y%m%dT%H%M%SZ')
    final_name="generation-$timestamp-$RUN_ID"
  fi
  final_path="$BACKUP_DIR/$final_name"
  create_adopted_temp directory ".generation.$RUN_ID." TEMP_GENERATION

  local archive="$TEMP_GENERATION/database.dump"
  local roles_before="$TEMP_GENERATION/roles.sql"
  local roles_after="$TEMP_GENERATION/.roles.after.sql"
  local roles_before_normalized="$TEMP_GENERATION/.roles.before.normalized"
  local roles_after_normalized="$TEMP_GENERATION/.roles.after.normalized"
  local manifest="$TEMP_GENERATION/source-manifest.json"
  local checksums="$TEMP_GENERATION/checksums.json"
  local service_file="$TEMP_GENERATION/.connection.conf"
  local dump_stderr="$TEMP_GENERATION/.pg_dump.stderr"
  local command_stderr="$TEMP_GENERATION/.command.stderr"
  local toc="$TEMP_GENERATION/.archive.toc"
  local ca_fd_path="/proc/self/fd/$CA_FD"
  create_service_file "$effective_database_url" "$service_file"
  unset effective_database_url

  if [[ "$BACKUP_MODE" == scheduled ]]; then
    start_scheduled_snapshot "$service_file" "$ca_fd_path"
  fi

  local status
  set +e
  PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
    PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
    "$PG_DUMPALL" --roles-only --no-role-passwords --no-password >"$roles_before" 2>"$command_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "pg_dumpall before snapshot failed with status $status" "$status"
  [[ ! -s "$command_stderr" ]] || fail 'pg_dumpall before snapshot emitted stderr'
  /usr/bin/chmod 600 -- "$roles_before"

  set +e
  PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
    PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
    "$PG_DUMP" --format=custom --no-password --snapshot="$SNAPSHOT" --file="$archive" 2>"$dump_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "pg_dump failed with status $status" "$status"
  [[ ! -s "$dump_stderr" ]] || fail 'pg_dump stderr is not allowlisted'
  /usr/bin/chmod 600 -- "$archive"

  set +e
  run_manifest_generator "$manifest" "$SNAPSHOT" "$service_file" "$ca_fd_path" 2>"$command_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "source manifest generation failed with status $status" "$status"
  [[ ! -s "$command_stderr" ]] || fail 'source manifest generator emitted stderr'
  /usr/bin/chmod 600 -- "$manifest"
  validate_manifest "$manifest" "$SNAPSHOT" || fail 'source manifest validation failed'

  set +e
  PGSERVICE=mc2_supabase_backup PGSERVICEFILE="$service_file" \
    PGSSLMODE=verify-full PGSSLROOTCERT="$ca_fd_path" \
    "$PG_DUMPALL" --roles-only --no-role-passwords --no-password >"$roles_after" 2>"$command_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "pg_dumpall after snapshot failed with status $status" "$status"
  [[ ! -s "$command_stderr" ]] || fail 'pg_dumpall after snapshot emitted stderr'
  /usr/bin/chmod 600 -- "$roles_after"

  finish_scheduled_snapshot

  local archive_size
  archive_size=$(/usr/bin/stat -c '%s' -- "$archive")
  [[ "$archive_size" -gt $MINIMUM_ARCHIVE_BYTES ]] || fail 'pg_dump archive is too small to be accepted' 65
  set +e
  "$PG_RESTORE" --list "$archive" >"$toc" 2>"$command_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "pg_restore validation failed with status $status" "$status"
  [[ ! -s "$command_stderr" ]] || fail 'pg_restore validation emitted stderr'
  /usr/bin/grep -Eq '^[[:space:]]*[0-9]+;' "$toc" || fail 'pg_restore validation returned no archive entries' 65
  set +e
  "$PG_RESTORE" --file=/dev/null "$archive" >/dev/null 2>"$command_stderr"
  status=$?
  set -e
  [[ $status -eq 0 ]] || fail "pg_restore full traversal failed with status $status" "$status"
  [[ ! -s "$command_stderr" ]] || fail 'pg_restore full traversal emitted stderr'

  normalize_roles_export "$roles_before" "$roles_before_normalized" || fail 'roles-before normalization failed'
  normalize_roles_export "$roles_after" "$roles_after_normalized" || fail 'roles-after normalization failed'
  local before_hash after_hash
  before_hash=$(/usr/bin/sha256sum "$roles_before_normalized")
  before_hash=${before_hash%% *}
  after_hash=$(/usr/bin/sha256sum "$roles_after_normalized")
  after_hash=${after_hash%% *}
  [[ "$before_hash" == "$after_hash" ]] || fail 'normalized role exports changed across the shared snapshot'

  /usr/bin/rm -- "$roles_after" "$roles_before_normalized" "$roles_after_normalized" \
    "$service_file" "$dump_stderr" "$command_stderr" "$toc"
  scan_generation_secrets "$URL_FILE" "$archive" "$roles_before" "$manifest" || \
    fail 'generation secret scan failed'
  create_checksums "$TEMP_GENERATION" "$final_name" "$SNAPSHOT"
  /usr/bin/chmod 600 -- "$checksums"
  scan_generation_secrets "$URL_FILE" "$roles_before" "$manifest" "$checksums" || \
    fail 'generation secret scan failed'

  local file
  for file in "$archive" "$roles_before" "$manifest" "$checksums"; do
    /usr/bin/sync -f "$file"
  done
  validate_complete_generation "$TEMP_GENERATION" "$final_name" || fail 'generation completeness validation failed'
  /usr/bin/sync -d "$TEMP_GENERATION"
  recheck_open_input 'URL credential' "$URL_FILE" '400:600' \
    'URL credential file must be owner-only mode 0400 or 0600' "$URL_FD" "$URL_OPEN_IDENTITY"
  recheck_open_input 'CA' "$CA_FILE" '400:440:444:600:640:644' \
    'CA file must not be group/world writable' "$CA_FD" "$CA_OPEN_IDENTITY"
  if [[ "$BACKUP_MODE" == q12 ]]; then
    recheck_open_input 'Q12 baseline' "$baseline_file" '400:600' \
      'Q12 baseline must be owner-only mode 0400 or 0600' "$BASELINE_FD" "$BASELINE_OPEN_IDENTITY"
    recheck_open_input 'Q12 expected catalog' "$expected_catalog_file" '400' \
      'Q12 expected catalog must be owner-only mode 0400' "$EXPECTED_CATALOG_FD" "$EXPECTED_CATALOG_OPEN_IDENTITY"
  fi
  recheck_locked_backup_directory "$lock_fd" "$lock_identity"

  if ! /usr/bin/python3 "$RENAME_NOREPLACE_HELPER" "$TEMP_GENERATION" "$final_path"; then
    fail 'refusing to replace an existing generation path' 73
  fi
  generation_committed=1
  /usr/bin/sync -d "$BACKUP_DIR"

  if [[ -n "$POST_GENERATION_HOOK" ]]; then
    set +e
    "$POST_GENERATION_HOOK" >/dev/null 2>&1
    status=$?
    set -e
    [[ $status -eq 0 ]] || fail 'post-generation hook failed before latest pointer commit' "$status"
  fi

  local checksums_hash
  checksums_hash=$(/usr/bin/sha256sum "$final_path/checksums.json")
  checksums_hash=${checksums_hash%% *}
  write_latest_pointer "$final_name" "$checksums_hash"
  validate_latest_pointer
  record_pointer_commit "$final_name"
  run_retention

  unset database_url
  exec {URL_FD}<&-
  exec {CA_FD}<&-
  [[ -z "$BASELINE_FD" ]] || exec {BASELINE_FD}<&-
  [[ -z "$EXPECTED_CATALOG_FD" ]] || exec {EXPECTED_CATALOG_FD}<&-
  TEMP_GENERATION=''
  printf 'Supabase backup published: %s\n' "$final_name"
}

main "$@"
