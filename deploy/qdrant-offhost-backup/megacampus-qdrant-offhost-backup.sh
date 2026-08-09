#!/usr/bin/env bash
# Pull and verify production Qdrant snapshots on helixa-new.
set -euo pipefail
umask 077

SRC_HOST="${SRC_HOST:-95.81.98.230}"
SRC_USER="${SRC_USER:-claude-deploy}"
SSH_KEY="${SSH_KEY:-/root/.ssh/megacampus-qdrant-offhost-backup}"
KNOWN_HOSTS="${KNOWN_HOSTS:-/root/.ssh/megacampus-qdrant-offhost-known_hosts}"
ROOT="${ROOT:-/opt/backups/megacampus-qdrant}"
SNAPSHOTS="$ROOT/snapshots"
RESTORE_EVIDENCE="$ROOT/restore-evidence"
LOCK_FILE="${LOCK_FILE:-/var/lock/megacampus-qdrant-offhost-backup.lock}"
VALIDATOR="${VALIDATOR:-/usr/local/libexec/megacampus-qdrant-offhost-validate}"
KEEP="${KEEP:-14}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_FREE_MB="${MIN_FREE_MB:-10240}"
MAX_SOURCE_AGE_SECONDS="${MAX_SOURCE_AGE_SECONDS:-28800}"
RESTORE_MAX_SOURCE_AGE_SECONDS="${RESTORE_MAX_SOURCE_AGE_SECONDS:-129600}"
QDRANT_IMAGE="${QDRANT_IMAGE:-qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c}"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  log "FAILED: $*" >&2
  exit 1
}

require_positive_integer() {
  local value=$1 label=$2
  [[ $value =~ ^[0-9]+$ && $value -gt 0 ]] || die "$label must be a positive integer"
}

