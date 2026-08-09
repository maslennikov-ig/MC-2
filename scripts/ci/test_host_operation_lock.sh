#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRAPPER="$ROOT_DIR/scripts/with_host_operation_lock.sh"
TEMP_DIR="$(mktemp -d)"
LOCK_PATH="$TEMP_DIR/.host-operation.lock"
READY_PATH="$TEMP_DIR/holder-ready"
RELEASE_PATH="$TEMP_DIR/release-holder"
CONTENDER_MARKER="$TEMP_DIR/contender-ran"
AFTER_MARKER="$TEMP_DIR/after-ran"
HOLDER_PID=''

cleanup() {
  if [ -n "$HOLDER_PID" ] && kill -0 "$HOLDER_PID" 2>/dev/null; then
    kill "$HOLDER_PID" 2>/dev/null || true
    wait "$HOLDER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -x "$WRAPPER" ] || fail "shared host-operation wrapper is missing or not executable"

HOST_OPERATION_LOCK_PATH="$LOCK_PATH" "$WRAPPER" test-holder -- \
  bash -c 'touch "$1"; while [ ! -e "$2" ]; do sleep 0.05; done' \
  _ "$READY_PATH" "$RELEASE_PATH" &
HOLDER_PID=$!

for _ in $(seq 1 100); do
  [ -e "$READY_PATH" ] && break
  kill -0 "$HOLDER_PID" 2>/dev/null || fail "lock holder exited before its command started"
  sleep 0.05
done
[ -e "$READY_PATH" ] || fail "lock holder did not start"

set +e
contender_output="$({
  HOST_OPERATION_LOCK_PATH="$LOCK_PATH" "$WRAPPER" test-contender -- \
    sh -c 'touch "$1"' _ "$CONTENDER_MARKER" 'secret-must-not-appear'
} 2>&1)"
contender_status=$?
set -e

[ "$contender_status" -eq 75 ] || fail "contender exited $contender_status instead of 75: $contender_output"
[[ "$contender_output" == *"cannot start test-contender"* ]] \
  || fail "contention error does not identify the rejected operation: $contender_output"
[[ "$contender_output" != *"secret-must-not-appear"* ]] \
  || fail "contention error exposed child-command arguments"
[ ! -e "$CONTENDER_MARKER" ] || fail "contending command ran without the lock"

for entrypoint in \
  "$ROOT_DIR/scripts/deploy_blue_green.sh production latest" \
  "$ROOT_DIR/scripts/deploy_dev.sh" \
  "$ROOT_DIR/scripts/rollback_blue_green.sh production 0000000000000000000000000000000000000000" \
  "$ROOT_DIR/scripts/deploy.sh production latest"; do
  read -r -a argv <<< "$entrypoint"
  set +e
  entrypoint_output="$({
    cd "$TEMP_DIR"
    BASE_PATH="$TEMP_DIR" HOST_OPERATION_LOCK_PATH="$LOCK_PATH" "${argv[@]}"
  } 2>&1)"
  entrypoint_status=$?
  set -e
  [ "$entrypoint_status" -eq 75 ] \
    || fail "$(basename "${argv[0]}") bypassed the held lock (exit $entrypoint_status): $entrypoint_output"
done

touch "$RELEASE_PATH"
wait "$HOLDER_PID"
HOLDER_PID=''

HOST_OPERATION_LOCK_PATH="$LOCK_PATH" "$WRAPPER" test-after-release -- \
  touch "$AFTER_MARKER"
[ -e "$AFTER_MARKER" ] || fail "command did not run after the owner released the lock"

echo "host-operation lock tests passed"
