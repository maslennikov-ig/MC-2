#!/usr/bin/bash
set -Eeuo pipefail

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

TEMP_ARCHIVE=''
TEMP_LIST=''
TEMP_STDERR=''

fail() {
  local message=$1
  local status=${2:-1}
  printf 'Supabase backup failed: %s\n' "$message" >&2
  exit "$status"
}

cleanup_temp() {
  local path
  for path in "$TEMP_ARCHIVE" "$TEMP_LIST" "$TEMP_STDERR"; do
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
  /usr/bin/stat -c '%u:%g:%a' -- "$1"
}

require_owned_directory() {
  local label=$1
  local path=$2
  require_absolute_path "$label" "$path"
  [[ -d "$path" && ! -L "$path" ]] || fail "$label must be a regular non-symlink directory"
  local expected="$(/usr/bin/id -u):$(/usr/bin/id -g):700"
  [[ "$(file_identity "$path")" == "$expected" ]] || fail "$label must be owned by the current user and mode 0700"
}

require_url_file() {
  require_absolute_path 'URL credential file' "$URL_FILE"
  [[ -f "$URL_FILE" && ! -L "$URL_FILE" ]] || fail 'URL credential file must be a regular non-symlink file'
  local identity uid gid mode
  identity=$(file_identity "$URL_FILE")
  IFS=: read -r uid gid mode <<< "$identity"
  [[ "$uid" == "$(/usr/bin/id -u)" && "$gid" == "$(/usr/bin/id -g)" ]] || fail 'URL credential file must be owned by the current user'
  [[ "$mode" == '400' || "$mode" == '600' ]] || fail 'URL credential file must be owner-only mode 0400 or 0600'
}

require_ca_file() {
  require_absolute_path 'CA file' "$CA_FILE"
  [[ -f "$CA_FILE" && ! -L "$CA_FILE" ]] || fail 'CA file must be a regular non-symlink file'
  local identity uid gid mode
  identity=$(file_identity "$CA_FILE")
  IFS=: read -r uid gid mode <<< "$identity"
  [[ "$uid" == "$(/usr/bin/id -u)" && "$gid" == "$(/usr/bin/id -g)" ]] || fail 'CA file must be owned by the current user'
  case "$mode" in
    400|440|444|600|640|644) ;;
    *) fail 'CA file must not be group/world writable' ;;
  esac
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
  [[ "$(file_identity "$path")" == "$expected" ]] || fail "$label test override must be owned by the current user and mode 0700"
}

configure_commands() {
  local test_mode=${MC2_SUPABASE_BACKUP_TEST_MODE:-}
  if [[ -z "$test_mode" ]]; then
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_ROOT:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_DUMP:-}" ]] || fail 'test command overrides require the exact protected test mode'
    [[ -z "${MC2_SUPABASE_BACKUP_TEST_PG_RESTORE:-}" ]] || fail 'test command overrides require the exact protected test mode'
  else
    [[ "$test_mode" == "$TEST_MODE_TOKEN" ]] || fail 'invalid protected test mode token'
    local test_root=${MC2_SUPABASE_BACKUP_TEST_ROOT:-}
    [[ "$test_root" == /tmp/mc2-supabase-backup-* ]] || fail 'protected test root must be an absolute mc2 temporary directory'
    require_owned_directory 'protected test root' "$test_root"
    PG_DUMP=${MC2_SUPABASE_BACKUP_TEST_PG_DUMP:-}
    PG_RESTORE=${MC2_SUPABASE_BACKUP_TEST_PG_RESTORE:-}
    require_test_command 'pg_dump' "$PG_DUMP" "$test_root"
    require_test_command 'pg_restore' "$PG_RESTORE" "$test_root"
  fi

  [[ -x "$PG_DUMP" ]] || fail 'absolute pg_dump command is unavailable'
  [[ -x "$PG_RESTORE" ]] || fail 'absolute pg_restore command is unavailable'
}

