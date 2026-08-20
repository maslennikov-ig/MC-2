#!/usr/bin/env bash
# Publishes host filesystem capacity as textfile metrics.
#
# Why a host-side writer and not the filesystem collector: the node_exporter in
# docker-compose.infra.yml is deliberately `--collector.disable-defaults
# --collector.textfile`, read-only, uid 65534, cap_drop ALL, and its comment says
# "Machine-scoped batch/application metrics only; no host collectors or host
# namespaces." Enabling `--collector.filesystem` there would report the
# CONTAINER's view; making it report the host's would mean mounting `/` into it,
# which is the thing that comment forbids. The textfile channel is the sanctioned
# way to get a host fact into Prometheus, and three other writers already use it.
#
# Why this exists at all: on 2026-08-20 the deploy host reached 100% (148G, 141G
# used, 0 avail) with no alert of any kind — 17 rules and not one about disk.
# Prometheus then could not write its own WAL, so the metric behind
# SupabaseBackupStale went stale and `absent()` turned a full disk into a
# critical BACKUP alarm. The first true symptom was a deploy dying on
# `ENOSPC: mkdir '/tmp/tsx-1001'` (mc2-adb6y).
#
# usage: publish-disk-metrics.sh OUTPUT [MOUNTPOINT]
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: publish-disk-metrics.sh OUTPUT [MOUNTPOINT]" >&2
  exit 64
fi

output=$1
mountpoint=${2:-/}

[[ -d $mountpoint ]] || { echo "not a directory: $mountpoint" >&2; exit 65; }

# POSIX output, one block size, so the parse does not depend on df's human mode.
read -r size_bytes avail_bytes < <(
  df -P -B1 -- "$mountpoint" | awk 'NR==2 { print $2, $4 }'
)

for value in "$size_bytes" "$avail_bytes"; do
  [[ $value =~ ^[0-9]+$ ]] || { echo "df returned a non-numeric value" >&2; exit 65; }
done
(( size_bytes > 0 )) || { echo "filesystem reports zero size" >&2; exit 65; }
(( avail_bytes <= size_bytes )) || { echo "available exceeds size" >&2; exit 65; }

directory=$(dirname -- "$output")
basename=$(basename -- "$output")
mkdir -p -- "$directory"
temporary=$(mktemp --tmpdir="$directory" ".${basename}.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT

# Names deliberately mirror node_exporter's filesystem collector, so a future
# move to the real collector needs no rule rewrite.
{
  echo '# TYPE megacampus_host_filesystem_size_bytes gauge'
  echo "megacampus_host_filesystem_size_bytes{mountpoint=\"$mountpoint\"} $size_bytes"
  echo '# TYPE megacampus_host_filesystem_avail_bytes gauge'
  echo "megacampus_host_filesystem_avail_bytes{mountpoint=\"$mountpoint\"} $avail_bytes"
} >"$temporary"

chmod 0644 "$temporary"
mv -- "$temporary" "$output"
trap - EXIT
