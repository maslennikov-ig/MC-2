#!/usr/bin/env python3
"""Run stage close verification based on the repo-local orchestration contract."""

from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
import tomllib

DEBT_MARKER_PATTERN = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)
DEBT_POLICY_REFERENCE_PATTERNS = (
    "TODO/FIXME/HACK/XXX",
    "DEBT_MARKER_PATTERN",
    "debt marker",
    "debt markers",
)
PROJECT_INDEX_REVIEW_MARKER = "project-index: reviewed-no-change"
PLACEHOLDERS = {"", "n/a", "<short cleanup result or blocker>"}
STRUCTURAL_CHANGE_PREFIXES = (
    "src/api/",
    "src/integrations/",
    "scripts/orchestration/",
    "frontend/",
)
STRUCTURAL_CHANGE_FILES = {
    "AGENTS.md",
    "README.md",
    "pyproject.toml",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    ".codex/orchestrator.toml",
    "src/main.py",
    "src/worker.py",
}


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def parse_artifact(path: pathlib.Path) -> dict[str, object]:
    frontmatter, _ = parse_frontmatter(path.read_text())
    data: dict[str, object] = {}
    current_key: str | None = None

    for raw_line in frontmatter.splitlines():
        if not raw_line:
            continue
        if raw_line.startswith("  - ") or raw_line.startswith("- "):
            if current_key is not None:
                values = data.setdefault(current_key, [])
                if isinstance(values, list):
                    values.append(raw_line.split("-", 1)[1].strip())
            continue
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value:
            data[key] = value
            current_key = None
        else:
            data[key] = []
            current_key = key

    return data


def load_stage_artifacts(repo_root: pathlib.Path, stage_id: str) -> list[dict[str, object]]:
    artifacts_dir = repo_root / ".codex" / "stages" / stage_id / "artifacts"
    if not artifacts_dir.exists():
        return []

    return [parse_artifact(path) for path in sorted(artifacts_dir.glob("*.md"))]


def infer_groups(contract: dict[str, object], artifacts: list[dict[str, object]], include_optional: bool) -> list[str]:
    verification = contract.get("verification", {})
    if not isinstance(verification, dict):
        return []

    groups: list[str] = []
    workspace = contract.get("workspace", {})
    multi_repo = bool(workspace.get("multi_repo")) if isinstance(workspace, dict) else False
    touched_repos: set[str] = set()
    has_changed_files = False

    for artifact in artifacts:
        repo = artifact.get("repo")
        if isinstance(repo, str) and repo and repo not in {"n/a", "<repo-or-n/a>"}:
            touched_repos.add(repo)

        changed_files = artifact.get("changed_files")
        if isinstance(changed_files, list) and any(item and not str(item).startswith("<") for item in changed_files):
            has_changed_files = True

    if multi_repo:
        for repo in sorted(touched_repos):
            group = f"{repo}_commands"
            if group in verification:
                groups.append(group)
    elif has_changed_files and "code_change_commands" in verification:
        groups.append("code_change_commands")

    if include_optional and "stage_level_optional_commands" in verification:
        groups.append("stage_level_optional_commands")

    return groups


def stage_has_high_risk_artifact(artifacts: list[dict[str, object]]) -> bool:
    for artifact in artifacts:
        risk_level = artifact.get("risk_level")
        if isinstance(risk_level, str) and risk_level.lower() == "high":
            return True
    return False


def meaningful_scalar(value: object) -> str:
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if not stripped or (stripped.startswith("<") and stripped.endswith(">")):
        return ""
    if stripped in PLACEHOLDERS:
        return ""
    return stripped


