#!/usr/bin/env python3
"""Inspect and update the repo-local delegated completion inbox."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tomllib
from datetime import datetime, timezone

ALLOWED_DECISIONS = {
    "accepted",
    "needs_rework_same_stream",
    "needs_new_stream",
    "blocked",
    "invalid_return",
}


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


def load_events(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        return []
    events: list[dict] = []
    for raw_line in path.read_text().splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        events.append(json.loads(raw_line))
    return events


def load_state(path: pathlib.Path) -> dict:
    if not path.exists():
        return {"reviewed": {}}
    return json.loads(path.read_text())


def save_state(path: pathlib.Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=True) + "\n")


def print_text(events: list[dict], reviewed: dict[str, dict]) -> None:
    pending = [event for event in events if event["event_id"] not in reviewed]
    print(f"total_events: {len(events)}")
    print(f"pending_events: {len(pending)}")
    if not pending:
        print("pending: none")
        return
    print("pending:")
    for event in pending:
        print(
            "- "
            f"{event['event_id']} | task={event['task_id']} | stage={event['stage_id']} | "
            f"status={event['status']} | verify={event['verify']} | artifact={event['artifact_path']}"
        )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--task")
    parser.add_argument("--mark-reviewed")
    parser.add_argument("--decision", choices=sorted(ALLOWED_DECISIONS))
    parser.add_argument("--note", default="")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = load_contract()
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("missing [completion_inbox] section in .codex/orchestrator.toml")

    events_file = resolve_runtime_path(repo_root, inbox, "events_file")
    state_file = resolve_runtime_path(repo_root, inbox, "review_state_file")

    events = load_events(events_file)
    if args.task:
        events = [event for event in events if event.get("task_id") == args.task]

    state = load_state(state_file)
    reviewed = state.setdefault("reviewed", {})

    if args.mark_reviewed:
        if not args.decision:
            raise SystemExit("--decision is required with --mark-reviewed")
        matching = [event for event in events if event.get("event_id") == args.mark_reviewed]
        if not matching:
            raise SystemExit(f"event not found: {args.mark_reviewed}")
        reviewed[args.mark_reviewed] = {
            "decision": args.decision,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "note": args.note,
            "task_id": matching[0].get("task_id"),
            "stage_id": matching[0].get("stage_id"),
        }
        save_state(state_file, state)

    payload = {
        "events": events,
        "reviewed": reviewed,
        "pending": [event for event in events if event["event_id"] not in reviewed],
    }

    if args.as_json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        print_text(events, reviewed)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
