#!/usr/bin/bash
set -Eeuo pipefail
export LC_ALL=C
umask 077

readonly SERVICE_NAME='megacampus-supabase-backup.service'
readonly TIMER_NAME='megacampus-supabase-backup.timer'
readonly SERVICE_SOURCE='/opt/megacampus/deploy/systemd/megacampus-supabase-backup.service'
readonly TIMER_SOURCE='/opt/megacampus/deploy/systemd/megacampus-supabase-backup.timer'
readonly SERVICE_TARGET='/etc/systemd/system/megacampus-supabase-backup.service'
readonly TIMER_TARGET='/etc/systemd/system/megacampus-supabase-backup.timer'
readonly SCHEDULE_LOCK='/opt/megacampus/backups/supabase/schedule.lock'
readonly INSTALL_LOCK='/opt/megacampus/backups/supabase/install.lock'
readonly BACKUP_LOCK='/opt/megacampus/backups/supabase/backup.lock'
readonly BACKUP_ROOT='/opt/megacampus/backups/supabase'
readonly RESTORE_COMMAND='/opt/megacampus/deploy/postgres/restore-supabase-drill.sh'
readonly SYSTEMCTL='/usr/bin/systemctl'
readonly RUNUSER='/usr/sbin/runuser'
readonly CONFIRMATION='INSTALL MC2 SUPABASE BACKUP SCHEDULE'

RUN_ID=''
SERVICE_SHA256=''
TIMER_SHA256=''
CONFIRM=''
installation_proven=0

