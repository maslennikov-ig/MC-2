#!/usr/bin/env python3
"""Inspect and update the repo-local delegated completion inbox."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import os
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
ALLOWED_SEVERITIES = {"P0", "P1", "P2", "P3"}


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
    try:
        state = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read review state {path}: {exc}") from exc
    if not isinstance(state, dict) or not isinstance(state.get("reviewed"), dict):
        raise SystemExit(f"review state {path} must contain a reviewed object")
    return state


def save_state(path: pathlib.Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(state, indent=2, ensure_ascii=True) + "\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def state_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def correction_limit(contract: dict) -> int | None:
    limits = contract.get("stage_limits")
    if not isinstance(limits, dict):
        return None
    value = limits.get("max_correction_loops")
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def prior_p2_corrections(reviewed: dict[str, dict], event: dict) -> int:
    return sum(
        1
        for entry in reviewed.values()
        if entry.get("task_id") == event.get("task_id")
        and entry.get("stage_id") == event.get("stage_id")
        and entry.get("decision") == "needs_rework_same_stream"
        and entry.get("severity", "P2") not in {"P0", "P1"}
    )


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
    parser.add_argument("--severity", choices=sorted(ALLOWED_SEVERITIES))
    parser.add_argument("--resolves-review", action="append", default=[])
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

    if args.mark_reviewed:
        with state_lock(state_file):
            state = load_state(state_file)
            reviewed = state["reviewed"]
            if not args.decision:
                raise SystemExit("--decision is required with --mark-reviewed")
            matching = [event for event in events if event.get("event_id") == args.mark_reviewed]
            if not matching:
                raise SystemExit(f"event not found: {args.mark_reviewed}")
            if args.mark_reviewed in reviewed:
                raise SystemExit(f"event already reviewed and immutable: {args.mark_reviewed}")
            if args.decision == "accepted" and args.severity:
                raise SystemExit("accepted correction events must omit --severity and link resolved findings")
            if args.decision == "accepted" and (
                matching[0].get("status") != "returned" or matching[0].get("verify") != "passed"
            ):
                raise SystemExit("accepted correction events require returned status and passed verification")

            event_links = matching[0].get("resolves_review", [])
            if not isinstance(event_links, list) or not all(isinstance(link, str) and link for link in event_links):
                raise SystemExit("event resolves_review must be a list of non-empty event ids")
            resolution_links = list(dict.fromkeys([*event_links, *args.resolves_review]))
            if args.decision != "accepted" and resolution_links:
                raise SystemExit("--resolves-review is allowed only with --decision accepted")
            for finding_id in resolution_links:
                finding = reviewed.get(finding_id)
                if not isinstance(finding, dict):
                    raise SystemExit(f"resolved review finding is not reviewed: {finding_id}")
                if finding.get("stage_id") != matching[0].get("stage_id"):
                    raise SystemExit(f"resolved review finding is outside this stage: {finding_id}")

            severity = args.severity or ("P2" if args.decision == "needs_rework_same_stream" else "")
            limit = correction_limit(contract)
            if (
                args.decision == "needs_rework_same_stream"
                and severity not in {"P0", "P1"}
                and limit is not None
                and prior_p2_corrections(reviewed, matching[0]) >= limit
            ):
                raise SystemExit(
                    "P2+ correction loop cap reached; use needs_new_stream and replan the next stage"
                )
            reviewed[args.mark_reviewed] = {
                "decision": args.decision,
                "severity": severity,
                "resolves_review": resolution_links,
                "correction_round": prior_p2_corrections(reviewed, matching[0]) + 1
                if args.decision == "needs_rework_same_stream" and severity not in {"P0", "P1"}
                else 0,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "note": args.note,
                "task_id": matching[0].get("task_id"),
                "stage_id": matching[0].get("stage_id"),
                "artifact_path": matching[0].get("artifact_path"),
                "verify": matching[0].get("verify"),
            }
            save_state(state_file, state)
    else:
        state = load_state(state_file)
        reviewed = state["reviewed"]

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
