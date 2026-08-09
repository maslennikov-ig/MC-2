#!/usr/bin/env bash

host_operation_lock_acquire() {
  local operation="${1:-}"
  local lock_path="${2:-}"

  if [[ ! "$operation" =~ ^[[:alnum:]_.:/-]+$ ]] || [ "${#operation}" -gt 80 ]; then
    printf 'ERROR: host operation name must use only letters, digits, dot, colon, slash, underscore, or dash\n' >&2
    return 64
  fi
  if [[ "$lock_path" != /* ]]; then
    printf 'ERROR: host operation lock path must be absolute\n' >&2
    return 64
  fi

  # A parent wrapper retains the descriptor while its child runs. The exported
  # path makes nested repository entrypoints cooperative without trying to
  # acquire the same lock again from a new open file description.
  if [ "${HOST_OPERATION_LOCK_HELD_PATH:-}" = "$lock_path" ]; then
    return 0
  fi

  if ! command -v flock >/dev/null 2>&1; then
    printf 'ERROR: cannot start %s: flock is unavailable\n' "$operation" >&2
    return 69
  fi

  if ! exec {HOST_OPERATION_LOCK_FD}<>"$lock_path"; then
    printf 'ERROR: cannot start %s: cannot open host operation lock %s\n' \
      "$operation" "$lock_path" >&2
    return 73
  fi

  if ! flock -n "$HOST_OPERATION_LOCK_FD"; then
    printf 'ERROR: cannot start %s: another host operation holds %s\n' \
      "$operation" "$lock_path" >&2
    return 75
  fi

  export HOST_OPERATION_LOCK_HELD_PATH="$lock_path"
}
