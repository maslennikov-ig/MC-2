#!/usr/bin/env bash
# Restricted production-side command for the helixa-new Qdrant backup key.
set -euo pipefail
umask 077

readonly SELF=/usr/local/sbin/megacampus-qdrant-offhost-source
readonly MANIFEST=/var/lib/megacampus-qdrant-recovery/manifests/latest-manifest.json
readonly METRICS_DIR=/var/lib/megacampus/qdrant-metrics
readonly EXPORT_LOCK=/run/lock/megacampus-qdrant-offhost-export.lock
readonly CONTAINER=megacampus-qdrant
readonly EXPECTED_VERSION=1.18.2
readonly EXPECTED_RETENTION_DAYS=14

die() {
  printf 'qdrant-offhost-source: %s\n' "$*" >&2
  exit 1
}

# sshd supplies SSH_ORIGINAL_COMMAND to the forced command. Validate it before
# crossing sudo, then pass one inert string into a clean root environment.
enter_privileged() {
  local command=${SSH_ORIGINAL_COMMAND:-}
  case "$command" in
    metadata | export\ [0-9]*\ [a-f0-9]* | publish-backup\ [0-9]*\ [0-9]*\ 14 | publish-restore\ [0-9]*\ [0-9]*) ;;
    *) die 'command is not allowed' ;;
  esac
  exec /usr/bin/sudo -n /usr/bin/env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    OFFHOST_COMMAND="$command" \
    "$SELF" --privileged
}

