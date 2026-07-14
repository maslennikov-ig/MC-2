#!/usr/bin/python3
"""No-I/O adapter for the Root-owned retained barrier production core."""

from __future__ import annotations

import importlib.util
import fcntl
import json
import os
import pathlib
import sys
import uuid
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO_ROOT / "deploy/qdrant/q12-lifecycle-core.py"
SPEC = importlib.util.spec_from_file_location("q12_lifecycle_core", CORE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load production lifecycle core")
CORE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CORE
SPEC.loader.exec_module(CORE)
run_supervisor = CORE.run_supervisor
run_claim = CORE.run_claim


class NoIoExecutor:
    """Returns immutable synthetic results and never performs an external effect."""

    def __init__(self) -> None:
        self.child_executions = 0
        self.attempted_effects: list[str] = []

    def execute(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]:
        self.child_executions += 1
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": capability["command_id"],
            "capability_sha256": CORE.sha256(CORE.complete_object(capability)),
            "result_sha256": CORE.sha256(f"accepted:{capability['command_id']}".encode()),
            "status": "accepted",
        }


def write_audit(
    root: pathlib.Path, executor: NoIoExecutor, output: dict[str, Any] | None = None
) -> None:
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    (root / "effects.json").write_text("[]\n", encoding="utf-8")
    (root / "executor-audit.json").write_text(
        json.dumps(
            {
                "childExecutions": executor.child_executions,
                "attemptedEffects": executor.attempted_effects,
                "enteredRunSupervisor": True,
                "enteredRunClaim": True,
                "leaseFd9Validated": bool(output and output.get("leaseFd9Validated")),
                "inheritedJournalIdentityValidated": bool(
                    output and output.get("inheritedJournalIdentityValidated")
                ),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    spec = json.load(sys.stdin)
    root = pathlib.Path(spec["runRoot"]).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock_path = root / "cutover.lock"
    lease_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lease_fd != 9:
        os.dup2(lease_fd, 9)
        os.close(lease_fd)
        lease_fd = 9
    fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock_stat = os.fstat(lease_fd)
    executor = NoIoExecutor()
    request = {
        **spec,
        "run_root": str(root),
        "run_id": str(uuid.uuid5(uuid.NAMESPACE_URL, str(root))),
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": "3" * 64,
        "expected_catalog_sha256": "4" * 64,
        "rotation_required": False,
        "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
    }
    try:
        output = run_supervisor(request, executor)
    except Exception as error:
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
