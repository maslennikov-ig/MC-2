#!/usr/bin/env bash
set -Eeuo pipefail

export LC_ALL=C
umask 077
original_args=("$@")

readonly EXPECTED_SCHEMA='megacampus.q12.expected-post-migration-catalog/v1'
readonly RECEIPT_SCHEMA='megacampus.q12.database-barrier-receipt/v1'
readonly PROBE_RECEIPT_SCHEMA='megacampus.q12.database-barrier-probes/v1'
readonly DEFAULT_PROJECT_DIRECTORY='/opt/megacampus'
readonly DEFAULT_NODE_BIN='/usr/bin/node'
readonly REQUIRED_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
readonly TEST_MODE_TOKEN='mc2-synthetic-q12-database-barrier-test-only'
readonly STRUCTURAL_CATALOG_FILE="$(dirname "$(realpath -e -- "$0")")/q12-structural-catalog.sql"

fail() {
  printf 'q12 database barrier: %s\n' "$1" >&2
  exit "${2:-1}"
}

usage() {
  cat <<'USAGE'
Usage: q12-database-barrier.sh install|verify-extended|prepare-recovery|activate|rollback|cleanup \
  --run-id UUID --db-url-file PATH --ca-file PATH \
  --q12-db-capability-file PATH \
  --expected-post-migration-catalog PATH \
  --expected-post-migration-catalog-sha256 SHA256 \
  [--after-migration 20260711140000|20260711151000]

All connection and capability values are read from owner-checked files/FDs.
verify-extended is read-only and cannot repair guard drift.
USAGE
}

[[ $# -gt 0 ]] || { usage >&2; exit 64; }
command_name="$1"
shift
case "$command_name" in
  install|verify-extended|prepare-recovery|activate|rollback|cleanup) ;;
  -h|--help|help) usage; exit 0 ;;
  *) fail 'command must be install, verify-extended, prepare-recovery, activate, rollback, or cleanup' 64 ;;
esac

run_id=''
db_url_file=''
ca_file=''
capability_file=''
expected_catalog_file=''
expected_catalog_sha256=''
after_migration=''
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 && -n $2 ]] || fail "$1 requires a value" 64
  option="$1"
  value="$2"
  shift 2
  case "$option" in
    --run-id) run_id="$value" ;;
    --db-url-file) db_url_file="$value" ;;
    --ca-file) ca_file="$value" ;;
    --q12-db-capability-file) capability_file="$value" ;;
    --expected-post-migration-catalog) expected_catalog_file="$value" ;;
    --expected-post-migration-catalog-sha256) expected_catalog_sha256="$value" ;;
    --after-migration) after_migration="$value" ;;
    *) fail "unknown option: $option" 64 ;;
  esac
done

[[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
  fail '--run-id must be a lower-case UUIDv4'
[[ $expected_catalog_sha256 =~ ^[a-f0-9]{64}$ ]] ||
  fail '--expected-post-migration-catalog-sha256 must be lower-case SHA-256'
if [[ $command_name == verify-extended ]]; then
  case "$after_migration" in
    20260711140000|20260711151000) ;;
    *) fail 'verify-extended requires an approved --after-migration' ;;
  esac
elif [[ -n $after_migration ]]; then
  fail '--after-migration is accepted only by verify-extended'
fi

