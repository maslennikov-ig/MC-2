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
  reindex-worker                      Consume only a dedicated qdrant-reindex-<uuid> queue
  snapshot                            Create and record an authenticated snapshot
  restore-drill                       Restore and verify an isolated collection
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

require_physical_target() {
  local target alias
  target="$(target_collection_from_args "$@")" ||
    fail '--target-collection must name an explicit physical collection'
  alias="${QDRANT_COLLECTION_NAME:-course_embeddings}"
  [[ -n $target && $target != "$alias" ]] ||
    fail '--target-collection must name a physical collection, not the stable alias'
}

read_secret_file() {
  local path="$1"
  local mode value

  [[ -f $path && ! -L $path && -r $path ]] || fail 'Qdrant API key file is missing or unreadable'
  mode="$(stat -c '%a' -- "$path")"
  (( (8#$mode & 077) == 0 )) || fail 'Qdrant API key file permissions are unsafe'

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
  node_privilege_args
  exec /usr/bin/setpriv "${NODE_PRIVILEGE_ARGS[@]}" -- "$@"
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
  local mode

  [[ -f $source && ! -L $source && -r $source ]] ||
    fail 'Recovery input file is missing or unreadable'
  mode="$(stat -c '%a' -- "$source")"
  (( (8#$mode & 077) == 0 )) || fail 'Recovery input file permissions are unsafe'
  install -d -o "$NODE_UID" -g "$NODE_GID" -m 0700 "$(dirname "$target")"
  install -o "$NODE_UID" -g "$NODE_GID" -m 0400 -- "$source" "$target"
}

run_self_check() {
  exec_as_node "$TSX_BIN" -e '
    const modules = [
      "./src/shared/qdrant/create-collection.ts",
      "./tools/qdrant/verify-collection.ts",
      "./tools/qdrant/reindex-course-embeddings.ts",
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
        ;;
      verify)
        require_physical_target "$@"
        ;;
      *)
        fail 'reindex mode must be plan, execute, or verify'
        ;;
    esac
    load_raw_api_key
    exec_as_node "$TSX_BIN" tools/qdrant/reindex-course-embeddings.ts "$@"
    ;;
  reindex-worker)
    require_qdrant_url
    require_upload_base
    require_reindex_queue
    [[ ${STAGE6_WORKER:-false} != 'true' ]] || fail 'reindex worker cannot run in Stage 6 mode'
    load_raw_api_key
    exec_as_node "$TSX_BIN" dist/orchestrator/worker-entrypoint.js
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
  *)
    fail "unknown command: $command_name"
    ;;
esac
