#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PUBLISHER="$ROOT_DIR/scripts/publish_production_env.sh"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

OLD_DIGEST='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
NEW_DIGEST='abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
OLD_GID='900'

write_old_env() {
  local digest="$1"
  local gid="$2"
  local target="$3"
  {
    printf 'NODE_ENV=production\n'
    printf 'SECRET_VALUE=old-secret\n'
    [ -z "$digest" ] || printf 'QDRANT_OPERATOR_IMAGE_SHA256=%s\n' "$digest"
    [ -z "$gid" ] || printf 'QDRANT_METRICS_GID=%s\n' "$gid"
  } > "$target"
  chmod 0640 "$target"
}

publish() {
  local target="$1"
  local candidate="$2"
  printf '%s' "$candidate" | "$PUBLISHER" "$target"
}

assert_unchanged_after_failure() {
  local target="$1"
  local candidate="$2"
  local before after output status
  before="$(sha256sum "$target")"
  set +e
  output="$(publish "$target" "$candidate" 2>&1)"
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail 'invalid publication unexpectedly succeeded'
  after="$(sha256sum "$target")"
  [ "$before" = "$after" ] || fail 'failed publication changed the existing env'
  [[ "$output" != *old-secret* ]] || fail 'failure output exposed an env secret'
}

[ -x "$PUBLISHER" ] || fail 'publisher is missing or not executable'

target="$TEMP_DIR/.env.production"
write_old_env "$OLD_DIGEST" "$OLD_GID" "$target"
old_inode="$(stat -c '%i' "$target")"
exec {old_env_fd}<"$target"
old_fd_content="$(cat "$target")"
publish "$target" $'NODE_ENV=production\nSECRET_VALUE=new-secret\n'
new_inode="$(stat -c '%i' "$target")"
[ "$old_inode" != "$new_inode" ] || fail 'publication did not replace the env by rename'
[ "$(cat <&"$old_env_fd")" = "$old_fd_content" ] ||
  fail 'open descriptor no longer reads the pre-publication env'
exec {old_env_fd}<&-
grep -qx "QDRANT_OPERATOR_IMAGE_SHA256=$OLD_DIGEST" "$target" ||
  fail 'valid previous operator digest was not retained'
grep -qx "QDRANT_METRICS_GID=$OLD_GID" "$target" ||
  fail 'valid previous metrics GID was not retained'
grep -qx 'SECRET_VALUE=new-secret' "$target" || fail 'candidate env was not published'
[ "$(grep -c '^QDRANT_OPERATOR_IMAGE_SHA256=' "$target")" -eq 1 ] ||
  fail 'published env has duplicate operator digest assignments'
[ "$(stat -c '%a' "$target")" = 600 ] || fail 'published env is not mode 0600'
[ -z "$(find "$TEMP_DIR" -maxdepth 1 -name '.env.production.*' -print -quit)" ] ||
  fail 'publisher left temporary env files behind'

write_old_env '' "$OLD_GID" "$target"
assert_unchanged_after_failure "$target" $'NODE_ENV=production\n'
write_old_env "$OLD_DIGEST" "$OLD_GID" "$target"
assert_unchanged_after_failure "$target" ''
write_old_env 'not-a-digest' "$OLD_GID" "$target"
assert_unchanged_after_failure "$target" $'NODE_ENV=production\n'
write_old_env "$OLD_DIGEST" "$OLD_GID" "$target"
duplicate_digest_candidate="$(printf 'QDRANT_OPERATOR_IMAGE_SHA256=%s\nQDRANT_OPERATOR_IMAGE_SHA256=%s\n' "$NEW_DIGEST" "$NEW_DIGEST")"
assert_unchanged_after_failure "$target" "$duplicate_digest_candidate"

write_old_env "$OLD_DIGEST" '' "$target"
assert_unchanged_after_failure "$target" $'NODE_ENV=production\n'
write_old_env "$OLD_DIGEST" 'zero' "$target"
assert_unchanged_after_failure "$target" $'NODE_ENV=production\n'
write_old_env "$OLD_DIGEST" "$OLD_GID" "$target"
duplicate_gid_candidate="$(printf 'QDRANT_METRICS_GID=%s\n' "$OLD_GID")"
assert_unchanged_after_failure "$target" "$duplicate_gid_candidate"

# A duplicate in the existing env is rejected before the rename as well.
{
  printf 'NODE_ENV=production\nQDRANT_OPERATOR_IMAGE_SHA256=%s\nQDRANT_OPERATOR_IMAGE_SHA256=%s\nQDRANT_METRICS_GID=%s\n' \
    "$OLD_DIGEST" "$OLD_DIGEST" "$OLD_GID"
} > "$target"
chmod 0600 "$target"
assert_unchanged_after_failure "$target" $'NODE_ENV=production\n'

echo 'production env publication tests passed'
