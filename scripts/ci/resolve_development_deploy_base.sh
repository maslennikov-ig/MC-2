#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${REPOSITORY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
EVENT_BEFORE="${EVENT_BEFORE:-${GITHUB_EVENT_BEFORE:-}}"
HEAD_SHA="${HEAD_SHA:-${GITHUB_SHA:-}}"

emit() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

emit_result() {
  emit base_sha "$1"
  emit force_all_runtime "$2"
  emit baseline_source "$3"
}

fallback() {
  local reason="$1"
  echo "::warning::Development deploy baseline is untrusted ($reason); rebuilding every runtime image." >&2
  emit_result "$EVENT_BEFORE" true conservative_fallback
  exit 0
}

# Keep pull requests, production and manual dispatch on their existing diff
# semantics. The development push path is the only one backed by the
# `development` GitHub Environment deployment history.
if [ "${GITHUB_EVENT_NAME:-}" != push ] || [ "${GITHUB_REF:-}" != refs/heads/develop ]; then
  emit_result "$EVENT_BEFORE" false event_before
  exit 0
fi

[ -n "$EVENT_BEFORE" ] && [ -n "$HEAD_SHA" ] || fallback missing_event_sha
[ -n "${GITHUB_TOKEN:-}" ] || fallback missing_github_token
[ -n "${GITHUB_REPOSITORY:-}" ] || fallback missing_repository
[ -n "${GITHUB_API_URL:-}" ] || fallback missing_api_url

[[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fallback invalid_repository
case "$GITHUB_API_URL" in
  https://*) ;;
  *) fallback invalid_api_url ;;
esac
case "$GITHUB_TOKEN" in
  *$'\n'*|*$'\r'*) fallback invalid_github_token ;;
esac

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
AUTH_CONFIG="$TEMP_DIR/curl-auth"
DEPLOYMENTS_JSON="$TEMP_DIR/deployments.json"
umask 077
printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN" > "$AUTH_CONFIG"

api_get() {
  local url="$1"
  local output="$2"
  curl \
    --config "$AUTH_CONFIG" \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 3 \
    --max-time 8 \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2026-03-10' \
    --output "$output" \
    "$url" 2>/dev/null
}

# Thirty recent development deployments bound both API work and failure time.
# A success older than this is deliberately treated as unknown and triggers a
# full runtime rebuild.
DEPLOYMENTS_URL="${GITHUB_API_URL%/}/repos/$GITHUB_REPOSITORY/deployments?environment=development&ref=develop&per_page=30"
api_get "$DEPLOYMENTS_URL" "$DEPLOYMENTS_JSON" || fallback deployments_api_unavailable

if ! deployment_rows="$(python3 - "$DEPLOYMENTS_JSON" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
if not isinstance(value, list):
    raise ValueError("deployments response is not a list")

rows = []
for item in value[:30]:
    if not isinstance(item, dict):
        continue
    deployment_id = item.get("id")
    sha = item.get("sha")
    created_at = item.get("created_at")
    if (
        isinstance(deployment_id, int)
        and isinstance(sha, str)
        and re.fullmatch(r"[0-9a-fA-F]{40}", sha)
        and isinstance(created_at, str)
    ):
        rows.append((created_at, deployment_id, sha.lower()))

for _, deployment_id, sha in sorted(rows, reverse=True):
    print(f"{deployment_id}\t{sha}")
PY
)"; then
  fallback invalid_deployments_response
fi

successful_sha=''
while IFS=$'\t' read -r deployment_id deployment_sha; do
  [ -n "$deployment_id" ] || continue
  STATUSES_JSON="$TEMP_DIR/statuses-$deployment_id.json"
  STATUSES_URL="${GITHUB_API_URL%/}/repos/$GITHUB_REPOSITORY/deployments/$deployment_id/statuses?per_page=30"
  if ! api_get "$STATUSES_URL" "$STATUSES_JSON"; then
    continue
  fi
  if ! latest_state="$(python3 - "$STATUSES_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
if not isinstance(value, list):
    raise ValueError("deployment statuses response is not a list")

rows = []
for item in value[:30]:
    if not isinstance(item, dict):
        continue
    state = item.get("state")
    created_at = item.get("created_at")
    status_id = item.get("id")
    if isinstance(state, str) and isinstance(created_at, str) and isinstance(status_id, int):
        rows.append((created_at, status_id, state))

if rows:
    print(max(rows)[2])
PY
)"; then
    continue
  fi
  if [ "$latest_state" = success ]; then
    successful_sha="$deployment_sha"
    break
  fi
done <<< "$deployment_rows"

[ -n "$successful_sha" ] || fallback no_recent_successful_deployment
git -C "$ROOT_DIR" cat-file -e "$successful_sha^{commit}" 2>/dev/null || fallback deployment_commit_missing
git -C "$ROOT_DIR" cat-file -e "$HEAD_SHA^{commit}" 2>/dev/null || fallback head_commit_missing
git -C "$ROOT_DIR" merge-base --is-ancestor "$successful_sha" "$HEAD_SHA" 2>/dev/null || fallback deployment_not_ancestor

emit_result "$successful_sha" false successful_development_deployment
