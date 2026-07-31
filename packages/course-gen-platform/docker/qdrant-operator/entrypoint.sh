#!/usr/bin/env bash
set -euo pipefail

umask 077

readonly OPERATOR_NAME='qdrant operator'
readonly TSX_BIN='/usr/local/bin/tsx'
readonly NODE_BIN='/usr/local/bin/node'
readonly NODE_UID='1001'
readonly NODE_GID='1001'
readonly CONTROLLER_UID='1000'
readonly CONTROLLER_GID='1000'
readonly REQUIRED_QDRANT_URL='http://qdrant:6333'
readonly REQUIRED_UPLOAD_BASE='/opt/megacampus/data'
readonly DEFAULT_API_KEY_FILE='/run/secrets/qdrant_api_key'
readonly STAGED_API_KEY_FILE='/run/qdrant-operator/qdrant_api_key'
readonly DEFAULT_Q12_DB_CAPABILITY_FILE='/run/secrets/q12_db_capability'
readonly STAGED_Q12_DB_CAPABILITY_FILE='/run/qdrant-operator/q12_db_capability'
readonly DEFAULT_Q12_PROBE_RECEIPT_FILE='/run/secrets/q12_database_barrier_probe_receipt'
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

# Both `execute` and `verify` are recovery-bound and share ONE durable run artifact under
# REINDEX_ARTIFACT_ROOT: execute writes it, verify refuses without it (verifyReindex ->
# 'Recovery-bound verify requires its exact durable run artifact'). The tool's own default is the
# relative artifacts/qdrant-reindex/<run-id>.json, which under `compose run --rm` on a read_only
# image resolves inside the container and dies with the run. Pinning only execute left verify
# reaching for that vanished default: measured 2026-07-31, a completed 234/234 execute could not be
# verified at all until --artifact was passed by hand.
require_reindex_run_artifact() {
  local run_id artifact expected
  run_id="$(cli_value_from_args --run-id "$@" || true)"
  [[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
    fail '--run-id must be an explicit UUIDv4 for a recovery-bound reindex run'
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

# These services run as root with `cap_drop: ALL` and only CHOWN/SETGID/SETUID added, so this
# process has NO DAC_OVERRIDE: a staging directory already owned by NODE_UID at mode 0700 refuses
# root's own writes. Keep it root-owned while root puts files in it and hand it over afterwards.
#
# Handing it over first is why every snapshot and restore-drill run has failed since the units were
# installed on 2026-07-17: the first enable, on 2026-07-31, died immediately with
# '/run/qdrant-operator/qdrant_api_key: Permission denied'. The timers had never been enabled, so
# nothing had ever exercised this path.
stage_owner_only_directory() {
  install -d -o 0 -g 0 -m 0700 "$1"
}

stage_owner_only_handover() {
  chown "$NODE_UID:$NODE_GID" "$1"
}

stage_api_key_for_file_client() {
  local staged_directory
  staged_directory="$(dirname "$STAGED_API_KEY_FILE")"
  read_secret_file "${QDRANT_API_KEY_FILE:-$DEFAULT_API_KEY_FILE}"
  stage_owner_only_directory "$staged_directory"
  printf '%s' "$REPLY" > "$STAGED_API_KEY_FILE"
  unset REPLY
  chown "$NODE_UID:$NODE_GID" "$STAGED_API_KEY_FILE"
  chmod 0400 "$STAGED_API_KEY_FILE"
  stage_owner_only_handover "$staged_directory"
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
  local staged_directory
  staged_directory="$(dirname "$target")"
  stage_owner_only_directory "$staged_directory"
  install -o "$NODE_UID" -g "$NODE_GID" -m 0400 -- "$source" "$target"
  stage_owner_only_handover "$staged_directory"
}

stage_q12_database_capability_if_requested() {
  local source identity probe_receipt probe_identity
  source="${Q12_DB_CAPABILITY_FILE:-}"
  if [[ -z $source ]]; then
    [[ -z ${Q12_DB_CAPABILITY_BOUND:-}${Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE:-}${Q12_RUN_ID:-}${Q12_EXPECTED_CATALOG_SHA256:-} ]] ||
      fail 'Q12 database capability binding marker is not operator-owned'
    return 0
  fi
  [[ -z ${Q12_DB_CAPABILITY_BOUND:-} ]] ||
    fail 'Q12 database capability binding marker is not operator-owned'
  [[ $source == "$DEFAULT_Q12_DB_CAPABILITY_FILE" ]] ||
    fail "Q12 database capability file must equal $DEFAULT_Q12_DB_CAPABILITY_FILE"
  [[ -f $source && ! -L $source && -r $source ]] ||
    fail 'Q12 database capability file is missing or unreadable'
  [[ $(realpath -e -- "$source") == "$source" ]] ||
    fail 'Q12 database capability file must be canonical'
  identity="$(stat -c '%u:%g:%a' -- "$source")"
  [[ $identity == "$CONTROLLER_UID:$CONTROLLER_GID:400" ]] ||
    fail 'Q12 database capability host bind must be owned by the fixed controller UID:GID with mode 0400'

  probe_receipt="${Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE:-}"
  [[ $probe_receipt == "$DEFAULT_Q12_PROBE_RECEIPT_FILE" ]] ||
    fail "Q12 database probe receipt must equal $DEFAULT_Q12_PROBE_RECEIPT_FILE"
  [[ ${Q12_RUN_ID:-} =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
    fail 'Q12 run identity is missing or invalid'
  [[ ${Q12_EXPECTED_CATALOG_SHA256:-} =~ ^[a-f0-9]{64}$ ]] ||
    fail 'Q12 expected catalog identity is missing or invalid'
  [[ -f $probe_receipt && ! -L $probe_receipt && -r $probe_receipt && $(realpath -e -- "$probe_receipt") == "$probe_receipt" ]] ||
    fail 'Q12 database probe receipt is missing or unsafe'
  probe_identity="$(stat -c '%u:%g:%a' -- "$probe_receipt")"
  [[ $probe_identity == "$CONTROLLER_UID:$CONTROLLER_GID:400" ]] ||
    fail 'Q12 database probe receipt host bind must be owned by the fixed controller UID:GID with mode 0400'
  "$NODE_BIN" -e '
    const fs=require("node:fs");
    const [path,run,catalog]=process.argv.slice(1);
    const canonical=value=>value&&typeof value==="object"&&!Array.isArray(value)
      ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    try {
      const value=JSON.parse(fs.readFileSync(path,"utf8"));
      const expectedProbes={auth_profile:"rejected_zero_residue",cron_rpc:"rejected_exact_jobs_unchanged",direct_supervisor:"rolled_back",pg_net_rpc:"rejected_zero_queue_zero_external_request",postgrest_anon:"rejected",postgrest_authenticated:"rejected",postgrest_preference_applied:"tx=rollback",postgrest_service_role_with_capability:"rolled_back",postgrest_service_role_without_capability:"rejected",storage_object:"rejected_zero_metadata_zero_bytes"};
      const expectedResidue={auth_rows:0,cron_job_set_unchanged:true,external_requests:0,guard_probe_rows:0,pg_net_queue_rows:0,storage_metadata_rows:0,storage_object_bytes:0};
      const exact=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
      if(!exact(Object.keys(value).sort(),["completed_at","expected_catalog_sha256","probes","residue","run_id","schema_version"])||
        value.schema_version!=="megacampus.q12.database-barrier-probes/v1"||value.run_id!==run||
        value.expected_catalog_sha256!==catalog||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(value.completed_at)||
        !exact(value.probes,expectedProbes)||!exact(value.residue,expectedResidue))process.exit(1);
    } catch { process.exit(1); }
  ' "$probe_receipt" "$Q12_RUN_ID" "$Q12_EXPECTED_CATALOG_SHA256" ||
    fail 'Q12 database probe receipt is incomplete or cross-wired'

  local staged_directory
  staged_directory="$(dirname "$STAGED_Q12_DB_CAPABILITY_FILE")"
  stage_owner_only_directory "$staged_directory"
  install -o "$NODE_UID" -g "$NODE_GID" -m 0400 -- \
    "$source" "$STAGED_Q12_DB_CAPABILITY_FILE"
  stage_owner_only_handover "$staged_directory"
  [[ $(stat -c '%u:%g:%a' -- "$STAGED_Q12_DB_CAPABILITY_FILE") == "$NODE_UID:$NODE_GID:400" ]] ||
    fail 'staged Q12 database capability must be owned by the fixed operator UID:GID with mode 0400'
  export Q12_DB_CAPABILITY_FILE="$STAGED_Q12_DB_CAPABILITY_FILE"
  export Q12_DB_CAPABILITY_BOUND=1
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
        require_reindex_run_artifact "$@"
        ;;
      verify)
        require_physical_target "$@"
        require_reindex_run_artifact "$@"
        ;;
      *)
        fail 'reindex mode must be plan, execute, or verify'
        ;;
    esac
    stage_q12_database_capability_if_requested
    load_raw_api_key
    exec_as_node "$TSX_BIN" tools/qdrant/reindex-course-embeddings.ts "$@" "${REINDEX_ARTIFACT_ARGS[@]}"
    ;;
  reindex-worker)
    require_qdrant_url
    require_upload_base
    require_reindex_queue
    require_reindex_worker_target
    [[ ${STAGE6_WORKER:-false} != 'true' ]] || fail 'reindex worker cannot run in Stage 6 mode'
    stage_q12_database_capability_if_requested
    load_raw_api_key
    if [[ ${Q12_DB_CAPABILITY_BOUND:-} == 1 ]]; then
      exec_as_node "$TSX_BIN" -e \
        'import("./tools/qdrant/source-recovery-database.ts").then(() => import("./dist/orchestrator/worker-entrypoint.js"))'
    fi
    exec_as_node "$TSX_BIN" dist/orchestrator/worker-entrypoint.js
    ;;
  source-recovery)
    unset QDRANT_API_KEY QDRANT_API_KEY_FILE QDRANT_READ_ONLY_API_KEY QDRANT_READ_ONLY_API_KEY_FILE
    if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
      exec_as_node "$TSX_BIN" tools/qdrant/source-recovery.ts "$@"
    fi
    require_source_recovery_arguments "$@"
    stage_q12_database_capability_if_requested
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
