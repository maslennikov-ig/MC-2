#!/usr/bin/bash
set -Eeuo pipefail
export LC_ALL=C

umask 077

readonly TEST_MODE_TOKEN='mc2-synthetic-local-backup-test-only'
readonly DEFAULT_URL_FILE='/opt/megacampus/secrets/supabase_db_url'
readonly DEFAULT_CA_FILE='/opt/megacampus/secrets/prod-ca-2021.crt'
readonly DEFAULT_BACKUP_DIR='/opt/megacampus/backups/supabase'
readonly MINIMUM_ARCHIVE_BYTES=1024

URL_FILE="${SUPABASE_BACKUP_URL_FILE:-$DEFAULT_URL_FILE}"
CA_FILE="${SUPABASE_BACKUP_CA_FILE:-$DEFAULT_CA_FILE}"
BACKUP_DIR="${SUPABASE_BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
RETENTION_DAYS="${SUPABASE_BACKUP_RETENTION_DAYS:-14}"
PG_DUMP='/usr/bin/pg_dump'
PG_RESTORE='/usr/bin/pg_restore'
TEST_MODE_ACTIVE=0
TRUST_BOUNDARY='/'
PRE_DUMP_HOOK=''
TEST_FINAL_NAME=''

TEMP_ARCHIVE=''
TEMP_LIST=''
URL_FD=''
CA_FD=''
URL_OPEN_IDENTITY=''
CA_OPEN_IDENTITY=''

fail() {
  local message=$1
  local status=${2:-1}
  printf 'Supabase backup failed: %s\n' "$message" >&2
  exit "$status"
}

cleanup_temp() {
  local path
  for path in "$TEMP_ARCHIVE" "$TEMP_LIST"; do
    [[ -n "$path" ]] || continue
    case "$path" in
      "$BACKUP_DIR"/.supabase-backup.tmp.*)
        if [[ -f "$path" && ! -L "$path" ]]; then
          /usr/bin/rm -f -- "$path"
        fi
        ;;
    esac
  done
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

