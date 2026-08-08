#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DETECTOR="$ROOT_DIR/scripts/ci/detect_deploy_changes.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_case() {
  local name="$1"
  shift

  local output
  if ! output="$("$DETECTOR" "$@")"; then
    echo "$output" >&2
    fail "$name detector command failed"
  fi

  echo "$output"
}

get_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }'
}

assert_value() {
  local output="$1"
  local key="$2"
  local expected="$3"
  local actual
  actual="$(printf '%s\n' "$output" | get_value "$key")"
  if [ "$actual" != "$expected" ]; then
    fail "$key expected '$expected' but got '$actual'"
  fi
}

assert_contains() {
  local output="$1"
  local needle="$2"
  if ! printf '%s\n' "$output" | grep -Fq "$needle"; then
    fail "expected output to contain '$needle'"
  fi
}

docs_only="$(run_case "docs-only" \
  docs/AGENT-ORCHESTRATION.md \
  .claude/agents/development/workers/code-reviewer.md \
  .codex/stages/example/summary.md \
  output/career-playbook-e2e/report.md)"
assert_value "$docs_only" should_deploy false
assert_value "$docs_only" should_build_docker false
assert_value "$docs_only" docker_matrix '{"include":[]}'

web_only="$(run_case "web-only" packages/web/app/[locale]/page.tsx)"
assert_value "$web_only" should_deploy true
assert_value "$web_only" should_build_docker true
assert_value "$web_only" web_changed true
assert_value "$web_only" api_changed false
assert_contains "$web_only" '"image":"web"'
assert_contains "$web_only" '"image":"qdrant-operator"'
assert_contains "$web_only" '"target":"qdrant-operator"'

api_only="$(run_case "api-only" packages/course-gen-platform/src/server/index.ts)"
assert_value "$api_only" should_deploy true
assert_value "$api_only" should_build_docker true
assert_value "$api_only" web_changed false
assert_value "$api_only" api_changed true
assert_contains "$api_only" '"image":"api"'
assert_contains "$api_only" '"image":"qdrant-operator"'

shared_types="$(run_case "shared-types" packages/shared-types/src/career-playbook.ts)"
assert_value "$shared_types" should_deploy true
assert_value "$shared_types" should_build_docker true
assert_value "$shared_types" web_changed true
assert_value "$shared_types" api_changed true
assert_contains "$shared_types" '"image":"web"'
assert_contains "$shared_types" '"image":"api"'

bridge_only="$(run_case "bridge-only" packages/course-gen-platform/docker/notebooklm-bridge/app.py)"
assert_value "$bridge_only" should_deploy true
assert_value "$bridge_only" should_build_docker true
assert_value "$bridge_only" web_changed false
assert_value "$bridge_only" api_changed false
assert_value "$bridge_only" bridge_changed true
assert_contains "$bridge_only" '"image":"notebooklm-bridge"'
assert_contains "$bridge_only" '"image":"qdrant-operator"'

deploy_config="$(run_case "deploy-config" deploy/nginx/megacampus.conf.template)"
assert_value "$deploy_config" should_deploy true
assert_value "$deploy_config" should_build_docker true
assert_value "$deploy_config" deploy_config_changed true
assert_contains "$deploy_config" '"image":"qdrant-operator"'

qdrant_ops="$(run_case "qdrant-ops" ops/qdrant/prometheus/prometheus.yml)"
assert_value "$qdrant_ops" should_deploy true
assert_value "$qdrant_ops" should_build_docker true
assert_value "$qdrant_ops" deploy_config_changed true
assert_contains "$qdrant_ops" '"image":"qdrant-operator"'

deploy_script="$(run_case "deploy-script" scripts/deploy_blue_green.sh scripts/deploy_dev.sh)"
assert_value "$deploy_script" should_deploy true
assert_value "$deploy_script" should_build_docker true
assert_value "$deploy_script" deploy_config_changed true
assert_value "$deploy_script" api_changed false
assert_contains "$deploy_script" '"image":"qdrant-operator"'

host_lock="$(run_case "host-lock" scripts/lib/host-operation-lock.sh scripts/with_host_operation_lock.sh)"
assert_value "$host_lock" should_deploy true
assert_value "$host_lock" should_build_docker true
assert_value "$host_lock" deploy_config_changed true
assert_value "$host_lock" api_changed false
assert_contains "$host_lock" '"image":"qdrant-operator"'

ci_only="$(run_case "ci-only" .github/workflows/ci-cd.yml scripts/ci/detect_deploy_changes.sh)"
assert_value "$ci_only" should_deploy true
assert_value "$ci_only" should_build_docker true
assert_value "$ci_only" deploy_config_changed true
assert_contains "$ci_only" '"image":"qdrant-operator"'

root_deps="$(run_case "root-deps" package.json pnpm-lock.yaml)"
assert_value "$root_deps" should_deploy true
assert_value "$root_deps" should_build_docker true
assert_value "$root_deps" web_changed true
assert_value "$root_deps" api_changed true
assert_contains "$root_deps" '"image":"web"'
assert_contains "$root_deps" '"image":"api"'

force_all="$(FORCE_DEPLOY=true "$DETECTOR" docs/README.md)"
assert_value "$force_all" should_deploy true
assert_value "$force_all" should_build_docker true
assert_value "$force_all" web_changed true
assert_value "$force_all" api_changed true
assert_value "$force_all" bridge_changed true
assert_contains "$force_all" '"image":"web"'
assert_contains "$force_all" '"image":"api"'
assert_contains "$force_all" '"image":"notebooklm-bridge"'

echo "detect_deploy_changes tests passed"
