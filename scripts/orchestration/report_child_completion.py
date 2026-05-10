#!/usr/bin/env python3
"""Record a delegated child completion event in the repo-local inbox."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tomllib
import uuid
from datetime import datetime, timezone

ALLOWED_STATUS = {"returned", "blocked"}
ALLOWED_VERIFY = {"passed", "failed", "blocked"}
ALLOWED_CLEAN = {"yes", "no"}


def load_contract() -> dict:
    return tomllib.loads(pathlib.Path(".codex/orchestrator.toml").read_text())


def require_string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise SystemExit(f"missing required contract field: {name}")
    return value


def resolve_runtime_path(repo_root: pathlib.Path, inbox: dict, key: str) -> pathlib.Path:
    raw_path = pathlib.Path(require_string(inbox.get(key), f"completion_inbox.{key}"))
    scope = inbox.get("scope", "repo_root")
    if scope == "git_common_dir":
        common_dir_raw = subprocess.check_output(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=repo_root,
            text=True,
        ).strip()
        common_dir = pathlib.Path(common_dir_raw)
        if not common_dir.is_absolute():
            common_dir = (repo_root / common_dir).resolve()
        return common_dir / raw_path
    return repo_root / raw_path


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--status", required=True, choices=sorted(ALLOWED_STATUS))
    parser.add_argument("--commit", default="n/a")
    parser.add_argument("--verify", required=True, choices=sorted(ALLOWED_VERIFY))
    parser.add_argument("--clean", required=True, choices=sorted(ALLOWED_CLEAN))
    parser.add_argument("--sender", default="manual-child")
    parser.add_argument("--note", default="")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = load_contract()
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("missing [completion_inbox] section in .codex/orchestrator.toml")

    events_file = resolve_runtime_path(repo_root, inbox, "events_file")
    artifact_path = pathlib.Path(args.artifact)
    if not artifact_path.exists():
        raise SystemExit(f"artifact path does not exist: {artifact_path}")

    events_file.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "event_id": str(uuid.uuid4()),
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "task_id": args.task,
        "stage_id": args.stage,
        "stream_id": args.task,
        "status": args.status,
        "artifact_path": str(artifact_path),
        "commit": args.commit,
        "verify": args.verify,
        "clean": args.clean,
        "sender": args.sender,
        "note": args.note,
    }

    with events_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")

    print(
        "completion event recorded: "
        f"{payload['event_id']} {payload['task_id']} {payload['status']} {payload['artifact_path']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
