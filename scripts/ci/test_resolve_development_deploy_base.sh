#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESOLVER="$ROOT_DIR/scripts/ci/resolve_development_deploy_base.sh"
DETECTOR="$ROOT_DIR/scripts/ci/detect_deploy_changes.sh"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

get_value() {
  local output="$1"
  local key="$2"
  printf '%s\n' "$output" | awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }'
}

assert_value() {
  local output="$1"
  local key="$2"
  local expected="$3"
  local actual
  actual="$(get_value "$output" "$key")"
  [ "$actual" = "$expected" ] || fail "$key expected '$expected' but got '$actual'"
}

REPO="$TEMP_DIR/repository"
mkdir -p "$REPO/packages/course-gen-platform/src" "$REPO/scripts/ci"
git -C "$REPO" init -q
git -C "$REPO" config user.name test
git -C "$REPO" config user.email test@example.invalid
echo base > "$REPO/README.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm base
DEPLOYED_SHA="$(git -C "$REPO" rev-parse HEAD)"

echo runtime > "$REPO/packages/course-gen-platform/src/runtime.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm runtime
FAILED_SHA="$(git -C "$REPO" rev-parse HEAD)"

echo fixture > "$REPO/scripts/ci/fixture.sh"
git -C "$REPO" add .
git -C "$REPO" commit -qm ci-fixture
HEAD_SHA="$(git -C "$REPO" rev-parse HEAD)"

mkdir -p "$TEMP_DIR/bin"
cat > "$TEMP_DIR/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    http://*|https://*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
[ -n "$output" ] || exit 90
if [ "${MOCK_API_FAILURE:-false}" = true ]; then
  exit 22
fi
case "$url" in
  */deployments\?*)
    cat > "$output" <<JSON
[
  {"id": 30, "sha": "$FAILED_SHA", "created_at": "2026-09-06T00:00:30Z"},
  {"id": 20, "sha": "$DEPLOYED_SHA", "created_at": "2026-09-06T00:00:20Z"}
]
JSON
    ;;
  */deployments/30/statuses\?*)
    if [ "${MOCK_LATEST_SUCCESS:-false}" = true ]; then
      printf '%s\n' '[{"id": 301, "state": "success", "created_at": "2026-09-06T00:00:31Z"}]' > "$output"
    else
      printf '%s\n' '[{"id": 301, "state": "failure", "created_at": "2026-09-06T00:00:31Z"}]' > "$output"
    fi
    ;;
  */deployments/20/statuses\?*)
    printf '%s\n' '[{"id": 201, "state": "success", "created_at": "2026-09-06T00:00:21Z"}]' > "$output"
    ;;
  *)
    exit 91
    ;;
esac
EOF
chmod +x "$TEMP_DIR/bin/curl"

run_resolver() {
  env \
    PATH="$TEMP_DIR/bin:$PATH" \
    REPOSITORY_ROOT="$REPO" \
    GITHUB_EVENT_NAME=push \
    GITHUB_REF=refs/heads/develop \
    GITHUB_REPOSITORY=example/repository \
    GITHUB_TOKEN=test-token \
    GITHUB_API_URL=https://api.github.test \
    EVENT_BEFORE="$FAILED_SHA" \
    HEAD_SHA="$HEAD_SHA" \
    DEPLOYED_SHA="$DEPLOYED_SHA" \
    FAILED_SHA="$FAILED_SHA" \
    "$@" "$RESOLVER"
}

# The newest deployment failed. The prior successful deployment is the real
# baseline, so the runtime change from the red run remains in the next diff.
catch_up="$(run_resolver env)"
assert_value "$catch_up" base_sha "$DEPLOYED_SHA"
assert_value "$catch_up" force_all_runtime false
assert_value "$catch_up" baseline_source successful_development_deployment

mapfile -t cumulative_files < <(git -C "$REPO" diff --name-only "$DEPLOYED_SHA" "$HEAD_SHA")
cumulative_detection="$("$DETECTOR" "${cumulative_files[@]}")"
assert_value "$cumulative_detection" api_changed true
assert_value "$cumulative_detection" deploy_config_changed true

# When the immediately preceding commit really reached development, retain the
# narrow config-only path and do not rebuild API code that is already live.
current_baseline="$(run_resolver env MOCK_LATEST_SUCCESS=true)"
assert_value "$current_baseline" base_sha "$FAILED_SHA"
assert_value "$current_baseline" force_all_runtime false
mapfile -t current_files < <(git -C "$REPO" diff --name-only "$FAILED_SHA" "$HEAD_SHA")
current_detection="$("$DETECTOR" "${current_files[@]}")"
assert_value "$current_detection" api_changed false
assert_value "$current_detection" deploy_config_changed true

# An unreachable history endpoint cannot prove what was deployed. Rebuild all
# runtime images instead of shrinking the diff back to the preceding commit.
api_failure="$(run_resolver env MOCK_API_FAILURE=true)"
assert_value "$api_failure" base_sha "$FAILED_SHA"
assert_value "$api_failure" force_all_runtime true
assert_value "$api_failure" baseline_source conservative_fallback
fallback_detection="$(FORCE_DEPLOY="$(get_value "$api_failure" force_all_runtime)" "$DETECTOR" scripts/ci/fixture.sh)"
assert_value "$fallback_detection" web_changed true
assert_value "$fallback_detection" api_changed true
assert_value "$fallback_detection" bridge_changed true

# A deployment SHA outside the current branch is not a usable delivery base.
FOREIGN_REPO="$TEMP_DIR/foreign"
git -C "$REPO" worktree add -q --detach "$FOREIGN_REPO" "$DEPLOYED_SHA"
echo foreign > "$FOREIGN_REPO/foreign.txt"
git -C "$FOREIGN_REPO" add .
git -C "$FOREIGN_REPO" commit -qm foreign
FOREIGN_SHA="$(git -C "$FOREIGN_REPO" rev-parse HEAD)"
git -C "$REPO" worktree remove -f "$FOREIGN_REPO"

non_ancestor="$(DEPLOYED_SHA="$FOREIGN_SHA" run_resolver env)"
assert_value "$non_ancestor" base_sha "$FAILED_SHA"
assert_value "$non_ancestor" force_all_runtime true
assert_value "$non_ancestor" baseline_source conservative_fallback

echo "resolve_development_deploy_base tests passed"
