#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Align storage mode with start-dev defaults for local smoke checks.
export USE_LOCAL_STORAGE="${USE_LOCAL_STORAGE:-true}"
if [[ "$USE_LOCAL_STORAGE" == "true" || "$USE_LOCAL_STORAGE" == "1" ]]; then
  export ENRICHMENTS_LOCAL_PATH="${ENRICHMENTS_LOCAL_PATH:-$REPO_ROOT/data/enrichments}"
  export ENRICHMENTS_PUBLIC_URL="${ENRICHMENTS_PUBLIC_URL:-/storage/enrichments}"
  export ENRICHMENTS_PUBLIC_BASE_URL="${ENRICHMENTS_PUBLIC_BASE_URL:-http://localhost:3000}"
fi

cd "$REPO_ROOT"
pnpm --filter @megacampus/course-gen-platform exec tsx scripts/nlm-stage7-smoke.ts "$@"
