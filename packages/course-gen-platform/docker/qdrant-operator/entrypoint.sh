#!/usr/bin/env bash
set -euo pipefail

umask 077

readonly OPERATOR_NAME='qdrant operator'
readonly TSX_BIN='/usr/local/bin/tsx'
readonly NODE_UID='1001'
readonly NODE_GID='1001'
readonly REQUIRED_QDRANT_URL='http://qdrant:6333'
readonly REQUIRED_UPLOAD_BASE='/opt/megacampus/data'
readonly DEFAULT_API_KEY_FILE='/run/secrets/qdrant_api_key'
readonly STAGED_API_KEY_FILE='/run/qdrant-operator/qdrant_api_key'
readonly STAGED_MANIFEST_FILE='/run/qdrant-operator/snapshot_manifest'
readonly STAGED_PROBE_FILE='/run/qdrant-operator/recovery_probe'
readonly REINDEX_ARTIFACT_ROOT='/var/lib/megacampus-qdrant-recovery/reindex'
readonly REQUIRED_METRICS_DIR='/var/lib/megacampus/qdrant-metrics'

fail() {
  printf '%s: %s\n' "$OPERATOR_NAME" "$1" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: qdrant-operator <command> [arguments]

Commands:
  bootstrap [options]                 Create/verify the physical collection and alias
  verify [options]                    Verify the physical collection and alias
  reindex plan|execute|verify [...]   Plan, execute, or verify source-driven reindex
  source-recovery plan|verify|execute|rollback|apply-dispositions|verify-dispositions
                                      Recover audited source files and dispositions
  reindex-worker                      Consume only a dedicated qdrant-reindex-<uuid> queue
  snapshot                            Create and record an authenticated snapshot
  restore-drill                       Restore and verify an isolated collection
  metrics-check                       Prove UID 1001 can write the shared metrics directory
  self-check                          Import all tools and prove the effective tool UID
  -h, --help                          Show this help
USAGE
}

require_qdrant_url() {
  [[ ${QDRANT_URL:-} == "$REQUIRED_QDRANT_URL" ]] ||
    fail "QDRANT_URL must equal $REQUIRED_QDRANT_URL"
}

require_upload_base() {
  [[ ${DOCLING_UPLOADS_BASE_PATH:-} == "$REQUIRED_UPLOAD_BASE" ]] ||
    fail "DOCLING_UPLOADS_BASE_PATH must equal $REQUIRED_UPLOAD_BASE"
}

