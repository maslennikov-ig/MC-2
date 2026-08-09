#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENTRYPOINT="$ROOT_DIR/packages/course-gen-platform/dist/server/index.js"
OUTPUT_FILE="$(mktemp)"

cleanup() {
  rm -f "$OUTPUT_FILE"
}

fail() {
  echo "FAIL: $*" >&2
  cat "$OUTPUT_FILE" >&2
  exit 1
}

trap cleanup EXIT

[ -f "$ENTRYPOINT" ] || fail "built backend entrypoint is missing; run the package build first"

set +e
env \
  -u NODE_ENV \
  -u PORT \
  -u SUPABASE_URL \
  -u SUPABASE_SERVICE_KEY \
  -u SUPABASE_ANON_KEY \
  -u REDIS_URL \
  -u QDRANT_URL \
  -u QDRANT_API_KEY \
  -u JINA_API_KEY \
  DOTENV_CONFIG_PATH=/dev/null \
  TMPDIR=/tmp \
  timeout 20s pnpm --dir "$ROOT_DIR" --filter @megacampus/course-gen-platform start \
  >"$OUTPUT_FILE" 2>&1
status=$?
set -e

[ "$status" -ne 0 ] || fail "start unexpectedly stayed running without required configuration"
[ "$status" -ne 124 ] || fail "start timed out instead of failing on missing configuration"

output="$(<"$OUTPUT_FILE")"
[[ "$output" != *"ERR_MODULE_NOT_FOUND"* ]] \
  || fail "built backend start still fails on extensionless ESM imports"
[[ "$output" == *"Missing required environment variables"* \
  || "$output" == *"Missing Supabase configuration"* ]] \
  || fail "start did not reach a known configuration validation boundary"

echo "course-gen built start runtime contract passed"
