#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/host-operation-lock.sh"

usage() {
  echo "Usage: $0 <operation-name> -- <command> [args...]" >&2
  exit 64
}

[ "$#" -ge 3 ] || usage
operation="$1"
shift
[ "$1" = "--" ] || usage
shift
[ "$#" -gt 0 ] || usage

lock_path="${HOST_OPERATION_LOCK_PATH:-/opt/megacampus/.host-operation.lock}"
host_operation_lock_acquire "$operation" "$lock_path"
"$@"
