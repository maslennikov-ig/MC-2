#!/usr/bin/env bash
set -euo pipefail

umask 077

readonly NODE_UID='1001'
readonly NODE_GID='1001'
readonly DEFAULT_LOCK_FILE='/run/megacampus-qdrant-source-recovery/source-recovery.lock'
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
  [--resume-from execute|verify|apply-dispositions|verify-dispositions] \
  --run-id UUID \
  --project-directory PATH --env-file PATH --plan-input PATH \
  --manifest PATH --progress-directory PATH \
  --development-root PATH --production-root PATH \
  --capability-directory PATH

By default, any active writer service blocks the run. --stop-writers explicitly
authorizes this wrapper to record, stop, and restore the exact six-service state.
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
  SYSTEMCTL_BIN="${SOURCE_RECOVERY_SYSTEMCTL_BIN:?local test systemctl path is required}"
  DOCKER_BIN="${SOURCE_RECOVERY_DOCKER_BIN:?local test docker path is required}"
  COMPOSE_BIN="${SOURCE_RECOVERY_COMPOSE_BIN:?local test Compose path is required}"
  LOCK_FILE="${SOURCE_RECOVERY_LOCK_FILE:?local test lock path is required}"
  expected_uid="${SOURCE_RECOVERY_EXPECTED_UID:?local test UID is required}"
  expected_gid="${SOURCE_RECOVERY_EXPECTED_GID:?local test GID is required}"
else
  [[ -z ${SOURCE_RECOVERY_SYSTEMCTL_BIN:-}${SOURCE_RECOVERY_DOCKER_BIN:-}${SOURCE_RECOVERY_COMPOSE_BIN:-}${SOURCE_RECOVERY_LOCK_FILE:-}${SOURCE_RECOVERY_EXPECTED_UID:-}${SOURCE_RECOVERY_EXPECTED_GID:-} ]] ||
    fail 'test-only command, lock, and UID overrides require SOURCE_RECOVERY_LOCAL_TEST=1'
  [[ $EUID -eq 0 ]] || fail 'production source recovery must run as root'
  SYSTEMCTL_BIN='/usr/bin/systemctl'
  DOCKER_BIN='/usr/bin/docker'
  COMPOSE_BIN="$(dirname "$(realpath -e -- "$0")")/operator-compose.sh"
  LOCK_FILE="$DEFAULT_LOCK_FILE"
  expected_uid="$NODE_UID"
  expected_gid="$NODE_GID"
fi
readonly SYSTEMCTL_BIN DOCKER_BIN COMPOSE_BIN LOCK_FILE expected_uid expected_gid

[[ -x $SYSTEMCTL_BIN ]] || fail 'systemctl executable is unavailable'
[[ -x $DOCKER_BIN ]] || fail 'Docker executable is unavailable'
[[ -x $COMPOSE_BIN ]] || fail 'operator Compose wrapper is unavailable'
[[ $expected_uid =~ ^[0-9]+$ ]] || fail 'expected source-recovery UID must be numeric'
[[ $expected_gid =~ ^[0-9]+$ ]] || fail 'expected source-recovery GID must be numeric'
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_CONTEXT:-} ]] ||
  fail 'remote or selected Docker contexts are forbidden'
docker_endpoint="$($DOCKER_BIN context inspect default --format '{{(index .Endpoints "docker").Host}}')"
[[ $docker_endpoint == unix:///* ]] || fail 'the default Docker context must use a local Unix socket'

stop_writers=0
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop-writers)
      stop_writers=1
      shift
      ;;
    --resume-from|--run-id|--project-directory|--env-file|--plan-input|--manifest|--progress-directory|--development-root|--production-root|--capability-directory)
      [[ $# -ge 2 && -n $2 ]] || fail "$1 requires a value"
      option="$1"
      value="$2"
      shift 2
      case "$option" in
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
      esac
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
  fail '--run-id must be a UUIDv4'
case "$resume_from" in
  ''|execute|verify|apply-dispositions|verify-dispositions) ;;
  *) fail '--resume-from must name an approved durable recovery continuation' ;;
esac