test_mode=0
trust_boundary='/'
project_directory="$DEFAULT_PROJECT_DIRECTORY"
node_bin="$DEFAULT_NODE_BIN"
if [[ -n ${MC2_Q12_BARRIER_TEST_MODE:-} ]]; then
  [[ ${MC2_Q12_BARRIER_TEST_MODE} == "$TEST_MODE_TOKEN" ]] || fail 'invalid protected test mode token'
  test_mode=1
  trust_boundary="${MC2_Q12_BARRIER_TEST_ROOT:-}"
  [[ $trust_boundary == /tmp/mc2-q12-barrier-* && -d $trust_boundary && ! -L $trust_boundary ]] ||
    fail 'protected test root must be a real /tmp/mc2-q12-barrier-* directory'
  [[ $(stat -c '%u:%g:%a' "$trust_boundary") == "$(id -u):$(id -g):700" ]] ||
    fail 'protected test root must be owner-only mode 0700'
  project_directory="${MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY:-$trust_boundary/project}"
  node_bin="${MC2_Q12_BARRIER_TEST_NODE:-}"
  [[ -x $node_bin && ! -L $node_bin && $node_bin == "$trust_boundary"/* ]] ||
    fail 'protected test node must be an executable below the test root'
else
  [[ -z ${MC2_Q12_BARRIER_TEST_ROOT:-}${MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY:-}${MC2_Q12_BARRIER_TEST_NODE:-} ]] ||
    fail 'test overrides require the exact protected test mode'
fi
readonly test_mode trust_boundary project_directory node_bin
fault_point="${MC2_Q12_BARRIER_FAULT_POINT:-}"
if [[ -n $fault_point ]]; then
  [[ $test_mode -eq 1 ]] || fail 'fault injection requires the exact protected test mode'
  case "$fault_point" in
    after-tx1-commit|before-second-terminate|before-tx2|before-receipt) ;;
    *) fail 'unknown protected database-barrier fault point' ;;
  esac
fi
readonly fault_point

require_absolute_path() {
  local label="$1"
  local path="$2"
  [[ $path == /* && $path != *$'\n'* && $path != *$'\r'* ]] || fail "$label must be an absolute control-free path"
}

require_safe_parent_chain() {
  local label="$1"
  local path="$2"
  local current="${path%/*}"
  local uid mode
  [[ -n $current ]] || current='/'
  while true; do
    [[ -d $current && ! -L $current && $(realpath -e -- "$current") == "$current" ]] ||
      fail "$label parent chain must contain only canonical non-symlink directories"
    IFS=: read -r uid mode <<<"$(stat -c '%u:%a' -- "$current")"
    [[ $uid == 0 || $uid == "$(id -u)" ]] || fail "$label parent has an unexpected owner"
    (( (8#$mode & 8#022) == 0 )) || fail "$label parent must not be group/world writable"
    [[ $current == "$trust_boundary" ]] && break
    [[ $current != / ]] || fail "$label is outside the trusted boundary"
    current="${current%/*}"
    [[ -n $current ]] || current='/'
  done
}

file_identity() {
  stat -c '%d:%i:%u:%g:%a:%F' -- "$1"
}

fd_identity() {
  stat -L -c '%d:%i:%u:%g:%a:%F' -- "/proc/self/fd/$1"
}

validate_file_path() {
  local label="$1"
  local path="$2"
  local allowed_modes="$3"
  require_absolute_path "$label" "$path"
  require_safe_parent_chain "$label" "$path"
  [[ -f $path && ! -L $path && $(realpath -e -- "$path") == "$path" ]] ||
    fail "$label must be a canonical non-symlink regular file"
  local identity device inode uid gid mode kind
  identity="$(file_identity "$path")"
  IFS=: read -r device inode uid gid mode kind <<<"$identity"
  [[ $kind == 'regular file' && $uid == "$(id -u)" && $gid == "$(id -g)" ]] ||
    fail "$label must be owned by the current UID:GID"
  case ":$allowed_modes:" in *":$mode:"*) ;; *) fail "$label has an unsafe mode" ;; esac
}

validate_code_file_path() {
  local label="$1" path="$2" identity uid gid mode kind
  require_absolute_path "$label" "$path"
  [[ -f $path && ! -L $path && $(realpath -e -- "$path") == "$path" ]] ||
    fail "$label must be a canonical non-symlink regular file"
  identity="$(file_identity "$path")"
  IFS=: read -r _ _ uid gid mode kind <<<"$identity"
  [[ $kind == 'regular file' && ($uid == 0 || $uid == "$(id -u)") && ($gid == 0 || $gid == "$(id -g)") ]] ||
    fail "$label has an unexpected owner"
  (( (8#$mode & 8#022) == 0 )) || fail "$label must not be group/world writable"
}

adopt_validated_fd() {
  local label="$1" path="$2" allowed_modes="$3" fd="$4"
  local -n identity_result="$5"
  validate_file_path "$label" "$path" "$allowed_modes"
  identity_result="$(file_identity "$path")"
  [[ ! -L $path && -e /proc/self/fd/$fd && $(fd_identity "$fd") == "$identity_result" ]] ||
    fail "$label O_NOFOLLOW descriptor identity changed while opening"
}

recheck_open_file() {
  local label="$1" path="$2" fd="$3" identity="$4"
  [[ ! -L $path && $(file_identity "$path") == "$identity" && $(fd_identity "$fd") == "$identity" ]] ||
    fail "$label identity changed after open"
}

if [[ $test_mode -eq 0 ]]; then
  [[ $db_url_file == '/opt/megacampus/secrets/supabase_db_url' ]] ||
    fail 'database URL must use the fixed production secret path'
  [[ $ca_file == '/opt/megacampus/secrets/prod-ca-2021.crt' ]] ||
    fail 'CA must use the fixed production trust path'
  [[ $capability_file == "/opt/megacampus/backups/q12/$run_id/secrets/db-capability" ]] ||
    fail 'database capability must use the fixed active-run path'
  [[ $expected_catalog_file == "/opt/megacampus/backups/q12/$run_id/expected-post-migration-catalog.json" ]] ||
    fail 'expected catalog must use the fixed active-run path'
else
  [[ $capability_file == "$trust_boundary/backups/q12/$run_id/secrets/db-capability" ]] ||
    fail 'test capability must use the fixed protected active-run path'
fi
run_root="$(dirname "$(dirname "$capability_file")")"
[[ -d $run_root && ! -L $run_root && $(stat -c '%u:%g:%a' "$run_root") == "$(id -u):$(id -g):700" ]] ||
  fail 'Q12 run root must be owner-only mode 0700'
receipt_file="$run_root/database-barrier-receipt.json"
probe_receipt_file="$run_root/database-barrier-probe-receipt.json"

url_fd='' ca_fd='' capability_fd='' catalog_fd='' probe_receipt_fd=''
url_identity='' ca_identity='' capability_identity='' catalog_identity='' probe_receipt_identity=''
validate_file_path 'database URL file' "$db_url_file" '400:600'
validate_file_path 'CA file' "$ca_file" '644'
validate_file_path 'database capability file' "$capability_file" '400'
validate_file_path 'expected catalog file' "$expected_catalog_file" '400'
validate_code_file_path 'canonical structural catalog SQL' "$STRUCTURAL_CATALOG_FILE"
probe_bootstrap_path=''
prior_receipt_bootstrap_path=''
case "$command_name" in verify-extended|prepare-recovery|activate|cleanup) probe_bootstrap_path="$probe_receipt_file" ;; esac
if [[ $command_name == prepare-recovery ]]; then
  prior_receipt_bootstrap_path="$receipt_file"
  validate_file_path 'final verified database barrier receipt' "$prior_receipt_bootstrap_path" '400'
fi
if [[ -n $probe_bootstrap_path ]]; then
  validate_file_path 'database barrier probe receipt' "$probe_bootstrap_path" '400'
fi
if [[ ${MC2_Q12_BARRIER_FD_BOOTSTRAPPED:-0} != 1 ]]; then
  readonly FD_BOOTSTRAP_PY='import os,stat,sys
script=sys.argv[1]
paths=sys.argv[2:9]
separator=sys.argv.index("--")
original=sys.argv[separator+1:]
for index,path in enumerate(paths):
    if not path:
        continue
    before=os.lstat(path)
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode) or os.path.realpath(path)!=path:
        raise SystemExit("unsafe Q12 input path")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    opened=os.fstat(fd)
    current=os.lstat(path)
    identity=lambda value:(value.st_dev,value.st_ino,value.st_uid,value.st_gid,stat.S_IMODE(value.st_mode),value.st_size)
    if identity(before)!=identity(opened) or identity(opened)!=identity(current) or stat.S_ISLNK(current.st_mode):
        raise SystemExit("Q12 input identity changed while opening")
    target=10+index
    os.dup2(fd,target,inheritable=True)
    if fd!=target:
        os.close(fd)
environment=dict(os.environ)
environment["MC2_Q12_BARRIER_FD_BOOTSTRAPPED"]="1"
os.execve("/bin/bash",["bash",script,*original],environment)'
  exec /usr/bin/python3 -c "$FD_BOOTSTRAP_PY" "$(realpath -e -- "$0")" \
    "$db_url_file" "$ca_file" "$capability_file" "$expected_catalog_file" "$probe_bootstrap_path" \
    "$STRUCTURAL_CATALOG_FILE" "$prior_receipt_bootstrap_path" \
    -- "${original_args[@]}"
fi
url_fd=10
ca_fd=11
capability_fd=12
catalog_fd=13
structural_catalog_fd=15
prior_receipt_fd=16
adopt_validated_fd 'database URL file' "$db_url_file" '400:600' "$url_fd" url_identity
adopt_validated_fd 'CA file' "$ca_file" '644' "$ca_fd" ca_identity
adopt_validated_fd 'database capability file' "$capability_file" '400' "$capability_fd" capability_identity
adopt_validated_fd 'expected catalog file' "$expected_catalog_file" '400' "$catalog_fd" catalog_identity
validate_code_file_path 'canonical structural catalog SQL' "$STRUCTURAL_CATALOG_FILE"
structural_catalog_identity="$(file_identity "$STRUCTURAL_CATALOG_FILE")"
[[ ! -L $STRUCTURAL_CATALOG_FILE && $(fd_identity "$structural_catalog_fd") == "$structural_catalog_identity" ]] ||
  fail 'canonical structural catalog SQL O_NOFOLLOW descriptor identity changed while opening'
STRUCTURAL_CATALOG_SQL="$(cat <&"$structural_catalog_fd")"
[[ -n $STRUCTURAL_CATALOG_SQL && $STRUCTURAL_CATALOG_SQL != *';'* ]] ||
  fail 'canonical structural catalog SQL must be one semicolon-free query'
readonly STRUCTURAL_CATALOG_SQL

actual_catalog_sha256="$(sha256sum "/proc/self/fd/$catalog_fd" | awk '{print $1}')"
[[ $actual_catalog_sha256 == "$expected_catalog_sha256" ]] || fail 'expected catalog SHA-256 does not match its opened FD'

rollback_probes_verified=false
probe_receipt_sha256=''
case "$command_name" in
  verify-extended|prepare-recovery|activate|cleanup)
    probe_receipt_fd=14
    adopt_validated_fd 'database barrier probe receipt' "$probe_receipt_file" '400' \
      "$probe_receipt_fd" probe_receipt_identity
    jq -e --arg schema "$PROBE_RECEIPT_SCHEMA" --arg run "$run_id" --arg catalog "$expected_catalog_sha256" '
      (keys | sort) == (["schema_version","run_id","expected_catalog_sha256","completed_at","probes","residue"] | sort) and
      .schema_version == $schema and .run_id == $run and .expected_catalog_sha256 == $catalog and
      (.completed_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$")) and
      .probes == {
        postgrest_anon:"rejected",
        postgrest_authenticated:"rejected",
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
        guard_probe_rows:0,
        auth_rows:0,
        storage_metadata_rows:0,
        storage_object_bytes:0,
        cron_job_set_unchanged:true,
        pg_net_queue_rows:0,
        external_requests:0
      }
    ' "/proc/self/fd/$probe_receipt_fd" >/dev/null || fail 'database barrier probe receipt is incomplete or cross-wired'
    probe_receipt_sha256="$(sha256sum "/proc/self/fd/$probe_receipt_fd" | awk '{print $1}')"
    rollback_probes_verified=true
    ;;
esac
readonly rollback_probes_verified probe_receipt_sha256

prior_receipt_identity=''
if [[ $command_name == prepare-recovery ]]; then
  adopt_validated_fd 'final verified database barrier receipt' "$receipt_file" '400' \
    "$prior_receipt_fd" prior_receipt_identity
  jq -e --arg schema "$RECEIPT_SCHEMA" --arg run "$run_id" --arg catalog "$expected_catalog_sha256" \
    --arg probe "$probe_receipt_sha256" '
    (keys | sort) == (["schema_version","run_id","state","zero_guard_residue",
      "expected_catalog_sha256","last_command","rollback_probes_verified",
      "probe_receipt_sha256"] | sort) and
    .schema_version == $schema and .run_id == $run and
    .expected_catalog_sha256 == $catalog and .zero_guard_residue == false and
    .rollback_probes_verified == true and .probe_receipt_sha256 == $probe and
    ((.state == "20260711151000_guard_verified" and .last_command == "verify-extended") or
     (.state == "recovery_ready_guarded" and .last_command == "prepare-recovery"))
  ' "/proc/self/fd/$prior_receipt_fd" >/dev/null ||
    fail 'prepare-recovery requires the exact final verified migration receipt'
fi

expected_json="$(cat <&"$catalog_fd")"
jq -e --arg schema "$EXPECTED_SCHEMA" '
  (keys | sort) == (["schema_version","database","database_owner","release_sha","migration_frontier","baseline_structural_sha256","expected_post_migration_catalog_sha256","inventory_counts","guarded_relations","cron_jobs","migrations"] | sort) and
  .schema_version == $schema and .database == "postgres" and .database_owner == "postgres" and
  (.release_sha | test("^[a-f0-9]{40}$")) and .migration_frontier == "20260704150249" and
  (.baseline_structural_sha256 | test("^[a-f0-9]{64}$")) and
  (.expected_post_migration_catalog_sha256 | test("^[a-f0-9]{64}$")) and
  .inventory_counts == {public:47,auth:22,storage:5,cron_jobs:8,pg_net_queue:0} and
  (.guarded_relations | type == "array" and length == 76) and
  ([.guarded_relations[].oid] | unique | length) == (.guarded_relations | length) and
  ([.guarded_relations[] | [.schema,.name] | join(".")] | unique | length) == (.guarded_relations | length) and
  ([.guarded_relations[] | select(
    (keys | sort) != (["schema","name","oid","relkind","parent_oid","owner"] | sort) or
    (.schema | test("^(public|auth|storage|cron|net)$") | not) or
    (.name | test("^[a-z_][a-z0-9_]*$") | not) or
    (.owner | test("^[a-z_][a-z0-9_]*$") | not) or
    (.relkind | test("^[rp]$") | not) or
    (.oid | type != "number") or
    ((.parent_oid != null) and (.parent_oid | type != "number"))
  )] | length) == 0 and
  ([.guarded_relations[] | select(.schema == "storage") | .name] | sort) ==
    (["buckets","buckets_analytics","objects","s3_multipart_uploads","s3_multipart_uploads_parts"] | sort) and
  ([.guarded_relations[] | select(.schema == "auth")] | length) == 22 and
  ([.guarded_relations[] | select(.schema == "public")] | length) == 47 and
  ([.guarded_relations[] | select(.schema == "auth" and .name == "schema_migrations")] | length) == 0 and
  ([.guarded_relations[] | select(.schema == "cron" and .name == "job")] | length) == 1 and
  ([.guarded_relations[] | select(.schema == "net" and .name == "http_request_queue")] | length) == 1 and
  (.cron_jobs | type == "array" and length == 8) and
  ([.cron_jobs[].jobid] | unique | length) == 8 and
  ([.cron_jobs[] | select((keys | sort) != (["jobid","username","command_sha256"] | sort) or .username != "postgres" or (.command_sha256 | test("^[a-f0-9]{64}$") | not))] | length) == 0 and
  (.migrations | keys | sort) == (["20260711140000","20260711151000"] | sort) and
  .migrations["20260711151000"].catalog_sha256 == .expected_post_migration_catalog_sha256 and
  ([.migrations[] | select(
    (keys | sort) != (["catalog_sha256","migration_file_sha256","relations"] | sort) or
    (.catalog_sha256 | test("^[a-f0-9]{64}$") | not) or
    (.migration_file_sha256 | test("^[a-f0-9]{64}$") | not) or
    (.relations | type != "array") or (.relations | length == 0)
    or (.relations != (.relations | sort_by(.schema,.name)))
  )] | length) == 0 and
  ([.migrations[].relations[] | select(
    (keys | sort) != (["schema","name","relkind","parent_schema","parent_name","owner"] | sort) or
    (.schema | test("^(public|auth|storage|cron|net)$") | not) or
    (.name | test("^[a-z_][a-z0-9_]*$") | not) or
    (.owner | test("^[a-z_][a-z0-9_]*$") | not) or
    (.relkind | test("^[rp]$") | not) or
    ((.parent_schema == null) != (.parent_name == null)) or
    ((.parent_schema != null) and
      ((.parent_schema | test("^(public|auth|storage|cron|net)$") | not) or
       (.parent_name | test("^[a-z_][a-z0-9_]*$") | not)))
  )] | length) == 0 and
  (([.guarded_relations] + [.migrations[].relations] | add) as $all |
    ([ $all[] | [.schema,.name] | join(".") ] | unique | length) == ($all | length))
' <<<"$expected_json" >/dev/null || fail 'expected catalog violates the frozen Q12 schema/exact inventory'
unset expected_json

base_lock_targets="$(jq -r '
  .guarded_relations | sort_by(.oid)
  | map("\"" + .schema + "\".\"" + .name + "\"") | join(", ")
' "/proc/self/fd/$catalog_fd")"
base_plus_first_lock_targets="$(jq -r '
  ([.guarded_relations] + [.migrations["20260711140000"].relations])
  | add | unique_by([.schema,.name]) | sort_by(.schema,.name)
  | map("\"" + .schema + "\".\"" + .name + "\"") | join(", ")
' "/proc/self/fd/$catalog_fd")"
all_lock_targets="$(jq -r '
  ([.guarded_relations] + [.migrations["20260711140000"].relations] + [.migrations["20260711151000"].relations])
  | add | unique_by([.schema,.name]) | sort_by(.schema,.name)
  | map("\"" + .schema + "\".\"" + .name + "\"") | join(", ")
' "/proc/self/fd/$catalog_fd")"
readonly STRUCTURAL_HISTORY_LOCK_TARGET='"supabase_migrations"."schema_migrations"'
base_lock_targets="$base_lock_targets, $STRUCTURAL_HISTORY_LOCK_TARGET"
base_plus_first_lock_targets="$base_plus_first_lock_targets, $STRUCTURAL_HISTORY_LOCK_TARGET"
all_lock_targets="$all_lock_targets, $STRUCTURAL_HISTORY_LOCK_TARGET"
[[ -n $base_lock_targets && -n $base_plus_first_lock_targets && -n $all_lock_targets ]] ||
  fail 'expected catalog produced an empty deterministic lock set'

sql_file="$(mktemp "$run_root/.q12-barrier-sql.$command_name.XXXXXX")"
chmod 0600 "$sql_file"
cleanup_sql() {
  if [[ -n ${sql_file:-} && -f $sql_file && ! -L $sql_file ]]; then
    rm -f -- "$sql_file"
    sync -d "$run_root" || true
  fi
  if [[ -n ${receipt_tmp:-} ]]; then
    rm -f -- "$receipt_tmp"
    sync -d "$run_root" || true
  fi
}
trap cleanup_sql EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

write_install_sql() {
  cat >"$sql_file" <<SQL
-- Q12_INSTALL_FRESH_BEGIN
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
DO \$q12\$
DECLARE expected jsonb := current_setting('megacampus.q12_expected_catalog')::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_prepared_xacts) THEN RAISE EXCEPTION 'prepared transactions are forbidden'; END IF;
  IF current_database() IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'wrong database/session identity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(expected->'guarded_relations')
      AS e(schema text,name text,oid oid,relkind "char",parent_oid oid,owner text)
    LEFT JOIN pg_namespace n ON n.nspname=e.schema
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.oid=e.oid AND c.relkind=e.relkind
    LEFT JOIN pg_roles owner ON owner.oid=c.relowner AND owner.rolname=e.owner
    LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid=c.oid
    WHERE c.oid IS NULL OR owner.oid IS NULL OR inheritance.inhparent IS DISTINCT FROM e.parent_oid
  ) THEN
    RAISE EXCEPTION 'guarded relation catalog/OID drift';
  END IF;
END \$q12\$;
LOCK TABLE $base_lock_targets IN ACCESS EXCLUSIVE MODE;
DO \$locked_identity\$
DECLARE expected jsonb := current_setting('megacampus.q12_expected_catalog')::jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(expected->'guarded_relations')
      AS e(schema text,name text,oid oid,relkind "char",parent_oid oid,owner text)
    LEFT JOIN pg_namespace n ON n.nspname=e.schema
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.oid=e.oid AND c.relkind=e.relkind
    LEFT JOIN pg_roles owner ON owner.oid=c.relowner AND owner.rolname=e.owner
    LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid=c.oid
    WHERE c.oid IS NULL OR owner.oid IS NULL OR inheritance.inhparent IS DISTINCT FROM e.parent_oid
  ) THEN
    RAISE EXCEPTION 'guarded relation catalog/OID drift after full lock';
  END IF;
END \$locked_identity\$;
DO \$structural\$
DECLARE actual_sha256 text;
BEGIN
  SELECT canonical.structural_sha256 INTO STRICT actual_sha256
  FROM (
$STRUCTURAL_CATALOG_SQL
  ) canonical;
  IF actual_sha256 IS DISTINCT FROM
     current_setting('megacampus.q12_expected_catalog')::jsonb->>'baseline_structural_sha256' THEN
    RAISE EXCEPTION 'pre-guard canonical structural catalog drift';
  END IF;
END \$structural\$;

CREATE SCHEMA q12_guard AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA q12_guard FROM PUBLIC;
CREATE TABLE q12_guard.active_run(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  run_id uuid NOT NULL,
  capability_sha256 text NOT NULL CHECK(capability_sha256 ~ '^[a-f0-9]{64}\$'),
  expected_catalog_sha256 text NOT NULL CHECK(expected_catalog_sha256 ~ '^[a-f0-9]{64}\$'),
  expected_catalog jsonb NOT NULL,
  activated boolean NOT NULL DEFAULT false
);
CREATE TABLE q12_guard.baseline(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  baseline jsonb NOT NULL,
  baseline_sha256 text NOT NULL CHECK(baseline_sha256 ~ '^[a-f0-9]{64}\$')
);
CREATE TABLE q12_guard.migration_guards(
  migration text PRIMARY KEY,
  catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[a-f0-9]{64}\$'),
  migration_file_sha256 text NOT NULL CHECK(migration_file_sha256 ~ '^[a-f0-9]{64}\$'),
  stable_expected jsonb NOT NULL,
  relation_set jsonb NOT NULL
);
CREATE TABLE q12_guard.probe(probe_id text PRIMARY KEY, touched_at timestamptz NOT NULL DEFAULT clock_timestamp());

INSERT INTO q12_guard.active_run(run_id,capability_sha256,expected_catalog_sha256,expected_catalog)
VALUES (
  current_setting('megacampus.q12_run_id')::uuid,
  current_setting('megacampus.q12_capability_sha256'),
  current_setting('megacampus.q12_expected_catalog_sha256'),
  current_setting('megacampus.q12_expected_catalog')::jsonb
);
INSERT INTO q12_guard.baseline(baseline,baseline_sha256)
SELECT payload, encode(extensions.digest(payload::text,'sha256'),'hex')
FROM (
  SELECT jsonb_build_object(
    'database_settings',COALESCE((
      SELECT to_jsonb(setting) FROM pg_db_role_setting setting
      WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND setrole=0
    ),'null'::jsonb),
    'default_transaction_read_only',(
      SELECT option FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) option
      WHERE s.setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND s.setrole=0
        AND option LIKE 'default_transaction_read_only=%' LIMIT 1
    ),
    'cron_jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) FROM cron.job j),
    'pg_net_queue_count',(SELECT count(*) FROM net.http_request_queue),
    'guarded_relations',current_setting('megacampus.q12_expected_catalog')::jsonb->'guarded_relations'
  ) payload
) captured;

CREATE FUNCTION q12_guard.assert_capability() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE active q12_guard.active_run%ROWTYPE; supplied text;
BEGIN
  SELECT * INTO STRICT active FROM q12_guard.active_run WHERE singleton;
  IF session_user='postgres' THEN
    supplied := current_setting('megacampus.q12_capability',true);
  ELSIF session_user='authenticator'
    AND COALESCE((current_setting('request.jwt.claims',true)::jsonb->>'role'),'')='service_role' THEN
    supplied := current_setting('request.headers',true)::jsonb->>'x-q12-capability';
  ELSE
    RAISE EXCEPTION 'Q12 database writes are maintenance-guarded';
  END IF;
  IF encode(extensions.digest(COALESCE(supplied,''),'sha256'),'hex') IS DISTINCT FROM active.capability_sha256 THEN
    RAISE EXCEPTION 'Q12 database writes require the active run capability';
  END IF;
END \$fn\$;

CREATE FUNCTION q12_guard.assert_controller_binding() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE active q12_guard.active_run%ROWTYPE;
BEGIN
  IF session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'Q12 controller binding requires the direct postgres role';
  END IF;
  PERFORM q12_guard.assert_capability();
  SELECT * INTO STRICT active FROM q12_guard.active_run WHERE singleton;
  IF active.run_id IS DISTINCT FROM NULLIF(current_setting('megacampus.q12_run_id',true),'')::uuid
    OR active.capability_sha256 IS DISTINCT FROM current_setting('megacampus.q12_capability_sha256',true)
    OR active.expected_catalog_sha256 IS DISTINCT FROM current_setting('megacampus.q12_expected_catalog_sha256',true)
    OR active.expected_catalog IS DISTINCT FROM NULLIF(current_setting('megacampus.q12_expected_catalog',true),'')::jsonb THEN
    RAISE EXCEPTION 'Q12 stored run truth differs from the current file-backed controller invocation';
  END IF;
END \$fn\$;

CREATE FUNCTION q12_guard.enforce_ddl_barrier() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
BEGIN
  PERFORM q12_guard.assert_capability();
END \$fn\$;

CREATE EVENT TRIGGER q12_guard_ddl_command_start
  ON ddl_command_start
  EXECUTE FUNCTION q12_guard.enforce_ddl_barrier();

CREATE FUNCTION q12_guard.quiesce_client_backends() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE client record; terminated boolean;
BEGIN
  PERFORM q12_guard.assert_controller_binding();
  FOR client IN
    SELECT pid,usename,state,xact_start,backend_xid,backend_xmin,backend_type
    FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'
    ORDER BY pid
  LOOP
    -- Supautils deliberately skips reserved/superuser roles. The source-owned
    -- supabase_admin clients are therefore a trusted managed-service boundary:
    -- only an exact idle, transaction-free client is accepted; all ordinary
    -- clients must be terminated successfully.
    IF client.usename='supabase_admin' THEN
      IF client.state IS DISTINCT FROM 'idle' OR client.xact_start IS NOT NULL
        OR client.backend_xid IS NOT NULL OR client.backend_xmin IS NOT NULL
        OR client.backend_type IS DISTINCT FROM 'client backend' THEN
        RAISE EXCEPTION 'unquiesced managed supabase_admin client blocks Q12 visibility proof';
      END IF;
    ELSE
      BEGIN
        terminated := pg_terminate_backend(client.pid,5000);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'unterminable non-allowlisted client blocks Q12 visibility proof';
      END;
      IF terminated IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'client termination did not complete during Q12 visibility proof';
      END IF;
    END IF;
  END LOOP;
END \$fn\$;

CREATE FUNCTION q12_guard.enforce_write_barrier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
BEGIN
  PERFORM q12_guard.assert_capability();
  IF TG_TABLE_SCHEMA='q12_guard' THEN
    IF TG_TABLE_NAME='migration_guards' AND TG_OP='INSERT' THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='active_run' AND TG_OP='UPDATE'
      AND OLD.singleton IS NOT DISTINCT FROM NEW.singleton
      AND OLD.run_id IS NOT DISTINCT FROM NEW.run_id
      AND OLD.capability_sha256 IS NOT DISTINCT FROM NEW.capability_sha256
      AND OLD.expected_catalog_sha256 IS NOT DISTINCT FROM NEW.expected_catalog_sha256
      AND OLD.expected_catalog IS NOT DISTINCT FROM NEW.expected_catalog
      AND OLD.activated=false AND NEW.activated=true THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Q12 durable guard truth is append-only';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSIF TG_OP='TRUNCATE' THEN RETURN NULL; ELSE RETURN NEW; END IF;
END \$fn\$;

CREATE FUNCTION q12_guard.verify_capability()
RETURNS TABLE(run_id uuid,expected_catalog_sha256 text,activated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
BEGIN
  PERFORM q12_guard.assert_capability();
  RETURN QUERY SELECT active.run_id,active.expected_catalog_sha256,active.activated
    FROM q12_guard.active_run active WHERE active.singleton;
END \$fn\$;

CREATE FUNCTION q12_guard.extend_guard(
  p_migration text,p_expected_relations jsonb,p_migration_file_sha256 text,
  p_expected_catalog_sha256 text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE expected jsonb; relation record; captured_relations jsonb;
BEGIN
  PERFORM q12_guard.assert_capability();
  SELECT expected_catalog INTO expected FROM q12_guard.active_run WHERE singleton FOR UPDATE;
  IF p_migration NOT IN ('20260711140000','20260711151000') OR
     p_expected_relations IS DISTINCT FROM expected->'migrations'->p_migration->'relations' OR
     p_migration_file_sha256 IS DISTINCT FROM expected->'migrations'->p_migration->>'migration_file_sha256' OR
     p_expected_catalog_sha256 IS DISTINCT FROM expected->'migrations'->p_migration->>'catalog_sha256' THEN
    RAISE EXCEPTION 'migration guard extension differs from the frozen catalog';
  END IF;
  IF p_migration='20260711151000' AND NOT EXISTS (
    SELECT 1 FROM q12_guard.migration_guards WHERE migration='20260711140000'
  ) THEN RAISE EXCEPTION 'observability guard extension requires the committed base guard'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
      'schema',x.schema,'name',x.name,'oid',c.oid::bigint,'relkind',c.relkind::text,
      'parent_schema',x.parent_schema,'parent_name',x.parent_name,
      'parent_oid',inheritance.inhparent::bigint,'owner',owner.rolname
    ) ORDER BY x.schema,x.name)
  INTO captured_relations
  FROM jsonb_to_recordset(p_expected_relations)
    AS x(schema text,name text,relkind "char",parent_schema text,parent_name text,owner text)
  JOIN pg_namespace n ON n.nspname=x.schema
  JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=x.name AND c.relkind=x.relkind
  JOIN pg_roles owner ON owner.oid=c.relowner AND owner.rolname=x.owner
  LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid=c.oid
  LEFT JOIN pg_class parent ON parent.oid=inheritance.inhparent
  LEFT JOIN pg_namespace parent_namespace ON parent_namespace.oid=parent.relnamespace
  WHERE (x.parent_schema IS NULL AND inheritance.inhparent IS NULL)
     OR (x.parent_schema IS NOT NULL AND parent_namespace.nspname=x.parent_schema AND parent.relname=x.parent_name);
  IF captured_relations IS NULL OR jsonb_array_length(captured_relations)<>jsonb_array_length(p_expected_relations) THEN
    RAISE EXCEPTION 'new migration stable relation catalog drift';
  END IF;
  FOR relation IN SELECT * FROM jsonb_to_recordset(captured_relations)
    AS x(schema text,name text,oid oid,relkind "char",parent_schema text,parent_name text,parent_oid oid,owner text)
    ORDER BY schema,name
  LOOP
    IF relation.parent_oid IS NULL THEN
      EXECUTE format('CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
    END IF;
    EXECUTE format('CREATE TRIGGER q12_guard_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
  END LOOP;
  INSERT INTO q12_guard.migration_guards(
    migration,catalog_sha256,migration_file_sha256,stable_expected,relation_set
  ) VALUES(
    p_migration,p_expected_catalog_sha256,p_migration_file_sha256,p_expected_relations,captured_relations
  );
END \$fn\$;

CREATE FUNCTION q12_guard.verify_expected_guards(p_after_migration text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE expected jsonb; expected_relations jsonb; required_migrations text[];
  structural_actual text; structural_expected text;
BEGIN
  PERFORM q12_guard.assert_controller_binding();
  SELECT expected_catalog INTO expected FROM q12_guard.active_run WHERE singleton;
  IF p_after_migration IS NULL THEN required_migrations := ARRAY[]::text[];
  ELSIF p_after_migration='20260711140000' THEN required_migrations := ARRAY['20260711140000'];
  ELSIF p_after_migration='20260711151000' THEN required_migrations := ARRAY['20260711140000','20260711151000'];
  ELSE RAISE EXCEPTION 'unsupported migration guard checkpoint';
  END IF;
  IF COALESCE((SELECT array_agg(migration ORDER BY migration) FROM q12_guard.migration_guards),ARRAY[]::text[])
       IS DISTINCT FROM required_migrations
    OR EXISTS (
      SELECT 1 FROM q12_guard.migration_guards guard
      WHERE guard.catalog_sha256 IS DISTINCT FROM expected->'migrations'->guard.migration->>'catalog_sha256'
        OR guard.migration_file_sha256 IS DISTINCT FROM expected->'migrations'->guard.migration->>'migration_file_sha256'
        OR guard.stable_expected IS DISTINCT FROM expected->'migrations'->guard.migration->'relations'
        OR (SELECT jsonb_agg(value - 'oid' - 'parent_oid' ORDER BY value->>'schema',value->>'name')
            FROM jsonb_array_elements(guard.relation_set)) IS DISTINCT FROM guard.stable_expected
    ) THEN RAISE EXCEPTION 'migration guard publication set missing or changed';
  END IF;
  expected_relations := expected->'guarded_relations';
  IF '20260711140000'=ANY(required_migrations) THEN
    expected_relations := expected_relations || (SELECT relation_set FROM q12_guard.migration_guards WHERE migration='20260711140000');
  END IF;
  IF '20260711151000'=ANY(required_migrations) THEN
    expected_relations := expected_relations || (SELECT relation_set FROM q12_guard.migration_guards WHERE migration='20260711151000');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(expected_relations)
      AS e(schema text,name text,oid oid,relkind "char",parent_oid oid,owner text)
    LEFT JOIN pg_namespace n ON n.nspname=e.schema
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.oid=e.oid AND c.relkind=e.relkind
    LEFT JOIN pg_roles owner ON owner.oid=c.relowner AND owner.rolname=e.owner
    LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid=c.oid
    WHERE c.oid IS NULL OR owner.oid IS NULL OR inheritance.inhparent IS DISTINCT FROM e.parent_oid
  ) THEN RAISE EXCEPTION 'guarded relation identity/owner/partition drift'; END IF;

  IF p_after_migration IS NULL THEN
    structural_expected := expected->>'baseline_structural_sha256';
  ELSIF p_after_migration='20260711140000' THEN
    structural_expected := expected->'migrations'->'20260711140000'->>'catalog_sha256';
  ELSE
    structural_expected := expected->>'expected_post_migration_catalog_sha256';
  END IF;
  SELECT canonical.structural_sha256 INTO STRICT structural_actual
  FROM (
$STRUCTURAL_CATALOG_SQL
  ) canonical;
  IF structural_actual IS DISTINCT FROM structural_expected THEN
    RAISE EXCEPTION 'canonical structural catalog drift at guard checkpoint';
  END IF;

  -- Compare the complete expected and actual trigger tuples. Partition leaf row
  -- clones are bound to the explicit root by root.tgrelid; TRUNCATE is explicit
  -- on every root, leaf, and standalone relation.
  IF EXISTS (
    WITH relation_expected AS (
      SELECT * FROM jsonb_to_recordset(expected_relations)
        AS e(schema text,name text,oid oid,relkind "char",parent_oid oid,owner text)
    ), expected_trigger AS (
      SELECT oid AS relid,'q12_guard_row'::name AS tgname,31::smallint AS tgtype,
        COALESCE(parent_oid,0::oid) AS parent_relid,'O'::"char" AS tgenabled,0::oid AS tgconstraint
      FROM relation_expected
      UNION ALL
      SELECT oid,'q12_guard_truncate'::name,34::smallint,0::oid,'O'::"char",0::oid
      FROM relation_expected
      UNION ALL
      SELECT format('q12_guard.%I',internal_table)::regclass::oid,
        'q12_guard_immutable'::name,31::smallint,0::oid,'O'::"char",0::oid
      FROM unnest(ARRAY['active_run','baseline','migration_guards']) internal_table
      UNION ALL
      SELECT format('q12_guard.%I',internal_table)::regclass::oid,
        'q12_guard_immutable_truncate'::name,34::smallint,0::oid,'O'::"char",0::oid
      FROM unnest(ARRAY['active_run','baseline','migration_guards']) internal_table
      UNION ALL
      SELECT 'q12_guard.probe'::regclass::oid,'q12_guard_row'::name,31::smallint,0::oid,'O'::"char",0::oid
      UNION ALL
      SELECT 'q12_guard.probe'::regclass::oid,'q12_guard_truncate'::name,34::smallint,0::oid,'O'::"char",0::oid
    ), actual_trigger AS (
      SELECT t.tgrelid,t.tgname,t.tgtype,
        CASE WHEN t.tgparentid=0 THEN 0::oid ELSE root.tgrelid END AS parent_relid,
        t.tgenabled,t.tgconstraint
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace n ON n.oid=p.pronamespace
      LEFT JOIN pg_trigger root ON root.oid=t.tgparentid
      WHERE n.nspname='q12_guard' AND p.proname='enforce_write_barrier' AND NOT t.tgisinternal
    ), trigger_delta AS (
      (SELECT * FROM expected_trigger EXCEPT SELECT * FROM actual_trigger)
      UNION ALL
      (SELECT * FROM actual_trigger EXCEPT SELECT * FROM expected_trigger)
    ) SELECT 1 FROM trigger_delta
  ) THEN RAISE EXCEPTION 'exact Q12 row/TRUNCATE trigger set or tgparentid drift'; END IF;

  IF (SELECT array_agg(c.relname::text ORDER BY c.relname::text) FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='q12_guard' AND c.relkind='r')
       IS DISTINCT FROM ARRAY['active_run','baseline','migration_guards','probe']
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='q12_guard' AND c.relkind IN ('r','p','S')
        AND (c.relkind<>'r' OR c.relowner<>'postgres'::regrole))
    OR (SELECT array_agg(p.proname::text ORDER BY p.proname::text) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['assert_capability','assert_controller_binding','enforce_ddl_barrier','enforce_write_barrier','extend_guard','quiesce_client_backends','verify_activated_state','verify_capability','verify_expected_guards','verify_install_resume_state']
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='q12_guard' AND (p.proowner<>'postgres'::regrole OR NOT p.prosecdef
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, q12_guard']))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
      WHERE n.nspname='q12_guard' AND acl.grantee<>c.relowner)
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE n.nspname='q12_guard' AND acl.grantee<>p.proowner)
    OR EXISTS (SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
      WHERE n.nspname='q12_guard' AND (n.nspowner<>'postgres'::regrole OR acl.grantee<>n.nspowner))
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) acl
      WHERE n.nspname='q12_guard' AND (t.typowner<>'postgres'::regrole OR acl.grantee<>t.typowner))
    OR (SELECT array_agg(t.typname::text ORDER BY t.typname::text) FROM pg_type t
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['_active_run','_baseline','_migration_guards','_probe','active_run','baseline','migration_guards','probe']
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='q12_guard' AND (
        (p.proname='extend_guard' AND p.proargnames IS DISTINCT FROM
          ARRAY['p_migration','p_expected_relations','p_migration_file_sha256','p_expected_catalog_sha256'])
        OR (p.proname='verify_expected_guards' AND p.proargnames IS DISTINCT FROM ARRAY['p_after_migration'])
      ))
    OR NOT EXISTS (
      SELECT 1 FROM pg_event_trigger event_trigger
      JOIN pg_roles owner ON owner.oid=event_trigger.evtowner
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE event_trigger.evtname='q12_guard_ddl_command_start'
        AND owner.rolname='postgres' AND event_trigger.evtevent='ddl_command_start'
        AND event_trigger.evtenabled='O' AND event_trigger.evttags IS NULL
        AND function_namespace.nspname='q12_guard'
        AND function_object.proname='enforce_ddl_barrier'
        AND pg_get_function_identity_arguments(function_object.oid)=''
    )
    OR (SELECT count(*) FROM pg_event_trigger event_trigger
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE function_namespace.nspname='q12_guard') <> 1
  THEN RAISE EXCEPTION 'q12_guard exact owner/object/ACL/function set drift'; END IF;
END \$fn\$;

CREATE FUNCTION q12_guard.verify_install_resume_state() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE saved jsonb; current_database_setting jsonb;
  saved_other_settings jsonb; current_other_settings jsonb; current_default text;
BEGIN
  PERFORM q12_guard.assert_controller_binding();
  PERFORM q12_guard.verify_expected_guards(NULL);
  SELECT baseline INTO STRICT saved FROM q12_guard.baseline WHERE singleton;
  SELECT COALESCE((SELECT to_jsonb(setting) FROM pg_db_role_setting setting
    WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND setrole=0),'null'::jsonb)
    INTO current_database_setting;
  SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO saved_other_settings
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(saved->'database_settings'->'setconfig')='array'
      THEN saved->'database_settings'->'setconfig' ELSE '[]'::jsonb END) item(value)
    WHERE value NOT LIKE 'default_transaction_read_only=%';
  SELECT max(value) FILTER (WHERE value LIKE 'default_transaction_read_only=%')
    INTO current_default
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(current_database_setting->'setconfig')='array'
      THEN current_database_setting->'setconfig' ELSE '[]'::jsonb END) item(value);
  SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO current_other_settings
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(current_database_setting->'setconfig')='array'
      THEN current_database_setting->'setconfig' ELSE '[]'::jsonb END) item(value)
    WHERE value NOT LIKE 'default_transaction_read_only=%';
  IF (saved->'database_settings' - 'setconfig') IS DISTINCT FROM (current_database_setting - 'setconfig')
    OR saved_other_settings IS DISTINCT FROM current_other_settings
    OR (current_default IS DISTINCT FROM saved->>'default_transaction_read_only'
      AND current_default IS DISTINCT FROM 'default_transaction_read_only=on')
    OR (SELECT activated FROM q12_guard.active_run WHERE singleton)
    OR (SELECT count(*) FROM cron.job WHERE active)<>0
    OR (SELECT count(*) FROM net.http_request_queue)<>0 THEN
    RAISE EXCEPTION 'durable install resume state drift';
  END IF;
END \$fn\$;

CREATE FUNCTION q12_guard.verify_activated_state() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS \$fn\$
DECLARE saved jsonb; current_database_setting jsonb;
BEGIN
  PERFORM q12_guard.assert_controller_binding();
  SELECT baseline INTO STRICT saved FROM q12_guard.baseline WHERE singleton;
  SELECT COALESCE((SELECT to_jsonb(setting) FROM pg_db_role_setting setting
    WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND setrole=0),'null'::jsonb)
    INTO current_database_setting;
  IF NOT (SELECT activated FROM q12_guard.active_run WHERE singleton)
    OR current_database_setting IS DISTINCT FROM saved->'database_settings'
    OR (SELECT jsonb_agg(to_jsonb(current_job) ORDER BY jobid) FROM cron.job current_job)
         IS DISTINCT FROM saved->'cron_jobs'
    OR (SELECT count(*) FROM net.http_request_queue) IS DISTINCT FROM (saved->>'pg_net_queue_count')::bigint
    OR (SELECT array_agg(relation.relname::text ORDER BY relation.relname::text)
        FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='q12_guard' AND relation.relkind='r')
         IS DISTINCT FROM ARRAY['active_run','baseline','migration_guards']
    OR (SELECT array_agg(function_object.proname::text ORDER BY function_object.proname::text)
        FROM pg_proc function_object JOIN pg_namespace namespace ON namespace.oid=function_object.pronamespace
        WHERE namespace.nspname='q12_guard')
         IS DISTINCT FROM ARRAY['assert_capability','assert_controller_binding','enforce_ddl_barrier','enforce_write_barrier','extend_guard','quiesce_client_backends','verify_activated_state','verify_capability','verify_expected_guards','verify_install_resume_state']
    OR (SELECT array_agg(type_object.typname::text ORDER BY type_object.typname::text)
        FROM pg_type type_object JOIN pg_namespace namespace ON namespace.oid=type_object.typnamespace
        WHERE namespace.nspname='q12_guard')
         IS DISTINCT FROM ARRAY['_active_run','_baseline','_migration_guards','active_run','baseline','migration_guards']
    OR EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='q12_guard' AND relation.relkind IN ('r','p','S')
          AND (relation.relkind<>'r' OR relation.relowner<>'postgres'::regrole))
    OR EXISTS (SELECT 1 FROM pg_proc function_object JOIN pg_namespace namespace ON namespace.oid=function_object.pronamespace
        WHERE namespace.nspname='q12_guard' AND (function_object.proowner<>'postgres'::regrole
          OR NOT function_object.prosecdef
          OR function_object.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, q12_guard']))
    OR EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) acl
        WHERE namespace.nspname='q12_guard' AND acl.grantee<>relation.relowner)
    OR EXISTS (SELECT 1 FROM pg_proc function_object JOIN pg_namespace namespace ON namespace.oid=function_object.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(function_object.proacl,acldefault('f',function_object.proowner))) acl
        WHERE namespace.nspname='q12_guard' AND acl.grantee<>function_object.proowner)
    OR EXISTS (SELECT 1 FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl,acldefault('n',namespace.nspowner))) acl
        WHERE namespace.nspname='q12_guard'
          AND (namespace.nspowner<>'postgres'::regrole OR acl.grantee<>namespace.nspowner))
    OR EXISTS (SELECT 1 FROM pg_type type_object JOIN pg_namespace namespace ON namespace.oid=type_object.typnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(type_object.typacl,acldefault('T',type_object.typowner))) acl
        WHERE namespace.nspname='q12_guard'
          AND (type_object.typowner<>'postgres'::regrole OR acl.grantee<>type_object.typowner))
    OR COALESCE((SELECT array_agg(migration ORDER BY migration) FROM q12_guard.migration_guards),ARRAY[]::text[])
         IS DISTINCT FROM ARRAY['20260711140000','20260711151000']
    OR EXISTS (
      SELECT 1 FROM q12_guard.migration_guards guard CROSS JOIN q12_guard.active_run active
      WHERE guard.catalog_sha256 IS DISTINCT FROM active.expected_catalog->'migrations'->guard.migration->>'catalog_sha256'
        OR guard.migration_file_sha256 IS DISTINCT FROM active.expected_catalog->'migrations'->guard.migration->>'migration_file_sha256'
        OR guard.stable_expected IS DISTINCT FROM active.expected_catalog->'migrations'->guard.migration->'relations'
        OR (SELECT jsonb_agg(value - 'oid' - 'parent_oid' ORDER BY value->>'schema',value->>'name')
            FROM jsonb_array_elements(guard.relation_set)) IS DISTINCT FROM guard.stable_expected
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_event_trigger event_trigger
      JOIN pg_roles owner ON owner.oid=event_trigger.evtowner
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE event_trigger.evtname='q12_guard_ddl_command_start'
        AND owner.rolname='postgres' AND event_trigger.evtevent='ddl_command_start'
        AND event_trigger.evtenabled='O' AND event_trigger.evttags IS NULL
        AND function_namespace.nspname='q12_guard' AND function_object.proname='enforce_ddl_barrier'
        AND pg_get_function_identity_arguments(function_object.oid)=''
    )
    OR (SELECT count(*) FROM pg_event_trigger event_trigger
        JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
        JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
        WHERE function_namespace.nspname='q12_guard') <> 1
    OR EXISTS (
      WITH expected(table_name,trigger_name,trigger_type) AS (
        VALUES
          ('active_run','q12_guard_immutable',31::smallint),
          ('active_run','q12_guard_immutable_truncate',34::smallint),
          ('baseline','q12_guard_immutable',31::smallint),
          ('baseline','q12_guard_immutable_truncate',34::smallint),
          ('migration_guards','q12_guard_immutable',31::smallint),
          ('migration_guards','q12_guard_immutable_truncate',34::smallint)
      ), actual AS (
        SELECT relation.relname::text,trigger_object.tgname::text,trigger_object.tgtype
        FROM pg_trigger trigger_object
        JOIN pg_class relation ON relation.oid=trigger_object.tgrelid
        JOIN pg_namespace relation_namespace ON relation_namespace.oid=relation.relnamespace
        JOIN pg_proc function_object ON function_object.oid=trigger_object.tgfoid
        JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
        WHERE function_namespace.nspname='q12_guard' AND function_object.proname='enforce_write_barrier'
          AND NOT trigger_object.tgisinternal
      ), delta AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      ) SELECT 1 FROM delta
    )
  THEN RAISE EXCEPTION 'exact durable activated Q12 state drift'; END IF;
END \$fn\$;

DO \$q12\$
DECLARE expected jsonb := current_setting('megacampus.q12_expected_catalog')::jsonb; relation record;
BEGIN
  FOR relation IN SELECT * FROM jsonb_to_recordset(expected->'guarded_relations')
    AS x(schema text,name text,oid oid,relkind "char",parent_oid oid) WHERE parent_oid IS NULL ORDER BY oid
  LOOP
    EXECUTE format('CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
  END LOOP;
  FOR relation IN SELECT * FROM jsonb_to_recordset(expected->'guarded_relations')
    AS x(schema text,name text,oid oid,relkind "char",parent_oid oid) ORDER BY oid
  LOOP
    EXECUTE format('CREATE TRIGGER q12_guard_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
  END LOOP;
END \$q12\$;

CREATE TRIGGER q12_guard_immutable BEFORE INSERT OR UPDATE OR DELETE ON q12_guard.active_run
  FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_immutable_truncate BEFORE TRUNCATE ON q12_guard.active_run
  FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_immutable BEFORE INSERT OR UPDATE OR DELETE ON q12_guard.baseline
  FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_immutable_truncate BEFORE TRUNCATE ON q12_guard.baseline
  FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_immutable BEFORE INSERT OR UPDATE OR DELETE ON q12_guard.migration_guards
  FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_immutable_truncate BEFORE TRUNCATE ON q12_guard.migration_guards
  FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE ON q12_guard.probe
  FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier();
CREATE TRIGGER q12_guard_truncate BEFORE TRUNCATE ON q12_guard.probe
  FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier();

REVOKE ALL ON ALL TABLES IN SCHEMA q12_guard FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA q12_guard FROM PUBLIC;
DO \$acl\$
DECLARE object record; grantee name;
BEGIN
  FOR object IN SELECT c.oid,c.relname,c.relowner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='q12_guard'
  LOOP
    FOR grantee IN SELECT r.rolname FROM aclexplode(COALESCE(object.relacl,acldefault('r',object.relowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE a.grantee<>object.relowner
    LOOP EXECUTE format('REVOKE ALL ON TABLE q12_guard.%I FROM %I',object.relname,grantee); END LOOP;
  END LOOP;
  FOR object IN SELECT t.typname,t.typowner,t.typacl FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='q12_guard'
  LOOP
    EXECUTE format('REVOKE ALL ON TYPE q12_guard.%I FROM PUBLIC',object.typname);
    FOR grantee IN SELECT r.rolname FROM aclexplode(COALESCE(object.typacl,acldefault('T',object.typowner))) a
      JOIN pg_roles r ON r.oid=a.grantee WHERE a.grantee<>object.typowner
    LOOP EXECUTE format('REVOKE ALL ON TYPE q12_guard.%I FROM %I',object.typname,grantee); END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='q12_guard' AND a.grantee<>c.relowner)
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='q12_guard' AND a.grantee<>p.proowner)
    OR EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='q12_guard' AND a.grantee<>n.nspowner)
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) a
      WHERE n.nspname='q12_guard' AND a.grantee<>t.typowner)
  THEN RAISE EXCEPTION 'q12_guard ACL is not owner-only'; END IF;
  IF (SELECT array_agg(c.relname::text ORDER BY c.relname::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='q12_guard' AND c.relkind='r')
       IS DISTINCT FROM ARRAY['active_run','baseline','migration_guards','probe']
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='q12_guard' AND c.relkind IN ('r','p','S') AND (c.relkind<>'r' OR c.relowner<>'postgres'::regrole))
    OR (SELECT array_agg(p.proname::text ORDER BY p.proname::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['assert_capability','assert_controller_binding','enforce_ddl_barrier','enforce_write_barrier','extend_guard','quiesce_client_backends','verify_activated_state','verify_capability','verify_expected_guards','verify_install_resume_state']
    OR (SELECT array_agg(t.typname::text ORDER BY t.typname::text) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['_active_run','_baseline','_migration_guards','_probe','active_run','baseline','migration_guards','probe']
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='q12_guard' AND (
        (p.proname='extend_guard' AND p.proargnames IS DISTINCT FROM ARRAY['p_migration','p_expected_relations','p_migration_file_sha256','p_expected_catalog_sha256'])
        OR (p.proname='verify_expected_guards' AND p.proargnames IS DISTINCT FROM ARRAY['p_after_migration'])
      ))
    OR NOT EXISTS (
      SELECT 1 FROM pg_event_trigger event_trigger
      JOIN pg_roles owner ON owner.oid=event_trigger.evtowner
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE event_trigger.evtname='q12_guard_ddl_command_start'
        AND owner.rolname='postgres' AND event_trigger.evtevent='ddl_command_start'
        AND event_trigger.evtenabled='O' AND event_trigger.evttags IS NULL
        AND function_namespace.nspname='q12_guard'
        AND function_object.proname='enforce_ddl_barrier'
        AND pg_get_function_identity_arguments(function_object.oid)=''
    )
    OR (SELECT count(*) FROM pg_event_trigger event_trigger
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE function_namespace.nspname='q12_guard') <> 1
  THEN RAISE EXCEPTION 'q12_guard owner/object set is not exact'; END IF;
END \$acl\$;

DO \$cron\$
DECLARE expected jsonb := current_setting('megacampus.q12_expected_catalog')::jsonb;
BEGIN
  IF jsonb_array_length(expected->'cron_jobs') <> 8 OR (SELECT count(*) FROM cron.job WHERE active)<>8 THEN
    RAISE EXCEPTION 'exact eight active cron rows are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cron.job j LEFT JOIN jsonb_to_recordset(expected->'cron_jobs') e(jobid bigint,username text,command_sha256 text)
      ON e.jobid=j.jobid AND e.username=j.username AND e.command_sha256=encode(extensions.digest(j.command,'sha256'),'hex')
    WHERE j.active AND e.jobid IS NULL
  ) THEN RAISE EXCEPTION 'cron row/hash drift'; END IF;
  IF (SELECT count(*) FROM net.http_request_queue)<>0 THEN RAISE EXCEPTION 'pg_net request queue must be empty'; END IF;
  UPDATE cron.job SET active=false WHERE active;
  IF (SELECT count(*) FROM cron.job WHERE active)<>0 OR (SELECT count(*) FROM net.http_request_queue)<>0 THEN
    RAISE EXCEPTION 'cron/pg_net barrier did not settle';
  END IF;
END \$cron\$;
SELECT q12_guard.verify_expected_guards(NULL);
SELECT q12_guard.quiesce_client_backends();
COMMIT;
-- Q12_INSTALL_TX1_COMMITTED
-- Q12_INSTALL_SECOND_TERMINATE
SELECT q12_guard.quiesce_client_backends();
-- Q12_INSTALL_TX2_BEGIN
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
LOCK TABLE $base_lock_targets IN ACCESS EXCLUSIVE MODE;
SELECT q12_guard.verify_install_resume_state();
COMMIT;
ALTER DATABASE postgres SET default_transaction_read_only=on;
SELECT q12_guard.quiesce_client_backends();
-- Q12_INSTALL_FRESH_END
-- Q12_INSTALL_RESUME_BEGIN
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.verify_install_resume_state();
COMMIT;
-- Q12_INSTALL_SECOND_TERMINATE
SELECT q12_guard.quiesce_client_backends();
-- Q12_INSTALL_TX2_BEGIN
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
LOCK TABLE $base_lock_targets IN ACCESS EXCLUSIVE MODE;
SELECT q12_guard.verify_install_resume_state();
COMMIT;
ALTER DATABASE postgres SET default_transaction_read_only=on;
SELECT q12_guard.quiesce_client_backends();
-- Q12_INSTALL_RESUME_END
SQL
}

write_verify_sql() {
  local verify_lock_targets
  if [[ $after_migration == 20260711140000 ]]; then
    verify_lock_targets="$base_plus_first_lock_targets"
  else
    verify_lock_targets="$all_lock_targets"
  fi
  cat >"$sql_file" <<SQL
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
LOCK TABLE $verify_lock_targets IN ACCESS EXCLUSIVE MODE;
SELECT q12_guard.verify_expected_guards('$after_migration');
DO \$verify\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='q12_guard' AND c.relkind='S') THEN
    RAISE EXCEPTION 'q12_guard sequence residue';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE active)<>0 OR (SELECT count(*) FROM net.http_request_queue)<>0 THEN
    RAISE EXCEPTION 'cron/pg_net maintenance barrier drift';
  END IF;
END \$verify\$;
COMMIT;
SQL
}

write_prepare_recovery_sql() {
  cat >"$sql_file" <<SQL
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
SELECT q12_guard.verify_expected_guards('20260711151000');
DO \$readiness\$
DECLARE saved jsonb; current_database_setting jsonb; current_default text;
  saved_other_settings jsonb; current_other_settings jsonb;
BEGIN
  SELECT baseline INTO STRICT saved FROM q12_guard.baseline WHERE singleton;
  SELECT COALESCE((SELECT to_jsonb(setting) FROM pg_db_role_setting setting
    WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND setrole=0),'null'::jsonb)
    INTO current_database_setting;
  SELECT max(value) FILTER (WHERE value LIKE 'default_transaction_read_only=%') INTO current_default
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(current_database_setting->'setconfig')='array'
      THEN current_database_setting->'setconfig' ELSE '[]'::jsonb END) item(value);
  SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO saved_other_settings
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(saved->'database_settings'->'setconfig')='array'
      THEN saved->'database_settings'->'setconfig' ELSE '[]'::jsonb END) item(value)
    WHERE value NOT LIKE 'default_transaction_read_only=%';
  SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO current_other_settings
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(current_database_setting->'setconfig')='array'
      THEN current_database_setting->'setconfig' ELSE '[]'::jsonb END) item(value)
    WHERE value NOT LIKE 'default_transaction_read_only=%';
  IF (saved->'database_settings' - 'setconfig') IS DISTINCT FROM (current_database_setting - 'setconfig')
    OR saved_other_settings IS DISTINCT FROM current_other_settings
    OR current_default IS DISTINCT FROM 'default_transaction_read_only=on'
    OR (SELECT activated FROM q12_guard.active_run WHERE singleton)
    OR (SELECT count(*) FROM cron.job WHERE active)<>0
    OR (SELECT count(*) FROM net.http_request_queue)<>0 THEN
    RAISE EXCEPTION 'cron/pg_net recovery readiness drift';
  END IF;
END \$readiness\$;
COMMIT;
SELECT q12_guard.quiesce_client_backends();
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
SELECT q12_guard.verify_expected_guards('20260711151000');
DO \$settled\$
BEGIN
  IF (SELECT activated FROM q12_guard.active_run WHERE singleton)
    OR (SELECT count(*) FROM cron.job WHERE active)<>0
    OR (SELECT count(*) FROM net.http_request_queue)<>0 THEN
    RAISE EXCEPTION 'cron/pg_net recovery readiness drift';
  END IF;
END \$settled\$;
COMMIT;
SQL
}

write_restore_sql() {
  local drop_schema="$1"
  cat >"$sql_file" <<SQL
$(if [[ $drop_schema == false ]]; then printf '%s\n' '-- Q12_ACTIVATE_NORMAL_BEGIN'; fi)
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
$(if [[ $drop_schema == false ]]; then
    printf 'LOCK TABLE %s IN ACCESS EXCLUSIVE MODE;\n%s\n' "$all_lock_targets" \
      "SELECT q12_guard.verify_expected_guards('20260711151000');"
  else
    cat <<'ROLLBACK_LOCK_SQL'
LOCK TABLE "supabase_migrations"."schema_migrations" IN ACCESS EXCLUSIVE MODE;
DO $rollback_lock$
DECLARE expected jsonb; relations jsonb; guard record; relation record; phase text[]; checkpoint text;
BEGIN
  SELECT expected_catalog INTO expected FROM q12_guard.active_run WHERE singleton;
  relations := expected->'guarded_relations';
  phase := COALESCE((SELECT array_agg(migration ORDER BY migration) FROM q12_guard.migration_guards),ARRAY[]::text[]);
  IF phase IS DISTINCT FROM ARRAY[]::text[]
    AND phase IS DISTINCT FROM ARRAY['20260711140000']
    AND phase IS DISTINCT FROM ARRAY['20260711140000','20260711151000']
  THEN RAISE EXCEPTION 'rollback migration guard phase is impossible'; END IF;
  FOR guard IN SELECT migration,catalog_sha256,migration_file_sha256,stable_expected,relation_set
    FROM q12_guard.migration_guards ORDER BY migration
  LOOP
    IF guard.migration NOT IN ('20260711140000','20260711151000')
      OR guard.catalog_sha256 IS DISTINCT FROM expected->'migrations'->guard.migration->>'catalog_sha256'
      OR guard.migration_file_sha256 IS DISTINCT FROM expected->'migrations'->guard.migration->>'migration_file_sha256'
      OR guard.stable_expected IS DISTINCT FROM expected->'migrations'->guard.migration->'relations'
      OR (SELECT jsonb_agg(value - 'oid' - 'parent_oid' ORDER BY value->>'schema',value->>'name')
          FROM jsonb_array_elements(guard.relation_set)) IS DISTINCT FROM guard.stable_expected THEN
      RAISE EXCEPTION 'rollback migration guard truth differs from frozen catalog';
    END IF;
    relations := relations || guard.relation_set;
  END LOOP;
  FOR relation IN SELECT * FROM jsonb_to_recordset(relations)
    AS x(schema text,name text,oid oid,relkind "char",parent_oid oid,owner text) ORDER BY oid
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles owner ON owner.oid=c.relowner LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid=c.oid
      WHERE c.oid=relation.oid AND n.nspname=relation.schema AND c.relname=relation.name
        AND c.relkind=relation.relkind AND owner.rolname=relation.owner
        AND inheritance.inhparent IS NOT DISTINCT FROM relation.parent_oid) THEN
      RAISE EXCEPTION 'rollback guarded relation truth is missing or changed';
    END IF;
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',relation.schema,relation.name);
  END LOOP;
  IF phase=ARRAY[]::text[] THEN checkpoint := NULL;
  ELSIF phase=ARRAY['20260711140000'] THEN checkpoint := '20260711140000';
  ELSE checkpoint := '20260711151000';
  END IF;
  PERFORM q12_guard.verify_expected_guards(checkpoint);
END $rollback_lock$;
ROLLBACK_LOCK_SQL
  fi)
DO \$restore\$
DECLARE saved jsonb; job jsonb; trigger_row record; prior_default text;
BEGIN
  SELECT baseline INTO saved FROM q12_guard.baseline WHERE singleton;
  IF saved IS NULL THEN RAISE EXCEPTION 'Q12 baseline is missing'; END IF;
  -- TRUNCATE triggers are all explicit. Drop them first on every captured
  -- relation, then only explicit root/standalone row triggers; PostgreSQL drops
  -- each partition leaf clone with its root trigger. The differently named
  -- q12_guard_immutable triggers survive through activation and observation.
  FOR trigger_row IN
    SELECT t.tgname,n.nspname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE pn.nspname='q12_guard' AND p.proname='enforce_write_barrier'
      AND NOT t.tgisinternal AND t.tgparentid=0 AND t.tgname='q12_guard_truncate'
    ORDER BY c.oid
  LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I',trigger_row.tgname,trigger_row.nspname,trigger_row.relname); END LOOP;
  FOR trigger_row IN
    SELECT t.tgname,n.nspname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE pn.nspname='q12_guard' AND p.proname='enforce_write_barrier'
      AND NOT t.tgisinternal AND t.tgparentid=0 AND t.tgname='q12_guard_row'
    ORDER BY c.oid
  LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I',trigger_row.tgname,trigger_row.nspname,trigger_row.relname); END LOOP;
  FOR job IN SELECT value FROM jsonb_array_elements(saved->'cron_jobs')
  LOOP
    UPDATE cron.job SET active=(job->>'active')::boolean
      WHERE jobid=(job->>'jobid')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'captured cron job disappeared'; END IF;
    IF (SELECT to_jsonb(current_job) FROM cron.job current_job WHERE current_job.jobid=(job->>'jobid')::bigint)
         IS DISTINCT FROM job THEN RAISE EXCEPTION 'captured cron job exact-row restore drift'; END IF;
  END LOOP;
  IF (SELECT jsonb_agg(to_jsonb(current_job) ORDER BY jobid) FROM cron.job current_job)
       IS DISTINCT FROM saved->'cron_jobs' THEN RAISE EXCEPTION 'captured cron job set restore drift'; END IF;
  prior_default := saved->>'default_transaction_read_only';
  IF prior_default IS NULL THEN
    EXECUTE 'ALTER DATABASE postgres RESET default_transaction_read_only';
  ELSE
    EXECUTE format(
      'ALTER DATABASE postgres SET default_transaction_read_only=%L',
      split_part(prior_default,'=',2)
    );
  END IF;
  IF COALESCE((SELECT to_jsonb(setting) FROM pg_db_role_setting setting
      WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname='postgres') AND setrole=0),'null'::jsonb)
       IS DISTINCT FROM saved->'database_settings' THEN RAISE EXCEPTION 'database default exact-row restore drift'; END IF;
  IF '$drop_schema'='false' THEN UPDATE q12_guard.active_run SET activated=true WHERE singleton; END IF;
END \$restore\$;
$(if [[ $drop_schema == false ]]; then printf '%s\n' 'DROP TABLE q12_guard.probe;'; fi)
$(if [[ $drop_schema == false ]]; then cat <<'ACTIVATION_GUARD_SQL'
DO $activation_guard$
BEGIN
  IF EXISTS (
    WITH expected(table_name,trigger_name,trigger_type) AS (
      VALUES
        ('active_run','q12_guard_immutable',31::smallint),
        ('active_run','q12_guard_immutable_truncate',34::smallint),
        ('baseline','q12_guard_immutable',31::smallint),
        ('baseline','q12_guard_immutable_truncate',34::smallint),
        ('migration_guards','q12_guard_immutable',31::smallint),
        ('migration_guards','q12_guard_immutable_truncate',34::smallint)
    ), actual AS (
      SELECT relation.relname::text,trigger_object.tgname::text,trigger_object.tgtype
      FROM pg_trigger trigger_object
      JOIN pg_class relation ON relation.oid=trigger_object.tgrelid
      JOIN pg_namespace relation_namespace ON relation_namespace.oid=relation.relnamespace
      JOIN pg_proc function_object ON function_object.oid=trigger_object.tgfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE relation_namespace.nspname='q12_guard' AND function_namespace.nspname='q12_guard'
        AND function_object.proname='enforce_write_barrier' AND NOT trigger_object.tgisinternal
    ), delta AS (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    ) SELECT 1 FROM delta
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_event_trigger event_trigger
    JOIN pg_roles owner ON owner.oid=event_trigger.evtowner
    JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
    WHERE event_trigger.evtname='q12_guard_ddl_command_start'
      AND owner.rolname='postgres' AND event_trigger.evtevent='ddl_command_start'
      AND event_trigger.evtenabled='O' AND event_trigger.evttags IS NULL
      AND function_namespace.nspname='q12_guard' AND function_object.proname='enforce_ddl_barrier'
      AND pg_get_function_identity_arguments(function_object.oid)=''
  ) THEN RAISE EXCEPTION 'internal Q12 guard trigger set drift before activation'; END IF;

  BEGIN
    UPDATE q12_guard.active_run SET expected_catalog=expected_catalog WHERE singleton;
    RAISE EXCEPTION 'active run mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'Q12 durable guard truth is append-only' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE q12_guard.baseline SET baseline=baseline WHERE singleton;
    RAISE EXCEPTION 'baseline mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'Q12 durable guard truth is append-only' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE q12_guard.migration_guards SET relation_set=relation_set;
    RAISE EXCEPTION 'migration guard mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'Q12 durable guard truth is append-only' THEN RAISE; END IF;
  END;
END $activation_guard$;
ACTIVATION_GUARD_SQL
fi)
$(if [[ $drop_schema == false ]]; then printf '%s\n' 'SELECT q12_guard.verify_activated_state();'; fi)
$(if [[ $drop_schema == true ]]; then printf '%s\n' 'DROP EVENT TRIGGER q12_guard_ddl_command_start;' 'DROP SCHEMA q12_guard CASCADE;'; fi)
COMMIT;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid<>pg_backend_pid();
$(if [[ $drop_schema == false ]]; then cat <<'ACTIVATION_RECOVERY_SQL'
-- Q12_ACTIVATE_NORMAL_END
-- Q12_ACTIVATE_RECOVERY_BEGIN
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.verify_activated_state();
COMMIT;
-- Q12_ACTIVATE_RECOVERY_END
ACTIVATION_RECOVERY_SQL
fi)
SQL
}

write_cleanup_sql() {
  cat >"$sql_file" <<'SQL'
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog;
SELECT q12_guard.assert_controller_binding();
SELECT q12_guard.verify_activated_state();
DO $cleanup$
BEGIN
  IF NOT (SELECT activated FROM q12_guard.active_run WHERE singleton) THEN RAISE EXCEPTION 'activation receipt is absent'; END IF;
  IF (SELECT array_agg(relation.relname::text ORDER BY relation.relname::text)
      FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='q12_guard' AND relation.relkind='r')
       IS DISTINCT FROM ARRAY['active_run','baseline','migration_guards']
    OR (SELECT array_agg(function_object.proname::text ORDER BY function_object.proname::text)
      FROM pg_proc function_object JOIN pg_namespace namespace ON namespace.oid=function_object.pronamespace
      WHERE namespace.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['assert_capability','assert_controller_binding','enforce_ddl_barrier','enforce_write_barrier','extend_guard','quiesce_client_backends','verify_activated_state','verify_capability','verify_expected_guards','verify_install_resume_state']
    OR (SELECT array_agg(type_object.typname::text ORDER BY type_object.typname::text)
      FROM pg_type type_object JOIN pg_namespace namespace ON namespace.oid=type_object.typnamespace
      WHERE namespace.nspname='q12_guard')
       IS DISTINCT FROM ARRAY['_active_run','_baseline','_migration_guards','active_run','baseline','migration_guards']
    OR NOT EXISTS (
      SELECT 1 FROM pg_event_trigger event_trigger
      JOIN pg_roles owner ON owner.oid=event_trigger.evtowner
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE event_trigger.evtname='q12_guard_ddl_command_start'
        AND owner.rolname='postgres' AND event_trigger.evtevent='ddl_command_start'
        AND event_trigger.evtenabled='O' AND event_trigger.evttags IS NULL
        AND function_namespace.nspname='q12_guard' AND function_object.proname='enforce_ddl_barrier'
        AND pg_get_function_identity_arguments(function_object.oid)=''
    )
    OR (SELECT count(*) FROM pg_event_trigger event_trigger
      JOIN pg_proc function_object ON function_object.oid=event_trigger.evtfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
      WHERE function_namespace.nspname='q12_guard') <> 1
    OR EXISTS (
      WITH expected(table_name,trigger_name,trigger_type) AS (
        VALUES
          ('active_run','q12_guard_immutable',31::smallint),
          ('active_run','q12_guard_immutable_truncate',34::smallint),
          ('baseline','q12_guard_immutable',31::smallint),
          ('baseline','q12_guard_immutable_truncate',34::smallint),
          ('migration_guards','q12_guard_immutable',31::smallint),
          ('migration_guards','q12_guard_immutable_truncate',34::smallint)
      ), actual AS (
        SELECT relation.relname::text,trigger_object.tgname::text,trigger_object.tgtype
        FROM pg_trigger trigger_object
        JOIN pg_class relation ON relation.oid=trigger_object.tgrelid
        JOIN pg_namespace relation_namespace ON relation_namespace.oid=relation.relnamespace
        JOIN pg_proc function_object ON function_object.oid=trigger_object.tgfoid
        JOIN pg_namespace function_namespace ON function_namespace.oid=function_object.pronamespace
        WHERE relation_namespace.nspname='q12_guard' AND function_namespace.nspname='q12_guard'
          AND function_object.proname='enforce_write_barrier' AND NOT trigger_object.tgisinternal
      ), delta AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      ) SELECT 1 FROM delta
    )
  THEN RAISE EXCEPTION 'exact internal Q12 guard cleanup state drift'; END IF;
END $cleanup$;
DROP EVENT TRIGGER q12_guard_ddl_command_start;
DROP SCHEMA q12_guard CASCADE;
COMMIT;
DO $residue$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='q12_guard')
    OR EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start') THEN
    RAISE EXCEPTION 'q12_guard residue remains';
  END IF;
END $residue$;
SQL
}

case "$command_name" in
  install) write_install_sql ;;
  verify-extended) write_verify_sql ;;
  prepare-recovery) write_prepare_recovery_sql ;;
  activate) write_restore_sql false ;;
  rollback) write_restore_sql true ;;
  cleanup) write_cleanup_sql ;;
esac
chmod 0600 "$sql_file"
sync -f "$sql_file"

readonly NODE_RUNNER='const fs=require("node:fs");const crypto=require("node:crypto");const {Client}=require("pg");
function one(fd,label){const value=fs.readFileSync(Number(fd),"utf8").replace(/\\r?\\n$/u,"");if(!value||/[\\r\\n]/u.test(value))throw new Error(label);return value;}
function between(value,start,end){const startIndex=value.indexOf(start);const endIndex=value.indexOf(end,startIndex+start.length);if(startIndex<0||endIndex<0)throw new Error("install SQL markers");return value.slice(startIndex+start.length,endIndex);}
function split(value,marker){const index=value.indexOf(marker);if(index<0)throw new Error("install SQL boundary");return [value.slice(0,index),value.slice(index+marker.length)];}
async function main(){const [operation,urlFd,caFd,capFd,catalogFd,sqlPath,catalogSha,runId,testMode,faultPoint]=process.argv.slice(1);let raw=one(urlFd,"url");const parsed=new URL(raw);if(parsed.protocol!=="postgresql:"||parsed.hostname!=="aws-1-us-east-2.pooler.supabase.com"||parsed.port!=="5432"||parsed.pathname!=="/postgres"||parsed.username!=="postgres.diqooqbuchsliypgwksu"||parsed.search||parsed.hash)throw new Error("database identity");const ca=fs.readFileSync(Number(caFd));if(testMode!=="1"&&crypto.createHash("sha256").update(ca).digest("hex")!=="700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7")throw new Error("CA identity");if(faultPoint&&testMode!=="1")throw new Error("fault mode");let capability=one(capFd,"capability");const expected=fs.readFileSync(Number(catalogFd),"utf8");const sql=fs.readFileSync(sqlPath,"utf8");const connection={host:parsed.hostname,port:Number(parsed.port),database:parsed.pathname.slice(1),user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),ssl:{ca,rejectUnauthorized:true}};const client=new Client({...connection,options:"-c default_transaction_read_only=off",application_name:"megacampus-q12-database-barrier"});raw="";await client.connect();try{const proof=await client.query("SELECT session_user,current_database(),current_setting(\u0027transaction_read_only\u0027) AS transaction_read_only,current_setting(\u0027server_version_num\u0027)::int AS server_version_num");if(proof.rows.length!==1||proof.rows[0].session_user!=="postgres"||proof.rows[0].current_database!=="postgres"||proof.rows[0].transaction_read_only!=="off"||proof.rows[0].server_version_num<170000||proof.rows[0].server_version_num>=180000)throw new Error("session proof");await client.query("SELECT set_config(\u0027megacampus.q12_capability\u0027,$1,false),set_config(\u0027megacampus.q12_capability_sha256\u0027,$2,false),set_config(\u0027megacampus.q12_expected_catalog\u0027,$3,false),set_config(\u0027megacampus.q12_expected_catalog_sha256\u0027,$4,false),set_config(\u0027megacampus.q12_run_id\u0027,$5,false)",[capability,crypto.createHash("sha256").update(capability).digest("hex"),expected,catalogSha,runId]);capability="";if(operation!=="install"){let commandSql=sql;if(operation==="activate"){const namespaceState=await client.query("SELECT pg_catalog.to_regnamespace(\u0027q12_guard\u0027) IS NOT NULL AS present");let activated=false;if(namespaceState.rows[0].present){const activationState=await client.query("SELECT activated FROM q12_guard.active_run WHERE singleton");activated=activationState.rows.length===1&&activationState.rows[0].activated===true;}commandSql=activated?between(sql,"-- Q12_ACTIVATE_RECOVERY_BEGIN","-- Q12_ACTIVATE_RECOVERY_END"):between(sql,"-- Q12_ACTIVATE_NORMAL_BEGIN","-- Q12_ACTIVATE_NORMAL_END");}await client.query(commandSql);if(operation==="prepare-recovery"){const inherited=new Client({...connection,application_name:"megacampus-q12-recovery-readiness-proof"});await inherited.connect();try{const inheritedProof=await inherited.query("SELECT current_setting(\u0027transaction_read_only\u0027) AS transaction_read_only");if(inheritedProof.rows.length!==1||inheritedProof.rows[0].transaction_read_only!=="on")throw new Error("recovery readiness inherited read-only proof");}finally{await inherited.end();}}if(faultPoint==="before-receipt")throw new Error("injected before receipt");return;}const state=await client.query("SELECT pg_catalog.to_regnamespace(\u0027q12_guard\u0027) IS NOT NULL AS present");const fresh=!state.rows[0].present;let postVisibility;if(fresh){const freshSql=between(sql,"-- Q12_INSTALL_FRESH_BEGIN","-- Q12_INSTALL_FRESH_END");const pieces=split(freshSql,"-- Q12_INSTALL_TX1_COMMITTED");await client.query(pieces[0]);postVisibility=pieces[1];if(faultPoint==="after-tx1-commit")throw new Error("injected after tx1");}else{postVisibility=between(sql,"-- Q12_INSTALL_RESUME_BEGIN","-- Q12_INSTALL_RESUME_END");}const terminatePieces=split(postVisibility,"-- Q12_INSTALL_SECOND_TERMINATE");if(terminatePieces[0].trim())await client.query(terminatePieces[0]);if(faultPoint==="before-second-terminate")throw new Error("injected before terminate");const tx2Pieces=split(terminatePieces[1],"-- Q12_INSTALL_TX2_BEGIN");if(tx2Pieces[0].trim())await client.query(tx2Pieces[0]);if(faultPoint==="before-tx2")throw new Error("injected before tx2");await client.query(tx2Pieces[1]);if(faultPoint==="before-receipt")throw new Error("injected before receipt");}finally{capability="";await client.end();}}
main().catch(()=>{process.stderr.write("q12 database barrier: database command failed\\n");process.exitCode=1;});'

recheck_open_file 'database URL file' "$db_url_file" "$url_fd" "$url_identity"
recheck_open_file 'CA file' "$ca_file" "$ca_fd" "$ca_identity"
recheck_open_file 'database capability file' "$capability_file" "$capability_fd" "$capability_identity"
recheck_open_file 'expected catalog file' "$expected_catalog_file" "$catalog_fd" "$catalog_identity"
recheck_open_file 'canonical structural catalog SQL' "$STRUCTURAL_CATALOG_FILE" "$structural_catalog_fd" "$structural_catalog_identity"
if [[ -n $probe_receipt_fd ]]; then
  recheck_open_file 'database barrier probe receipt' "$probe_receipt_file" "$probe_receipt_fd" "$probe_receipt_identity"
fi
if [[ $command_name == prepare-recovery ]]; then
  recheck_open_file 'final verified database barrier receipt' "$receipt_file" "$prior_receipt_fd" "$prior_receipt_identity"
fi

(
  cd "$project_directory/packages/course-gen-platform"
  "$node_bin" -e "$NODE_RUNNER" "$command_name" "$url_fd" "$ca_fd" "$capability_fd" "$catalog_fd" \
    "$sql_file" "$expected_catalog_sha256" "$run_id" "$test_mode" "$fault_point"
) || fail 'database command did not complete'

recheck_open_file 'database capability file' "$capability_file" "$capability_fd" "$capability_identity"
recheck_open_file 'canonical structural catalog SQL' "$STRUCTURAL_CATALOG_FILE" "$structural_catalog_fd" "$structural_catalog_identity"
if [[ -n $probe_receipt_fd ]]; then
  recheck_open_file 'database barrier probe receipt' "$probe_receipt_file" "$probe_receipt_fd" "$probe_receipt_identity"
  exec {probe_receipt_fd}<&-
fi
if [[ $command_name == prepare-recovery ]]; then
  recheck_open_file 'final verified database barrier receipt' "$receipt_file" "$prior_receipt_fd" "$prior_receipt_identity"
  exec {prior_receipt_fd}<&-
fi
exec {url_fd}<&-
exec {ca_fd}<&-
exec {capability_fd}<&-
exec {catalog_fd}<&-
exec {structural_catalog_fd}<&-

receipt_state='maintenance_guarded'
zero_guard_residue=false
case "$command_name" in
  install) receipt_state='maintenance_guarded' ;;
  verify-extended) receipt_state="${after_migration}_guard_verified" ;;
  prepare-recovery) receipt_state='recovery_ready_guarded' ;;
  activate) receipt_state='activated' ;;
  rollback|cleanup) receipt_state='guard_cleanup_complete'; zero_guard_residue=true ;;
esac
receipt_tmp="$(mktemp -- "$run_root/.database-barrier-receipt.XXXXXXXXXX")"
[[ -f $receipt_tmp && ! -L $receipt_tmp && $(stat -c '%u:%g:%a' -- "$receipt_tmp") == "$(id -u):$(id -g):600" ]] ||
  fail 'database barrier receipt temporary file is unsafe'
jq -n --arg schema "$RECEIPT_SCHEMA" --arg run "$run_id" --arg state "$receipt_state" \
  --arg catalog "$expected_catalog_sha256" --arg command "$command_name" --argjson zero "$zero_guard_residue" \
  --argjson probes "$rollback_probes_verified" --arg probe_sha "$probe_receipt_sha256" \
  '{schema_version:$schema,run_id:$run,state:$state,zero_guard_residue:$zero,
    expected_catalog_sha256:$catalog,last_command:$command,rollback_probes_verified:$probes,
    probe_receipt_sha256:(if $probe_sha=="" then null else $probe_sha end)}' \
  >"$receipt_tmp"
chown "$(id -u):$(id -g)" "$receipt_tmp"
chmod 0400 "$receipt_tmp"
[[ -f $receipt_tmp && ! -L $receipt_tmp && $(stat -c '%u:%g:%a' -- "$receipt_tmp") == "$(id -u):$(id -g):400" ]] ||
  fail 'database barrier receipt temporary identity changed'
sync -f "$receipt_tmp"
mv -f -- "$receipt_tmp" "$receipt_file"
receipt_tmp=''
sync -d "$run_root"

if [[ $command_name == cleanup || $command_name == rollback ]]; then
  rm -f -- "$capability_file"
  # fsync the persistent secret parent only after the database proved zero guard residue.
  sync -d "$(dirname "$capability_file")"
fi

printf 'q12 database barrier: %s verified\n' "$receipt_state"
