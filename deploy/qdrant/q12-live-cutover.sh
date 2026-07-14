#!/usr/bin/bash
set -euo pipefail
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" supervisor "$@"
