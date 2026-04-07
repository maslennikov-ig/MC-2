#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

STAGE_ID=""
ARTIFACTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE_ID="${2:-}"
      shift 2
      ;;
    --artifact)
      ARTIFACTS+=("${2:-}")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--stage <stage-id>] [--artifact <path>]..." >&2
      exit 2
      ;;
  esac
done

python3 - <<'PY'
import pathlib
import tomllib

required = [
    pathlib.Path("AGENTS.md"),
    pathlib.Path(".codex/orchestrator.toml"),
    pathlib.Path(".codex/handoff.md"),
    pathlib.Path(".codex/stage-artifact-template.md"),
]

missing = [str(path) for path in required if not path.exists()]
if missing:
    raise SystemExit(f"Missing required orchestration files: {', '.join(missing)}")

contract = tomllib.loads(pathlib.Path(".codex/orchestrator.toml").read_text())
baseline = contract.get("baseline")
if not isinstance(baseline, dict):
    raise SystemExit("Missing [baseline] section in .codex/orchestrator.toml")

profile = baseline.get("profile")
source_skill = baseline.get("source_skill")
if not profile or not source_skill:
    raise SystemExit("Baseline metadata must define profile and source_skill")

for blocked in (pathlib.Path("tasks.json"), pathlib.Path(".codex/tasks.json")):
    if blocked.exists():
        raise SystemExit(f"Duplicate task ledger is not allowed: {blocked}")

handoff_text = pathlib.Path(".codex/handoff.md").read_text()
handoff_lines = len(handoff_text.splitlines())
handoff = contract.get("handoff", {})
max_lines = handoff.get("hard_limit_lines") or handoff.get("current_state_max_lines")
if isinstance(max_lines, int) and handoff_lines > max_lines:
    raise SystemExit(
        f".codex/handoff.md has {handoff_lines} lines, exceeds configured limit {max_lines}"
    )

print(f"orchestration contract OK ({profile} via {source_skill})")
PY

git diff --check
echo "git diff --check OK"

echo "git status --short"
git status --short || true

if [[ ${#ARTIFACTS[@]} -gt 0 ]]; then
  python3 scripts/orchestration/validate_artifact.py "${ARTIFACTS[@]}"
fi

if [[ -n "$STAGE_ID" ]]; then
  python3 scripts/orchestration/check_stage_ready.py "$STAGE_ID"
fi

echo "process verification OK"
