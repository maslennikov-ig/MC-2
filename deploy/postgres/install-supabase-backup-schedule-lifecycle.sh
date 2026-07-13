#!/usr/bin/bash

# Sourced by install-supabase-backup-schedule.sh after its local preflight.
# The caller supplies fail(), read_pointer_generation(), SYSTEMCTL, RUNUSER,
# SERVICE_NAME, TIMER_NAME, BACKUP_ROOT, RESTORE_COMMAND, RUN_ID, and
# installation_proven.

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
