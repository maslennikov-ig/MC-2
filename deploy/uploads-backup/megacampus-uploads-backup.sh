#!/usr/bin/env bash
#
# Off-host backup of the megacampus uploaded source documents.
#
# These files are the only irreplaceable data the product holds: Qdrant vectors
# and generated courses can be rebuilt from them, and nothing can rebuild them.
# `file_catalog.storage_path` is a relative filesystem path, not a Storage key,
# so the bytes exist only on the production host's disk.
#
# Runs ON helixa-new (82.26.152.8), PULLING from megacampus-prod (95.81.98.230).
# Pull, not push, on purpose: production holds no credential to this host, so a
# compromised or mistaken production box cannot reach in and damage the copy.
#
# The source side is one line in claude-deploy's authorized_keys carrying a
# forced command, so the key can do exactly one thing — stream the uploads
# directory as a tar. Verified: asking it to run anything else still returns the
# tar. No package was installed on either host; neither has rsync.
#
# Install:  install -m 700 megacampus-uploads-backup.sh \
#             /usr/local/sbin/megacampus-uploads-backup
set -euo pipefail

SRC_HOST="${SRC_HOST:-95.81.98.230}"
SRC_USER="${SRC_USER:-claude-deploy}"
SSH_KEY="${SSH_KEY:-/root/.ssh/megacampus-uploads-backup}"
ROOT="${ROOT:-/opt/backups/megacampus-uploads}"
SNAPSHOTS="$ROOT/snapshots"
KEEP="${KEEP:-14}"
# Refuse to write a snapshot that would leave less than this much room. A backup
# that fills the disk takes the host down with it.
MIN_FREE_MB="${MIN_FREE_MB:-5120}"
# A source that suddenly holds far fewer files is a deletion, not a backup
# input. Recording it would overwrite good history with the accident.
SHRINK_FLOOR_PCT="${SHRINK_FLOOR_PCT:-90}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "FAILED: $*" >&2; exit 1; }

ssh_pull() {
  ssh -i "$SSH_KEY" \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=20 \
    -o ServerAliveInterval=15 \
    "$SRC_USER@$SRC_HOST" true
}

previous_count() {
  local manifest="$ROOT/latest/MANIFEST.json"
  [ -r "$manifest" ] || { echo 0; return; }
  sed -n 's/.*"entry_count"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$manifest" | head -1
}

cmd_run() {
  mkdir -p "$SNAPSHOTS"
  local free_mb
  free_mb=$(df -Pm "$ROOT" | awk 'NR==2 {print $4}')
  [ "$free_mb" -ge "$MIN_FREE_MB" ] \
    || die "only ${free_mb}MB free under $ROOT, need ${MIN_FREE_MB}MB"

  local stamp work archive
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  work="$SNAPSHOTS/.incoming-$stamp"
  mkdir -p "$work"
  # Nothing outside this function ever sees a half-written snapshot: the work
  # directory is hidden and only promoted after every check has passed.
  trap 'rm -rf "$work"' EXIT

  archive="$work/uploads.tar.zst"
  log "pulling from $SRC_USER@$SRC_HOST"
  ssh_pull | zstd -3 -q -o "$archive" \
    || die "pull or compress failed"
  [ -s "$archive" ] || die "archive is empty"

  # Read the archive back rather than trusting that the write succeeded.
  local entry_count file_count bytes prev
  entry_count=$(zstd -dc "$archive" | tar -tf - | grep -c . || true)
  file_count=$(zstd -dc "$archive" | tar -tvf - | grep -vc '^d' || true)
  [ "$entry_count" -gt 0 ] || die "archive lists no entries"

  prev=$(previous_count)
  if [ "$prev" -gt 0 ]; then
    local floor=$(( prev * SHRINK_FLOOR_PCT / 100 ))
    [ "$entry_count" -ge "$floor" ] \
      || die "source shrank from $prev to $entry_count entries (floor $floor). \
Refusing to record it. If the deletion was intentional, rerun with SHRINK_FLOOR_PCT=0."
  fi

  bytes=$(stat -c %s "$archive")
  local sha
  sha=$(sha256sum "$archive" | awk '{print $1}')
  printf '%s  uploads.tar.zst\n' "$sha" > "$work/SHA256SUMS"

  cat > "$work/MANIFEST.json" <<JSON
{
  "taken_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_host": "$SRC_HOST",
  "source_path": "/opt/megacampus/data/uploads",
  "archive": "uploads.tar.zst",
  "archive_bytes": $bytes,
  "archive_sha256": "$sha",
  "entry_count": $entry_count,
  "file_count": $file_count,
  "previous_entry_count": $prev
}
JSON

  trap - EXIT
  mv "$work" "$SNAPSHOTS/$stamp"
  ln -sfn "$SNAPSHOTS/$stamp" "$ROOT/latest"
  log "snapshot $stamp: $file_count files, $entry_count entries, $bytes bytes"

  cmd_prune
}

cmd_prune() {
  local n
  n=$(find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d -not -name '.incoming-*' \
      | wc -l)
  [ "$n" -gt "$KEEP" ] || return 0
  find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d -not -name '.incoming-*' \
    | sort | head -n "$(( n - KEEP ))" \
    | while read -r old; do log "pruning $(basename "$old")"; rm -rf "$old"; done
}

# Re-verify a stored snapshot against its own checksum. A backup nobody reads
# back is a belief, not a backup.
cmd_verify() {
  local snap="${1:-$ROOT/latest}"
  [ -d "$snap" ] || die "no such snapshot: $snap"
  ( cd "$snap" && sha256sum -c SHA256SUMS ) || die "checksum mismatch in $snap"
  local listed
  listed=$(zstd -dc "$snap/uploads.tar.zst" | tar -tf - | grep -c . || true)
  log "verify OK: $snap, $listed entries readable"
}

# Extract one file so a restore can be proved rather than assumed. The path is
# as stored in file_catalog.storage_path, e.g. uploads/<org>/<doc>/<file>.
cmd_restore_one() {
  local path="${1:?usage: restore-one <path-inside-archive> <dest-dir> [snapshot]}"
  local dest="${2:?usage: restore-one <path-inside-archive> <dest-dir> [snapshot]}"
  local snap="${3:-$ROOT/latest}"
  mkdir -p "$dest"
  zstd -dc "$snap/uploads.tar.zst" | tar -xf - -C "$dest" "$path" \
    || die "not found in $snap: $path"
  log "restored $dest/$path"
  sha256sum "$dest/$path"
}

cmd_list() {
  find "$SNAPSHOTS" -mindepth 1 -maxdepth 1 -type d -not -name '.incoming-*' \
    | sort | while read -r s; do
      printf '%s  %s\n' "$(basename "$s")" \
        "$(sed -n 's/.*"file_count"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1 files/p' \
           "$s/MANIFEST.json" 2>/dev/null | head -1)"
    done
}

case "${1:-run}" in
  run)         flock -n /var/lock/megacampus-uploads-backup.lock \
                 "$0" __locked_run ;;
  __locked_run) cmd_run ;;
  verify)      shift; cmd_verify "$@" ;;
  restore-one) shift; cmd_restore_one "$@" ;;
  list)        cmd_list ;;
  prune)       cmd_prune ;;
  *)           die "usage: $0 {run|verify|restore-one|list|prune}" ;;
esac
