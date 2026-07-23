#!/usr/bin/env bash
set -euo pipefail

umask 077

readonly NODE_UID='1001'
readonly NODE_GID='1001'
readonly CONTROLLER_UID='1000'
readonly CONTROLLER_GID='1000'
readonly PYTHON_BIN='/usr/bin/python3'
readonly RESUME_CONTROLLER="$(dirname "$(realpath -e -- "$0")")/q12-writer-resume.py"
readonly DEFAULT_LOCK_FILE='/run/megacampus-qdrant-source-recovery/source-recovery.lock'
readonly DEFAULT_Q12_CUTOVER_LOCK_FILE='/opt/megacampus/backups/q12/cutover.lock'
readonly WRITER_QUIESCE_SCHEMA='megacampus.q12.writer-quiesce/v1'
readonly WRITER_RECOVERY_STATE_SCHEMA='megacampus.q12.writer-recovery-state/v1'
readonly FINAL_WRITER_MANIFEST_SCHEMA='megacampus.q12.final-writer-manifest/v1'
readonly WRITER_HANDOFF_STATE_SCHEMA='megacampus.q12.writer-handoff-state/v1'
readonly WRITER_ROLLBACK_STATE_SCHEMA='megacampus.q12.writer-rollback-state/v1'
readonly WRITER_RESUME_AUTHORITY_SCHEMA='megacampus.q12.writer-resume-authority/v1'
readonly WRITER_RESUME_STATE_SCHEMA='megacampus.q12.writer-resume-state/v1'
readonly CUTOVER_CHECKPOINT_SCHEMA='megacampus.q12.cutover-checkpoint/v1'
readonly PROBE_RECEIPT_SCHEMA='megacampus.q12.database-barrier-probes/v1'
readonly COMPOSE_PROJECT_LABEL='com.docker.compose.project'
readonly COMPOSE_SERVICE_LABEL='com.docker.compose.service'
readonly COMPOSE_CONFIG_FILES_LABEL='com.docker.compose.project.config_files'
readonly COMPOSE_WORKING_DIR_LABEL='com.docker.compose.project.working_dir'
# Exact label identities. Production allows one same-colour API/Web alternative
# and requires every fixed megacampus service below. Name-substring discovery is
# deliberately absent; docker compose down is forbidden.
readonly -a COMPOSE_WRITER_IDENTITIES=(
  'megacampus-blue:api'
  'megacampus-blue:web'
  'megacampus-green:api'
  'megacampus-green:web'
  'megacampus:worker'
  'megacampus:worker-stage6'
  'megacampus:worker-stage7'
  'megacampus:api-dev'
  'megacampus:web-dev'
  'megacampus:worker-dev'
  'megacampus:worker-stage6-dev'
  'megacampus:worker-stage7-dev'
)
readonly -a WRITER_SERVICES=(
  megacampus-api
  megacampus-api-blue
  megacampus-api-green
  megacampus-worker
  megacampus-worker-stage6
  megacampus-worker-stage7
)

fail() {
  printf 'source-recovery host wrapper: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: source-recovery-run.sh [--stop-writers] \
  [--operation forward|rollback] \
  [--resume-from execute|verify|apply-dispositions|verify-dispositions] \
  --run-id UUID \
  --project-directory PATH --env-file PATH \
  --manifest PATH --progress-directory PATH \
  --development-root PATH --production-root PATH

Writer-only resume: source-recovery-run.sh \
  --operation resume-writers-only --resume-mode forward|rollback --run-id UUID

Writer-only quiesce: source-recovery-run.sh \
  --operation quiesce-writers-only --run-id UUID

Q12 Compose quiesce: --database-barrier-receipt PATH
External Q12 quiesce: --external-quiesce-manifest PATH with inherited
Q12_EXTERNAL_QUIESCE_LEASE_FD.

Fresh plan only: --plan-input PATH --capability-directory PATH

By default, any active writer service blocks the run. --stop-writers explicitly
authorizes this wrapper to record, stop, and restore the exact ten-writer state.
Fresh runs require absent manifest/journal state. --resume-from requires reviewed
owner-only state, never replans, and always reruns copy verification before any
disposition command.
USAGE
}

if [[ $# -eq 1 && (${1:-} == -h || ${1:-} == --help) ]]; then
  usage
  exit 0
fi

local_test="${SOURCE_RECOVERY_LOCAL_TEST:-0}"
if [[ $local_test == 1 ]]; then
  writer_backend="${SOURCE_RECOVERY_WRITER_BACKEND:-systemd}"
  SYSTEMCTL_BIN="${SOURCE_RECOVERY_SYSTEMCTL_BIN:-}"
  DOCKER_BIN="${SOURCE_RECOVERY_DOCKER_BIN:?local test docker path is required}"
  COMPOSE_BIN="${SOURCE_RECOVERY_COMPOSE_BIN:?local test Compose path is required}"
  CURL_BIN="${SOURCE_RECOVERY_CURL_BIN:-/usr/bin/curl}"
  LOCK_FILE="${SOURCE_RECOVERY_LOCK_FILE:?local test lock path is required}"
  Q12_CUTOVER_LOCK_FILE="${SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE:-$LOCK_FILE.q12-cutover}"
  Q12_RUN_ROOT_OVERRIDE="${SOURCE_RECOVERY_Q12_RUN_ROOT:-}"
  resume_fault_point="${SOURCE_RECOVERY_RESUME_FAULT_POINT:-}"
  quiesce_fault_point="${SOURCE_RECOVERY_QUIESCE_FAULT_POINT:-}"
  expected_uid="${SOURCE_RECOVERY_EXPECTED_UID:?local test UID is required}"
  expected_gid="${SOURCE_RECOVERY_EXPECTED_GID:?local test GID is required}"
  controller_uid="${SOURCE_RECOVERY_CONTROLLER_UID:?local test controller UID is required}"
  controller_gid="${SOURCE_RECOVERY_CONTROLLER_GID:?local test controller GID is required}"
  emit_bin_override="${SOURCE_RECOVERY_EMIT_BIN:-}"
  restore_verification_attempts=2
  restore_verification_delay=0
else
  [[ -z ${SOURCE_RECOVERY_WRITER_BACKEND:-}${SOURCE_RECOVERY_SYSTEMCTL_BIN:-}${SOURCE_RECOVERY_DOCKER_BIN:-}${SOURCE_RECOVERY_COMPOSE_BIN:-}${SOURCE_RECOVERY_CURL_BIN:-}${SOURCE_RECOVERY_LOCK_FILE:-}${SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE:-}${SOURCE_RECOVERY_Q12_RUN_ROOT:-}${SOURCE_RECOVERY_RESUME_FAULT_POINT:-}${SOURCE_RECOVERY_QUIESCE_FAULT_POINT:-}${SOURCE_RECOVERY_EXPECTED_UID:-}${SOURCE_RECOVERY_EXPECTED_GID:-}${SOURCE_RECOVERY_CONTROLLER_UID:-}${SOURCE_RECOVERY_CONTROLLER_GID:-}${SOURCE_RECOVERY_EMIT_BIN:-} ]] ||
    fail 'test-only command, lock, and UID overrides require SOURCE_RECOVERY_LOCAL_TEST=1'
  [[ $EUID -eq 0 ]] || fail 'production source recovery must run as root'
  SYSTEMCTL_BIN='/usr/bin/systemctl'
  DOCKER_BIN='/usr/bin/docker'
  COMPOSE_BIN="$(dirname "$(realpath -e -- "$0")")/operator-compose.sh"
  CURL_BIN='/usr/bin/curl'
  LOCK_FILE="$DEFAULT_LOCK_FILE"
  Q12_CUTOVER_LOCK_FILE="$DEFAULT_Q12_CUTOVER_LOCK_FILE"
  Q12_RUN_ROOT_OVERRIDE=''
  resume_fault_point=''
  quiesce_fault_point=''
  expected_uid="$NODE_UID"
  expected_gid="$NODE_GID"
  controller_uid="$CONTROLLER_UID"
  controller_gid="$CONTROLLER_GID"
  emit_bin_override=''
  restore_verification_attempts=30
  restore_verification_delay=1
  writer_backend='compose'
fi
readonly SYSTEMCTL_BIN DOCKER_BIN COMPOSE_BIN CURL_BIN LOCK_FILE Q12_CUTOVER_LOCK_FILE Q12_RUN_ROOT_OVERRIDE resume_fault_point quiesce_fault_point expected_uid expected_gid controller_uid controller_gid emit_bin_override writer_backend restore_verification_attempts restore_verification_delay

case "$writer_backend" in
  compose) ;;
  systemd)
    [[ $local_test == 1 ]] || fail 'the systemd writer backend is test-only compatibility'
    [[ -x $SYSTEMCTL_BIN ]] || fail 'systemctl executable is unavailable'
    ;;
  *) fail 'writer backend must be compose or test-only systemd' ;;
esac
[[ -x $DOCKER_BIN ]] || fail 'Docker executable is unavailable'
[[ -x $COMPOSE_BIN ]] || fail 'operator Compose wrapper is unavailable'
[[ -x $CURL_BIN ]] || fail 'curl executable is unavailable'
[[ -x $PYTHON_BIN ]] || fail 'Python executable is unavailable'
[[ -f $RESUME_CONTROLLER && ! -L $RESUME_CONTROLLER && -r $RESUME_CONTROLLER ]] ||
  fail 'writer resume controller is unavailable or unsafe'
if [[ $local_test != 1 ]]; then
  [[ $(stat -c '%u:%g:%a' -- "$RESUME_CONTROLLER") == '0:0:644' ]] ||
    fail 'writer resume controller must have exact root ownership and mode 0644'