read_database_url() {
  local -n output=$1
  local -a lines=()
  mapfile -t lines < "$URL_FILE"
  [[ ${#lines[@]} -eq 1 && -n "${lines[0]}" ]] || fail 'URL credential file must contain exactly one non-empty line'
  output=${lines[0]}
  [[ "$output" == postgresql://* || "$output" == postgres://* ]] || fail 'URL credential must use postgresql:// or postgres://'
  [[ ! "$output" =~ [[:space:]] ]] || fail 'URL credential contains whitespace'

  local query
  [[ "$output" == *\?* ]] || fail 'URL must contain exact sslmode=verify-full'
  query=${output#*\?}
  local parameter sslmode_count=0 root_count=0
  local -a parameters=()
  IFS='&' read -r -a parameters <<< "$query"
  for parameter in "${parameters[@]}"; do
    if [[ "$parameter" == sslmode=* ]]; then
      [[ "$parameter" == 'sslmode=verify-full' ]] || fail 'URL must contain exact sslmode=verify-full'
      ((sslmode_count += 1))
    elif [[ "$parameter" == sslrootcert=* ]]; then
      [[ "$parameter" == "sslrootcert=$CA_FILE" ]] || fail 'URL sslrootcert must equal the explicit CA file path'
      ((root_count += 1))
    fi
  done
  [[ $sslmode_count -eq 1 ]] || fail 'URL must contain exact sslmode=verify-full'
  [[ $root_count -eq 1 ]] || fail 'URL must contain the exact explicit sslrootcert path'
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
    identity=$(file_identity "$candidate")
    [[ "$identity" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || continue
    if [[ -n "$(/usr/bin/find "$candidate" -maxdepth 0 -type f -mtime "+$RETENTION_DAYS" -print -quit)" ]]; then
      /usr/bin/rm -- "$candidate"
    fi
  done
  shopt -u nullglob
}

main() {
  [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail 'retention days must be a non-negative integer'
  require_owned_directory 'backup directory' "$BACKUP_DIR"

  local lock_fd
  exec {lock_fd}<"$BACKUP_DIR"
  /usr/bin/flock --nonblock "$lock_fd" || fail 'backup already running' 75

  require_url_file
  require_ca_file
  configure_commands

  local database_url=''
  read_database_url database_url

  TEMP_ARCHIVE=$(create_temp archive)
  TEMP_LIST=$(create_temp list)
  TEMP_STDERR=$(create_temp stderr)

  local status
  if PGDATABASE="$database_url" PGSSLMODE='verify-full' PGSSLROOTCERT="$CA_FILE" \
    "$PG_DUMP" --format=custom --no-password --file="$TEMP_ARCHIVE" 2>"$TEMP_STDERR"; then
    status=0
  else
    status=$?
    fail "pg_dump failed with status $status" "$status"
  fi
  unset database_url

  local archive_size
  archive_size=$(/usr/bin/stat -c '%s' -- "$TEMP_ARCHIVE")
  [[ "$archive_size" -gt $MINIMUM_ARCHIVE_BYTES ]] || fail 'pg_dump archive is too small to be accepted' 65

  if "$PG_RESTORE" --list "$TEMP_ARCHIVE" >"$TEMP_LIST" 2>"$TEMP_STDERR"; then
    status=0
  else
    status=$?
    fail "pg_restore validation failed with status $status" "$status"
  fi
  /usr/bin/grep -Eq '^[[:space:]]*[0-9]+;' "$TEMP_LIST" || fail 'pg_restore validation returned no archive entries' 65

  /usr/bin/sync -f "$TEMP_ARCHIVE"
  local timestamp final_name final_path
  timestamp=$(/usr/bin/date -u '+%Y%m%dT%H%M%SZ')
  final_name="supabase-$timestamp-$$.dump"
  final_path="$BACKUP_DIR/$final_name"
  [[ ! -e "$final_path" && ! -L "$final_path" ]] || fail 'refusing to replace an existing backup path' 73
  /usr/bin/mv -- "$TEMP_ARCHIVE" "$final_path"
  TEMP_ARCHIVE=''
  /usr/bin/sync -d "$BACKUP_DIR"

  run_retention
  /usr/bin/sync -d "$BACKUP_DIR"
  printf 'Supabase backup published: %s\n' "$final_name"
}

main "$@"