def check_child_acceptance_cleanup(artifacts: list[dict[str, object]]) -> None:
    failures: list[str] = []
    for artifact in artifacts:
        task_id = meaningful_scalar(artifact.get("task_id")) or "<unknown-task>"
        status = meaningful_scalar(artifact.get("status"))
        accepted = meaningful_scalar(artifact.get("accepted_by_orchestrator"))
        if status not in {"accepted", "merged"} and accepted != "yes":
            continue

        delivery_method = meaningful_scalar(artifact.get("delivery_method"))
        cleanup_status = meaningful_scalar(artifact.get("cleanup_status"))
        cleanup_notes = meaningful_scalar(artifact.get("cleanup_notes"))

        if delivery_method in {"", "not accepted"}:
            failures.append(f"{task_id}: accepted stream missing delivery_method")
        if accepted != "yes":
            failures.append(f"{task_id}: accepted stream missing accepted_by_orchestrator: yes")
        if cleanup_status not in {"cleaned", "blocked"}:
            failures.append(f"{task_id}: accepted stream cleanup_status must be cleaned or blocked")
        if not cleanup_notes:
            failures.append(f"{task_id}: accepted stream missing cleanup_notes")

    if not failures:
        print("child acceptance cleanup OK")
        return

    print("Accepted child streams require mini-closeout before stage close:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)


def add_e2e_group_when_requested(
    groups: list[str],
    verification: dict[str, object],
    requested: bool,
) -> list[str]:
    if not requested:
        return groups

    commands = verification.get("e2e_commands")
    if not isinstance(commands, list) or not commands:
        print("E2E command is not configured (skipped)")
        return groups

    if "e2e_commands" not in groups:
        groups.append("e2e_commands")
    return groups


def run_shell(command: str, cwd: pathlib.Path, dry_run: bool) -> None:
    print(f"$ {command}")
    if dry_run:
        return
    subprocess.run(command, shell=True, cwd=cwd, executable="/bin/bash", check=True)


def git_available(repo_root: pathlib.Path) -> bool:
    return subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    ).returncode == 0