fi
[[ $expected_uid =~ ^[0-9]+$ ]] || fail 'expected source-recovery UID must be numeric'
[[ $expected_gid =~ ^[0-9]+$ ]] || fail 'expected source-recovery GID must be numeric'
[[ $controller_uid =~ ^[0-9]+$ ]] || fail 'expected controller UID must be numeric'
[[ $controller_gid =~ ^[0-9]+$ ]] || fail 'expected controller GID must be numeric'
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_CONTEXT:-} ]] ||
  fail 'remote or selected Docker contexts are forbidden'
docker_context="$($DOCKER_BIN context show)"
[[ $docker_context =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]] ||
  fail 'active Docker context name is invalid'
docker_endpoint="$($DOCKER_BIN context inspect "$docker_context" --format '{{(index .Endpoints "docker").Host}}')"
[[ $docker_endpoint == unix:///* ]] ||
  fail 'active Docker context must use a local Unix socket'
# Caller overrides are rejected above. Pin every later plain `docker compose`
# invocation to the exact context whose endpoint was verified here.
export DOCKER_CONTEXT="$docker_context"

stop_writers=0
operation='forward'
resume_mode=''
resume_from=''
run_id=''
project_directory=''
env_file=''
plan_input=''
manifest=''
progress_directory=''
development_root=''
production_root=''
capability_directory=''
database_barrier_receipt=''
external_quiesce_manifest=''
q12_db_capability_file=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop-writers)
      stop_writers=1
      shift
      ;;
    --operation|--resume-mode|--resume-from|--run-id|--project-directory|--env-file|--plan-input|--manifest|--progress-directory|--development-root|--production-root|--capability-directory|--database-barrier-receipt|--external-quiesce-manifest|--q12-db-capability-file)
      [[ $# -ge 2 && -n $2 ]] || fail "$1 requires a value"
      option="$1"
      value="$2"
      shift 2
      case "$option" in
        --operation) operation="$value" ;;
        --resume-mode) resume_mode="$value" ;;
        --resume-from) resume_from="$value" ;;
        --run-id) run_id="$value" ;;
        --project-directory) project_directory="$value" ;;
        --env-file) env_file="$value" ;;
        --plan-input) plan_input="$value" ;;
        --manifest) manifest="$value" ;;
        --progress-directory) progress_directory="$value" ;;
        --development-root) development_root="$value" ;;
        --production-root) production_root="$value" ;;
        --capability-directory) capability_directory="$value" ;;
        --database-barrier-receipt) database_barrier_receipt="$value" ;;
        --external-quiesce-manifest) external_quiesce_manifest="$value" ;;
        --q12-db-capability-file) q12_db_capability_file="$value" ;;
      esac
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -z $external_quiesce_manifest || $stop_writers -eq 0 ]] ||
  fail '--external-quiesce-manifest cannot be combined with --stop-writers'

# Production runs are UUIDv4; the accepted D5J joined fixture freezes UUIDv5 run
# ids derived from the run-root path (q12-writer-resume.py:21-23), so accept both.
[[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
  fail '--run-id must be a UUIDv4 or UUIDv5'
case "$operation" in
  forward|rollback|resume-writers-only|quiesce-writers-only) ;;
  *) fail '--operation must be forward, rollback, resume-writers-only, or quiesce-writers-only' ;;
esac
if [[ $operation == resume-writers-only ]]; then
  case "$resume_mode" in forward|rollback) ;; *) fail 'resume-writers-only requires --resume-mode forward or rollback' ;; esac
  [[ $stop_writers -eq 0 && -z $resume_from && -z $project_directory && -z $env_file &&
     -z $plan_input && -z $manifest && -z $progress_directory && -z $development_root &&
     -z $production_root && -z $capability_directory && -z $database_barrier_receipt &&
     -z $external_quiesce_manifest && -z $q12_db_capability_file ]] ||
    fail 'resume-writers-only accepts only --operation, --resume-mode, and --run-id'
else
  [[ -z $resume_mode ]] || fail '--resume-mode is accepted only by resume-writers-only'
fi
if [[ $operation == quiesce-writers-only ]]; then
  [[ $stop_writers -eq 0 && -z $resume_mode && -z $resume_from && -z $project_directory &&
     -z $env_file && -z $plan_input && -z $manifest && -z $progress_directory &&
     -z $development_root && -z $production_root && -z $capability_directory &&
     -z $database_barrier_receipt && -z $external_quiesce_manifest &&
     -z $q12_db_capability_file ]] ||
    fail 'quiesce-writers-only accepts only --operation and --run-id'
fi
case "$resume_from" in
  ''|execute|verify|apply-dispositions|verify-dispositions) ;;
  *) fail '--resume-from must name an approved durable recovery continuation' ;;
esac
[[ $operation != rollback || -z $resume_from ]] ||
  fail 'rollback cannot be combined with a forward resume stage'
fresh_plan=0
if [[ $operation == forward && -z $resume_from ]]; then
  fresh_plan=1
fi
readonly fresh_plan