require_reindex_queue() {
  [[ ${BULLMQ_QUEUE_NAME:-} =~ ^qdrant-reindex-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
    fail 'BULLMQ_QUEUE_NAME must be a dedicated qdrant-reindex-<uuid> queue'
}

require_reindex_worker_target() {
  local target alias
  target="${QDRANT_REINDEX_TARGET_COLLECTION:-}"
  alias="${QDRANT_COLLECTION_NAME:-course_embeddings}"
  [[ -n $target ]] ||
    fail 'QDRANT_REINDEX_TARGET_COLLECTION must name an explicit physical collection'
  [[ $target != "$alias" ]] ||
    fail 'QDRANT_REINDEX_TARGET_COLLECTION must not equal the stable alias'
}

target_collection_from_args() {
  local previous=''
  local argument
  for argument in "$@"; do
    if [[ $previous == '--target-collection' ]]; then
      printf '%s' "$argument"
      return 0
    fi
    if [[ $argument == --target-collection=* ]]; then
      printf '%s' "${argument#--target-collection=}"
      return 0
    fi
    previous=$argument
  done
  return 1
}

cli_value_from_args() {
  local option="$1"
  shift
  local previous='' argument
  for argument in "$@"; do
    if [[ $previous == "$option" ]]; then
      printf '%s' "$argument"
      return 0
    fi
    if [[ $argument == "$option="* ]]; then
      printf '%s' "${argument#*=}"
      return 0
    fi
    previous="$argument"
  done
  return 1
}

require_physical_target() {
  local target alias
  target="$(target_collection_from_args "$@")" ||
    fail '--target-collection must name an explicit physical collection'
  alias="${QDRANT_COLLECTION_NAME:-course_embeddings}"
  [[ -n $target && $target != "$alias" ]] ||
    fail '--target-collection must name a physical collection, not the stable alias'
}

require_reindex_execution_artifact() {
  local run_id artifact expected
  run_id="$(cli_value_from_args --run-id "$@" || true)"
  [[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
    fail '--run-id must be an explicit UUIDv4 for reindex execution'
  expected="$REINDEX_ARTIFACT_ROOT/$run_id.json"
  artifact="$(cli_value_from_args --artifact "$@" || true)"
  if [[ -n $artifact && $artifact != "$expected" ]]; then
    fail '--artifact must equal /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json'
  fi
  REINDEX_ARTIFACT_ARGS=()
  if [[ -z $artifact ]]; then
    REINDEX_ARTIFACT_ARGS=(--artifact "$expected")
  fi
}

read_secret_file() {
  local path="$1"
  local identity value

  [[ -f $path && ! -L $path && -r $path ]] || fail 'Qdrant API key file is missing or unreadable'
  identity="$(stat -c '%u:%g:%a' -- "$path")"
  [[ $identity == '0:0:400' ]] || fail 'Qdrant API key file must be root:root mode 0400'

  value="$(cat -- "$path"; printf x)"
  value="${value%x}"
  if [[ $value == *$'\r\n' ]]; then
    value="${value%$'\r\n'}"
  elif [[ $value == *$'\n' ]]; then
    value="${value%$'\n'}"
  fi
  [[ -n $value && $value != *$'\n'* && $value != *$'\r'* ]] ||
    fail 'Qdrant API key file must contain exactly one non-empty line'
  REPLY="$value"
}

node_privilege_args() {
  NODE_PRIVILEGE_ARGS=(--reuid="$NODE_UID" --regid="$NODE_GID")
  if [[ ${QDRANT_METRICS_GID:-} =~ ^[0-9]+$ ]]; then
    NODE_PRIVILEGE_ARGS+=(--groups="$QDRANT_METRICS_GID")
  else
    NODE_PRIVILEGE_ARGS+=(--clear-groups)
  fi
}

exec_as_node() {
  if [[ $(id -u) == "$NODE_UID" && $(id -g) == "$NODE_GID" ]]; then
    exec "$@"
  fi
  node_privilege_args
  exec /usr/bin/setpriv "${NODE_PRIVILEGE_ARGS[@]}" -- "$@"
}

require_normalized_absolute_path() {
  local value="$1"
  local label="$2"
  [[ $value == /* && $(realpath -m -- "$value") == "$value" ]] ||
    fail "$label must be a normalized absolute path"
}

require_source_recovery_arguments() {
  local mode="${1:-}"
  shift || true
  local manifest='' journal='' plan_input='' capability='' confirmation=''
  local previous='' argument value

  case "$mode" in
    plan|verify|execute|rollback|apply-dispositions|verify-dispositions) ;;
    *) fail 'source-recovery requires an approved mode' ;;
  esac

  for argument in "$@"; do
    if [[ -n $previous ]]; then
      value="$argument"
      case "$previous" in
        --manifest-path) manifest="$value" ;;
        --journal-path) journal="$value" ;;
        --plan-input-path) plan_input="$value" ;;
        --capability-probe-directory) capability="$value" ;;
        --confirm-run-id) confirmation="$value" ;;
      esac
      previous=''
      continue
    fi
    case "$argument" in
      --manifest-path|--journal-path|--plan-input-path|--capability-probe-directory|--confirm-run-id)
        previous="$argument"
        ;;
      --manifest-path=*|--journal-path=*|--plan-input-path=*|--capability-probe-directory=*|--confirm-run-id=*)
        value="${argument#*=}"
        case "${argument%%=*}" in
          --manifest-path) manifest="$value" ;;
          --journal-path) journal="$value" ;;
          --plan-input-path) plan_input="$value" ;;
          --capability-probe-directory) capability="$value" ;;
          --confirm-run-id) confirmation="$value" ;;
        esac
        ;;
    esac
  done
  [[ -z $previous ]] || fail "$previous requires a value"

  manifest="${manifest:-${SOURCE_RECOVERY_MANIFEST_PATH:-}}"
  journal="${journal:-${SOURCE_RECOVERY_JOURNAL_PATH:-}}"
  require_normalized_absolute_path "$manifest" 'source-recovery manifest path'
  require_normalized_absolute_path "$journal" 'source-recovery journal path'

  if [[ $mode == plan ]]; then
    plan_input="${plan_input:-${SOURCE_RECOVERY_PLAN_INPUT_PATH:-}}"
    capability="${capability:-${SOURCE_RECOVERY_CAPABILITY_PROBE_DIRECTORY:-}}"
    require_normalized_absolute_path "$plan_input" 'source-recovery plan input path'
    require_normalized_absolute_path "$capability" 'source-recovery capability directory'
  elif [[ $mode != verify ]]; then
    [[ $confirmation =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
      fail 'source-recovery mutating modes require --confirm-run-id UUIDv4'
  fi
}

load_raw_api_key() {
  read_secret_file "${QDRANT_API_KEY_FILE:-$DEFAULT_API_KEY_FILE}"
  export QDRANT_API_KEY="$REPLY"
  unset REPLY
}

stage_api_key_for_file_client() {
  read_secret_file "${QDRANT_API_KEY_FILE:-$DEFAULT_API_KEY_FILE}"
  install -d -o "$NODE_UID" -g "$NODE_GID" -m 0700 "$(dirname "$STAGED_API_KEY_FILE")"
  printf '%s' "$REPLY" > "$STAGED_API_KEY_FILE"
  unset REPLY
  chown "$NODE_UID:$NODE_GID" "$STAGED_API_KEY_FILE"
  chmod 0400 "$STAGED_API_KEY_FILE"
  export QDRANT_API_KEY_FILE="$STAGED_API_KEY_FILE"
}

stage_owner_only_file() {
  local source="$1"
  local target="$2"
  local identity

  [[ -f $source && ! -L $source && -r $source ]] ||
    fail 'Recovery input file is missing or unreadable'
  identity="$(stat -c '%u:%g:%a' -- "$source")"
  [[ $identity == '0:0:400' ]] || fail 'Recovery input file must be root:root mode 0400'
  install -d -o "$NODE_UID" -g "$NODE_GID" -m 0700 "$(dirname "$target")"
  install -o "$NODE_UID" -g "$NODE_GID" -m 0400 -- "$source" "$target"
}

run_self_check() {
  exec_as_node "$TSX_BIN" -e '
    const modules = [
      "./src/shared/qdrant/create-collection.ts",
      "./tools/qdrant/verify-collection.ts",
      "./tools/qdrant/reindex-course-embeddings.ts",
      "./tools/qdrant/source-recovery.ts",
      "./tools/qdrant/snapshot.ts",
      "./tools/qdrant/restore-drill.ts",
    ];
    Promise.all(modules.map(module => import(module))).then(() => {
      const uid = process.getuid?.();
      if (uid !== 1001) throw new Error(`operator tool UID must be 1001, received ${uid}`);
      process.stdout.write(JSON.stringify({ status: "ok", uid, modules: modules.length }) + "\n");
    });
  '
}

command_name="${1:---help}"
shift || true
REINDEX_ARTIFACT_ARGS=()

case "$command_name" in
  -h|--help|help)
    usage
    ;;
  self-check)
    run_self_check
    ;;
  bootstrap)
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      exec_as_node "$TSX_BIN" src/shared/qdrant/create-collection.ts "$@"
    fi
    require_qdrant_url
    load_raw_api_key
    exec_as_node "$TSX_BIN" src/shared/qdrant/create-collection.ts "$@"
    ;;
  verify)
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      exec_as_node "$TSX_BIN" tools/qdrant/verify-collection.ts "$@"
    fi
    require_qdrant_url
    load_raw_api_key
    exec_as_node "$TSX_BIN" tools/qdrant/verify-collection.ts "$@"
    ;;
  reindex)
    mode="${1:-}"
    if [[ $mode == '-h' || $mode == '--help' || -z $mode ]]; then
      exec_as_node "$TSX_BIN" tools/qdrant/reindex-course-embeddings.ts --help
    fi
    require_qdrant_url
    require_upload_base
    case "$mode" in
      plan)
        ;;
      execute)
        require_reindex_queue
        require_physical_target "$@"
        require_reindex_execution_artifact "$@"
        ;;
      verify)
        require_physical_target "$@"
        ;;
      *)
        fail 'reindex mode must be plan, execute, or verify'
        ;;
    esac
    load_raw_api_key
    exec_as_node "$TSX_BIN" tools/qdrant/reindex-course-embeddings.ts "$@" "${REINDEX_ARTIFACT_ARGS[@]}"
    ;;
  reindex-worker)
    require_qdrant_url
    require_upload_base
    require_reindex_queue
    require_reindex_worker_target
    [[ ${STAGE6_WORKER:-false} != 'true' ]] || fail 'reindex worker cannot run in Stage 6 mode'
    load_raw_api_key
    exec_as_node "$TSX_BIN" dist/orchestrator/worker-entrypoint.js
    ;;
  source-recovery)
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      exec_as_node "$TSX_BIN" tools/qdrant/source-recovery.ts "$@"
    fi
    require_source_recovery_arguments "$@"
    unset QDRANT_API_KEY QDRANT_API_KEY_FILE
    exec_as_node "$TSX_BIN" tools/qdrant/source-recovery.ts "$@"
    ;;
  snapshot)
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      printf 'Usage: qdrant-operator snapshot\n'
      exit 0
    fi
    [[ $# -eq 0 ]] || fail 'snapshot accepts no arguments'
    require_qdrant_url
    stage_api_key_for_file_client
    exec_as_node "$TSX_BIN" tools/qdrant/snapshot.ts
    ;;
  restore-drill)
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      printf 'Usage: qdrant-operator restore-drill\n'
      exit 0
    fi
    [[ $# -eq 0 ]] || fail 'restore-drill accepts no arguments'
    require_qdrant_url
    stage_api_key_for_file_client
    QDRANT_SNAPSHOT_MANIFEST_FILE="${QDRANT_SNAPSHOT_MANIFEST_FILE:-/run/secrets/snapshot_manifest}"
    QDRANT_RECOVERY_PROBE_FILE="${QDRANT_RECOVERY_PROBE_FILE:-/run/secrets/recovery_probe}"
    stage_owner_only_file "$QDRANT_SNAPSHOT_MANIFEST_FILE" "$STAGED_MANIFEST_FILE"
    stage_owner_only_file "$QDRANT_RECOVERY_PROBE_FILE" "$STAGED_PROBE_FILE"
    export QDRANT_SNAPSHOT_MANIFEST_FILE="$STAGED_MANIFEST_FILE"
    export QDRANT_RECOVERY_PROBE_FILE="$STAGED_PROBE_FILE"
    exec_as_node "$TSX_BIN" tools/qdrant/restore-drill.ts
    ;;
  metrics-check)
    [[ $# -eq 0 ]] || fail 'metrics-check accepts no arguments'
    [[ ${QDRANT_METRICS_TEXTFILE_DIR:-} == "$REQUIRED_METRICS_DIR" ]] ||
      fail "QDRANT_METRICS_TEXTFILE_DIR must equal $REQUIRED_METRICS_DIR"
    exec_as_node /usr/bin/bash -eu -c '
      path="$1"
      [[ -d "$path" && ! -L "$path" && -w "$path" ]]
      [[ $(/usr/bin/stat -c %a -- "$path") == 2775 ]]
    ' -- "$REQUIRED_METRICS_DIR"
    ;;
  *)
    fail "unknown command: $command_name"
    ;;
esac
