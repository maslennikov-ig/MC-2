#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'qdrant secret entrypoint: %s\n' "$1" >&2
  exit 1
}

read_secret() {
  local label="$1"
  local path="$2"
  local mode
  local value

  [[ -n "$path" ]] || fail "$label file path is required"
  [[ -f "$path" && -r "$path" ]] || fail "$label file is missing or unreadable"
  mode="$(stat -c '%a' "$path")" || fail "$label file permissions cannot be inspected"
  (( (8#$mode & 077) == 0 )) || fail "$label file must not be group/world readable"

  value="$(cat -- "$path"; printf x)"
  value="${value%x}"
  if [[ "$value" == *$'\r\n' ]]; then
    value="${value%$'\r\n'}"
  elif [[ "$value" == *$'\n' ]]; then
    value="${value%$'\n'}"
  fi
  [[ -n "$value" ]] || fail "$label file is empty"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "$label must contain exactly one line"

  REPLY="$value"
}

healthcheck() {
  local protocol status reason
  exec 3<>/dev/tcp/127.0.0.1/6333 || exit 1
  printf 'GET /readyz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' >&3
  IFS=' ' read -r protocol status reason <&3 || exit 1
  [[ "$protocol" == HTTP/* && "$status" == 200 ]]
}

if [[ "${1:-}" == healthcheck ]]; then
  healthcheck
  exit $?
fi

read_secret 'admin API key' "${QDRANT_API_KEY_FILE:-}"
export QDRANT__SERVICE__API_KEY="$REPLY"
unset REPLY

read_secret 'read-only API key' "${QDRANT_READ_ONLY_API_KEY_FILE:-}"
export QDRANT__SERVICE__READ_ONLY_API_KEY="$REPLY"
unset REPLY

snapshot_storage="${QDRANT_SNAPSHOT_STORAGE:-}"
case "$snapshot_storage" in
  local)
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__SNAPSHOTS_STORAGE=local
    export QDRANT__STORAGE__SNAPSHOTS_PATH=/qdrant/storage/snapshots
    ;;
  s3)
    unset QDRANT__STORAGE__SNAPSHOTS_PATH
    [[ -n "${QDRANT_S3_BUCKET:-}" ]] || fail 'S3 bucket is required'
    [[ -n "${QDRANT_S3_REGION:-}" ]] || fail 'S3 region is required'
    read_secret 'S3 access key' "${QDRANT_S3_ACCESS_KEY_FILE:-}"
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ACCESS_KEY="$REPLY"
    unset REPLY
    read_secret 'S3 secret key' "${QDRANT_S3_SECRET_KEY_FILE:-}"
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__SECRET_KEY="$REPLY"
    unset REPLY
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__SNAPSHOTS_STORAGE=s3
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__BUCKET="$QDRANT_S3_BUCKET"
    export QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__REGION="$QDRANT_S3_REGION"
    if [[ -n "${QDRANT_S3_ENDPOINT_URL:-}" ]]; then
      export QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ENDPOINT_URL="$QDRANT_S3_ENDPOINT_URL"
    fi
    ;;
  *)
    fail 'snapshot storage must be local or s3'
    ;;
esac

# Docker retains the image's default Cmd when Compose overrides Entrypoint.
# Avoid passing the stock "./entrypoint.sh" token through to the Qdrant binary.
[[ $# -eq 1 && "$1" == ./entrypoint.sh ]] && set --

exec /qdrant/entrypoint.sh "$@"
