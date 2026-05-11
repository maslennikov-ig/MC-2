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
import re
import tomllib

orchestrator_path = pathlib.Path(".codex/orchestrator.toml")
contract = tomllib.loads(orchestrator_path.read_text())
handoff_file = pathlib.Path(contract.get("handoff_file", ".codex/handoff.md"))
artifact_template = pathlib.Path(contract.get("artifact_template", ".codex/stage-artifact-template.md"))

required = [
    pathlib.Path("AGENTS.md"),
    orchestrator_path,
    handoff_file,
    artifact_template,
    pathlib.Path("scripts/orchestration/run_stage_closeout.py"),
    pathlib.Path("scripts/orchestration/cleanup_stage_workspace.py"),
]

workspace = contract.get("workspace", {})
if isinstance(workspace, dict) and workspace.get("launch_mode") == "manual_user_launch":
    manual_prompt_template = pathlib.Path(
        contract.get("manual_prompt_template", ".codex/manual-agent-prompt-template.md")
    )
    required.append(manual_prompt_template)

missing = [str(path) for path in required if not path.exists()]
if missing:
    raise SystemExit(f"Missing required orchestration files: {', '.join(missing)}")

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

handoff_text = handoff_file.read_text()
handoff_lines = len(handoff_text.splitlines())
handoff = contract.get("handoff", {})
max_lines = handoff.get("hard_limit_lines") or handoff.get("current_state_max_lines")
if isinstance(max_lines, int) and handoff_lines > max_lines:
    raise SystemExit(
        f"{handoff_file} has {handoff_lines} lines, exceeds configured limit {max_lines}"
    )

required_handoff_tokens = [
    "## Next recommended",
    "Next stage id:",
    "Recommended action:",
    "## Starter prompt for next orchestrator",
    "Use $stage-orchestrator",
    "## Explicit defers",
]
missing_handoff_tokens = [token for token in required_handoff_tokens if token not in handoff_text]
if missing_handoff_tokens:
    raise SystemExit(
        f"{handoff_file} is missing required next-stage handoff fields: {', '.join(missing_handoff_tokens)}"
    )

explicit_defers_match = re.search(
    r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
    handoff_text,
    re.MULTILINE | re.DOTALL,
)
if not explicit_defers_match:
    raise SystemExit(f"{handoff_file} is missing the Explicit defers section")

explicit_defers_body = explicit_defers_match.group("body").strip()
if not explicit_defers_body:
    raise SystemExit(f"{handoff_file} has an empty Explicit defers section")

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
