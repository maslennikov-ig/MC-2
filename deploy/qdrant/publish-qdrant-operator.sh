#!/usr/bin/bash
set -Eeuo pipefail
set +x

export LC_ALL=C
umask 077

readonly REGISTRY='ghcr.io'
readonly REPOSITORY='ghcr.io/maslennikov-ig/mc-2/qdrant-operator'
readonly EXPECTED_ORIGIN='https://github.com/maslennikov-ig/MC-2.git'
readonly DOCKERFILE_RELATIVE='packages/course-gen-platform/Dockerfile'
readonly REQUIRED_TARGET='qdrant-operator'
readonly REQUIRED_PLATFORM='linux/amd64'
readonly MINIMAL_PATH='/usr/local/bin:/usr/bin:/bin'

COMMIT=''
GITHUB_USER=''
CONFIRMATION=''
STATE_ROOT=''
WORKTREE=''
DOCKER_CONFIG_DIR=''
DOCKER_HOME=''
GIT_BIN=''
DOCKER_BIN=''
ENV_BIN=''
CLEANUP_DONE=0
CLEANUP_STATUS=0

usage() {
  printf '%s\n' \
    'Usage: publish-qdrant-operator.sh --commit <40-hex-sha> --github-user <user> --confirm "PUBLISH qdrant-operator <40-hex-sha>"' >&2
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

set_once() {
  local name="$1"
  local value="$2"
  local current
  current="${!name}"
  [[ -z "$current" ]] || fail "duplicate option for $name"
  printf -v "$name" '%s' "$value"
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --commit)
        (( $# >= 2 )) || fail '--commit requires a value'
        set_once COMMIT "$2"
        shift 2
        ;;
      --github-user)
        (( $# >= 2 )) || fail '--github-user requires a value'
        set_once GITHUB_USER "$2"
        shift 2
        ;;
      --confirm)
        (( $# >= 2 )) || fail '--confirm requires a value'
        set_once CONFIRMATION "$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage
        fail "unknown argument: $1"
        ;;
    esac
  done
}

validate_request() {
  [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] ||
    fail 'commit must be exactly 40 lowercase hexadecimal characters'
  [[ "$GITHUB_USER" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$ ]] ||
    fail 'GitHub username is invalid'
  local expected_confirmation="PUBLISH qdrant-operator $COMMIT"
  [[ "$CONFIRMATION" == "$expected_confirmation" ]] ||
    fail "confirmation must exactly equal: $expected_confirmation"
}

reject_inherited_docker_authentication() {
  if [[ -n "${DOCKER_CONFIG:-}" || -n "${DOCKER_AUTH_CONFIG:-}" ]]; then
    fail 'inherited Docker authentication is forbidden; unset DOCKER_CONFIG and DOCKER_AUTH_CONFIG'
  fi

  local inherited_config=''
  local inherited_contents=''
  local nonempty_auths_regex='"auths"[[:space:]]*:[[:space:]]*\{[[:space:]]*"'
  if [[ -n "${HOME:-}" ]]; then
    inherited_config="$HOME/.docker/config.json"
  fi
  if [[ -n "$inherited_config" && ( -e "$inherited_config" || -L "$inherited_config" ) ]]; then
    [[ -f "$inherited_config" && ! -L "$inherited_config" ]] ||
      fail 'inherited Docker authentication is forbidden; default config is not a regular file'
    inherited_contents="$(<"$inherited_config")"
    if [[ "$inherited_contents" == *'"credsStore"'* ||
          "$inherited_contents" == *'"credHelpers"'* ||
          "$inherited_contents" =~ $nonempty_auths_regex ]]; then
      fail 'inherited Docker authentication is forbidden; remove default auths and credential helpers'
    fi
  fi
}

resolve_commands() {
  GIT_BIN="$(command -v git)" || fail 'git executable is required'
  DOCKER_BIN="$(command -v docker)" || fail 'docker executable is required'
  ENV_BIN="$(command -v env)" || fail 'env executable is required'
  [[ "$GIT_BIN" == /* && -x "$GIT_BIN" ]] || fail 'git executable resolution is unsafe'
  [[ "$DOCKER_BIN" == /* && -x "$DOCKER_BIN" ]] || fail 'docker executable resolution is unsafe'
  [[ "$ENV_BIN" == /* && -x "$ENV_BIN" ]] || fail 'env executable resolution is unsafe'
}

validate_commit_identity() {
  local repository_root
  local origin_url
  local remote_refs
  repository_root="$($GIT_BIN rev-parse --show-toplevel)" ||
    fail 'publisher must run inside a Git worktree'
  [[ "$repository_root" == /* ]] || fail 'Git repository root must be absolute'
  "$GIT_BIN" cat-file -e "${COMMIT}^{commit}" 2>/dev/null ||
    fail 'commit is not reachable in the local repository'
  origin_url="$($GIT_BIN remote get-url origin)" || fail 'unable to resolve the origin URL'
  [[ "$origin_url" == "$EXPECTED_ORIGIN" ]] || fail 'origin must be the canonical MegaCampus repository'
  GIT_TERMINAL_PROMPT=0 "$GIT_BIN" fetch --quiet --prune --no-tags origin ||
    fail 'unable to refresh origin before publication'
  remote_refs="$($GIT_BIN for-each-ref --format='%(refname)' --contains "$COMMIT" refs/remotes/origin/)" ||
    fail 'unable to inspect origin remote-tracking refs'
  [[ -n "$remote_refs" ]] ||
    fail 'commit is not contained by any fetched origin ref; push and fetch it before publication'
}

run_docker() {
  "$ENV_BIN" -i \
    "HOME=$DOCKER_HOME" \
    "PATH=$MINIMAL_PATH" \
    "DOCKER_CONFIG=$DOCKER_CONFIG_DIR" \
    'BUILDX_METADATA_PROVENANCE=max' \
    "$DOCKER_BIN" "$@"
}

cleanup_resources() {
  if (( CLEANUP_DONE != 0 )); then
    return "$CLEANUP_STATUS"
  fi
  CLEANUP_DONE=1
  local failed=0

  if [[ -n "$DOCKER_CONFIG_DIR" && -d "$DOCKER_CONFIG_DIR" ]]; then
    if ! run_docker logout "$REGISTRY" >/dev/null 2>&1; then
      failed=1
    fi
  fi
  if [[ -n "$WORKTREE" && -e "$WORKTREE" ]]; then
    if ! "$GIT_BIN" worktree remove --force "$WORKTREE" >/dev/null 2>&1; then
      failed=1
    fi
  fi
  if [[ -n "$STATE_ROOT" ]]; then
    if ! rm -rf -- "$STATE_ROOT"; then
      failed=1
    fi
    if [[ -e "$STATE_ROOT" || -L "$STATE_ROOT" ]]; then
      failed=1
    fi
  fi

  CLEANUP_STATUS=$failed
  return "$failed"
}

on_exit() {
  local original_status=$?
  trap - EXIT HUP INT TERM
  if ! cleanup_resources; then
    printf '%s\n' 'ERROR: publisher cleanup failed; publication result must not be accepted' >&2
    exit 90
  fi
  exit "$original_status"
}

install_cleanup_traps() {
  trap on_exit EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

create_isolated_state() {
  STATE_ROOT="$(mktemp -d -- "${TMPDIR:-/tmp}/mc2-qdrant-publisher.XXXXXXXXXX")" ||
    fail 'unable to create unique publisher state'
  install_cleanup_traps
  [[ "$STATE_ROOT" == /* ]] || fail 'publisher state path must be absolute'
  chmod 0700 "$STATE_ROOT"
  WORKTREE="$STATE_ROOT/worktree"
  DOCKER_CONFIG_DIR="$STATE_ROOT/docker-config"
  DOCKER_HOME="$STATE_ROOT/docker-home"
  mkdir -m 0700 -- "$DOCKER_CONFIG_DIR" "$DOCKER_HOME"
  printf '%s\n' '{"auths":{}}' > "$DOCKER_CONFIG_DIR/config.json"
  chmod 0600 "$DOCKER_CONFIG_DIR/config.json"
  [[ "$(stat -c '%a' "$DOCKER_CONFIG_DIR")" == 700 ]] ||
    fail 'isolated Docker config directory must be mode 0700'
  [[ "$(stat -c '%a' "$DOCKER_CONFIG_DIR/config.json")" == 600 ]] ||
    fail 'isolated Docker config file must be mode 0600'
}

create_clean_worktree() {
  "$GIT_BIN" worktree add --detach "$WORKTREE" "$COMMIT" >/dev/null
  local actual_commit
  local worktree_status
  local dockerfile="$WORKTREE/$DOCKERFILE_RELATIVE"
  local dockerfile_contents
  actual_commit="$($GIT_BIN -C "$WORKTREE" rev-parse HEAD)"
  [[ "$actual_commit" == "$COMMIT" ]] || fail 'detached worktree commit does not match the requested SHA'
  worktree_status="$($GIT_BIN -C "$WORKTREE" status --porcelain --untracked-files=all)"
  [[ -z "$worktree_status" ]] || fail 'detached publication worktree is not clean'
  [[ -f "$dockerfile" && ! -L "$dockerfile" ]] || fail 'accepted commit lacks the operator Dockerfile'
  dockerfile_contents="$(<"$dockerfile")"
  [[ "$dockerfile_contents" == *'FROM runner AS qdrant-operator'* ]] ||
    fail 'accepted commit lacks the existing qdrant-operator target'
}

read_registry_token() {
  local token=''
  local unexpected=''
  if ! IFS= read -r token || [[ -z "$token" ]]; then
    fail 'registry token must be supplied on stdin'
  fi
  if IFS= read -r unexpected; then
    fail 'registry token stdin must contain exactly one line'
  fi
  [[ "$token" != *[[:space:]]* ]] || fail 'registry token stdin contains whitespace'
  printf -v REGISTRY_TOKEN '%s' "$token"
}

login_registry() {
  local isolated_config_contents
  if ! printf '%s\n' "$REGISTRY_TOKEN" |
    run_docker login "$REGISTRY" --username "$GITHUB_USER" --password-stdin >/dev/null; then
    unset REGISTRY_TOKEN
    fail 'GHCR login failed; supply a classic PAT with write:packages through stdin'
  fi
  unset REGISTRY_TOKEN
  [[ -f "$DOCKER_CONFIG_DIR/config.json" && ! -L "$DOCKER_CONFIG_DIR/config.json" ]] ||
    fail 'Docker login did not produce a regular isolated config file'
  [[ "$(stat -c '%a' "$DOCKER_CONFIG_DIR/config.json")" == 600 ]] ||
    fail 'isolated Docker config file must remain mode 0600 after login'
  isolated_config_contents="$(<"$DOCKER_CONFIG_DIR/config.json")"
  if [[ "$isolated_config_contents" == *'"credsStore"'* ||
        "$isolated_config_contents" == *'"credHelpers"'* ]]; then
    fail 'isolated Docker config contains a credential helper or store'
  fi
}

publish_and_verify() {
  local tag="$REPOSITORY:$COMMIT"
  local metadata_file="$STATE_ROOT/buildx-metadata.json"
  local metadata_contents
  local metadata_digest
  local remote_digest_json
  local remote_digest
  local digest_key_regex='"containerimage\.digest"[[:space:]]*:[[:space:]]*"(sha256:[0-9a-f]{64})"'
  local remote_digest_regex='^"(sha256:[0-9a-f]{64})"$'

  run_docker buildx build \
    --file "$WORKTREE/$DOCKERFILE_RELATIVE" \
    --target "$REQUIRED_TARGET" \
    --platform "$REQUIRED_PLATFORM" \
    --tag "$tag" \
    --label "org.opencontainers.image.revision=$COMMIT" \
    --provenance=mode=max \
    --metadata-file "$metadata_file" \
    --push \
    "$WORKTREE"

  [[ -f "$metadata_file" && ! -L "$metadata_file" ]] ||
    fail 'Buildx did not produce a regular metadata file'
  [[ "$(stat -c '%a' "$metadata_file")" == 600 ]] ||
    fail 'Buildx metadata file must be mode 0600'
  metadata_contents="$(<"$metadata_file")"
  [[ "$metadata_contents" == *'"buildx.build.provenance"'* ]] ||
    fail 'Buildx metadata does not record provenance'
  if [[ "$metadata_contents" =~ $digest_key_regex ]]; then
    metadata_digest="${BASH_REMATCH[1]}"
  else
    fail 'Buildx metadata does not contain one valid registry digest'
  fi

  remote_digest_json="$(
    run_docker buildx imagetools inspect "$tag" --format '{{json .Manifest.Digest}}'
  )" ||
    fail 'independent remote digest inspection failed'
  if [[ "$remote_digest_json" =~ $remote_digest_regex ]]; then
    remote_digest="${BASH_REMATCH[1]}"
  else
    fail 'independent remote digest inspection returned an invalid digest'
  fi
  [[ "$remote_digest" == "$metadata_digest" ]] ||
    fail 'remote digest does not match Buildx metadata'
  printf -v PUBLISHED_REFERENCE '%s@%s' "$REPOSITORY" "$remote_digest"
}

main() {
  parse_args "$@"
  validate_request
  reject_inherited_docker_authentication
  resolve_commands
  validate_commit_identity
  read_registry_token
  create_isolated_state
  create_clean_worktree
  login_registry
  publish_and_verify

  if ! cleanup_resources; then
    printf '%s\n' 'ERROR: publisher cleanup failed; publication result must not be accepted' >&2
    exit 90
  fi
  trap - EXIT HUP INT TERM
  printf 'Published qdrant-operator: %s\n' "$PUBLISHED_REFERENCE"
}

main "$@"
