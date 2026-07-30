#!/usr/bin/python3
"""Design D5 harness: does the controller route EXACTLY `source.forward` through the root-owned
launcher, and nothing else?

The ordinary-execution seam (``OwnerCustodyExecutor.execute_ordinary``) must prefix that single
frozen command with ``sudo -n -- <launcher>`` at LAUNCH time, while leaving the command it was handed
untouched — the journal keeps recording the manifest argv and env verbatim (spec §D7). Every other
ordinary command must keep today's direct launch: there is deliberately no generic escalation hook.

``execute`` is overridden here to CAPTURE what the seam would have run instead of running it (real
sudo is not exercised in unit tests; the launcher's own behaviour is covered by
q12-privileged-launch.test.ts). Prints ONE JSON object; the TypeScript test asserts on it. Nothing
is mutated on disk.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO / "deploy/qdrant/q12-lifecycle-core.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE_PATH)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)


class CapturingExecutor(core.OwnerCustodyExecutor):
    """Captures the LAUNCH command the ordinary seam builds, without shelling anything."""

    def __init__(self) -> None:
        super().__init__()
        self.launched: dict[str, object] | None = None

    def execute(self, command: dict[str, object], capability: dict[str, object]) -> dict[str, object]:
        self.launched = copy.deepcopy(command)
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": capability["command_id"],
            "capability_sha256": core.sha256(core.complete_object(capability)),
            "result_sha256": core.sha256(b"captured"),
            "status": "accepted",
        }


def render(argv: list[str], run_id: str) -> list[str]:
    """The frozen argv with its placeholders resolved (values are irrelevant to routing — argv[0]
    and the operation are what the launcher whitelists)."""
    rendered = []
    for value in argv:
        value = value.replace("<run-id>", run_id)
        value = value.replace("<recovery-run-id>", "7c9d1a44-2f6b-4e11-8b0d-53a7e9c2f108")
        value = value.replace(
            "<quiesce-manifest>",
            f"/opt/megacampus/backups/q12/{run_id}/writer-quiesce-{run_id}.json",
        )
        rendered.append(value)
    return rendered


def route(command_id: str, run_id: str) -> dict[str, object]:
    manifest = core.load_manifest()
    frozen = manifest["commands"][command_id]
    command = {
        "argv": render(list(frozen["argv"]), run_id),
        "env": dict(frozen["env"]),
        "command_sha256": core.sha256(core.canonical(render(list(frozen["argv"]), run_id))),
    }
    capability = {
        "schema_version": "megacampus.q12.retained-capability/v1",
        "command_id": command_id,
        "run_id": run_id,
    }
    handed = copy.deepcopy(command)
    executor = CapturingExecutor()
    case: dict[str, object] = {"frozenArgv": handed["argv"], "frozenEnv": handed["env"]}
    try:
        executor.execute_ordinary(command, capability)
        case["executed"] = True
    except Exception as error:  # noqa: BLE001 — reported to the TS assertion layer
        case["executed"] = False
        case["error"] = f"{type(error).__name__}: {error}"
    launched = executor.launched or {}
    case["launchArgv"] = launched.get("argv")
    case["launchEnv"] = launched.get("env")
    case["launchCommandSha256"] = launched.get("command_sha256")
    # D7: the seam may add launch-time mechanics, never rewrite what it was handed.
    case["commandNotMutated"] = command == handed
    return case


def main() -> int:
    # The caller pins the run id so its own rendering of the frozen argv is comparable byte for byte.
    run_id = str(uuid.UUID(sys.argv[1])) if len(sys.argv) > 1 else str(uuid.uuid4())
    sys.stdout.write(
        json.dumps(
            {
                "runId": run_id,
                "launcherPath": str(CORE_PATH.with_name("q12-privileged-launch.sh")),
                "sudoBin": core.SUDO_BIN,
                "sourceForward": route("source.forward", run_id),
                "migrationBaseApply": route("migration.base.apply", run_id),
                "writersQuiesce": route("writers.quiesce", run_id),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
