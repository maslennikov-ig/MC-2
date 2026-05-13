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

EXPECTED_PROFILE = "balanced-v2.9"
EXPECTED_SOURCE_SKILL = "orchestration-setup"

orchestrator_path = pathlib.Path(".codex/orchestrator.toml")
contract = tomllib.loads(orchestrator_path.read_text())
handoff_file = pathlib.Path(contract.get("handoff_file", ".codex/handoff.md"))
project_index_file = pathlib.Path(contract.get("project_index_file", ".codex/project-index.md"))
artifact_template = pathlib.Path(contract.get("artifact_template", ".codex/stage-artifact-template.md"))

required = [
    pathlib.Path("AGENTS.md"),
    orchestrator_path,
    handoff_file,
    project_index_file,
    artifact_template,
    pathlib.Path(".codex/subagent-task-contract.md"),
    pathlib.Path(".codex/subagent-spawn-template.md"),
    pathlib.Path("scripts/orchestration/run_stage_closeout.py"),
    pathlib.Path("scripts/orchestration/cleanup_stage_workspace.py"),
    pathlib.Path("scripts/orchestration/report_child_completion.py"),
    pathlib.Path("scripts/orchestration/review_completion_inbox.py"),
]

workspace = contract.get("workspace", {})
delegation = contract.get("delegation", {})
launcher = "codex_subagents"
if isinstance(delegation, dict) and isinstance(delegation.get("launcher"), str):
    launcher = delegation["launcher"]
elif isinstance(workspace, dict) and workspace.get("launch_mode") == "manual_user_launch":
    launcher = "manual_user_launch"

if launcher not in {"codex_subagents", "manual_user_launch", "none"}:
    raise SystemExit(
        "delegation.launcher must be one of codex_subagents, manual_user_launch, or none"
    )

if launcher == "manual_user_launch":
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

if profile != EXPECTED_PROFILE or source_skill != EXPECTED_SOURCE_SKILL:
    raise SystemExit(
        f"Expected baseline {EXPECTED_PROFILE} via {EXPECTED_SOURCE_SKILL}, got {profile} via {source_skill}"
    )

if contract.get("role") != "orchestrator-stage":
    raise SystemExit("orchestrator role must be 'orchestrator-stage'")

completion_inbox = contract.get("completion_inbox")
if not isinstance(completion_inbox, dict):
    raise SystemExit("Missing [completion_inbox] section in .codex/orchestrator.toml")
for key in ("scope", "events_file", "review_state_file", "report_entrypoint", "review_entrypoint"):
    if not completion_inbox.get(key):
        raise SystemExit(f"completion_inbox.{key} is required")

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

agents = contract.get("agents", {})
agents_max_lines = None
if isinstance(agents, dict):
    agents_max_lines = agents.get("root_max_lines") or agents.get("hard_limit_lines")
if isinstance(agents_max_lines, int):
    agents_path = pathlib.Path("AGENTS.md")
    agents_lines = len(agents_path.read_text().splitlines())
    if agents_lines > agents_max_lines:
        raise SystemExit(
            f"{agents_path} has {agents_lines} lines, exceeds configured limit {agents_max_lines}"
        )

required_handoff_tokens = [
    "## Next recommended",
    "Next stage id:",
    "Recommended action:",
    "## Starter prompt for next orchestrator",
    "Use $orchestrator-stage",
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

project_index_text = project_index_file.read_text()
project_index = contract.get("project_index", {})
project_index_max_lines = 150
required_project_index_sections = [
    "## Runtime Shape",
    "## Primary Entrypoints",
    "## Core Subsystems",
    "## Integrations And Sources Of Truth",
    "## Verification",
    "## Conventions And Boundaries",
]
if isinstance(project_index, dict):
    if isinstance(project_index.get("max_lines"), int):
        project_index_max_lines = project_index["max_lines"]
    if isinstance(project_index.get("required_sections"), list):
        required_project_index_sections = [
            str(section)
            for section in project_index["required_sections"]
            if isinstance(section, str)
        ]

project_index_lines = len(project_index_text.splitlines())
if project_index_lines > project_index_max_lines:
    raise SystemExit(
        f"{project_index_file} has {project_index_lines} lines, exceeds configured limit {project_index_max_lines}"
    )

missing_project_index_sections = [
    section for section in required_project_index_sections if section not in project_index_text
]
if missing_project_index_sections:
    raise SystemExit(
        f"{project_index_file} is missing required sections: {', '.join(missing_project_index_sections)}"
    )

for forbidden in ("## Current truth", "## Next recommended", "## Explicit defers"):
    if forbidden in project_index_text:
        raise SystemExit(
            f"{project_index_file} must stay navigation-only and not duplicate handoff section {forbidden!r}"
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
