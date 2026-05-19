#!/usr/bin/env python3
"""Check whether a stage folder is ready for closure or handoff."""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: check_stage_ready.py <stage-id>", file=sys.stderr)
        return 2

    stage_id = argv[1]
    repo_root = pathlib.Path.cwd()
    stage_dir = repo_root / ".codex" / "stages" / stage_id
    summary_path = stage_dir / "summary.md"
    artifacts_dir = stage_dir / "artifacts"
    handoff_path = repo_root / ".codex" / "handoff.md"
    validator = repo_root / "scripts" / "orchestration" / "validate_artifact.py"

    errors: list[str] = []

    if not summary_path.exists():
        errors.append(f"missing stage summary: {summary_path}")

    artifacts = sorted(artifacts_dir.glob("*.md")) if artifacts_dir.exists() else []

    if handoff_path.exists():
        handoff_text = handoff_path.read_text()
        if stage_id not in handoff_text:
            errors.append(f"handoff does not mention stage id {stage_id}")
        explicit_defers_match = re.search(
            r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
            handoff_text,
            re.MULTILINE | re.DOTALL,
        )
        if not explicit_defers_match:
            errors.append("handoff is missing ## Explicit defers")
        elif not explicit_defers_match.group("body").strip():
            errors.append("handoff has an empty ## Explicit defers section")
    else:
        errors.append(f"missing handoff file: {handoff_path}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    if artifacts:
        subprocess.run([sys.executable, str(validator), *[str(path) for path in artifacts]], check=True)
    print(f"stage {stage_id} ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
