#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Qdrant operator Compose preflight: %s\n' "$1" >&2
  exit 1
}

# --- frozen-HOME normalization (mc2-wwc9l) ---
# The frozen Q12 command manifest (sha256 aaec6fc2…, immutable by contract) declares HOME=/root
# for every command. That was correct while the controller ran as root; since the execution
# identity amendment the children run as uid 1000, which cannot read /root. The docker CLI
# resolves its cli-plugins through the config directory under HOME, so an unusable HOME does not
# merely drop credentials — `docker compose` ceases to exist and the call dies with
# "unknown flag: --project-directory", exit 125. That killed the 2026-07-27 window in preflight.
# The manifest env cannot be edited, so the repair belongs here, at the wrapper seam. ONLY a HOME
# the current uid genuinely cannot use is replaced, so the root path stays byte-identical.
if [[ -z ${HOME-} || ! -O "${HOME-}" || ! -r "${HOME-}" || ! -x "${HOME-}" ]]; then
  frozen_home_resolved="$(getent passwd "$(id -u)" | cut -d: -f6)"
  if [[ -z ${frozen_home_resolved} || ! -d ${frozen_home_resolved} ||
    ! -r ${frozen_home_resolved} || ! -x ${frozen_home_resolved} ]]; then
    printf 'frozen-HOME normalization: no usable HOME for uid %s\n' "$(id -u)" >&2
    exit 1
  fi
  export HOME="${frozen_home_resolved}"
fi
# --- end frozen-HOME normalization ---

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