def git_diff_text(repo_root: pathlib.Path) -> str:
    result = subprocess.run(
        ["git", "diff", "--unified=0", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        return result.stdout

    fallback = subprocess.run(
        ["git", "diff", "--unified=0", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    return fallback.stdout if fallback.returncode == 0 else ""


def changed_line_debt_hits(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    hits: list[str] = []
    current_file = "<unknown>"
    for line in git_diff_text(repo_root).splitlines():
        if line.startswith("+++ b/"):
            current_file = line.removeprefix("+++ b/")
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        content = line[1:].strip()
        if any(pattern in content for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
            continue
        if DEBT_MARKER_PATTERN.search(content):
            hits.append(f"{current_file}: {content}")

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode != 0:
        return hits

    for raw_path in untracked.stdout.splitlines():
        path = repo_root / raw_path
        if not path.is_file():
            continue
        try:
            for line_number, line in enumerate(path.read_text(errors="ignore").splitlines(), start=1):
                if any(pattern in line for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
                    continue
                if DEBT_MARKER_PATTERN.search(line):
                    hits.append(f"{raw_path}:{line_number}: {line.strip()}")
        except OSError:
            continue

    return hits


def explicit_defers_body(repo_root: pathlib.Path, contract: dict[str, object]) -> str:
    handoff_path = repo_root / str(contract.get("handoff_file", ".codex/handoff.md"))
    if not handoff_path.exists():
        return ""

    match = re.search(
        r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
        handoff_path.read_text(),
        re.MULTILINE | re.DOTALL,
    )
    return match.group("body").strip() if match else ""


def git_changed_files(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    changed: list[str] = []
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        changed.extend(line.strip() for line in result.stdout.splitlines() if line.strip())

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode == 0:
        changed.extend(line.strip() for line in untracked.stdout.splitlines() if line.strip())

    return sorted(set(changed))


def stage_summary_text(repo_root: pathlib.Path, stage_id: str) -> str:
    summary = repo_root / ".codex" / "stages" / stage_id / "summary.md"
    if not summary.exists():
        return ""
    return summary.read_text(errors="ignore")


def check_project_index_review(repo_root: pathlib.Path, contract: dict[str, object], stage_id: str) -> None:
    project_index_path = str(contract.get("project_index_file", ".codex/project-index.md"))
    changed = git_changed_files(repo_root)
    if not changed:
        print("project index review OK (no changed files)")
        return

    if project_index_path in changed:
        print("project index review OK (index updated)")
        return

    structural_changes = [
        path
        for path in changed
        if path in STRUCTURAL_CHANGE_FILES
        or any(path.startswith(prefix) for prefix in STRUCTURAL_CHANGE_PREFIXES)
    ]
    if not structural_changes:
        print("project index review OK (no structural changes detected)")
        return

    summary = stage_summary_text(repo_root, stage_id).lower()
    if PROJECT_INDEX_REVIEW_MARKER in summary:
        print("project index review OK (stage summary records no-change review)")
        return

    print("Structural changes require project index review before stage close:", file=sys.stderr)
    for path in structural_changes[:20]:
        print(f"- {path}", file=sys.stderr)
    if len(structural_changes) > 20:
        print(f"- ... {len(structural_changes) - 20} more", file=sys.stderr)
    print(
        f"Update {project_index_path} or add `{PROJECT_INDEX_REVIEW_MARKER}` to the stage summary with a brief reason.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def has_tracked_defer(body: str) -> bool:
    normalized = body.strip().lower()
    if not normalized or normalized in {"none", "- none"}:
        return False
    return re.search(r"\b(bd|bead|beads|task|tracked)\b", normalized) is not None


def check_debt_markers(repo_root: pathlib.Path, contract: dict[str, object]) -> None:
    debt_scan = contract.get("debt_scan", {})
    if isinstance(debt_scan, dict) and debt_scan.get("enabled") is False:
        print("debt marker scan skipped (debt_scan.enabled = false)")
        return

    hits = changed_line_debt_hits(repo_root)
    if not hits:
        print("debt marker scan OK")
        return

    defer_body = explicit_defers_body(repo_root, contract)
    if has_tracked_defer(defer_body):
        print("debt marker scan OK (tracked defer recorded)")
        return

    print("Changed-line debt markers require action before stage close:", file=sys.stderr)
    for hit in hits[:20]:
        print(f"- {hit}", file=sys.stderr)
    if len(hits) > 20:
        print(f"- ... {len(hits) - 20} more", file=sys.stderr)
    print(
        "Fix the marker or create/update a Beads task and list the defer under ## Explicit defers.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, dest="stage_id")
    parser.add_argument("--verify-group", action="append", default=[])
    parser.add_argument("--include-optional", action="store_true")
    parser.add_argument("--include-e2e", action="store_true")
    parser.add_argument("--skip-process-check", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = tomllib.loads((repo_root / ".codex" / "orchestrator.toml").read_text())
    artifacts = load_stage_artifacts(repo_root, args.stage_id)
    verification = contract.get("verification", {})
    if not isinstance(verification, dict):
        verification = {}

    groups = list(args.verify_group) if args.verify_group else infer_groups(contract, artifacts, args.include_optional)
    if not groups and "stage_close_commands" in verification:
        groups = ["stage_close_commands"]
    groups = add_e2e_group_when_requested(
        groups,
        verification,
        requested=args.include_e2e or stage_has_high_risk_artifact(artifacts),
    )

    check_child_acceptance_cleanup(artifacts)
    check_project_index_review(repo_root, contract, args.stage_id)
    check_debt_markers(repo_root, contract)

    for group in groups:
        commands = verification.get(group)
        if not isinstance(commands, list):
            raise SystemExit(f"Verification group {group!r} is missing or not a list")
        print(f"== verification group: {group} ==")
        for command in commands:
            run_shell(str(command), repo_root, args.dry_run)

    if not args.skip_process_check:
        enforcement = contract.get("enforcement", {})
        if not isinstance(enforcement, dict):
            enforcement = {}
        entrypoint = enforcement.get("process_verification_entrypoint", "scripts/orchestration/run_process_verification.sh")
        if not isinstance(entrypoint, str) or not entrypoint:
            raise SystemExit("Missing process_verification_entrypoint")
        cmd = [str(repo_root / entrypoint), "--stage", args.stage_id]
        print("$ " + " ".join(cmd))
        if not args.dry_run:
            subprocess.run(cmd, cwd=repo_root, check=True)

    print("stage closeout verification OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
