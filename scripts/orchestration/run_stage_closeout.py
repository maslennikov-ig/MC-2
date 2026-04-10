#!/usr/bin/env python3
"""Run stage close verification based on the repo-local orchestration contract."""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import tomllib


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
        raise SystemExit(f"Missing artifacts directory: {artifacts_dir}")

    artifacts = [parse_artifact(path) for path in sorted(artifacts_dir.glob("*.md"))]
    if not artifacts:
        raise SystemExit(f"Stage {stage_id} has no tracked artifacts")
    return artifacts


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


def run_shell(command: str, cwd: pathlib.Path, dry_run: bool) -> None:
    print(f"$ {command}")
    if dry_run:
        return
    subprocess.run(command, shell=True, cwd=cwd, executable="/bin/bash", check=True)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, dest="stage_id")
    parser.add_argument("--verify-group", action="append", default=[])
    parser.add_argument("--include-optional", action="store_true")
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
