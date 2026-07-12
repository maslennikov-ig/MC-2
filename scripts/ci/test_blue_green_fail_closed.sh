#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT_DIR/scripts/deploy_blue_green.sh"
ROLLBACK="$ROOT_DIR/scripts/rollback_blue_green.sh"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

expect_failure() {
  local expected="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    fail "command unexpectedly succeeded: $*"
  fi
  case "$output" in
    *"$expected"*) ;;
    *) fail "expected '$expected' in: $output" ;;
  esac
}

expect_failure "TAG must be an immutable commit tag" env BASE_PATH="$TEMP_DIR" "$DEPLOY" production latest

printf 'blue\n' > "$TEMP_DIR/active_color"
cat > "$TEMP_DIR/deploy_state" <<'EOF'
status=preparing
previous_color=green
target_color=blue
commit=0000000000000000000000000000000000000000
EOF
expect_failure "did not reach status=switched" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production

cat > "$TEMP_DIR/deploy_state" <<'EOF'
status=switched
previous_color=blue
target_color=green
commit=0000000000000000000000000000000000000000
EOF
expect_failure "active color does not match the switched deployment" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production

cat > "$TEMP_DIR/deploy_state" <<'EOF'
status=accepted
previous_color=green
target_color=blue
commit=0000000000000000000000000000000000000000
EOF
cat > "$TEMP_DIR/.env.green" <<'EOF'
WEB_IMAGE=ghcr.io/maslennikov-ig/mc-2/web:latest
API_IMAGE=ghcr.io/maslennikov-ig/mc-2/api:latest
EOF
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production

DIGEST="$(printf 'a%.0s' {1..64})"
cat > "$TEMP_DIR/.env.green" <<EOF
WEB_IMAGE=ghcrXio/maslennikov-ig/mc-2/web@sha256:$DIGEST
API_IMAGE=ghcr.io/maslennikov-ig/mc-2/api@sha256:$DIGEST
EOF
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production

cat > "$TEMP_DIR/.env.green" <<EOF
WEB_IMAGE=ghcr.io/attacker/example/web@sha256:$DIGEST
API_IMAGE=ghcr.io/maslennikov-ig/mc-2/api@sha256:$DIGEST
EOF
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production

echo "blue/green fail-closed tests passed"
