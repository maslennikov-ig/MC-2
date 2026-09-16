#!/usr/bin/env bash
set -euo pipefail

# Publish a complete production env without exposing a partially-written file to
# the snapshot/operator timers. The deploy workflow supplies the candidate on
# stdin; the two host-owned values are retained from the existing env and the
# final file is replaced with one same-directory rename.

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

target="${1:-}"
[ -n "$target" ] || fail 'usage: publish_production_env.sh <absolute-env-path>'
[[ "$target" == /* ]] || fail 'target env path must be absolute'
[ -f "$target" ] && [ ! -L "$target" ] ||
  fail 'existing target env is missing or is not a regular file'

target_dir="$(dirname -- "$target")"
target_name="$(basename -- "$target")"
[ -d "$target_dir" ] || fail 'target env directory is missing'

candidate_tmp="$(mktemp -- "$target_dir/.${target_name}.candidate.XXXXXX")"
published_tmp=""
cleanup() {
  [ -z "$candidate_tmp" ] || rm -f -- "$candidate_tmp"
  [ -z "$published_tmp" ] || rm -f -- "$published_tmp"
}
trap cleanup EXIT
chmod 0600 -- "$candidate_tmp"
cat > "$candidate_tmp"
[ -s "$candidate_tmp" ] || fail 'candidate env is empty'

read_unique_value() {
  local file="$1"
  local key="$2"
  local output_name="$3"
  local count=0
  local value=''
  local line

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$key="*)
        count=$((count + 1))
        value="${line#"$key="}"
        ;;
    esac
  done < "$file"

  [ "$count" -eq 1 ] || fail "existing env must contain exactly one $key"
  printf -v "$output_name" '%s' "$value"
}

assert_candidate_omits() {
  local key="$1"
  local count
  count="$(awk -v key="$key" 'index($0, key "=") == 1 { count++ } END { print count + 0 }' "$candidate_tmp")"
  [ "$count" -eq 0 ] || fail "candidate env must omit $key; it is retained from the existing env"
}

operator_digest=''
metrics_gid=''
read_unique_value "$target" QDRANT_OPERATOR_IMAGE_SHA256 operator_digest
read_unique_value "$target" QDRANT_METRICS_GID metrics_gid

[[ "$operator_digest" =~ ^[0-9a-f]{64}$ ]] ||
  fail 'existing QDRANT_OPERATOR_IMAGE_SHA256 is not a valid 64-character lowercase digest'
[[ "$metrics_gid" =~ ^[1-9][0-9]*$ ]] ||
  fail 'existing QDRANT_METRICS_GID is not a valid non-zero numeric group id'

# The workflow deliberately does not provide these values. Rejecting all
# candidate assignments also rejects duplicate digest lines before publication.
assert_candidate_omits QDRANT_OPERATOR_IMAGE_SHA256
assert_candidate_omits QDRANT_METRICS_GID

published_tmp="$(mktemp -- "$target_dir/.${target_name}.XXXXXX")"
chmod 0600 -- "$published_tmp"
{
  cat -- "$candidate_tmp"
  printf '\nQDRANT_OPERATOR_IMAGE_SHA256=%s\n' "$operator_digest"
  printf 'QDRANT_METRICS_GID=%s\n' "$metrics_gid"
} > "$published_tmp"
chmod 0600 -- "$published_tmp"

# `mv` within the target directory is the publication boundary. Any validation,
# read, or write failure above leaves the previous valid env untouched. Existing
# deployments are intentionally fail-closed when either retained value is absent
# or malformed; first bootstrap requires a separately authorized initialization.
mv -f -- "$published_tmp" "$target"
published_tmp=''

unset operator_digest metrics_gid