require_real_path() {
  local value="$1"
  local label="$2"
  [[ $value == /* && -e $value && ! -L $value ]] || fail "$label must be an existing absolute non-symlink path"
  [[ $(realpath -e -- "$value") == "$value" ]] || fail "$label must be normalized and canonical"
}

require_real_path "$project_directory" 'project directory'
require_real_path "$env_file" 'Compose environment file'
require_real_path "$plan_input" 'protected plan input'
require_real_path "$progress_directory" 'progress directory'
require_real_path "$development_root" 'development upload root'
require_real_path "$production_root" 'production upload root'
require_real_path "$capability_directory" 'capability directory'
[[ -f $env_file && -r $env_file ]] || fail 'Compose environment file must be a readable file'
[[ -f $plan_input ]] || fail 'protected plan input must be a file'
[[ -d $progress_directory && -d $development_root && -d $production_root && -d $capability_directory ]] ||
  fail 'progress, upload roots, and capability paths must be directories'
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

journal="$progress_directory/journal.json"
if [[ -z $resume_from ]]; then
  [[ ! -e $manifest && ! -e $journal ]] ||
    fail 'fresh recovery requires absent manifest and journal state'
else
  [[ -f $manifest && ! -L $manifest && $(owner_group_mode "$manifest") == "$expected_uid:$expected_gid:400" ]] ||
    fail 'resume requires an owner-only immutable manifest'
  [[ -f $journal && ! -L $journal && $(owner_group_mode "$journal") == "$expected_uid:$expected_gid:600" ]] ||
    fail 'resume requires an owner-only progress journal'
fi

[[ $(owner_group_mode "$state_directory") == "$expected_uid:$expected_gid:700" ]] ||
  fail 'state directory must be owned by UID:GID 1001:1001 with mode 0700'
[[ $(owner_group_mode "$progress_directory") == "$expected_uid:$expected_gid:700" ]] ||
  fail 'progress directory must be owned by UID:GID 1001:1001 with mode 0700'
[[ $(owner_group_mode "$capability_directory") == "$expected_uid:$expected_gid:700" ]] ||
  fail 'capability directory must be owned by UID:GID 1001:1001 with mode 0700'
[[ $(owner_group_mode "$plan_input") == "$expected_uid:$expected_gid:600" ]] ||
  fail 'protected plan input must be owned by UID:GID 1001:1001 with mode 0600'
[[ -z $(find "$capability_directory" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
  fail 'capability directory must be empty before planning'

contains_path() {
  local parent="$1"
  local child="$2"
  [[ $child == "$parent" || $child == "$parent/"* ]]
}

for root in "$development_root" "$production_root"; do
  if contains_path "$root" "$capability_directory" || contains_path "$capability_directory" "$root"; then
    fail 'capability directory must be outside and not a parent of either upload root'
  fi
  [[ $(stat -c '%d' -- "$capability_directory") == $(stat -c '%d' -- "$root") ]] ||
    fail 'capability directory and both upload roots must share one filesystem device'
done

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

restore_writers() {
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

if [[ $stop_writers -eq 1 ]]; then
  trap restore_writers EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  for service in "${active_services[@]}"; do
    "$SYSTEMCTL_BIN" stop "$service"
  done
  for service in "${WRITER_SERVICES[@]}"; do
    [[ $($SYSTEMCTL_BIN is-active "$service" 2>/dev/null || true) == inactive ]] ||
      fail "writer service did not stop: $service"
  done
fi

export SOURCE_RECOVERY_STATE_HOST_DIR="$state_directory"
export SOURCE_RECOVERY_PROGRESS_HOST_DIR="$progress_directory"
export SOURCE_RECOVERY_PLAN_INPUT_FILE="$plan_input"
export SOURCE_RECOVERY_MANIFEST_FILE="$manifest"
export SOURCE_RECOVERY_DEVELOPMENT_UPLOAD_ROOT="$development_root"
export SOURCE_RECOVERY_PRODUCTION_UPLOAD_ROOT="$production_root"
export SOURCE_RECOVERY_CAPABILITY_HOST_DIR="$capability_directory"

compose_run() {
  local service="$1"
  shift
  "$COMPOSE_BIN" \
    --project-directory "$project_directory" \
    -f "$compose_file" \
    --env-file "$env_file" \
    --profile operator run --rm --no-deps -T "$service" "$@"
}

if [[ -z $resume_from ]]; then
  compose_run qdrant-source-recovery-planner source-recovery plan
  [[ -f $manifest && ! -L $manifest && $(owner_group_mode "$manifest") == "$expected_uid:$expected_gid:400" ]] ||
    fail 'planner did not publish an owner-only immutable manifest'
  [[ -f $journal && ! -L $journal && $(owner_group_mode "$journal") == "$expected_uid:$expected_gid:600" ]] ||
    fail 'planner did not publish an owner-only progress journal'
  [[ -z $(find "$capability_directory" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
    fail 'planner left capability probe residue'
fi
if [[ -z $resume_from || $resume_from == execute ]]; then
  compose_run qdrant-source-recovery-executor source-recovery execute --confirm-run-id "$run_id"
fi
# This verification is deliberately unconditional. An operator-selected resume
# label is never accepted as proof that copy verification already ran.
compose_run qdrant-source-recovery-planner source-recovery verify
if [[ $resume_from != verify-dispositions ]]; then
  compose_run qdrant-source-recovery-disposition source-recovery apply-dispositions --confirm-run-id "$run_id"
fi
compose_run qdrant-source-recovery-disposition source-recovery verify-dispositions --confirm-run-id "$run_id"