validate_configuration() {
  [[ $ROOT == /opt/backups/* && $ROOT != /opt/backups/ ]] \
    || die 'ROOT must be one owned directory below /opt/backups'
  [[ $SNAPSHOTS == "$ROOT/snapshots" && $RESTORE_EVIDENCE == "$ROOT/restore-evidence" ]] \
    || die 'derived backup paths are inconsistent'
  require_positive_integer "$KEEP" KEEP
  require_positive_integer "$RETENTION_DAYS" RETENTION_DAYS
  require_positive_integer "$MIN_FREE_MB" MIN_FREE_MB
  require_positive_integer "$MAX_SOURCE_AGE_SECONDS" MAX_SOURCE_AGE_SECONDS
  [[ -x $VALIDATOR ]] || die "validator is not executable: $VALIDATOR"
  [[ -f $SSH_KEY && ! -L $SSH_KEY ]] || die "SSH key is missing or unsafe: $SSH_KEY"
  case $(stat -c %a "$SSH_KEY") in
    400 | 600) ;;
    *) die 'SSH key or staged credential mode must be 400 or 600' ;;
  esac
  [[ -f $KNOWN_HOSTS && ! -L $KNOWN_HOSTS ]] \
    || die "dedicated known-hosts file is missing or unsafe: $KNOWN_HOSTS"
  case $(stat -c %a "$KNOWN_HOSTS") in
    400 | 600) ;;
    *) die 'known-hosts file or staged credential mode must be 400 or 600' ;;
  esac
}

ensure_directories() {
  install -d -o root -g root -m 0700 "$ROOT" "$SNAPSHOTS" "$RESTORE_EVIDENCE"
}

require_free_space() {
  local free_mb
  free_mb=$(df -Pm "$ROOT" | awk 'NR == 2 { print $4 }')
  [[ $free_mb =~ ^[0-9]+$ ]] || die 'could not determine free backup space'
  (( free_mb >= MIN_FREE_MB )) \
    || die "only ${free_mb}MB free under $ROOT; ${MIN_FREE_MB}MB is required"
}

require_free_space_for_snapshot() {
  local snapshot_bytes=$1 free_mb snapshot_mb required_mb
  [[ $snapshot_bytes =~ ^[0-9]+$ && $snapshot_bytes -gt 0 ]] \
    || die 'source metadata has an invalid snapshot size'
  (( snapshot_bytes <= 9000000000000000000 )) \
    || die 'source snapshot size exceeds the supported range'
  snapshot_mb=$(( (snapshot_bytes + 1048575) / 1048576 ))
  required_mb=$(( MIN_FREE_MB + snapshot_mb ))
  free_mb=$(df -Pm "$ROOT" | awk 'NR == 2 { print $4 }')
  [[ $free_mb =~ ^[0-9]+$ ]] || die 'could not determine free backup space'
  (( free_mb >= required_mb )) \
    || die "only ${free_mb}MB free under $ROOT; ${required_mb}MB is required for this snapshot and the ${MIN_FREE_MB}MB floor"
}

ssh_command() {
  ssh \
    -i "$SSH_KEY" \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -o GlobalKnownHostsFile=/dev/null \
    -o ConnectTimeout=20 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=4 \
    -T \
    "$SRC_USER@$SRC_HOST" \
    "$@"
}

json_field() {
  local document=$1 field=$2
  /usr/bin/python3 -c '
import json, sys
value = json.loads(sys.stdin.read()).get(sys.argv[1])
if isinstance(value, bool) or not isinstance(value, (str, int)):
    raise SystemExit(1)
print(value)
' "$field" <<<"$document"
}

verify_generation() {
  local generation=$1 max_age=$2
  "$VALIDATOR" verify \
    --generation "$generation" \
    --max-age-seconds "$max_age"
}

write_receipt() {
  local generation=$1 verification=$2
  local sha size points snapshot created pulled_at pulled_epoch
  sha=$(json_field "$verification" sha256)
  size=$(json_field "$verification" size_bytes)
  points=$(json_field "$verification" point_count)
  snapshot=$(json_field "$verification" snapshot_name)
  created=$(json_field "$verification" created_at)
  pulled_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  pulled_epoch=$(date +%s)
  /usr/bin/printf '%s\n' \
    '{' \
    '  "schema_version": "megacampus.qdrant.offhost-receipt/v1",' \
    "  \"pulled_at\": \"$pulled_at\"," \
    "  \"pulled_epoch_seconds\": $pulled_epoch," \
    "  \"source_host\": \"$SRC_HOST\"," \
    '  "transport": "restricted-ssh-pull",' \
    "  \"source_snapshot_created_at\": \"$created\"," \
    "  \"snapshot_name\": \"$snapshot\"," \
    "  \"snapshot_bytes\": $size," \
    "  \"snapshot_sha256\": \"$sha\"," \
    "  \"point_count\": $points," \
    "  \"retention_days\": $RETENTION_DAYS," \
    "  \"maximum_generations\": $KEEP" \
    '}' >"$generation/OFFHOST.json"
  chmod 0600 "$generation/OFFHOST.json"
}

safe_generation() {
  local candidate=$1 name
  [[ -d $candidate && ! -L $candidate ]] || return 1
  [[ $(dirname "$candidate") == "$SNAPSHOTS" ]] || return 1
  name=$(basename "$candidate")
  [[ $name =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$ ]]
}

receipt_epoch() {
  local generation=$1
  /usr/bin/python3 - "$generation/OFFHOST.json" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
value = json.loads(path.read_text(encoding="utf-8"))
epoch = value.get("pulled_epoch_seconds")
if not isinstance(epoch, int) or isinstance(epoch, bool) or epoch <= 0:
    raise SystemExit(1)
print(epoch)
PY
}

remove_generation() {
  local candidate=$1
  safe_generation "$candidate" || die "refusing to prune unsafe path: $candidate"
  log "pruning $(basename "$candidate")"
  rm -rf -- "$candidate"
}

cmd_prune() {
  ensure_directories
  local now cutoff latest candidate epoch
  now=$(date +%s)
  cutoff=$(( now - RETENTION_DAYS * 24 * 60 * 60 ))
  latest=$(readlink -f "$ROOT/latest" 2>/dev/null || true)

  while IFS= read -r candidate; do
    safe_generation "$candidate" || continue
    [[ $candidate != "$latest" ]] || continue
    epoch=$(receipt_epoch "$candidate" 2>/dev/null || true)
    [[ $epoch =~ ^[0-9]+$ ]] || {
      log "leaving unvalidated generation untouched: $candidate" >&2
      continue
    }
    (( epoch >= cutoff )) || remove_generation "$candidate"
  done < <(find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d -print | sort)

  local -a generations=()
  mapfile -t generations < <(
    find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d \
      -name '20??-??-??T??-??-??Z' -print | sort
  )
  while (( ${#generations[@]} > KEEP )); do
    candidate=${generations[0]}
    generations=("${generations[@]:1}")
    [[ $candidate != "$latest" ]] || continue
    remove_generation "$candidate"
  done
}

cmd_run() {
  validate_configuration
  ensure_directories
  cmd_prune

  local stamp work destination verification size epoch source_metadata source_size source_sha
  source_metadata=$(ssh_command metadata) || die 'could not read restricted source metadata'
  source_size=$(json_field "$source_metadata" size_bytes) \
    || die 'source metadata did not contain a valid snapshot size'
  source_sha=$(json_field "$source_metadata" sha256) \
    || die 'source metadata did not contain a valid snapshot digest'
  [[ $source_sha =~ ^[a-f0-9]{64}$ ]] || die 'source metadata snapshot digest is invalid'
  require_free_space_for_snapshot "$source_size"
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  work="$SNAPSHOTS/.incoming-$stamp-$$"
  destination="$SNAPSHOTS/$stamp"
  [[ ! -e $work && ! -e $destination ]] || die 'snapshot generation already exists'
  install -d -o root -g root -m 0700 "$work"
  trap 'rm -rf -- "$work"' EXIT

  log "pulling the latest verified production snapshot"
  ssh_command export "$source_size" "$source_sha" | tar \
    --extract \
    --file=- \
    --directory="$work" \
    --no-same-owner \
    --no-same-permissions \
    --no-overwrite-dir \
    || die 'restricted pull or archive extraction failed'
  verification=$(verify_generation "$work" "$MAX_SOURCE_AGE_SECONDS") \
    || die 'pulled generation did not pass size, checksum, version, and freshness validation'
  write_receipt "$work" "$verification"
  verification=$(verify_generation "$work" "$MAX_SOURCE_AGE_SECONDS") \
    || die 'off-host receipt did not bind the validated generation'
  [[ $(json_field "$verification" size_bytes) == "$source_size" \
      && $(json_field "$verification" sha256) == "$source_sha" ]] \
    || die 'pulled generation differs from metadata preflight'
  require_free_space

  mv "$work" "$destination"
  trap - EXIT
  ln -s "snapshots/$stamp" "$ROOT/.latest-$$"
  mv -Tf "$ROOT/.latest-$$" "$ROOT/latest"

  size=$(json_field "$verification" size_bytes)
  epoch=$(date +%s)
  ssh_command publish-backup "$epoch" "$size" "$RETENTION_DAYS" \
    || die 'backup exists, but its production freshness metric was not published'
  cmd_prune
  log "off-host snapshot $stamp verified: $size bytes, retention ${RETENTION_DAYS}d/${KEEP} copies"
}

resolve_generation() {
  local requested=${1:-$ROOT/latest} resolved
  resolved=$(readlink -f "$requested") || die "cannot resolve generation: $requested"
  [[ $resolved == "$SNAPSHOTS/"* ]] || die 'generation resolves outside the backup root'
  safe_generation "$resolved" || die 'generation path is unsafe'
  printf '%s\n' "$resolved"
}

cmd_verify() {
  validate_configuration
  ensure_directories
  local generation verification
  generation=$(resolve_generation "${1:-$ROOT/latest}")
  verification=$(verify_generation "$generation" 0) || die "verification failed: $generation"
  log "verify OK: $generation ($(json_field "$verification" size_bytes) bytes)"
  printf '%s\n' "$verification"
}

cleanup_restore_container() {
  local container=${1:-}
  [[ -n $container ]] || return 0
  docker rm -f "$container" >/dev/null 2>&1 || true
}

run_restore_probe() {
  local port=$1 expected_points=$2
  /usr/bin/python3 - "$port" "$expected_points" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

port = int(sys.argv[1])
expected_points = int(sys.argv[2])
base = f"http://127.0.0.1:{port}"
deadline = time.monotonic() + 180
last_error = "not started"
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(base + "/", timeout=3) as response:
            version = json.load(response).get("version")
        if version != "1.18.2":
            raise RuntimeError(f"restored server version is {version!r}")
        with urllib.request.urlopen(
            base + "/collections/offhost_restore_drill", timeout=5
        ) as response:
            result = json.load(response)["result"]
        if result.get("status") != "green":
            raise RuntimeError(f"restored collection status is {result.get('status')!r}")
        if result.get("points_count") != expected_points:
            raise RuntimeError(
                f"restored point count {result.get('points_count')!r} != {expected_points}"
            )
        print(json.dumps({
            "server_version": version,
            "collection": "offhost_restore_drill",
            "status": result["status"],
            "point_count": result["points_count"],
        }, sort_keys=True, separators=(",", ":")))
        raise SystemExit(0)
    except (OSError, KeyError, RuntimeError, urllib.error.URLError) as error:
        last_error = str(error)
        time.sleep(2)
raise SystemExit(f"restore probe timed out: {last_error}")
PY
}

cmd_restore_drill() {
  validate_configuration
  ensure_directories
  require_free_space
  local generation verification snapshot_path points container port probe epoch evidence
  generation=$(resolve_generation "$ROOT/latest")
  verification=$(verify_generation "$generation" "$RESTORE_MAX_SOURCE_AGE_SECONDS") \
    || die 'latest off-host generation is too old or invalid for restore'
  snapshot_path=$(json_field "$verification" snapshot_path)
  points=$(json_field "$verification" point_count)

  if ! docker image inspect "$QDRANT_IMAGE" >/dev/null 2>&1; then
    log 'pulling the exact digest-pinned Qdrant 1.18.2 image (one-time on this host)'
    timeout 1200 docker pull "$QDRANT_IMAGE" >/dev/null \
      || die 'exact Qdrant restore image pull failed'
  fi
  docker image inspect "$QDRANT_IMAGE" >/dev/null \
    || die 'exact Qdrant restore image is unavailable after pull'

  container="megacampus-qdrant-offhost-restore-$(date +%s)-$$"
  trap 'cleanup_restore_container "$container"' EXIT
  docker run -d \
    --name "$container" \
    --pull=never \
    --restart=no \
    --cpus=0.50 \
    --memory=1536m \
    --memory-swap=1536m \
    --pids-limit=256 \
    --security-opt=no-new-privileges:true \
    --cap-drop=ALL \
    -p 127.0.0.1::6333 \
    -v "$snapshot_path:/snapshots/restore.snapshot:ro" \
    "$QDRANT_IMAGE" \
    ./entrypoint.sh \
    --snapshot /snapshots/restore.snapshot:offhost_restore_drill >/dev/null \
    || die 'isolated restore container did not start'
  port=$(docker port "$container" 6333/tcp | awk -F: 'NR == 1 { print $NF }')
  [[ $port =~ ^[0-9]+$ ]] || die 'could not resolve the loopback restore port'
  probe=$(run_restore_probe "$port" "$points") || {
    docker logs --tail 80 "$container" >&2 || true
    die 'exact-version restore probe failed'
  }
  cleanup_restore_container "$container"
  trap - EXIT

  epoch=$(date +%s)
  evidence="$RESTORE_EVIDENCE/$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  /usr/bin/printf '%s\n' \
    '{' \
    '  "schema_version": "megacampus.qdrant.offhost-restore/v1",' \
    "  \"verified_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," \
    "  \"source_generation\": \"$(basename "$generation")\"," \
    "  \"snapshot_sha256\": \"$(json_field "$verification" sha256)\"," \
    "  \"image\": \"$QDRANT_IMAGE\"," \
    "  \"probe\": $probe" \
    '}' >"$evidence"
  chmod 0600 "$evidence"
  ssh_command publish-restore "$epoch" "$points" \
    || die 'restore passed, but its production freshness metric was not published'
  log "isolated exact-version restore OK: $points points"
}

cmd_list() {
  ensure_directories
  local generation receipt
  while IFS= read -r generation; do
    safe_generation "$generation" || continue
    receipt="$generation/OFFHOST.json"
    if [[ -r $receipt ]]; then
      printf '%s  %s bytes\n' "$(basename "$generation")" \
        "$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["snapshot_bytes"])' "$receipt")"
    fi
  done < <(find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d -print | sort)
}

case "${1:-run}" in
  run)
    flock -n "$LOCK_FILE" "$0" __locked_run
    ;;
  __locked_run)
    cmd_run
    ;;
  verify)
    shift
    cmd_verify "$@"
    ;;
  restore-drill)
    flock -n "$LOCK_FILE" "$0" __locked_restore
    ;;
  __locked_restore)
    cmd_restore_drill
    ;;
  prune)
    validate_configuration
    cmd_prune
    ;;
  list)
    validate_configuration
    cmd_list
    ;;
  *) die 'usage: megacampus-qdrant-offhost-backup {run|verify [generation]|restore-drill|prune|list}' ;;
esac
