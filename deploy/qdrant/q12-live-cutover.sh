#!/usr/bin/bash
set -euo pipefail
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
mode=supervisor
if [[ ${1:-} == plan || ${1:-} == --plan ]]; then
  mode=plan
  shift
elif [[ ${1:-} == live ]]; then
  mode=live
  shift
elif [[ ${1:-} == recover ]]; then
  mode=recover
  shift
fi
# mc2-ot8se: the window does not open without a fresh GREEN pre-flight report describing THIS
# deployed tree. Nine attempts each spent an asset reinstall, a fresh run root and (after #9) a
# manual production restore to discover one environmental defect; the pre-flight finds them all in
# minutes, and this gate is what makes it load-bearing rather than advisory.
#
# Scope of the gate:
#   * `live` and `supervisor` only. `plan` is read-only and is what PRODUCES the run root the
#     pre-flight reads, so gating it would be circular; `recover` must stay reachable when the
#     window has already gone wrong, which is exactly when a fresh report may be impossible.
#   * only when `--run-id` is present, i.e. a real run. A malformed invocation without it falls
#     straight through to argparse, which rejects it — and omitting `--run-id` is not a way past
#     the gate, because argparse requires it for every windowing operation.
#   * never on `--help`, so the argparse surface stays reachable.
gate_run_id=""
gate_help=0
gate_previous=""
for gate_argument in "$@"; do
  if [[ $gate_argument == --help || $gate_argument == -h ]]; then gate_help=1; fi
  if [[ $gate_previous == --run-id ]]; then gate_run_id="$gate_argument"; fi
  gate_previous="$gate_argument"
done
if [[ ($mode == live || $mode == supervisor) && -n $gate_run_id && $gate_help -eq 0 ]]; then
  /usr/bin/python3 "${SCRIPT_DIR}/q12-window-preflight.py" --assert-fresh-report \
    --report-dir "/opt/megacampus/backups/q12/${gate_run_id}" \
    --deploy-root /opt/megacampus >&2
fi
exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" "$mode" "$@"