configure_commands() {
  local test_mode=${MC2_SUPABASE_BACKUP_TEST_MODE:-}
  if [[ -z "$test_mode" ]]; then
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_ROOT:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_DUMP:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_RESTORE:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK:-}" ]] || fail 'test hook requires the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_FINAL_NAME:-}" ]] || fail 'test final name requires the exact protected test mode'
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
    require_test_command 'pg_dump' "$PG_DUMP" "$test_root"
    require_test_command 'pg_restore' "$PG_RESTORE" "$test_root"

    PRE_DUMP_HOOK=${MC2_SUPABASE_BACKUP_TEST_PRE_DUMP_HOOK:-}
    if [[ -n "$PRE_DUMP_HOOK" ]]; then
      require_test_command 'pre-dump hook' "$PRE_DUMP_HOOK" "$test_root"
    fi
    TEST_FINAL_NAME=${MC2_SUPABASE_BACKUP_TEST_FINAL_NAME:-}
    if [[ -n "$TEST_FINAL_NAME" ]]; then
      [[ "$TEST_FINAL_NAME" =~ ^supabase-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$ ]] || fail 'protected test final name is invalid'
    fi
  fi

  [[ -x "$PG_DUMP" ]] || fail 'absolute pg_dump command is unavailable'
  [[ -x "$PG_RESTORE" ]] || fail 'absolute pg_restore command is unavailable'
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

  local opened_fd
  exec {opened_fd}<"$path" || fail "$label file could not be opened"
  local opened_identity current_identity
  opened_identity=$(fd_identity "$opened_fd")
  current_identity=$(file_identity "$path")
  if [[ "$opened_identity" != "$current_identity" ]]; then
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
  [[ "$original_result" == postgresql://* || "$original_result" == postgres://* ]] || fail 'URL credential must use postgresql:// or postgres://'
  [[ ! "$original_result" =~ [[:space:]] ]] || fail 'URL credential contains whitespace'

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
    fi
    joined+="$separator$parameter"
    separator='&'
  done
  [[ $sslmode_count -eq 1 ]] || fail 'URL must contain exact sslmode=verify-full'
  [[ $root_count -eq 1 ]] || fail 'URL must contain the exact explicit sslrootcert path'
  effective_result="$base?$joined"
}

create_temp() {
  /usr/bin/mktemp "$BACKUP_DIR/.supabase-backup.tmp.$1.XXXXXX"
}

run_retention() {
  local candidate name identity
  shopt -s nullglob
  for candidate in "$BACKUP_DIR"/supabase-*.dump; do
    name=${candidate##*/}
    [[ "$name" =~ ^supabase-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump$ ]] || continue
    [[ -f "$candidate" && ! -L "$candidate" ]] || continue
    identity=$(/usr/bin/stat -c '%u:%g:%a' -- "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || continue
    if [[ -n "$(/usr/bin/find "$candidate" -maxdepth 0 -type f -mtime "+$RETENTION_DAYS" -print -quit)" ]]; then
      /usr/bin/rm -- "$candidate"
    fi
  done
  shopt -u nullglob
}

main() {
  [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail 'retention days must be a non-negative integer'
  configure_commands

  local lock_fd lock_identity
  open_locked_backup_directory lock_fd lock_identity
  /usr/bin/flock --nonblock "$lock_fd" || fail 'backup already running' 75

  cleanup_stale_temporaries

  open_validated_input 'URL credential' "$URL_FILE" '400:600' \
    'URL credential file must be owner-only mode 0400 or 0600' URL_FD URL_OPEN_IDENTITY
  open_validated_input 'CA' "$CA_FILE" '400:440:444:600:640:644' \
    'CA file must not be group/world writable' CA_FD CA_OPEN_IDENTITY

  if [[ -n "$PRE_DUMP_HOOK" ]]; then
    "$PRE_DUMP_HOOK" >/dev/null 2>&1 || fail 'protected pre-dump test hook failed'
  fi

  local database_url='' effective_database_url=''
  read_database_url "$URL_FD" "/proc/self/fd/$CA_FD" database_url effective_database_url
  recheck_open_input 'URL credential' "$URL_FILE" '400:600' \
    'URL credential file must be owner-only mode 0400 or 0600' "$URL_FD" "$URL_OPEN_IDENTITY"
  recheck_open_input 'CA' "$CA_FILE" '400:440:444:600:640:644' \
    'CA file must not be group/world writable' "$CA_FD" "$CA_OPEN_IDENTITY"
  recheck_locked_backup_directory "$lock_fd" "$lock_identity"

  TEMP_ARCHIVE=$(create_temp archive)
  TEMP_LIST=$(create_temp list)

  local status ca_fd_path="/proc/self/fd/$CA_FD"
  if PGDATABASE="$effective_database_url" PGSSLMODE='verify-full' PGSSLROOTCERT="$ca_fd_path" \
    "$PG_DUMP" --format=custom --no-password --file="$TEMP_ARCHIVE" 2>/dev/null; then
    status=0
  else
    status=$?
    fail "pg_dump failed with status $status" "$status"
  fi
  unset database_url effective_database_url
  exec {URL_FD}<&-
  exec {CA_FD}<&-

  local archive_size
  archive_size=$(/usr/bin/stat -c '%s' -- "$TEMP_ARCHIVE")
  [[ "$archive_size" -gt $MINIMUM_ARCHIVE_BYTES ]] || fail 'pg_dump archive is too small to be accepted' 65

  if "$PG_RESTORE" --list "$TEMP_ARCHIVE" >"$TEMP_LIST" 2>/dev/null; then
    status=0
  else
    status=$?
    fail "pg_restore validation failed with status $status" "$status"
  fi
  /usr/bin/grep -Eq '^[[:space:]]*[0-9]+;' "$TEMP_LIST" || fail 'pg_restore validation returned no archive entries' 65

  if "$PG_RESTORE" --file=/dev/null "$TEMP_ARCHIVE" >/dev/null 2>&1; then
    status=0
  else
    status=$?
    fail "pg_restore full traversal failed with status $status" "$status"
  fi

  recheck_locked_backup_directory "$lock_fd" "$lock_identity"
  /usr/bin/sync -f "$TEMP_ARCHIVE"
  local timestamp final_name final_path
  if [[ $TEST_MODE_ACTIVE -eq 1 && -n "$TEST_FINAL_NAME" ]]; then
    final_name=$TEST_FINAL_NAME
  else
    timestamp=$(/usr/bin/date -u '+%Y%m%dT%H%M%SZ')
    final_name="supabase-$timestamp-$$.dump"
  fi
  final_path="$BACKUP_DIR/$final_name"
  if ! /usr/bin/ln --no-target-directory -- "$TEMP_ARCHIVE" "$final_path" 2>/dev/null; then
    fail 'refusing to replace an existing backup path' 73
  fi
  /usr/bin/sync -d "$BACKUP_DIR"
  /usr/bin/rm -- "$TEMP_ARCHIVE"
  TEMP_ARCHIVE=''
  /usr/bin/sync -d "$BACKUP_DIR"

  recheck_locked_backup_directory "$lock_fd" "$lock_identity"
  run_retention
  /usr/bin/sync -d "$BACKUP_DIR"
  printf 'Supabase backup published: %s\n' "$final_name"
}

main "$@"
