#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

web_changed=false
api_changed=false
bridge_changed=false
deploy_config_changed=false
runtime_changed=false
operator_changed=false

changed_files=()

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

add_matrix_entry() {
  local image="$1"
  local dockerfile="$2"
  local context="$3"
  local target="${4:-}"
  local escaped_image escaped_dockerfile escaped_context escaped_target
  escaped_image="$(json_escape "$image")"
  escaped_dockerfile="$(json_escape "$dockerfile")"
  escaped_context="$(json_escape "$context")"
  escaped_target="$(json_escape "$target")"
  matrix_entries+=("{\"image\":\"$escaped_image\",\"dockerfile\":\"$escaped_dockerfile\",\"context\":\"$escaped_context\",\"target\":\"$escaped_target\"}")
}

read_changed_files() {
  if [ "$#" -gt 0 ]; then
    changed_files=("$@")
    return
  fi

  if [ -n "${BASE_SHA:-}" ] && [ -n "${HEAD_SHA:-}" ] && [ "$BASE_SHA" != "0000000000000000000000000000000000000000" ]; then
    mapfile -t changed_files < <(git -C "$ROOT_DIR" diff --name-only "$BASE_SHA" "$HEAD_SHA")
    return
  fi

  if [ -n "${HEAD_SHA:-}" ] && { [ "${BASE_SHA:-}" = "0000000000000000000000000000000000000000" ] || [ "${GITHUB_EVENT_BEFORE:-}" = "0000000000000000000000000000000000000000" ]; }; then
    mapfile -t changed_files < <(git -C "$ROOT_DIR" diff-tree --no-commit-id --name-only -r "$HEAD_SHA")
    return
  fi

  if [ -n "${GITHUB_EVENT_BEFORE:-}" ] && [ -n "${GITHUB_SHA:-}" ] && [ "$GITHUB_EVENT_BEFORE" != "0000000000000000000000000000000000000000" ]; then
    mapfile -t changed_files < <(git -C "$ROOT_DIR" diff --name-only "$GITHUB_EVENT_BEFORE" "$GITHUB_SHA")
    return
  fi

  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    mapfile -t changed_files < <(git -C "$ROOT_DIR" diff --name-only "origin/$GITHUB_BASE_REF...HEAD")
    return
  fi

  mapfile -t changed_files < <(git -C "$ROOT_DIR" diff --name-only HEAD~1 HEAD)
}

is_docs_or_agent_only_path() {
  local path="$1"
  case "$path" in
    .beads/*|.claude/*|.codex/*|.gemini/*|docs/*|specs/*|output/*|.playwright-cli/*)
      return 0
      ;;
    *.md)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

classify_path() {
  local path="$1"

  if is_docs_or_agent_only_path "$path"; then
    return
  fi

  case "$path" in
    docker-compose*.yml|nginx-docling-proxy.conf|deploy/*|ops/qdrant/*|scripts/deploy*.sh|scripts/rollback_blue_green.sh)
      deploy_config_changed=true
      return
      ;;
    packages/web/Dockerfile|packages/course-gen-platform/Dockerfile|.dockerignore|packages/*/.dockerignore)
      deploy_config_changed=true
      ;;
  esac

  case "$path" in
    package.json|pnpm-lock.yaml|pnpm-workspace.yaml|tsconfig.json|.dockerignore)
      web_changed=true
      api_changed=true
      runtime_changed=true
      return
      ;;
  esac

  case "$path" in
    packages/shared-types/*|packages/shared-logger/*|packages/shared-utils/*)
      web_changed=true
      api_changed=true
      runtime_changed=true
      return
      ;;
  esac

  case "$path" in
    packages/course-gen-platform/docker/notebooklm-bridge/*)
      bridge_changed=true
      runtime_changed=true
      return
      ;;
  esac

  case "$path" in
    packages/course-gen-platform/Dockerfile|packages/course-gen-platform/.dockerignore)
      api_changed=true
      runtime_changed=true
      return
      ;;
    packages/course-gen-platform/docs/*|packages/course-gen-platform/tests/*)
      return
      ;;
    packages/course-gen-platform/*)
      api_changed=true
      runtime_changed=true
      return
      ;;
  esac

  case "$path" in
    packages/web/Dockerfile|packages/web/.dockerignore)
      web_changed=true
      runtime_changed=true
      return
      ;;
    packages/web/docs/*|packages/web/tests/*)
      return
      ;;
    packages/web/*)
      web_changed=true
      runtime_changed=true
      return
      ;;
  esac

  case "$path" in
    .github/workflows/*|scripts/ci/*)
      deploy_config_changed=true
      return
      ;;
    scripts/*|packages/*|supabase/*)
      api_changed=true
      runtime_changed=true
      return
      ;;
  esac
}

read_changed_files "$@"

if [ "${FORCE_DEPLOY:-false}" = "true" ]; then
  web_changed=true
  api_changed=true
  bridge_changed=true
  runtime_changed=true
fi

for path in "${changed_files[@]}"; do
  [ -z "$path" ] && continue
  classify_path "$path"
done

should_deploy=false
if [ "$runtime_changed" = true ] || [ "$deploy_config_changed" = true ]; then
  should_deploy=true
  operator_changed=true
fi

should_build_docker=false
if [ "$web_changed" = true ] || [ "$api_changed" = true ] || [ "$bridge_changed" = true ] || [ "$operator_changed" = true ]; then
  should_build_docker=true
fi

matrix_entries=()
if [ "$web_changed" = true ]; then
  add_matrix_entry "web" "./packages/web/Dockerfile" "." ""
fi
if [ "$api_changed" = true ]; then
  add_matrix_entry "api" "./packages/course-gen-platform/Dockerfile" "." "runner"
fi
if [ "$bridge_changed" = true ]; then
  add_matrix_entry "notebooklm-bridge" "./packages/course-gen-platform/docker/notebooklm-bridge/Dockerfile" "./packages/course-gen-platform/docker/notebooklm-bridge" ""
fi
if [ "$operator_changed" = true ]; then
  add_matrix_entry "qdrant-operator" "./packages/course-gen-platform/Dockerfile" "." "qdrant-operator"
fi

docker_matrix='{"include":[]}'
if [ "${#matrix_entries[@]}" -gt 0 ]; then
  joined="$(IFS=,; echo "${matrix_entries[*]}")"
  docker_matrix="{\"include\":[$joined]}"
fi

emit() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

emit should_deploy "$should_deploy"
emit should_build_docker "$should_build_docker"
emit web_changed "$web_changed"
emit api_changed "$api_changed"
emit bridge_changed "$bridge_changed"
emit deploy_config_changed "$deploy_config_changed"
emit runtime_changed "$runtime_changed"
emit docker_matrix "$docker_matrix"