fail() {
  printf 'Supabase backup schedule installation failed: %s\n' "$1" >&2
  exit "${2:-1}"
}

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run-id) RUN_ID=${2:-}; shift 2 ;;
      --service-sha256) SERVICE_SHA256=${2:-}; shift 2 ;;
      --timer-sha256) TIMER_SHA256=${2:-}; shift 2 ;;
      --confirm) CONFIRM=${2:-}; shift 2 ;;
      *) fail 'unsupported installer argument' 64 ;;
    esac
  done
  [[ "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || fail 'run id must be a lowercase UUID' 64
  [[ "$SERVICE_SHA256" =~ ^[0-9a-f]{64}$ && "$TIMER_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail 'unit hashes must be lowercase SHA-256 values' 64
  [[ "$CONFIRM" == "$CONFIRMATION" ]] || fail 'exact confirmation phrase is required' 64
}

verify_hash() {
  local path=$1 expected=$2 actual
  [[ -f "$path" && ! -L "$path" ]] || fail "tracked unit is unavailable: $path"
  actual=$(/usr/bin/sha256sum -- "$path")
  actual=${actual%% *}
  [[ "$actual" == "$expected" ]] || fail "tracked unit hash mismatch: $path"
}

read_pointer_generation() {
  local pointer=$1
  [[ -f "$pointer" && ! -L "$pointer" ]] || return 1
  /usr/bin/python3 - "$pointer" <<'PY'
import json
import pathlib
import re
import sys

value = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
name = value.get("generation")
if not isinstance(name, str) or not re.fullmatch(r"generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}", name):
    raise SystemExit(1)
print(name)
PY
}

# BEGIN authoritative schedule proof lifecycle
disable_unproven_timer() {
  local status=$?
  trap - EXIT
  if [[ $installation_proven -eq 0 ]]; then
    "$SYSTEMCTL" stop "$TIMER_NAME" >/dev/null 2>&1 || true
    "$SYSTEMCTL" disable "$TIMER_NAME" >/dev/null 2>&1 || true
  fi
  exit "$status"
}

prove_supabase_backup_schedule() {
  local before_generation='' before_invocation after_invocation='' generation
  before_generation=$(read_pointer_generation "$BACKUP_ROOT/latest.json" 2>/dev/null || true)
  before_invocation=$("$SYSTEMCTL" show "$SERVICE_NAME" --property=InvocationID --value)

  # Starting the Persistent timer first lets systemd perform a missed-run
  # catch-up. A direct service start is used only when no new invocation was
  # observed, so one installation cannot launch the backup twice.
  "$SYSTEMCTL" start "$TIMER_NAME"
  for _ in $(/usr/bin/seq 1 15); do
    after_invocation=$("$SYSTEMCTL" show "$SERVICE_NAME" --property=InvocationID --value)
    [[ -n "$after_invocation" && "$after_invocation" != "$before_invocation" ]] && break
    /usr/bin/sleep 1
  done
  if [[ -z "$after_invocation" || "$after_invocation" == "$before_invocation" ]]; then
    "$SYSTEMCTL" start "$SERVICE_NAME"
  else
    while "$SYSTEMCTL" is-active --quiet "$SERVICE_NAME"; do
      /usr/bin/sleep 1
    done
  fi
  [[ "$("$SYSTEMCTL" show "$SERVICE_NAME" --property=Result --value)" == success ]] || \
    fail 'scheduled backup service proof failed'
  generation=$(read_pointer_generation "$BACKUP_ROOT/latest.json") || \
    fail 'scheduled backup did not publish a valid pointer'
  [[ "$generation" != "$before_generation" ]] || \
    fail 'scheduled backup did not publish a fresh generation'
  [[ -d "$BACKUP_ROOT/$generation" && ! -L "$BACKUP_ROOT/$generation" ]] || \
    fail 'scheduled generation path is invalid'

  "$RUNUSER" --user claude-deploy -- "$RESTORE_COMMAND" \
    --generation "$BACKUP_ROOT/$generation" --scheduled-run-id "$RUN_ID"

  "$SYSTEMCTL" enable "$TIMER_NAME"
  "$SYSTEMCTL" is-active --quiet "$TIMER_NAME" || fail 'proven backup timer is not active'
  "$SYSTEMCTL" is-enabled --quiet "$TIMER_NAME" || fail 'proven backup timer is not enabled'
  installation_proven=1
  printf 'Supabase backup schedule installed and proven: %s\n' "$generation"
}
# END authoritative schedule proof lifecycle

main() {
  parse_arguments "$@"
  [[ "$(/usr/bin/id -u)" == 0 ]] || fail 'installer must run as root' 77
  [[ -e /usr/share/zoneinfo/Europe/Amsterdam ]] || fail 'Europe/Amsterdam timezone data is unavailable'
  [[ "$(/usr/bin/timedatectl show --property=Timezone --value)" == 'Europe/Amsterdam' ]] || fail 'host timezone is not Europe/Amsterdam'
  [[ -x "$RESTORE_COMMAND" && ! -L "$RESTORE_COMMAND" ]] || fail 'restore drill entrypoint is unavailable'
  verify_hash "$SERVICE_SOURCE" "$SERVICE_SHA256"
  verify_hash "$TIMER_SOURCE" "$TIMER_SHA256"

  local network_before
  /usr/bin/systemctl is-active --quiet networking.service || fail 'networking.service is not active'
  /usr/bin/systemctl is-enabled --quiet networking.service || fail 'networking.service is not enabled'
  network_before=$(/usr/bin/systemctl show networking.service --property=Before --value) || fail 'networking.service is unavailable'
  [[ " $network_before " == *' network-online.target '* ]] || fail 'networking.service does not reach network-online.target'
  /usr/bin/systemctl list-dependencies network-online.target >/dev/null || fail 'network-online.target is unavailable'
  /usr/bin/systemd-analyze verify "$SERVICE_SOURCE" "$TIMER_SOURCE" || fail 'systemd unit verification failed'

  /usr/bin/install -d -o claude-deploy -g claude-deploy -m 0700 "$BACKUP_ROOT"
  /usr/bin/install -d -o claude-deploy -g claude-deploy -m 0700 /opt/megacampus/logs
  # The scheduler wrapper requires all three owned lock files to pre-exist.
  /usr/bin/touch "$SCHEDULE_LOCK" "$INSTALL_LOCK" "$BACKUP_LOCK"
  /usr/bin/chown claude-deploy:claude-deploy "$SCHEDULE_LOCK" "$INSTALL_LOCK" "$BACKUP_LOCK"
  /usr/bin/chmod 0600 "$SCHEDULE_LOCK" "$INSTALL_LOCK" "$BACKUP_LOCK"
  exec {install_lock_fd}>"$INSTALL_LOCK"
  /usr/bin/flock --nonblock --exclusive "$install_lock_fd" || fail 'another schedule installation is active' 75
  exec {schedule_lock_fd}>"$SCHEDULE_LOCK"
  /usr/bin/flock --nonblock --exclusive "$schedule_lock_fd" || fail 'schedule installation or execution is already active' 75

  trap disable_unproven_timer EXIT
  /usr/bin/systemctl stop "$TIMER_NAME" >/dev/null 2>&1 || true
  /usr/bin/install -o root -g root -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
  /usr/bin/install -o root -g root -m 0644 "$TIMER_SOURCE" "$TIMER_TARGET"
  verify_hash "$SERVICE_TARGET" "$SERVICE_SHA256"
  verify_hash "$TIMER_TARGET" "$TIMER_SHA256"
  [[ "$(/usr/bin/stat -c '%U:%G:%a' -- "$SERVICE_TARGET")" == 'root:root:644' ]] || fail 'installed service metadata mismatch'
  [[ "$(/usr/bin/stat -c '%U:%G:%a' -- "$TIMER_TARGET")" == 'root:root:644' ]] || fail 'installed timer metadata mismatch'
  /usr/bin/systemctl daemon-reload
  /usr/bin/flock --unlock "$schedule_lock_fd"
  exec {schedule_lock_fd}>&-

  # The broken legacy cron remains disabled; only this proven timer is enabled.
  prove_supabase_backup_schedule
  trap - EXIT
}

main "$@"
