#!/usr/bin/bash
set -euo pipefail
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
mode=supervisor
if [[ ${1:-} == plan || ${1:-} == --plan ]]; then
  mode=plan
  shift
fi
exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" "$mode" "$@"