run_writer_resume_only() {
  local resume_run_root
  if [[ $local_test == 1 ]]; then
    resume_run_root="$Q12_RUN_ROOT_OVERRIDE"
    # The accepted D5J joined fixture roots at the materializer's /tmp/mc2-q12-d5-root-*
    # directory (q12-retained-barrier-runner.py); the production branch is untouched.
    [[ $resume_run_root == /tmp/mc2-source-recovery-wrapper-*/backups/q12/$run_id ||
       $resume_run_root == /tmp/mc2-q12-d5-root-* ]] ||
      fail 'protected resume test run root is invalid'
    case "$resume_fault_point" in ''|after-first-start|before-receipt|after-terminal-before-receipt|after-terminal-temp-fsync|after-terminal-rename) ;; *) fail 'unknown protected resume fault point' ;; esac
  else
    resume_run_root="/opt/megacampus/backups/q12/$run_id"
  fi
  [[ $resume_run_root == /* && -d $resume_run_root && ! -L $resume_run_root &&
     $(realpath -e -- "$resume_run_root") == "$resume_run_root" ]] ||
    fail 'writer resume run root must be a canonical non-symlink directory'
  [[ $(stat -c '%u:%g:%a' -- "$resume_run_root") == "$controller_uid:$controller_gid:700" ]] ||
    fail 'writer resume run root must have the exact controller owner and mode 0700'
  local resume_lock_directory
  resume_lock_directory="$(dirname -- "$LOCK_FILE")"
  if [[ $local_test == 1 ]]; then
    mkdir -p -- "$resume_lock_directory"
    chmod 0700 -- "$resume_lock_directory"
  else
    install -d -o root -g root -m 0700 -- "$resume_lock_directory"
  fi
  exec {resume_host_lock_fd}>"$LOCK_FILE"
  flock -n "$resume_host_lock_fd" || fail 'another source-recovery run holds the host lock'

  local resume_controller_pid resume_controller_status
  /usr/bin/env -i \
    PATH='/usr/sbin:/usr/bin:/sbin:/bin' \
    LC_ALL='C' LANG='C' HOME='/root' Q12_EXTERNAL_QUIESCE_LEASE_FD='9' \
    "$PYTHON_BIN" "$RESUME_CONTROLLER" "$resume_mode" "$run_id" "$resume_run_root" "$DOCKER_BIN" \
    "$Q12_CUTOVER_LOCK_FILE" "$controller_uid" "$controller_gid" "$local_test" "$resume_fault_point" \
    {resume_host_lock_fd}>&- </dev/null &
  resume_controller_pid=$!
  trap 'kill -TERM "$resume_controller_pid" 2>/dev/null || true' TERM
  trap 'kill -INT "$resume_controller_pid" 2>/dev/null || true' INT
  while true; do
    if wait "$resume_controller_pid"; then
      resume_controller_status=0
      break
    else
      resume_controller_status=$?
    fi
    kill -0 "$resume_controller_pid" 2>/dev/null || break
  done
  trap - TERM INT
  return "$resume_controller_status"
}

run_writer_quiesce_only() {
  local quiesce_run_root
  if [[ $local_test == 1 ]]; then
    quiesce_run_root="$Q12_RUN_ROOT_OVERRIDE"
    [[ $quiesce_run_root == /tmp/mc2-source-recovery-wrapper-*/backups/q12/$run_id ]] ||
      fail 'protected quiesce test run root is invalid'
  else
    quiesce_run_root="/opt/megacampus/backups/q12/$run_id"
  fi
  [[ $quiesce_run_root == /* && -d $quiesce_run_root && ! -L $quiesce_run_root &&
     $(realpath -e -- "$quiesce_run_root") == "$quiesce_run_root" ]] ||
    fail 'writer quiesce run root must be a canonical non-symlink directory'
  [[ $(stat -c '%u:%g:%a' -- "$quiesce_run_root") == "$controller_uid:$controller_gid:700" ]] ||
    fail 'writer quiesce run root must have the exact controller owner and mode 0700'
  local quiesce_lock_directory
  quiesce_lock_directory="$(dirname -- "$LOCK_FILE")"
  if [[ $local_test == 1 ]]; then
    mkdir -p -- "$quiesce_lock_directory"
    chmod 0700 -- "$quiesce_lock_directory"
  else
    install -d -o root -g root -m 0700 -- "$quiesce_lock_directory"
  fi
  exec {quiesce_host_lock_fd}>"$LOCK_FILE"
  flock -n "$quiesce_host_lock_fd" || fail 'another source-recovery run holds the host lock'
  /usr/bin/env -i \
    PATH='/usr/sbin:/usr/bin:/sbin:/bin' \
    LC_ALL='C' LANG='C' HOME='/root' Q12_EXTERNAL_QUIESCE_LEASE_FD='9' \
    "$PYTHON_BIN" "$RESUME_CONTROLLER" quiesce "$run_id" "$quiesce_run_root" "$DOCKER_BIN" \
    "$Q12_CUTOVER_LOCK_FILE" "$controller_uid" "$controller_gid" "$local_test" "$quiesce_fault_point" "$CURL_BIN" \
    {quiesce_host_lock_fd}>&- </dev/null
}

if [[ $operation == resume-writers-only ]]; then
  run_writer_resume_only
  exit 0
fi
if [[ $operation == quiesce-writers-only ]]; then
  run_writer_quiesce_only
  exit 0
fi

require_real_path() {
  local value="$1"
  local label="$2"
  [[ $value == /* && -e $value && ! -L $value ]] || fail "$label must be an existing absolute non-symlink path"
  [[ $(realpath -e -- "$value") == "$value" ]] || fail "$label must be normalized and canonical"
}

require_real_path "$project_directory" 'project directory'
require_real_path "$env_file" 'Compose environment file'
require_real_path "$progress_directory" 'progress directory'
require_real_path "$development_root" 'development upload root'
require_real_path "$production_root" 'production upload root'
[[ -f $env_file && -r $env_file ]] || fail 'Compose environment file must be a readable file'
[[ -d $progress_directory && -d $development_root && -d $production_root ]] ||
  fail 'progress and upload-root paths must be directories'
compose_file="$project_directory/docker-compose.infra.yml"
[[ -f $compose_file && ! -L $compose_file ]] || fail 'project Compose file is missing or unsafe'

[[ $manifest == /* && $(realpath -m -- "$manifest") == "$manifest" ]] ||
  fail 'manifest path must be normalized and absolute'
state_directory="$(dirname -- "$manifest")"
require_real_path "$state_directory" 'source-recovery state directory'
[[ $manifest == "$state_directory/manifest.json" ]] || fail 'manifest must be state/manifest.json'
[[ $progress_directory == "$state_directory/progress" ]] ||
  fail 'progress directory must be the state/progress sibling of the manifest'

owner_group_mode() {
  stat -c '%u:%g:%a' -- "$1"
}

validate_external_quiesce_lease() {
  lease_fd="${Q12_EXTERNAL_QUIESCE_LEASE_FD:-}"
  [[ $lease_fd =~ ^[0-9]+$ ]] && ((lease_fd >= 3)) && [[ -e /proc/self/fd/$lease_fd ]] ||
    fail 'external quiesce requires an inherited lease FD'
  [[ $Q12_CUTOVER_LOCK_FILE == /* && -f $Q12_CUTOVER_LOCK_FILE && ! -L $Q12_CUTOVER_LOCK_FILE ]] ||
    fail 'external quiesce lease requires the exact canonical lock file'
  [[ $(realpath -e -- "$Q12_CUTOVER_LOCK_FILE") == "$Q12_CUTOVER_LOCK_FILE" ]] ||
    fail 'external quiesce lease requires the exact canonical lock file'
  [[ $(owner_group_mode "$Q12_CUTOVER_LOCK_FILE") == "$controller_uid:$controller_gid:600" ]] ||
    fail 'external quiesce lease lock identity must match the controller owner and mode 0600'
  [[ $(readlink -e -- "/proc/self/fd/$lease_fd") == "$Q12_CUTOVER_LOCK_FILE" ]] ||
    fail 'external quiesce lease FD must reference the exact cutover lock'
  [[ $(stat -Lc '%d:%i' -- "/proc/self/fd/$lease_fd") == $(stat -c '%d:%i' -- "$Q12_CUTOVER_LOCK_FILE") ]] ||
    fail 'external quiesce lease FD identity changed'
  # Re-locking the inherited descriptor would acquire an unlocked descriptor and
  # prove nothing. Close it only inside this probe, then require a fresh open to
  # contend with the parent shell's exact same-open-file-description lock.
  if (
    eval "exec ${lease_fd}>&-"
    flock -n "$Q12_CUTOVER_LOCK_FILE" true
  ); then
    fail 'external quiesce lease FD is not held'
  fi
}

q12_run_id=''
if [[ -n $q12_db_capability_file ]]; then
  [[ $q12_db_capability_file == /* && -f $q12_db_capability_file && ! -L $q12_db_capability_file ]] ||
    fail 'Q12 database capability must be an existing absolute non-symlink file'
  [[ $(realpath -e -- "$q12_db_capability_file") == "$q12_db_capability_file" ]] ||
    fail 'Q12 database capability path must be canonical'
  expected_q12_capability_identity="$controller_uid:$controller_gid:400"
  [[ $(owner_group_mode "$q12_db_capability_file") == "$expected_q12_capability_identity" ]] ||
    fail 'Q12 database capability must have the exact owner and mode 0400'
  if [[ $local_test == 1 ]]; then
    [[ $q12_db_capability_file =~ /backups/q12/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/secrets/db-capability$ ]] ||
      fail 'Q12 database capability must use the active run path'
  else
    [[ $q12_db_capability_file =~ ^/opt/megacampus/backups/q12/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/secrets/db-capability$ ]] ||
      fail 'Q12 database capability must use the fixed active run path'
  fi
  q12_run_id="${BASH_REMATCH[1]}"
  [[ -n $database_barrier_receipt || -n $external_quiesce_manifest ]] ||
    fail 'Q12 database capability requires a durable writer-quiesce contract'
  [[ $stop_writers -eq 0 ]] ||
    fail 'Q12 --stop-writers is forbidden; use quiesce-writers-only and --external-quiesce-manifest'
  [[ -n $external_quiesce_manifest ]] ||
    fail 'standalone Q12 source recovery requires --external-quiesce-manifest from quiesce-writers-only'
elif [[ -n $database_barrier_receipt || -n $external_quiesce_manifest ]]; then
  fail 'Q12 writer quiesce requires --q12-db-capability-file'
fi
readonly q12_run_id
q12_run_root=''
q12_probe_receipt=''
if [[ -n $q12_run_id ]]; then
  q12_run_root="$(dirname "$(dirname "$q12_db_capability_file")")"
  [[ -d $q12_run_root && ! -L $q12_run_root && $(realpath -e -- "$q12_run_root") == "$q12_run_root" ]] ||
    fail 'Q12 run root must be a canonical controller directory'
  [[ $(owner_group_mode "$q12_run_root") == "$controller_uid:$controller_gid:700" ]] ||
    fail 'Q12 run root must have the exact controller owner and mode 0700'
  q12_secrets_directory="$(dirname "$q12_db_capability_file")"
  [[ -d $q12_secrets_directory && ! -L $q12_secrets_directory && $(realpath -e -- "$q12_secrets_directory") == "$q12_secrets_directory" ]] ||
    fail 'Q12 secrets directory must be canonical'
  [[ $(owner_group_mode "$q12_secrets_directory") == "$controller_uid:$controller_gid:700" ]] ||
    fail 'Q12 secrets directory must have the exact controller owner and mode 0700'
  if [[ -n $database_barrier_receipt ]]; then
    [[ $database_barrier_receipt == "$q12_run_root/database-barrier-receipt.json" ]] ||
      fail 'database barrier receipt must use the active Q12 run root'
  fi
  q12_probe_receipt="$q12_run_root/database-barrier-probe-receipt.json"
fi
readonly q12_run_root q12_probe_receipt

journal="$progress_directory/journal.json"
if [[ $fresh_plan -eq 1 ]]; then
  require_real_path "$plan_input" 'protected plan input'
  require_real_path "$capability_directory" 'capability directory'
  [[ -f $plan_input && -d $capability_directory ]] ||
    fail 'fresh plan input and capability paths have invalid types'
  [[ ! -e $manifest && ! -e $journal ]] ||
    fail 'fresh recovery requires absent manifest and journal state'
else
  [[ -f $manifest && ! -L $manifest && $(owner_group_mode "$manifest") == "$expected_uid:$expected_gid:400" ]] ||
    fail 'resume requires an owner-only immutable manifest'
  [[ -f $journal && ! -L $journal && $(owner_group_mode "$journal") == "$expected_uid:$expected_gid:600" ]] ||
    fail 'resume requires an owner-only progress journal'
  # Compose interpolates every profile service even when `run` selects only a
  # verifier/executor. These non-authoritative placeholders are ignored by all
  # resume commands and add no writable path beyond the existing state bind.
  plan_input='/dev/null'
  capability_directory="$state_directory"
fi

[[ $(owner_group_mode "$state_directory") == "$expected_uid:$expected_gid:700" ]] ||
  fail 'state directory must be owned by UID:GID 1001:1001 with mode 0700'
[[ $(owner_group_mode "$progress_directory") == "$expected_uid:$expected_gid:700" ]] ||
  fail 'progress directory must be owned by UID:GID 1001:1001 with mode 0700'

contains_path() {
  local parent="$1"
  local child="$2"
  [[ $child == "$parent" || $child == "$parent/"* ]]
}

if [[ $fresh_plan -eq 1 ]]; then
  [[ $(owner_group_mode "$capability_directory") == "$expected_uid:$expected_gid:700" ]] ||
    fail 'capability directory must be owned by UID:GID 1001:1001 with mode 0700'
  [[ $(owner_group_mode "$plan_input") == "$expected_uid:$expected_gid:600" ]] ||
    fail 'protected plan input must be owned by UID:GID 1001:1001 with mode 0600'
  [[ -z $(find "$capability_directory" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
    fail 'capability directory must be empty before planning'
  for root in "$development_root" "$production_root"; do
    if contains_path "$root" "$capability_directory" || contains_path "$capability_directory" "$root"; then
      fail 'capability directory must be outside and not a parent of either upload root'
    fi
    [[ $(stat -c '%d' -- "$capability_directory") == $(stat -c '%d' -- "$root") ]] ||
      fail 'capability directory and both upload roots must share one filesystem device'
  done
fi

lock_directory="$(dirname -- "$LOCK_FILE")"
if [[ $local_test == 1 ]]; then
  mkdir -p -- "$lock_directory"
  chmod 0700 -- "$lock_directory"
else
  install -d -o root -g root -m 0700 -- "$lock_directory"
fi
exec {lock_fd}>"$LOCK_FILE"
flock -n "$lock_fd" || fail 'another source-recovery run holds the host lock'

declare -A prior_state=()
active_services=()
writer_inventory='[]'
if [[ -n $q12_run_root ]]; then
  quiesce_manifest="$q12_run_root/writer-quiesce-${q12_run_id}.json"
  writer_recovery_state="$q12_run_root/writer-recovery-state-${q12_run_id}.json"
else
  quiesce_manifest="$progress_directory/writer-quiesce-${run_id}.json"
  writer_recovery_state=''
fi
readonly quiesce_manifest writer_recovery_state
lease_fd=''
writer_mutation_started=0

require_controller_file() {
  local path="$1"
  local label="$2"
  [[ $path == /* && -f $path && ! -L $path && $(realpath -e -- "$path") == "$path" ]] ||
    fail "$label must be an existing canonical non-symlink file"
  [[ $(owner_group_mode "$path") == "$controller_uid:$controller_gid:400" ]] ||
    fail "$label must be owned by the exact controller UID:GID with mode 0400"
}

open_controller_file() {
  local path="$1" label="$2"
  local -n opened_fd_result="$3" identity_result="$4" sha256_result="$5"
  local before after descriptor opened_fd
  require_controller_file "$path" "$label"
  before="$(stat -c '%d:%i:%u:%g:%a:%F' -- "$path")"
  exec {opened_fd}<"$path"
  after="$(stat -c '%d:%i:%u:%g:%a:%F' -- "$path")"
  descriptor="$(stat -Lc '%d:%i:%u:%g:%a:%F' -- "/proc/self/fd/$opened_fd")"
  if [[ -L $path || $before != "$after" || $after != "$descriptor" || $descriptor != *':regular file' ]]; then
    eval "exec ${opened_fd}<&-"
    fail "$label identity changed while opening"
  fi
  opened_fd_result="$opened_fd"
  identity_result="$descriptor"
  sha256_result="$(sha256sum "/proc/self/fd/$opened_fd" | awk '{print $1}')"
  [[ $sha256_result =~ ^[a-f0-9]{64}$ ]] || {
    eval "exec ${opened_fd}<&-"
    fail "$label hash could not be captured"
  }
}

open_operator_file() {
  local path="$1" label="$2" expected_mode="$3"
  local -n opened_fd_result="$4" identity_result="$5" sha256_result="$6"
  local before after descriptor opened_fd
  [[ $path == /* && -f $path && ! -L $path && $(realpath -e -- "$path") == "$path" ]] ||
    fail "$label must be an existing canonical non-symlink file"
  [[ $(owner_group_mode "$path") == "$expected_uid:$expected_gid:$expected_mode" ]] ||
    fail "$label must have the exact operator owner and mode $expected_mode"
  before="$(stat -c '%d:%i:%u:%g:%a:%F' -- "$path")"
  exec {opened_fd}<"$path"
  after="$(stat -c '%d:%i:%u:%g:%a:%F' -- "$path")"
  descriptor="$(stat -Lc '%d:%i:%u:%g:%a:%F' -- "/proc/self/fd/$opened_fd")"
  if [[ -L $path || $before != "$after" || $after != "$descriptor" || $descriptor != *':regular file' ]]; then
    eval "exec ${opened_fd}<&-"
    fail "$label identity changed while opening"
  fi
  opened_fd_result="$opened_fd"
  identity_result="$descriptor"
  sha256_result="$(sha256sum "/proc/self/fd/$opened_fd" | awk '{print $1}')"
  [[ $sha256_result =~ ^[a-f0-9]{64}$ ]] || {
    eval "exec ${opened_fd}<&-"
    fail "$label hash could not be captured"
  }
}

verify_controller_file_unchanged() {
  local path="$1" label="$2" expected_identity="$3" expected_sha256="$4"
  local check_fd='' check_identity='' check_sha256=''
  open_controller_file "$path" "$label" check_fd check_identity check_sha256
  if [[ $check_identity != "$expected_identity" || $check_sha256 != "$expected_sha256" ]]; then
    eval "exec ${check_fd}<&-"
    fail "$label changed after validation"
  fi
  eval "exec ${check_fd}<&-"
}

verify_operator_file_unchanged() {
  local path="$1" label="$2" expected_mode="$3" expected_identity="$4" expected_sha256="$5"
  local check_fd='' check_identity='' check_sha256=''
  open_operator_file "$path" "$label" "$expected_mode" check_fd check_identity check_sha256
  if [[ $check_identity != "$expected_identity" || $check_sha256 != "$expected_sha256" ]]; then
    eval "exec ${check_fd}<&-"
    fail "$label changed after validation"
  fi
  eval "exec ${check_fd}<&-"
}

q12_capability_identity=''
q12_capability_sha256=''
if [[ -n $q12_run_id ]]; then
  q12_capability_fd=''
  open_controller_file "$q12_db_capability_file" 'Q12 database capability' \
    q12_capability_fd q12_capability_identity q12_capability_sha256
  eval "exec ${q12_capability_fd}<&-"
fi

barrier_receipt_identity=''
barrier_receipt_sha256=''
read_barrier_receipt() {
  local receipt_fd=''
  open_controller_file "$database_barrier_receipt" 'database barrier receipt' \
    receipt_fd barrier_receipt_identity barrier_receipt_sha256
  jq -e --arg run "$q12_run_id" '
    (keys | sort) == (["schema_version","run_id","state","zero_guard_residue",
      "expected_catalog_sha256","last_command","rollback_probes_verified",
      "probe_receipt_sha256"] | sort) and
    .schema_version == "megacampus.q12.database-barrier-receipt/v1" and
    .run_id == $run and
    .state == "recovery_ready_guarded" and .zero_guard_residue == false and
    .last_command == "prepare-recovery" and .rollback_probes_verified == true and
    (.probe_receipt_sha256 | test("^[a-f0-9]{64}$")) and
    (.expected_catalog_sha256 | test("^[a-f0-9]{64}$"))
  ' "/proc/self/fd/$receipt_fd" >/dev/null || {
    eval "exec ${receipt_fd}<&-"
    fail 'database barrier receipt is not exact recovery_ready_guarded state'
  }
  barrier_json="$(jq -c '{state,zero_guard_residue,expected_catalog_sha256,probe_receipt_sha256}' "/proc/self/fd/$receipt_fd")"
  eval "exec ${receipt_fd}<&-"
}

probe_receipt_identity=''
probe_receipt_sha256=''
validate_probe_receipt() {
  local expected_catalog_sha256="$1"
  local receipt_fd=''
  open_controller_file "$q12_probe_receipt" 'database barrier probe receipt' \
    receipt_fd probe_receipt_identity probe_receipt_sha256
  jq -e --arg schema "$PROBE_RECEIPT_SCHEMA" --arg run "$q12_run_id" \
    --arg catalog "$expected_catalog_sha256" '
    (keys | sort) == (["schema_version","run_id","expected_catalog_sha256","completed_at","probes","residue"] | sort) and
    .schema_version == $schema and .run_id == $run and .expected_catalog_sha256 == $catalog and
    (.completed_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$")) and
    .probes == {
      postgrest_anon:"rejected",postgrest_authenticated:"rejected",
      postgrest_service_role_without_capability:"rejected",
      postgrest_service_role_with_capability:"rolled_back",
      postgrest_preference_applied:"tx=rollback",
      auth_profile:"rejected_zero_residue",
      storage_object:"rejected_zero_metadata_zero_bytes",
      cron_rpc:"rejected_exact_jobs_unchanged",
      pg_net_rpc:"rejected_zero_queue_zero_external_request",
      direct_supervisor:"rolled_back"
    } and
    .residue == {
      guard_probe_rows:0,auth_rows:0,storage_metadata_rows:0,storage_object_bytes:0,
      cron_job_set_unchanged:true,pg_net_queue_rows:0,external_requests:0
    }
  ' "/proc/self/fd/$receipt_fd" >/dev/null || {
    eval "exec ${receipt_fd}<&-"
    fail 'database barrier probe receipt is incomplete or cross-wired'
  }
  eval "exec ${receipt_fd}<&-"
}

quiesce_json=''
quiesce_manifest_identity=''
quiesce_manifest_sha256=''
read_quiesce_manifest() {
  local mode="$1" expected_catalog_sha256="${2:-}" manifest_fd=''
  open_controller_file "$quiesce_manifest" 'durable writer quiesce manifest' \
    manifest_fd quiesce_manifest_identity quiesce_manifest_sha256
  jq -e --arg schema "$WRITER_QUIESCE_SCHEMA" --arg run "$q12_run_id" \
    --arg mode "$mode" --arg catalog "$expected_catalog_sha256" '
    (keys | sort) == (["schema_version","run_id","status","barrier","writers"] | sort) and
    .schema_version == $schema and .run_id == $run and
    (if $mode == "external" then .status == "quiesced"
     else (.status == "policy_change_planned" or .status == "policy_no_verified" or .status == "quiesced") end) and
    (.barrier | keys | sort) == (["state","zero_guard_residue","expected_catalog_sha256","probe_receipt_sha256"] | sort) and
    .barrier.state == "recovery_ready_guarded" and .barrier.zero_guard_residue == false and
    (.barrier.expected_catalog_sha256 | test("^[a-f0-9]{64}$")) and
    (.barrier.probe_receipt_sha256 | test("^[a-f0-9]{64}$")) and
    ($catalog == "" or .barrier.expected_catalog_sha256 == $catalog) and
    (.writers | length) == 10 and ([.writers[].id] | unique | length) == 10 and
    all(.writers[];
      (keys | sort) == (["class","id","name","project","service","config_files","working_dir",
        "image_id","image_ref","prior_running","prior_status","healthcheck_present","prior_health_status",
        "prior_restart_policy","temporary_restart_policy"] | sort) and
      (.class == "production-api" or .class == "production-web" or
       .class == "production-worker" or .class == "development-api" or
       .class == "development-web" or .class == "development-worker") and
      (.id | test("^[a-f0-9]{64}$")) and (.name | type == "string" and startswith("/")) and
      (.project | type == "string" and length > 0) and (.service | type == "string" and length > 0) and
      (.config_files | type == "string" and length > 0) and (.working_dir | type == "string" and length > 0) and
      (.image_id | type == "string" and length > 0) and (.image_ref | type == "string" and length > 0) and
      (.prior_running | type == "boolean") and
      ((.prior_running == true and .prior_status == "running") or
       (.prior_running == false and (.prior_status == "created" or .prior_status == "exited"))) and
      (.healthcheck_present | type == "boolean") and
      ((.healthcheck_present == true and .prior_health_status == "healthy") or
       (.healthcheck_present == false and .prior_health_status == null)) and
      (.prior_restart_policy | keys | sort) == (["name","maximum_retry_count"] | sort) and
      (.prior_restart_policy.name | type == "string") and
      (.prior_restart_policy.maximum_retry_count | type == "number" and . >= 0 and floor == .) and
      .temporary_restart_policy == {name:"no",maximum_retry_count:0}) and
    ([.writers[] | select(.class == "production-api")] | length) == 1 and
    ([.writers[] | select(.class == "production-web")] | length) == 1 and
    ([.writers[] | select(.class == "production-worker")] | length) == 3 and
    ([.writers[] | select(.class == "development-api")] | length) == 1 and
    ([.writers[] | select(.class == "development-web")] | length) == 1 and
    ([.writers[] | select(.class == "development-worker")] | length) == 3 and
    ([.writers[] | select(.project == "megacampus-blue" or .project == "megacampus-green") | .project] | unique | length) == 1 and
    (([.writers[] | select(.project == "megacampus-blue" or .project == "megacampus-green") | .project] | unique | .[0]) as $production_project |
      ([.writers[] | (.project + "/" + .service)] | sort) == ([$production_project + "/api",$production_project + "/web",
        "megacampus/worker","megacampus/worker-stage6","megacampus/worker-stage7","megacampus/api-dev","megacampus/web-dev",
        "megacampus/worker-dev","megacampus/worker-stage6-dev","megacampus/worker-stage7-dev"] | sort)) and
    all(.writers[];
      if (.project == "megacampus-blue" or .project == "megacampus-green") then
        ((.service == "api" and .class == "production-api") or
         (.service == "web" and .class == "production-web"))
      elif .project == "megacampus" then
        ((.service == "worker" or .service == "worker-stage6" or .service == "worker-stage7") and .class == "production-worker") or
        (.service == "api-dev" and .class == "development-api") or
        (.service == "web-dev" and .class == "development-web") or
        ((.service == "worker-dev" or .service == "worker-stage6-dev" or .service == "worker-stage7-dev") and .class == "development-worker")
      else false end)
  ' "/proc/self/fd/$manifest_fd" >/dev/null || {
    eval "exec ${manifest_fd}<&-"
    fail 'durable writer quiesce manifest is invalid or cross-wired'
  }
  quiesce_json="$(jq -c . "/proc/self/fd/$manifest_fd")"
  eval "exec ${manifest_fd}<&-"
}

recover_standalone_quiesce_inventory() {
  local observed_inventory="$writer_inventory" expected durable_identity observed_identity
  [[ -e $quiesce_manifest ]] || return 0
  read_quiesce_manifest resumable "$q12_expected_catalog_sha256"
  writer_inventory="$(jq -c '.writers' <<<"$quiesce_json")"
  durable_identity="$(jq -S -c '[.[] | {class,id,name,project,service,config_files,working_dir,image_id,image_ref}] | sort_by(.project,.service)' <<<"$writer_inventory")"
  observed_identity="$(jq -S -c '[.[] | {class,id,name,project,service,config_files,working_dir,image_id,image_ref}] | sort_by(.project,.service)' <<<"$observed_inventory")"
  [[ $durable_identity == "$observed_identity" ]] ||
    fail 'durable writer inventory differs from the exact current Compose identity projection'
  while IFS= read -r expected; do
    current_writer_record "$expected" >/dev/null
  done < <(jq -c '.[]' <<<"$writer_inventory")
}

inspect_writer() {
  local id="$1"
  local project="$2"
  local service="$3"
  local class="$4"
  local raw
  raw="$($DOCKER_BIN inspect "$id")"
  jq -e --arg id "$id" --arg project "$project" --arg service "$service" '
    length == 1 and (.[0] as $container |
    $container.Id == $id and
    $container.Config.Labels["com.docker.compose.project"] == $project and
    $container.Config.Labels["com.docker.compose.service"] == $service and
    ($container.Config.Labels["com.docker.compose.project.config_files"] | type == "string" and length > 0) and
    ($container.Config.Labels["com.docker.compose.project.working_dir"] | type == "string" and length > 0) and
    ($container.Name | type == "string" and length > 1) and
    ($container.Image | type == "string" and length > 0) and
    ($container.Config.Image | type == "string" and length > 0) and
    ($container.State.Restarting == false) and
    (($container.State.Health == null) or $container.State.Health.Status == "healthy") and
    (["running","exited","created"] | index($container.State.Status) != null) and
    ($container.HostConfig.RestartPolicy.Name | type == "string") and
    ($container.HostConfig.RestartPolicy.MaximumRetryCount | type == "number"))
  ' <<<"$raw" >/dev/null || fail "writer identity/state/policy is invalid: $project/$service"
  jq -c --arg class "$class" '
    .[0] | {
      class:$class,id:.Id,name:.Name,
      project:.Config.Labels["com.docker.compose.project"],
      service:.Config.Labels["com.docker.compose.service"],
      config_files:.Config.Labels["com.docker.compose.project.config_files"],
      working_dir:.Config.Labels["com.docker.compose.project.working_dir"],
      image_id:.Image,image_ref:.Config.Image,
      prior_running:.State.Running,
      prior_status:.State.Status,
      healthcheck_present:(.State.Health != null),
      prior_health_status:(.State.Health.Status // null),
      prior_restart_policy:{
        name:.HostConfig.RestartPolicy.Name,
        maximum_retry_count:.HostConfig.RestartPolicy.MaximumRetryCount
      },
      temporary_restart_policy:{name:"no",maximum_retry_count:0}
    }
  ' <<<"$raw"
}

find_writer_ids() {
  local project="$1"
  local service="$2"
  "$DOCKER_BIN" ps -aq --no-trunc \
    --filter "label=$COMPOSE_PROJECT_LABEL=$project" \
    --filter "label=$COMPOSE_SERVICE_LABEL=$service"
}

append_exact_writer() {
  local project="$1"
  local service="$2"
  local class="$3"
  local -a ids=()
  local record
  mapfile -t ids < <(find_writer_ids "$project" "$service")
  [[ ${#ids[@]} -eq 1 && -n ${ids[0]} ]] ||
    fail "writer identity must resolve exactly one container: $project/$service"
  record="$(inspect_writer "${ids[0]}" "$project" "$service" "$class")"
  writer_inventory="$(jq -c --argjson record "$record" '. + [$record]' <<<"$writer_inventory")"
}

collect_compose_writers() {
  local color project
  local -a blue_api=() blue_web=() green_api=() green_web=()
  mapfile -t blue_api < <(find_writer_ids megacampus-blue api)
  mapfile -t blue_web < <(find_writer_ids megacampus-blue web)
  mapfile -t green_api < <(find_writer_ids megacampus-green api)
  mapfile -t green_web < <(find_writer_ids megacampus-green web)
  [[ ${#blue_api[@]} -le 1 && ${#blue_web[@]} -le 1 && ${#green_api[@]} -le 1 && ${#green_web[@]} -le 1 ]] ||
    fail 'production writer identity is duplicated'
  if [[ ${#blue_api[@]} -eq 1 && ${#blue_web[@]} -eq 1 && ${#green_api[@]} -eq 0 && ${#green_web[@]} -eq 0 ]]; then
    color='blue'
  elif [[ ${#green_api[@]} -eq 1 && ${#green_web[@]} -eq 1 && ${#blue_api[@]} -eq 0 && ${#blue_web[@]} -eq 0 ]]; then
    color='green'
  else
    fail 'production API/Web must be exactly one same-colour Compose pair'
  fi
  project="megacampus-$color"
  append_exact_writer "$project" api production-api
  append_exact_writer "$project" web production-web
  append_exact_writer megacampus worker production-worker
  append_exact_writer megacampus worker-stage6 production-worker
  append_exact_writer megacampus worker-stage7 production-worker
  append_exact_writer megacampus api-dev development-api
  append_exact_writer megacampus web-dev development-web
  append_exact_writer megacampus worker-dev development-worker
  append_exact_writer megacampus worker-stage6-dev development-worker
  append_exact_writer megacampus worker-stage7-dev development-worker
  [[ $(jq 'length' <<<"$writer_inventory") -eq 10 ]] || fail 'exact ten-writer inventory was not produced'
  [[ $(jq '[.[].id] | unique | length' <<<"$writer_inventory") -eq 10 ]] || fail 'writer container identity is duplicated'
}

current_writer_record() {
  local expected="$1"
  local allow_unready_health="${2:-0}"
  local id project service raw
  id="$(jq -r '.id' <<<"$expected")"
  project="$(jq -r '.project' <<<"$expected")"
  service="$(jq -r '.service' <<<"$expected")"
  raw="$($DOCKER_BIN inspect "$id")"
  jq -e --argjson expected "$expected" --arg allow "$allow_unready_health" '
    length == 1 and .[0].Id == $expected.id and .[0].Name == $expected.name and
    .[0].Config.Labels["com.docker.compose.project"] == $expected.project and
    .[0].Config.Labels["com.docker.compose.service"] == $expected.service and
    .[0].Config.Labels["com.docker.compose.project.config_files"] == $expected.config_files and
    .[0].Config.Labels["com.docker.compose.project.working_dir"] == $expected.working_dir and
    .[0].Image == $expected.image_id and .[0].Config.Image == $expected.image_ref and
    .[0].State.Restarting == false and
    ((.[0].State.Health != null) == $expected.healthcheck_present) and
    ($allow == "1" or (.[0].State.Health == null) or .[0].State.Health.Status == "healthy")
  ' <<<"$raw" >/dev/null || fail "captured writer identity changed: $project/$service"
  jq -c '.[0]' <<<"$raw"
}

write_quiesce_manifest() {
  local status="$1"
  local barrier_json="$2"
  local temporary manifest_directory publish_fd=''
  manifest_directory="$(dirname "$quiesce_manifest")"
  temporary="$(mktemp -- "$manifest_directory/.writer-quiesce.XXXXXXXXXX")" || return 1
  if ! jq -n --arg schema "$WRITER_QUIESCE_SCHEMA" --arg run "$q12_run_id" --arg status "$status" \
      --argjson barrier "$barrier_json" --argjson writers "$writer_inventory" \
      '{schema_version:$schema,run_id:$run,status:$status,barrier:$barrier,writers:$writers}' >"$temporary" ||
    ! chown "$controller_uid:$controller_gid" "$temporary" ||
    ! chmod 0400 "$temporary" ||
    [[ ! -f $temporary || -L $temporary ]] ||
    [[ $(owner_group_mode "$temporary") != "$controller_uid:$controller_gid:400" ]] ||
    ! sync -f "$temporary" ||
    ! mv -f -- "$temporary" "$quiesce_manifest" ||
    ! sync -d "$manifest_directory"; then
    rm -f -- "$temporary"
    return 1
  fi
  open_controller_file "$quiesce_manifest" 'published writer quiesce manifest' \
    publish_fd quiesce_manifest_identity quiesce_manifest_sha256
  eval "exec ${publish_fd}<&-"
}

write_recovery_complete_state() {
  local temporary quiesce_sha256 source_journal_fd='' source_journal_identity='' source_journal_sha256='' publish_fd=''
  [[ -n $writer_recovery_state && -n $q12_run_root ]] || return 1
  verify_controller_file_unchanged "$quiesce_manifest" 'durable writer quiesce manifest' \
    "$quiesce_manifest_identity" "$quiesce_manifest_sha256"
  verify_operator_file_unchanged "$manifest" 'immutable source recovery manifest' 400 \
    "$source_manifest_identity" "$source_manifest_sha256"
  open_operator_file "$journal" 'source recovery journal' 600 \
    source_journal_fd source_journal_identity source_journal_sha256
  quiesce_sha256="$(sha256sum -- "$quiesce_manifest" | awk '{print $1}')"
  eval "exec ${source_journal_fd}<&-"
  [[ $quiesce_sha256 == "$quiesce_manifest_sha256" &&
     $source_manifest_sha256 =~ ^[a-f0-9]{64}$ && $source_journal_sha256 =~ ^[a-f0-9]{64}$ ]] || return 1
  temporary="$(mktemp -- "$q12_run_root/.writer-recovery-state.XXXXXXXXXX")" || return 1
  if ! jq -n --arg schema "$WRITER_RECOVERY_STATE_SCHEMA" --arg run "$q12_run_id" \
      --arg catalog "$q12_expected_catalog_sha256" --arg quiesce "$quiesce_sha256" \
      --arg source_manifest "$source_manifest_sha256" --arg source_journal "$source_journal_sha256" '
      {schema_version:$schema,run_id:$run,state:"recovery_complete_writers_quiesced",
       expected_catalog_sha256:$catalog,writer_quiesce_manifest_sha256:$quiesce,
       source_manifest_sha256:$source_manifest,source_journal_sha256:$source_journal}
    ' >"$temporary" ||
    ! chown "$controller_uid:$controller_gid" "$temporary" ||
    ! chmod 0400 "$temporary" ||
    [[ ! -f $temporary || -L $temporary ]] ||
    [[ $(owner_group_mode "$temporary") != "$controller_uid:$controller_gid:400" ]] ||
    ! sync -f "$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  if [[ -e $writer_recovery_state || -L $writer_recovery_state ]]; then
    if [[ ! -f $writer_recovery_state || -L $writer_recovery_state ]] ||
      [[ $(owner_group_mode "$writer_recovery_state") != "$controller_uid:$controller_gid:400" ]] ||
      ! cmp -s -- "$temporary" "$writer_recovery_state"; then
      printf 'source-recovery host wrapper: writer recovery state already exists with non-exact bytes\n' >&2
      rm -f -- "$temporary"
      return 1
    fi
    rm -f -- "$temporary"
  elif ! "$PYTHON_BIN" - "$temporary" "$writer_recovery_state" <<'PY'
import ctypes
import os
import sys

source, destination = sys.argv[1:]
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = getattr(libc, "renameat2", None)
if renameat2 is None:
    raise SystemExit(1)
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1) != 0:
    raise SystemExit(1)
PY
  then
    if [[ ! -f $writer_recovery_state || -L $writer_recovery_state ]] ||
      [[ $(owner_group_mode "$writer_recovery_state") != "$controller_uid:$controller_gid:400" ]] ||
      ! cmp -s -- "$temporary" "$writer_recovery_state"; then
      printf 'source-recovery host wrapper: writer recovery state already exists with non-exact bytes\n' >&2
      rm -f -- "$temporary"
      return 1
    fi
    rm -f -- "$temporary"
  fi
  sync -d "$q12_run_root" || return 1
  recovery_state_identity=''
  recovery_state_sha256=''
  open_controller_file "$writer_recovery_state" 'published writer recovery state' \
    publish_fd recovery_state_identity recovery_state_sha256
  eval "exec ${publish_fd}<&-"
}

assert_all_stopped_with_no_restart() {
  local expected current
  while IFS= read -r expected; do
    current="$(current_writer_record "$expected")"
    jq -e '.State.Running == false and (.State.Status == "exited" or .State.Status == "created") and .HostConfig.RestartPolicy.Name == "no" and .HostConfig.RestartPolicy.MaximumRetryCount == 0' \
      <<<"$current" >/dev/null || fail 'writer did not remain stopped with restart=no'
  done < <(jq -c '.[]' <<<"$writer_inventory")
}

probe_closed_inbound() {
  local host
  for host in ai.megacampus.ru dev.ai.megacampus.ru; do
    if ! (
      set -e
      probe_directory="$(mktemp -d -- "$q12_run_root/.inbound-probe.XXXXXXXXXX")"
      chmod 0700 "$probe_directory"
      headers="$probe_directory/headers"
      body="$probe_directory/body"
      trap 'rm -f -- "$headers" "$body"; rmdir -- "$probe_directory"' EXIT
      status="$($CURL_BIN --silent --show-error --http1.1 --proto '=https' --max-redirs 0 \
        --user-agent 'mc2-q12-inbound-probe/1' --dump-header "$headers" --output "$body" \
        --write-out '%{http_code}' --max-filesize 512 \
        --resolve "$host:443:127.0.0.1" --connect-timeout 10 --max-time 30 "https://$host/")"
      [[ -f $headers && ! -L $headers && -f $body && ! -L $body ]]
      [[ $(owner_group_mode "$probe_directory") == "$(id -u):$(id -g):700" ]]
      [[ $(owner_group_mode "$headers") == "$(id -u):$(id -g):600" ]]
      [[ $(owner_group_mode "$body") == "$(id -u):$(id -g):600" ]]
      "$PYTHON_BIN" - "$headers" "$body" "$status" <<'PY'
import pathlib
import re
import sys

headers_path, body_path, reported_status = sys.argv[1:]
headers = pathlib.Path(headers_path).read_bytes()
body = pathlib.Path(body_path).read_bytes()
if len(body) > 512 or not headers.endswith(b"\r\n\r\n"):
    raise SystemExit(1)
lines = headers[:-4].split(b"\r\n")
if not lines or any(not line for line in lines):
    raise SystemExit(1)
status_match = re.fullmatch(rb"HTTP/1\.1 (502 Bad Gateway|503 Service Temporarily Unavailable)", lines[0])
if status_match is None:
    raise SystemExit(1)
reason = status_match.group(1).decode("ascii")
status = reason.split(" ", 1)[0]
if reported_status != status:
    raise SystemExit(1)
values: dict[str, list[str]] = {}
for raw in lines[1:]:
    if b":" not in raw or raw[:1] in b" \t":
        raise SystemExit(1)
    raw_name, raw_value = raw.split(b":", 1)
    try:
        name = raw_name.decode("ascii").lower()
        value = raw_value.strip(b" \t").decode("ascii")
    except UnicodeDecodeError:
        raise SystemExit(1)
    if re.fullmatch(r"[!#$%&'*+.^_`|~0-9a-z-]+", name) is None:
        raise SystemExit(1)
    values.setdefault(name, []).append(value)
for critical in ("server", "content-type", "content-length"):
    if len(values.get(critical, [])) != 1:
        raise SystemExit(1)
if "transfer-encoding" in values or values["content-type"][0] != "text/html":
    raise SystemExit(1)
server = values["server"][0]
if re.fullmatch(r"nginx(?:/[0-9]+\.[0-9]+\.[0-9]+(?: \([A-Za-z0-9][A-Za-z0-9 ._+~:-]{0,63}\))?)?", server) is None:
    raise SystemExit(1)
length = values["content-length"][0]
if re.fullmatch(r"0|[1-9][0-9]*", length) is None or int(length) != len(body):
    raise SystemExit(1)
expected = (
    f"<html>\r\n<head><title>{reason}</title></head>\r\n<body>\r\n"
    f"<center><h1>{reason}</h1></center>\r\n<hr><center>{server}</center>\r\n"
    "</body>\r\n</html>\r\n"
).encode("ascii")
if body != expected:
    raise SystemExit(1)
PY
    ); then
      fail "inbound Nginx response signature is invalid for $host"
    fi
  done
}

update_restart_no() {
  local expected id current
  expected="$1"
  id="$(jq -r '.id' <<<"$expected")"
  current="$(current_writer_record "$expected")"
  writer_mutation_started=1
  "$DOCKER_BIN" update --restart=no "$id" >/dev/null
  current="$(current_writer_record "$expected")"
  jq -e '.HostConfig.RestartPolicy.Name == "no" and .HostConfig.RestartPolicy.MaximumRetryCount == 0' \
    <<<"$current" >/dev/null || fail 'restart=no policy did not persist'
}

stop_writer_class() {
  local class="$1"
  local expected id current
  while IFS= read -r expected; do
    id="$(jq -r '.id' <<<"$expected")"
    current="$(current_writer_record "$expected")"
    if jq -e '.State.Running == true' <<<"$current" >/dev/null; then
      writer_mutation_started=1
      "$DOCKER_BIN" stop --time 30 "$id" >/dev/null
    fi
  done < <(jq -c --arg class "$class" '.[] | select(.class == $class)' <<<"$writer_inventory")
}

requiesce_compose_writers_after_restore_failure() {
  local cleanup_failed=0 expected id current
  while IFS= read -r expected; do
    id="$(jq -r '.id' <<<"$expected")"
    "$DOCKER_BIN" update --restart=no "$id" >/dev/null || cleanup_failed=1
  done < <(jq -c '.[]' <<<"$writer_inventory")
  while IFS= read -r expected; do
    id="$(jq -r '.id' <<<"$expected")"
    current="$(current_writer_record "$expected" 1)" || { cleanup_failed=1; continue; }
    if jq -e '.State.Running == true' <<<"$current" >/dev/null; then
      "$DOCKER_BIN" stop --time 30 "$id" >/dev/null || cleanup_failed=1
    fi
  done < <(jq -c '.[]' <<<"$writer_inventory")
  while IFS= read -r expected; do
    current="$(current_writer_record "$expected" 1)" || { cleanup_failed=1; continue; }
    jq -e '.State.Running == false and (.State.Status == "exited" or .State.Status == "created") and .HostConfig.RestartPolicy.Name == "no" and .HostConfig.RestartPolicy.MaximumRetryCount == 0' \
      <<<"$current" >/dev/null || cleanup_failed=1
  done < <(jq -c '.[]' <<<"$writer_inventory")
  [[ $cleanup_failed -eq 0 ]]
}

finish_compose_recovery() {
  local original_status="$?"
  trap - EXIT INT TERM
  set +e
  if [[ $original_status -eq 0 ]]; then
    if ! (assert_all_stopped_with_no_restart) ||
      ! (verify_controller_file_unchanged "$database_barrier_receipt" 'database barrier receipt' \
        "$barrier_receipt_identity" "$barrier_receipt_sha256") ||
      ! (verify_controller_file_unchanged "$q12_probe_receipt" 'database barrier probe receipt' \
        "$probe_receipt_identity" "$probe_receipt_sha256") ||
      ! (write_recovery_complete_state); then
      original_status=1
    fi
  fi
  if [[ $original_status -ne 0 && $writer_mutation_started -eq 1 ]]; then
    if ! requiesce_compose_writers_after_restore_failure; then
      printf 'source-recovery host wrapper: compensating writer re-quiesce failed\n' >&2
      original_status=1
    fi
  fi
  if [[ $original_status -ne 0 ]]; then
    printf 'source-recovery host wrapper: recovery did not publish a quiesced completion state\n' >&2
  fi
  exit "$original_status"
}

restore_systemd_writers() {
  local original_status="$?"
  local restore_failed=0 current service
  trap - EXIT INT TERM
  set +e
  for service in "${WRITER_SERVICES[@]}"; do
    if [[ ${prior_state[$service]} == active ]]; then
      "$SYSTEMCTL_BIN" start "$service" >/dev/null 2>&1 || restore_failed=1
    else
      "$SYSTEMCTL_BIN" stop "$service" >/dev/null 2>&1 || restore_failed=1
    fi
  done
  for service in "${WRITER_SERVICES[@]}"; do
    current="$($SYSTEMCTL_BIN is-active "$service" 2>/dev/null || true)"
    [[ $current == "${prior_state[$service]}" ]] || restore_failed=1
  done
  if [[ $restore_failed -ne 0 ]]; then
    printf 'source-recovery host wrapper: failed to restore exact writer state\n' >&2
    original_status=1
  fi
  exit "$original_status"
}

if [[ $writer_backend == systemd ]]; then
  for service in "${WRITER_SERVICES[@]}"; do
    state="$($SYSTEMCTL_BIN is-active "$service" 2>/dev/null || true)"
    [[ $state == active || $state == inactive ]] ||
      fail "writer service $service has unsupported state: ${state:-unknown}"
    prior_state["$service"]="$state"
    [[ $state == inactive ]] || active_services+=("$service")
  done
  if [[ ${#active_services[@]} -gt 0 && $stop_writers -ne 1 ]]; then
    fail "active writer services require explicit --stop-writers: ${active_services[*]}"
  fi
  if [[ $stop_writers -eq 1 ]]; then
    trap restore_systemd_writers EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    for service in "${active_services[@]}"; do "$SYSTEMCTL_BIN" stop "$service"; done
    for service in "${WRITER_SERVICES[@]}"; do
      [[ $($SYSTEMCTL_BIN is-active "$service" 2>/dev/null || true) == inactive ]] ||
        fail "writer service did not stop: $service"
    done
  fi
else
  q12_expected_catalog_sha256=''
  barrier_json=''
  if [[ -n $q12_run_id ]]; then
    if [[ -n $external_quiesce_manifest ]]; then
      [[ $external_quiesce_manifest == "$quiesce_manifest" ]] ||
        fail 'external quiesce manifest must use the fixed active Q12 run path'
      read_quiesce_manifest external
      q12_expected_catalog_sha256="$(jq -r '.barrier.expected_catalog_sha256' <<<"$quiesce_json")"
      [[ $q12_expected_catalog_sha256 =~ ^[a-f0-9]{64}$ ]] || fail 'external quiesce manifest is invalid'
      if [[ -n $database_barrier_receipt ]]; then
        read_barrier_receipt
        jq -e --arg catalog "$q12_expected_catalog_sha256" '
          .state == "recovery_ready_guarded" and .zero_guard_residue == false and
          .expected_catalog_sha256 == $catalog
        ' <<<"$barrier_json" >/dev/null ||
          fail 'external quiesce manifest and database barrier receipt are cross-wired'
      else
        barrier_json="$(jq -c '.barrier' <<<"$quiesce_json")"
      fi
    elif [[ -n $database_barrier_receipt ]]; then
      read_barrier_receipt
      q12_expected_catalog_sha256="$(jq -r '.expected_catalog_sha256' <<<"$barrier_json")"
    fi
    [[ $q12_expected_catalog_sha256 =~ ^[a-f0-9]{64}$ ]] || fail 'Q12 expected catalog binding is absent'
    validate_probe_receipt "$q12_expected_catalog_sha256"
    [[ $(jq -r '.probe_receipt_sha256' <<<"$barrier_json") == "$probe_receipt_sha256" ]] ||
      fail 'database barrier and rollback-probe receipts are not hash-bound'
  fi
  readonly q12_expected_catalog_sha256
  if [[ -n $external_quiesce_manifest ]]; then
    validate_external_quiesce_lease
  fi
  collect_compose_writers
  if [[ -n $external_quiesce_manifest ]]; then
    verify_controller_file_unchanged "$quiesce_manifest" 'external quiesce manifest' \
      "$quiesce_manifest_identity" "$quiesce_manifest_sha256"
    writer_inventory="$(jq -c '.writers' <<<"$quiesce_json")"
    assert_all_stopped_with_no_restart
  elif [[ $stop_writers -eq 1 ]]; then
    recover_standalone_quiesce_inventory
    jq -e '
      ([.[] | select((.class == "production-api" or .class == "production-web") and .prior_running == true)] | length) == 2
    ' <<<"$writer_inventory" >/dev/null || fail 'the active production API/Web pair must both be running'
    [[ -n $database_barrier_receipt ]] || fail '--stop-writers requires --database-barrier-receipt'
    write_quiesce_manifest policy_change_planned "$barrier_json"
    trap finish_compose_recovery EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    while IFS= read -r expected; do update_restart_no "$expected"; done < <(jq -c '.[]' <<<"$writer_inventory")
    write_quiesce_manifest policy_no_verified "$barrier_json"
    stop_writer_class production-api
    stop_writer_class production-web
    stop_writer_class development-api
    stop_writer_class development-web
    probe_closed_inbound
    stop_writer_class production-worker
    stop_writer_class development-worker
    assert_all_stopped_with_no_restart
    write_quiesce_manifest quiesced "$barrier_json"
  else
    if jq -e '[.[] | select(.prior_running == true)] | length > 0' <<<"$writer_inventory" >/dev/null; then
      fail 'active Compose writers require --stop-writers or --external-quiesce-manifest'
    fi
  fi
fi

export SOURCE_RECOVERY_STATE_HOST_DIR="$state_directory"
export SOURCE_RECOVERY_PROGRESS_HOST_DIR="$progress_directory"
export SOURCE_RECOVERY_PLAN_INPUT_FILE="$plan_input"
export SOURCE_RECOVERY_MANIFEST_FILE="$manifest"
export SOURCE_RECOVERY_DEVELOPMENT_UPLOAD_ROOT="$development_root"
export SOURCE_RECOVERY_PRODUCTION_UPLOAD_ROOT="$production_root"
export SOURCE_RECOVERY_CAPABILITY_HOST_DIR="$capability_directory"
if [[ -n $database_barrier_receipt ]]; then
  export SOURCE_RECOVERY_DATABASE_BARRIER_RECEIPT="$database_barrier_receipt"
fi

compose_run() {
  local service="$1"
  local -a q12_args=() compose_args=()
  shift
  if [[ -n $q12_db_capability_file ]]; then
    verify_controller_file_unchanged "$q12_db_capability_file" 'Q12 database capability' \
      "$q12_capability_identity" "$q12_capability_sha256"
    verify_controller_file_unchanged "$q12_probe_receipt" 'database barrier probe receipt' \
      "$probe_receipt_identity" "$probe_receipt_sha256"
    if [[ -n $database_barrier_receipt ]]; then
      verify_controller_file_unchanged "$database_barrier_receipt" 'database barrier receipt' \
        "$barrier_receipt_identity" "$barrier_receipt_sha256"
    fi
    q12_args=(
      -v "$q12_db_capability_file:/run/secrets/q12_db_capability:ro"
      -e Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability
      -v "$q12_probe_receipt:/run/secrets/q12_database_barrier_probe_receipt:ro"
      -e Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt
      -e "Q12_RUN_ID=$q12_run_id"
      -e "Q12_EXPECTED_CATALOG_SHA256=$q12_expected_catalog_sha256"
    )
  fi
  compose_args=(
    --project-directory "$project_directory" \
    -f "$compose_file" \
    --env-file "$env_file" \
    --profile operator run --rm --no-deps -T "${q12_args[@]}" "$service" "$@"
  )
  if [[ -n $lease_fd ]]; then
    (
      unset Q12_EXTERNAL_QUIESCE_LEASE_FD
      eval "exec ${lease_fd}>&-"
      exec "$COMPOSE_BIN" "${compose_args[@]}"
    )
  else
    "$COMPOSE_BIN" "${compose_args[@]}"
  fi
}

if [[ $operation == rollback ]]; then
  compose_run qdrant-source-recovery-executor source-recovery rollback --confirm-run-id "$run_id"
  exit 0
fi

if [[ $fresh_plan -eq 1 ]]; then
  compose_run qdrant-source-recovery-planner source-recovery plan
  [[ -f $manifest && ! -L $manifest && $(owner_group_mode "$manifest") == "$expected_uid:$expected_gid:400" ]] ||
    fail 'planner did not publish an owner-only immutable manifest'
  [[ -f $journal && ! -L $journal && $(owner_group_mode "$journal") == "$expected_uid:$expected_gid:600" ]] ||
    fail 'planner did not publish an owner-only progress journal'
  [[ -z $(find "$capability_directory" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
    fail 'planner left capability probe residue'
fi
source_manifest_fd=''
source_manifest_identity=''
source_manifest_sha256=''
open_operator_file "$manifest" 'immutable source recovery manifest' 400 \
  source_manifest_fd source_manifest_identity source_manifest_sha256
eval "exec ${source_manifest_fd}<&-"
readonly source_manifest_identity source_manifest_sha256
if [[ $fresh_plan -eq 1 || $resume_from == execute ]]; then
  compose_run qdrant-source-recovery-executor source-recovery execute --confirm-run-id "$run_id"
fi
# This verification is deliberately unconditional. An operator-selected resume
# label is never accepted as proof that copy verification already ran.
compose_run qdrant-source-recovery-planner source-recovery verify
if [[ $resume_from != verify-dispositions ]]; then
  compose_run qdrant-source-recovery-disposition source-recovery apply-dispositions --confirm-run-id "$run_id"
fi
compose_run qdrant-source-recovery-disposition source-recovery verify-dispositions --confirm-run-id "$run_id"

# W7a real leg: after the fully verified Q12 forward recovery, compute and publish the
# source.forward acceptance authority (<q12-run-root>/source-forward-acceptance.json) the
# cutover controller's read_source_forward_acceptance consumes. The frozen source.forward
# argv carries no acceptance flags, so every input derives from existing arguments plus the
# operator-staged run-root coverage-run authority. A non-Q12 forward has no consumer and
# publishes nothing.
if [[ -n $q12_run_id ]]; then
  accepted_coverage_run_file="$q12_run_root/accepted-coverage-run"
  require_controller_file "$accepted_coverage_run_file" 'accepted coverage-run authority'
  uuid_v4_pattern='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  accepted_coverage_run="$(head -n 1 -- "$accepted_coverage_run_file")"
  [[ $(wc -c < "$accepted_coverage_run_file") -eq $((${#accepted_coverage_run} + 1)) ]] ||
    fail 'accepted coverage-run authority must be a single newline-terminated organization:course:run line'
  [[ $accepted_coverage_run =~ ^${uuid_v4_pattern}:${uuid_v4_pattern}:${uuid_v4_pattern}$ ]] ||
    fail 'accepted coverage-run authority must be organization:course:run lower-case UUIDv4'

  read_production_env_value() {
    local key="$1"
    local lines
    lines="$(grep -E "^${key}=" -- "$env_file" || true)"
    [[ -n $lines && $(printf '%s\n' "$lines" | wc -l) -eq 1 ]] ||
      fail "production env file must define exactly one ${key}"
    local value="${lines#*=}"
    [[ -n $value ]] || fail "production env file ${key} must not be empty"
    printf '%s' "$value"
  }
  supabase_url="$(read_production_env_value SUPABASE_URL)"
  supabase_service_key="$(read_production_env_value SUPABASE_SERVICE_KEY)"

  if [[ $local_test == 1 && -n $emit_bin_override ]]; then
    emit_command=("$emit_bin_override")
  else
    emit_tsx="$project_directory/packages/course-gen-platform/node_modules/.bin/tsx"
    emit_entrypoint="$project_directory/packages/course-gen-platform/tools/qdrant/emit-source-forward-acceptance.ts"
    [[ -x $emit_tsx && ! -L $emit_tsx ]] ||
      fail 'source.forward acceptance emit requires the package tsx shim'
    [[ -f $emit_entrypoint && ! -L $emit_entrypoint ]] ||
      fail 'source.forward acceptance emit entrypoint is unavailable'
    emit_command=("$emit_tsx" "$emit_entrypoint")
  fi

  acceptance_output="$q12_run_root/source-forward-acceptance.json"
  rm -f -- "$acceptance_output"
  emit_source_forward_acceptance() {
    if [[ -n $lease_fd ]]; then
      (
        unset Q12_EXTERNAL_QUIESCE_LEASE_FD
        eval "exec ${lease_fd}>&-"
        SUPABASE_URL="$supabase_url" SUPABASE_SERVICE_KEY="$supabase_service_key" \
          exec "${emit_command[@]}" \
          --manifest "$manifest" --journal "$journal" \
          --recovery-run-id "$run_id" \
          --accepted-coverage-run "$accepted_coverage_run" \
          --output "$acceptance_output"
      )
    else
      SUPABASE_URL="$supabase_url" SUPABASE_SERVICE_KEY="$supabase_service_key" \
        "${emit_command[@]}" \
        --manifest "$manifest" --journal "$journal" \
        --recovery-run-id "$run_id" \
        --accepted-coverage-run "$accepted_coverage_run" \
        --output "$acceptance_output"
    fi
  }
  if ! emit_source_forward_acceptance; then
    rm -f -- "$acceptance_output"
    fail 'source.forward acceptance emit failed'
  fi
  # --no-dereference: the run root is controller-writable, so a root wrapper must never
  # chown through a concurrently planted symlink; a swapped entry then fails the
  # no-follow publish check below and the leftover is removed.
  if ! chown --no-dereference "$controller_uid:$controller_gid" -- "$acceptance_output" 2>/dev/null; then
    rm -f -- "$acceptance_output"
    fail 'source.forward acceptance authority ownership could not be set'
  fi
  if [[ ! -f $acceptance_output || -L $acceptance_output ||
    $(owner_group_mode "$acceptance_output") != "$controller_uid:$controller_gid:400" ]]; then
    rm -f -- "$acceptance_output"
    fail 'source.forward acceptance authority was not published owner-only 0400'
  fi
fi
