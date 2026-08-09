#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_entrypoint() {
  local name="$1"
  local entrypoint="$2"
  shift 2

  local case_dir="$TEMP_DIR/$name"
  local fake_bin="$case_dir/bin"
  local home_dir="$case_dir/home"
  local base_path="$case_dir/base"
  local record_dir="$case_dir/record"
  local original_config='{"auths":{"ghcr.io":{"auth":"persistent-read-only"}}}'
  local output status config_path

  mkdir -p "$fake_bin" "$home_dir/.docker" "$base_path/scripts/lib" "$record_dir"
  printf '%s\n' "$original_config" > "$home_dir/.docker/config.json"
  cp "$ROOT_DIR/scripts/lib/docling-rollout.sh" "$base_path/scripts/lib/docling-rollout.sh"

  cat > "$fake_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

[ "${1:-}" = login ] || exit 98
config_dir="${DOCKER_CONFIG:-$HOME/.docker}"
printf '%s\n' "$config_dir" > "$GHCR_TEST_RECORD/config-path"
token="$(cat)"
[ "$token" = test-ci-token ] || exit 96
mkdir -p "$config_dir"
printf '%s\n' '{"auths":{"ghcr.io":{"auth":"temporary-job-token"}}}' > "$config_dir/config.json"
exit 42
EOF
  chmod +x "$fake_bin/docker"

  set +e
  output="$({
    HOME="$home_dir" \
      PATH="$fake_bin:$PATH" \
      BASE_PATH="$base_path" \
      GHCR_TEST_RECORD="$record_dir" \
      GITHUB_TOKEN=test-ci-token \
      GITHUB_ACTOR=test-actor \
      DEPLOY_WEB_CHANGED=false \
      DEPLOY_API_CHANGED=false \
      DEPLOY_BRIDGE_CHANGED=false \
      DEPLOY_CONFIG_CHANGED=false \
      "$entrypoint" "$@"
  } 2>&1)"
  status=$?
  set -e

  [ "$status" -eq 42 ] \
    || fail "$name did not reach the controlled docker login failure (exit $status): $output"
  [[ "$output" != *test-ci-token* ]] || fail "$name exposed the CI token in output"
  [ -s "$record_dir/config-path" ] || fail "$name did not invoke docker login"
  config_path="$(cat "$record_dir/config-path")"
  [ "$config_path" != "$home_dir/.docker" ] || fail "$name overwrote the persistent Docker config"
  [ "$(cat "$home_dir/.docker/config.json")" = "$original_config" ] \
    || fail "$name changed the persistent Docker credential"
  [ ! -e "$config_path" ] || fail "$name left the ephemeral Docker config behind after exit"
}

run_entrypoint blue-green "$ROOT_DIR/scripts/deploy_blue_green.sh" \
  production 0000000000000000000000000000000000000000
run_entrypoint development "$ROOT_DIR/scripts/deploy_dev.sh"

echo "ephemeral GHCR auth tests passed"
