#!/usr/bin/python3
"""W7a increment 1 harness: prove the PRODUCTION owner-custody executor really EXECUTES an ordinary
command's manifest argv (the in-window residual W5 bounded), rather than fixture-projecting it.

Continues q12-w5-production-rehearsal-runner.py, whose docstring bounds exactly this residual: the
real data-movement children were NOT exercised there because the deployed ``OwnerCustodyExecutor``
had no ``execute_ordinary`` seam. This runner constructs a fully-resolved ``command`` (a real argv
with an OBSERVABLE side effect — it writes a marker file) plus a ``capability``, calls the deployed
``owner_custody_executor().execute_ordinary(command, capability)``, and reports whether the child
really ran and whether the result honours the RESULT_KEYS contract
(``capability_sha256 == sha256(complete_object(capability))`` — the ``!= digest`` gate at
q12-lifecycle-core.py:2497).

Prints ONE JSON object; the TypeScript test asserts on it. No production file/manifest is mutated;
run_root/marker live under an ephemeral /tmp dir (no /opt/megacampus, no docker, no prod).
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO / "deploy/qdrant/q12-lifecycle-core.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE_PATH)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)


def main() -> int:
    run_id = str(uuid.uuid4())
    result_out: dict[str, object] = {"runId": run_id}

    executor = core.owner_custody_executor()
    result_out["hasExecuteOrdinary"] = callable(getattr(executor, "execute_ordinary", None))

    with tempfile.TemporaryDirectory(prefix="mc2-q12-w7a-") as tmp:
        marker = pathlib.Path(tmp) / "child-ran.marker"
        # A fully-resolved command exactly as resolved_command() hands to the hook: real argv (with an
        # observable effect), a real env, and a command_sha256. The argv writes the marker so a REAL
        # shell (ProductionExecutor.execute) is provable and distinct from the fixture projection
        # (which never runs argv).
        command = {
            "argv": ["/usr/bin/env", "sh", "-c", f"printf ran > {marker}"],
            "env": {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C"},
            "command_sha256": core.sha256(b"w7a-increment-1-command"),
        }
        capability = {
            "schema_version": "megacampus.q12.retained-capability/v1",
            "command_id": "migration.base.apply",
            "run_id": run_id,
        }
        expected_capability_sha256 = core.sha256(core.complete_object(capability))

        try:
            result = executor.execute_ordinary(command, capability)
            result_out["executed"] = True
            result_out["result"] = result
            result_out["markerExists"] = marker.exists()
            result_out["markerBody"] = marker.read_text() if marker.exists() else None
            result_out["resultKeysMatch"] = set(result) == core.RESULT_KEYS
            result_out["capabilityBinds"] = (
                result.get("capability_sha256") == expected_capability_sha256
            )
            result_out["statusAccepted"] = result.get("status") == "accepted"
            # A REAL run binds result_sha256 to the child stdout, NOT the fixture "q12-joined-fixture"
            # projection — prove we did not take the fallback branch.
            fixture_result_sha = core.sha256(
                core.canonical(
                    {
                        "command_id": "migration.base.apply",
                        "run_id": run_id,
                        "evidence": "q12-joined-fixture",
                    }
                )
            )
            result_out["distinctFromFixtureProjection"] = (
                result.get("result_sha256") != fixture_result_sha
            )
        except AttributeError as error:
            result_out["executed"] = False
            result_out["error"] = f"AttributeError: {error}"
        except Exception as error:  # noqa: BLE001 — report any failure to the TS assertion layer
            result_out["executed"] = False
            result_out["error"] = f"{type(error).__name__}: {error}"

    sys.stdout.write(json.dumps(result_out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
