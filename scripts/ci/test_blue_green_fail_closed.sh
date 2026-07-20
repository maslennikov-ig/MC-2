#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT_DIR/scripts/deploy_blue_green.sh"
ROLLBACK="$ROOT_DIR/scripts/rollback_blue_green.sh"
TEMP_DIR="$(mktemp -d)"
CURRENT_COMMIT='0000000000000000000000000000000000000000'
STALE_COMMIT='1111111111111111111111111111111111111111'
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
expect_failure "did not reach status=switched" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

cat > "$TEMP_DIR/deploy_state" <<'EOF'
status=switched
previous_color=blue
target_color=green
commit=0000000000000000000000000000000000000000
EOF
expect_failure "active color does not match the switched deployment" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

cat > "$TEMP_DIR/deploy_state" <<EOF
status=accepted
previous_color=green
target_color=blue
commit=$STALE_COMMIT
EOF
expect_failure "does not match the requested release" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

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
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

DIGEST="$(printf 'a%.0s' {1..64})"
cat > "$TEMP_DIR/.env.green" <<EOF
WEB_IMAGE=ghcrXio/maslennikov-ig/mc-2/web@sha256:$DIGEST
API_IMAGE=ghcr.io/maslennikov-ig/mc-2/api@sha256:$DIGEST
EOF
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

cat > "$TEMP_DIR/.env.green" <<EOF
WEB_IMAGE=ghcr.io/attacker/example/web@sha256:$DIGEST
API_IMAGE=ghcr.io/maslennikov-ig/mc-2/api@sha256:$DIGEST
EOF
expect_failure "WEB_IMAGE is missing or mutable" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" production "$CURRENT_COMMIT"

# --- Q12 quiesce-aware handoff fail-closed cases ---------------------------
Q12_RUN_ID='123e4567-e89b-42d3-a456-426614174000'
Q12_SHA="$(printf 'a%.0s' {1..40})"
Q12_MANIFEST="$TEMP_DIR/backups/q12/$Q12_RUN_ID/writer-quiesce-$Q12_RUN_ID.json"

expect_failure "run-id must be a canonical" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode prepare-quiesced --run-id not-a-uuid --release-sha "$Q12_SHA" \
  --external-quiesce-manifest "$Q12_MANIFEST"

expect_failure "release-sha must be 40" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode prepare-quiesced --run-id "$Q12_RUN_ID" --release-sha short \
  --external-quiesce-manifest "$Q12_MANIFEST"

expect_failure "unknown Q12 handoff mode" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode teleport --run-id "$Q12_RUN_ID" --release-sha "$Q12_SHA" \
  --external-quiesce-manifest "$Q12_MANIFEST"

expect_failure "unexpected Q12 handoff argument" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode prepare-quiesced --run-id "$Q12_RUN_ID" --release-sha "$Q12_SHA" --surprise x

expect_failure "must be an absolute path" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode prepare-quiesced --run-id "$Q12_RUN_ID" --release-sha "$Q12_SHA" \
  --external-quiesce-manifest relative/manifest.json

# Run root absent: prepare must fail before touching Docker.
expect_failure "run root is missing" env BASE_PATH="$TEMP_DIR" "$DEPLOY" \
  --q12-mode prepare-quiesced --run-id "$Q12_RUN_ID" --release-sha "$Q12_SHA" \
  --external-quiesce-manifest "$Q12_MANIFEST"

# Build a bound run root plus a durable activation receipt for the
# finish-forward rollback guard.
mkdir -p "$TEMP_DIR/backups/q12/$Q12_RUN_ID"
cat > "$Q12_MANIFEST" <<EOF
{"schema_version":"megacampus.q12.writer-quiesce/v1","run_id":"$Q12_RUN_ID","status":"quiesced","writers":[]}
EOF
cat > "$TEMP_DIR/backups/q12/$Q12_RUN_ID/database-barrier-receipt.json" <<EOF
{"schema_version":"megacampus.q12.database-barrier-receipt/v1","run_id":"$Q12_RUN_ID","state":"activated","last_command":"activate"}
EOF
expect_failure "finish-forward only" env BASE_PATH="$TEMP_DIR" "$ROLLBACK" \
  production "$Q12_SHA" --q12-run-id "$Q12_RUN_ID" --external-quiesce-manifest "$Q12_MANIFEST"

echo "blue/green fail-closed tests passed"
