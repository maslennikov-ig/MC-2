#!/usr/bin/bash
set -Eeuo pipefail
export LC_ALL=C
umask 077

readonly TEST_MODE_TOKEN='mc2-synthetic-schedule-test-only'
BACKUP_ROOT='/opt/megacampus/backups/supabase'
Q12_LOCK='/opt/megacampus/backups/q12/cutover.lock'
Q12_ACTIVE_RUN='/opt/megacampus/backups/q12/active-run'
SCHEDULE_LOCK='/opt/megacampus/backups/supabase/schedule.lock'
BACKUP_LOCK='/opt/megacampus/backups/supabase/backup.lock'
JOURNAL='/opt/megacampus/backups/supabase/scheduler-journal.jsonl'
BACKUP_COMMAND='/opt/megacampus/deploy/postgres/backup-supabase.sh'
UUID_SOURCE='/proc/sys/kernel/random/uuid'

fail() {
  printf 'Scheduled Supabase backup failed: %s\n' "$1" >&2
  exit "${2:-1}"
}

configure_test_mode() {
  local mode=${MC2_SUPABASE_SCHEDULE_TEST_MODE:-}
  if [[ -z "$mode" ]]; then
    [[ -z "${MC2_SUPABASE_SCHEDULE_TEST_ROOT:-}" && -z "${MC2_SUPABASE_SCHEDULE_TEST_BACKUP_COMMAND:-}" && -z "${MC2_SUPABASE_SCHEDULE_TEST_UUID_FILE:-}" ]] || \
      fail 'scheduler test overrides require the exact protected test mode' 64
    return
  fi
  [[ "$mode" == "$TEST_MODE_TOKEN" ]] || fail 'invalid protected scheduler test mode token' 64
  local root=${MC2_SUPABASE_SCHEDULE_TEST_ROOT:-}
  [[ "$root" == /tmp/mc2-supabase-schedule-* && -d "$root" && ! -L "$root" ]] || \
    fail 'protected scheduler test root is invalid' 64
  [[ "$root" == "$(/usr/bin/readlink -f -- "$root")" ]] || fail 'scheduler test root path drift' 64
  BACKUP_ROOT="$root/supabase"
  Q12_LOCK="$root/q12/cutover.lock"
  Q12_ACTIVE_RUN="$root/q12/active-run"
  SCHEDULE_LOCK="$BACKUP_ROOT/schedule.lock"
  BACKUP_LOCK="$BACKUP_ROOT/backup.lock"
  JOURNAL="$BACKUP_ROOT/scheduler-journal.jsonl"
  BACKUP_COMMAND=${MC2_SUPABASE_SCHEDULE_TEST_BACKUP_COMMAND:-}
  UUID_SOURCE=${MC2_SUPABASE_SCHEDULE_TEST_UUID_FILE:-}
  [[ "$BACKUP_COMMAND" == "$root"/* && -x "$BACKUP_COMMAND" && ! -L "$BACKUP_COMMAND" ]] || \
    fail 'protected scheduler backup command is invalid' 64
  [[ "$UUID_SOURCE" == "$root"/* && -f "$UUID_SOURCE" && ! -L "$UUID_SOURCE" ]] || \
    fail 'protected scheduler UUID source is invalid' 64
}

# mc2-1cxna: publish a freshness gauge for the node_exporter textfile collector, so a failed or
# skipped nightly run goes stale and raises SupabaseBackupStale instead of leaving a log line
# nobody reads. Stamped ONLY here — after pg_restore validation and pointer publication have both
# succeeded — so the metric cannot report a backup that does not exist.
#
# Publishing is best effort: a metrics directory that is missing or unwritable must never turn a
# good backup into a failed run. Missing metric reads as stale, which is the honest outcome.
publish_backup_metric() {
  local directory=${METRICS_TEXTFILE_DIR:-/var/lib/megacampus/qdrant-metrics}
  local output="$directory/megacampus_supabase_backup.prom"
  local temporary

  [[ -d "$directory" && -w "$directory" ]] || {
    printf 'Scheduled Supabase backup: metrics directory %s is not writable, metric not published\n' \
      "$directory" >&2
    return 0
  }

  temporary=$(/usr/bin/mktemp --tmpdir="$directory" '.megacampus_supabase_backup.XXXXXX') || return 0
  {
    echo '# TYPE megacampus_supabase_last_successful_backup_unixtime_seconds gauge'
    echo "megacampus_supabase_last_successful_backup_unixtime_seconds $(/usr/bin/date -u +%s)"
  } >"$temporary"
  /usr/bin/chmod 0644 -- "$temporary"
  /usr/bin/mv -- "$temporary" "$output" || /usr/bin/rm -f -- "$temporary"
}

require_owned_lock() {
  local label=$1 path=$2
  [[ -f "$path" && ! -L "$path" ]] || fail "$label must be a regular non-symlink file"
  [[ "$(/usr/bin/readlink -f -- "$path")" == "$path" ]] || fail "$label has canonical path drift"
  [[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$path")" == "$(/usr/bin/id -u):$(/usr/bin/id -g):600" ]] || \
    fail "$label metadata mismatch"
}

append_journal() {
  local result=$1 generation=${2:-}
  /usr/bin/python3 - "$JOURNAL" "$RUN_ID" "$result" "$generation" <<'PY'
import datetime
import json
import os
import sys

path, run_id, result, generation = sys.argv[1:]
event = {
    "generation": generation or None,
    "result": result,
    "run_id": run_id,
    "schema": "megacampus.supabase-backup-scheduler/v1",
    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
}
fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
with os.fdopen(fd, "a", encoding="utf-8") as stream:
    stream.write(json.dumps(event, sort_keys=True, separators=(",", ":")) + "\n")
    stream.flush()
    os.fsync(stream.fileno())
PY
}

configure_test_mode
[[ $# -eq 0 ]] || fail 'operator arguments are not accepted' 64
[[ -d "$BACKUP_ROOT" && ! -L "$BACKUP_ROOT" ]] || fail 'backup root is unavailable'
[[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$BACKUP_ROOT")" == "$(/usr/bin/id -u):$(/usr/bin/id -g):700" ]] || \
  fail 'backup root metadata mismatch'
[[ ! -e "$Q12_ACTIVE_RUN" && ! -L "$Q12_ACTIVE_RUN" ]] || fail 'refusing scheduled backup while Q12 is active' 75
if [[ -e "$Q12_LOCK" || -L "$Q12_LOCK" ]]; then
  [[ -f "$Q12_LOCK" && ! -L "$Q12_LOCK" ]] || fail 'Q12 host lock is unsafe' 75
  require_owned_lock 'Q12 host lock' "$Q12_LOCK"
  exec {q12_lock_fd}<"$Q12_LOCK"
  /usr/bin/flock --nonblock --shared "$q12_lock_fd" || fail 'refusing scheduled backup while Q12 is active' 75
fi

require_owned_lock 'schedule lock' "$SCHEDULE_LOCK"
require_owned_lock 'backup lock' "$BACKUP_LOCK"
exec {schedule_lock_fd}<>"$SCHEDULE_LOCK"
/usr/bin/flock --nonblock --exclusive "$schedule_lock_fd" || fail 'another scheduled backup run is active' 75
exec {backup_lock_fd}<>"$BACKUP_LOCK"
/usr/bin/flock --nonblock --exclusive "$backup_lock_fd" || fail 'another backup process is active' 75

RUN_ID=$(/usr/bin/cat "$UUID_SOURCE")
[[ "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || \
  fail 'kernel UUID source returned an invalid identifier'

completed=0
on_exit() {
  local status=$?
  trap - EXIT
  if [[ $completed -eq 0 ]]; then
    append_journal failed || status=90
  fi
  exit "$status"
}
trap on_exit EXIT

# The broken legacy cron remains disabled; systemd is the sole scheduler.
"$BACKUP_COMMAND" --scheduled-run-id "$RUN_ID"
generation=$(/usr/bin/python3 - "$BACKUP_ROOT/latest.json" <<'PY'
import json
import pathlib
import sys

print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)
[[ "$generation" =~ ^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || fail 'published pointer is invalid'
append_journal passed "$generation"
publish_backup_metric
completed=1
