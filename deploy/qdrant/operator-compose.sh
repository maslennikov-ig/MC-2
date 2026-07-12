#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Qdrant operator Compose preflight: %s\n' "$1" >&2
  exit 1
}

digest="${QDRANT_OPERATOR_IMAGE_SHA256:-}"
env_file=''
previous=''
for argument in "$@"; do
  if [[ $previous == '--env-file' ]]; then
    [[ -z $env_file ]] || fail 'exactly one --env-file is supported'
    env_file="$argument"
    previous=''
    continue
  fi
  if [[ $argument == --env-file=* ]]; then
    [[ -z $env_file ]] || fail 'exactly one --env-file is supported'
    env_file="${argument#*=}"
    continue
  fi
  previous="$argument"
done
[[ $previous != '--env-file' ]] || fail '--env-file requires a path'

if [[ -z $digest && -n $env_file ]]; then
  [[ -f $env_file && ! -L $env_file && -r $env_file ]] ||
    fail 'the Compose env file is missing or unreadable'
  matches=0
  while IFS= read -r line || [[ -n $line ]]; do
    line="${line%$'\r'}"
    if [[ $line == QDRANT_OPERATOR_IMAGE_SHA256=* ]]; then
      matches=$((matches + 1))
      digest="${line#*=}"
    fi
  done < "$env_file"
  [[ $matches -le 1 ]] || fail 'QDRANT_OPERATOR_IMAGE_SHA256 must appear once in the env file'
fi

[[ $digest =~ ^[0-9a-f]{64}$ ]] ||
  fail 'QDRANT_OPERATOR_IMAGE_SHA256 must be exactly 64 lowercase hexadecimal characters'

export QDRANT_OPERATOR_IMAGE_SHA256="$digest"
exec /usr/bin/docker compose "$@"
