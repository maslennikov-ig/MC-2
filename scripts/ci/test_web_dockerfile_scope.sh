#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DOCKERFILE="$ROOT_DIR/packages/web/Dockerfile"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if grep -Eq 'RUN[[:space:]]+pnpm[[:space:]]+build([[:space:]]|$)' "$WEB_DOCKERFILE"; then
  fail "web Dockerfile must not run the root monorepo build"
fi

grep -Fq 'pnpm --filter @megacampus/course-gen-platform exec tsc -p tsconfig.json --emitDeclarationOnly' "$WEB_DOCKERFILE" \
  || fail "web Dockerfile must generate backend type declarations for AppRouter"

grep -Fq 'pnpm --filter @megacampus/web build' "$WEB_DOCKERFILE" \
  || fail "web Dockerfile must build only the web package"

echo "web Dockerfile scope test passed"