manifest_fields() {
  /usr/bin/python3 - "$MANIFEST" "$EXPECTED_VERSION" <<'PY'
import json
import pathlib
import re
import stat
import sys

path = pathlib.Path(sys.argv[1])
expected_version = sys.argv[2]
metadata = path.lstat()
if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
    raise SystemExit("manifest is not a regular file")
value = json.loads(path.read_text(encoding="utf-8"))
if value.get("schema_version") != "megacampus.qdrant.snapshot-manifest/v1":
    raise SystemExit("manifest schema is not accepted")
if value.get("status") != "success" or value.get("storage_mode") != "local":
    raise SystemExit("manifest does not describe a successful local snapshot")
if value.get("server_version") != expected_version:
    raise SystemExit("manifest server version is not accepted")
safe = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$")
physical = value.get("physical_collection")
snapshot = value.get("snapshot_name")
sha256 = value.get("sha256")
size = value.get("size_bytes")
if not isinstance(physical, str) or not safe.fullmatch(physical):
    raise SystemExit("physical collection is unsafe")
if not isinstance(snapshot, str) or not safe.fullmatch(snapshot) or not snapshot.endswith(".snapshot"):
    raise SystemExit("snapshot name is unsafe")
if not isinstance(sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", sha256):
    raise SystemExit("snapshot digest is invalid")
if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
    raise SystemExit("snapshot size is invalid")
print("\t".join((physical, snapshot, sha256, str(size))))
PY
}

snapshot_metadata() {
  [[ -r $MANIFEST ]] || die 'latest manifest is not readable'
  local fields physical snapshot expected_sha expected_size
  fields=$(manifest_fields) || die 'latest manifest validation failed'
  IFS=$'\t' read -r physical snapshot expected_sha expected_size <<<"$fields"
  /usr/bin/printf '{"sha256":"%s","size_bytes":%s}\n' "$expected_sha" "$expected_size"
}

export_snapshot() {
  local requested_size=$1 requested_sha=$2
  [[ $requested_size =~ ^[0-9]+$ && $requested_size -gt 0 ]] \
    || die 'requested snapshot size is invalid'
  [[ $requested_sha =~ ^[a-f0-9]{64}$ ]] || die 'requested snapshot digest is invalid'
  [[ -r $MANIFEST ]] || die 'latest manifest is not readable'
  local fields physical snapshot expected_sha expected_size
  fields=$(manifest_fields) || die 'latest manifest validation failed'
  IFS=$'\t' read -r physical snapshot expected_sha expected_size <<<"$fields"
  [[ $expected_size == "$requested_size" && $expected_sha == "$requested_sha" ]] \
    || die 'latest snapshot changed after metadata preflight'

  exec 9>"$EXPORT_LOCK"
  /usr/bin/flock -n 9 || die 'another off-host export is already running'

  local mount_source snapshot_dir snapshot_path checksum_path
  mount_source=$(
    /usr/bin/docker inspect "$CONTAINER" \
      --format '{{ range .Mounts }}{{ if eq .Destination "/qdrant/storage" }}{{ .Source }}{{ end }}{{ end }}'
  ) || die 'cannot inspect the production Qdrant storage mount'
  [[ $mount_source == /var/lib/docker/volumes/*/_data ]] \
    || die 'production Qdrant storage mount is outside the accepted Docker volume root'
  snapshot_dir="$mount_source/snapshots/$physical"
  snapshot_path="$snapshot_dir/$snapshot"
  checksum_path="$snapshot_path.checksum"
  [[ -f $snapshot_path && ! -L $snapshot_path ]] || die 'snapshot file is missing or unsafe'
  [[ $(/usr/bin/stat -c %s "$snapshot_path") == "$expected_size" ]] \
    || die 'snapshot size differs from the manifest'
  [[ -f $checksum_path && ! -L $checksum_path ]] || die 'Qdrant checksum sidecar is missing'
  [[ $(/usr/bin/tr -d '[:space:]' <"$checksum_path") == "$expected_sha" ]] \
    || die 'Qdrant checksum sidecar differs from the manifest'

  # Both inputs are immutable regular files selected only after strict name and
  # mount validation. No Qdrant API credential is read or sent off-host.
  exec /usr/bin/nice -n 15 /usr/bin/ionice -c 3 /usr/bin/tar \
    --format=posix \
    --numeric-owner \
    --owner=0 \
    --group=0 \
    --mode='u=rw,go=' \
    -C "$(/usr/bin/dirname "$MANIFEST")" \
    -cf - \
    "$(/usr/bin/basename "$MANIFEST")" \
    -C "$snapshot_dir" \
    "$snapshot"
}

validate_recent_epoch() {
  local epoch=$1 now
  [[ $epoch =~ ^[0-9]{10}$ ]] || die 'metric timestamp is invalid'
  now=$(/usr/bin/date +%s)
  (( epoch <= now + 300 && epoch >= now - 3600 )) \
    || die 'metric timestamp is outside the accepted one-hour reporting window'
}

publish_file() {
  local destination=$1 content=$2 temporary
  [[ -d $METRICS_DIR && ! -L $METRICS_DIR ]] || die 'metrics directory is unavailable'
  [[ $(/usr/bin/stat -c '%u:%G:%a' "$METRICS_DIR") == 0:megacampus-metrics:3775 ]] \
    || die 'metrics directory must be root-owned, group-writable, setgid, and sticky'
  temporary=$(/usr/bin/mktemp "$METRICS_DIR/.qdrant-offhost.XXXXXX")
  trap '/usr/bin/rm -f -- "$temporary"' RETURN
  /usr/bin/printf '%b' "$content" >"$temporary"
  /usr/bin/chown root:root "$temporary"
  /usr/bin/chmod 0644 "$temporary"
  /usr/bin/mv -fT "$temporary" "$destination"
  trap - RETURN
}

publish_backup() {
  local epoch=$1 size=$2 retention=$3
  validate_recent_epoch "$epoch"
  [[ $size =~ ^[0-9]+$ && $size -gt 0 ]] || die 'snapshot size metric is invalid'
  [[ $retention == "$EXPECTED_RETENTION_DAYS" ]] || die 'retention metric is invalid'
  publish_file "$METRICS_DIR/megacampus_qdrant_offhost_backup.prom" "# HELP megacampus_qdrant_offhost_last_successful_snapshot_unixtime_seconds Last verified off-host Qdrant copy time.\n# TYPE megacampus_qdrant_offhost_last_successful_snapshot_unixtime_seconds gauge\nmegacampus_qdrant_offhost_last_successful_snapshot_unixtime_seconds $epoch\n# HELP megacampus_qdrant_offhost_snapshot_size_bytes Size of the latest verified off-host Qdrant copy.\n# TYPE megacampus_qdrant_offhost_snapshot_size_bytes gauge\nmegacampus_qdrant_offhost_snapshot_size_bytes $size\n# HELP megacampus_qdrant_offhost_retention_days Configured off-host retention in days.\n# TYPE megacampus_qdrant_offhost_retention_days gauge\nmegacampus_qdrant_offhost_retention_days $retention\n"
}

publish_restore() {
  local epoch=$1 point_count=$2
  validate_recent_epoch "$epoch"
  [[ $point_count =~ ^[0-9]+$ ]] || die 'restore point-count metric is invalid'
  publish_file "$METRICS_DIR/megacampus_qdrant_offhost_restore.prom" "# HELP megacampus_qdrant_offhost_last_successful_restore_drill_unixtime_seconds Last exact-version restore from the off-host copy.\n# TYPE megacampus_qdrant_offhost_last_successful_restore_drill_unixtime_seconds gauge\nmegacampus_qdrant_offhost_last_successful_restore_drill_unixtime_seconds $epoch\n# HELP megacampus_qdrant_offhost_restored_points Points observed after the latest off-host restore drill.\n# TYPE megacampus_qdrant_offhost_restored_points gauge\nmegacampus_qdrant_offhost_restored_points $point_count\n"
}

main() {
  if [[ ${1:-} != --privileged ]]; then
    [[ $EUID -ne 0 ]] || die 'direct root invocation must use --privileged with OFFHOST_COMMAND'
    enter_privileged
  fi
  [[ $EUID -eq 0 ]] || die 'privileged phase did not run as root'

  local command=${OFFHOST_COMMAND:-}
  local -a parts=()
  read -r -a parts <<<"$command"
  case ${parts[0]:-} in
    metadata)
      [[ ${#parts[@]} -eq 1 ]] || die 'metadata takes no arguments'
      snapshot_metadata
      ;;
    export)
      [[ ${#parts[@]} -eq 3 ]] || die 'export takes size and digest arguments'
      export_snapshot "${parts[1]}" "${parts[2]}"
      ;;
    publish-backup)
      [[ ${#parts[@]} -eq 4 ]] || die 'publish-backup takes three arguments'
      publish_backup "${parts[1]}" "${parts[2]}" "${parts[3]}"
      ;;
    publish-restore)
      [[ ${#parts[@]} -eq 3 ]] || die 'publish-restore takes two arguments'
      publish_restore "${parts[1]}" "${parts[2]}"
      ;;
    *) die 'command is not allowed' ;;
  esac
}

main "$@"
