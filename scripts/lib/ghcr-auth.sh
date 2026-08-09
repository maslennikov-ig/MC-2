#!/usr/bin/env bash

GHCR_EPHEMERAL_DOCKER_CONFIG=''
GHCR_EPHEMERAL_DOCKER_CONFIG_ROOT=''

ghcr_cleanup_ephemeral_auth() {
  local config_dir="${GHCR_EPHEMERAL_DOCKER_CONFIG:-}"
  local config_root="${GHCR_EPHEMERAL_DOCKER_CONFIG_ROOT:-}"

  [ -n "$config_dir" ] || return 0
  if [ -z "$config_root" ] || [ "${config_dir%/*}" != "$config_root" ] ||
    [[ "${config_dir##*/}" != mc2-ghcr-auth.* ]] || [ ! -O "$config_dir" ]; then
    printf 'ERROR: refusing to remove unexpected ephemeral Docker config path\n' >&2
    return 1
  fi

  rm -rf -- "$config_dir"
  GHCR_EPHEMERAL_DOCKER_CONFIG=''
  GHCR_EPHEMERAL_DOCKER_CONFIG_ROOT=''
}

ghcr_login_with_ci_token() {
  [ -n "${GITHUB_TOKEN:-}" ] || return 0

  local temp_root="${TMPDIR:-/tmp}"
  if [[ "$temp_root" != /* ]] || [ ! -d "$temp_root" ] || [ ! -w "$temp_root" ]; then
    printf 'ERROR: GHCR authentication requires a writable absolute temporary directory\n' >&2
    return 73
  fi

  GHCR_EPHEMERAL_DOCKER_CONFIG_ROOT="$(cd "$temp_root" && pwd -P)"
  GHCR_EPHEMERAL_DOCKER_CONFIG="$(mktemp -d "$GHCR_EPHEMERAL_DOCKER_CONFIG_ROOT/mc2-ghcr-auth.XXXXXX")"
  chmod 0700 "$GHCR_EPHEMERAL_DOCKER_CONFIG"
  export DOCKER_CONFIG="$GHCR_EPHEMERAL_DOCKER_CONFIG"
  trap ghcr_cleanup_ephemeral_auth EXIT

  echo "Logging in to GHCR with an ephemeral Docker config..."
  printf '%s' "$GITHUB_TOKEN" |
    docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
  unset GITHUB_TOKEN
}
