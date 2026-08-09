#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/course-gen-platform"
TARGET_DECLARATION="$PACKAGE_DIR/dist/server/routers/admin/users.d.ts"
BUILD_INFO="$PACKAGE_DIR/tsconfig.tsbuildinfo"
TEMP_DIR="$(mktemp -d)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

restore_outputs() {
  if [ -d "$TEMP_DIR/original-dist" ]; then
    if [ -d "$PACKAGE_DIR/dist" ]; then
      mv "$PACKAGE_DIR/dist" "$TEMP_DIR/rebuilt-dist"
    fi
    mv "$TEMP_DIR/original-dist" "$PACKAGE_DIR/dist"
  fi
}

cleanup() {
  restore_outputs
  rm -rf "$TEMP_DIR"
}

trap cleanup EXIT
cd "$ROOT_DIR"

pnpm --filter @megacampus/course-gen-platform build:types
[ -f "$TARGET_DECLARATION" ] || fail "baseline build did not emit admin/users.d.ts"
[ -f "$BUILD_INFO" ] || fail "baseline build did not retain tsconfig.tsbuildinfo"

mv "$PACKAGE_DIR/dist" "$TEMP_DIR/original-dist"

pnpm --filter @megacampus/course-gen-platform build:types
[ -f "$TARGET_DECLARATION" ] \
  || fail "build:types exited successfully but left admin/users.d.ts missing with stale tsbuildinfo"

pnpm --filter @megacampus/course-gen-platform build:types
[ -f "$TARGET_DECLARATION" ] || fail "repeated build removed admin/users.d.ts"

echo "course-gen declaration rebuild contract passed"
