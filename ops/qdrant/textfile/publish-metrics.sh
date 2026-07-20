#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "usage: publish-metrics.sh OUTPUT REQUESTS FALLBACKS SNAPSHOT_UNIXTIME RESTORE_UNIXTIME" >&2
  exit 64
fi

output=$1
requests=$2
fallbacks=$3
snapshot_unixtime=$4
restore_unixtime=$5

for value in "$requests" "$fallbacks" "$snapshot_unixtime" "$restore_unixtime"; do
  [[ $value =~ ^[0-9]+$ ]] || { echo "metric values must be non-negative integers" >&2; exit 65; }
done
(( fallbacks <= requests )) || { echo "fallbacks cannot exceed requests" >&2; exit 65; }

directory=$(dirname -- "$output")
basename=$(basename -- "$output")
mkdir -p -- "$directory"
temporary=$(mktemp --tmpdir="$directory" ".${basename}.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT

{
  echo '# TYPE megacampus_qdrant_hybrid_requests_total counter'
  echo "megacampus_qdrant_hybrid_requests_total{service=\"operator\",instance=\"operator\"} $requests"
  echo '# TYPE megacampus_qdrant_hybrid_fallback_total counter'
  echo "megacampus_qdrant_hybrid_fallback_total{service=\"operator\",instance=\"operator\"} $fallbacks"
  echo '# TYPE megacampus_qdrant_last_successful_snapshot_unixtime_seconds gauge'
  echo "megacampus_qdrant_last_successful_snapshot_unixtime_seconds $snapshot_unixtime"
  echo '# TYPE megacampus_qdrant_last_successful_restore_drill_unixtime_seconds gauge'
  echo "megacampus_qdrant_last_successful_restore_drill_unixtime_seconds $restore_unixtime"
} >"$temporary"

chmod 0644 "$temporary"
mv -- "$temporary" "$output"
trap - EXIT
