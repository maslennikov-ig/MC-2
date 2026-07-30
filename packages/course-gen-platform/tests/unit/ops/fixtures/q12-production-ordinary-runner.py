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

It ALSO drives the 2026-07-26 D3 half — which descriptors that real child inherits. The frozen
``writers.quiesce`` env declares ``Q12_EXTERNAL_QUIESCE_LEASE_FD=9`` and its wrapper demands an
inherited, still-held descriptor on the canonical cutover lock, so ``descriptor_surface_case``
reports the child's own ``/proc/self/fd`` surface for a lease-declaring and a non-declaring command
while the parent holds the lock exactly as the controller does.

Prints ONE JSON object; the TypeScript test asserts on it. No production file/manifest is mutated;
run_root/marker live under an ephemeral /tmp dir (no /opt/megacampus, no docker, no prod).
"""

from __future__ import annotations

import copy
import fcntl
import importlib.util
import json
import os
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


INSPECTOR = '''\
import json, os, sys
surface = {}
for raw in os.listdir("/proc/self/fd"):
    try:
        fd = int(raw)
        os.fstat(fd)
    except (OSError, ValueError):
        continue
    try:
        surface[fd] = os.readlink(f"/proc/self/fd/{fd}")
    except OSError:
        surface[fd] = None
open(sys.argv[1], "w").write(
    json.dumps({"fds": sorted(surface), "leaseTarget": surface.get(9), "env": dict(os.environ)})
)
'''


def descriptor_surface_case(executor: object, run_id: str, command_id: str) -> dict[str, object]:
    """Design D3: what descriptor surface does an ordinary child actually get?

    The seam must hand the child the canonical FD9 cutover lease exactly when the FROZEN manifest env
    declares ``Q12_EXTERNAL_QUIESCE_LEASE_FD`` — which ``writers.quiesce`` (C2) does and which its
    wrapper's ``validate_external_quiesce_lease`` (source-recovery-run.sh:388-411) requires — and
    must hand it to NOBODY else. Both halves are driven here with the controller side mimicked
    faithfully: the lock is opened on descriptor 9 and held with ``LOCK_EX`` for the whole call
    (q12-lifecycle-core.py:8041-8046), so a command that declares no lease proves it stays narrow
    even though the descriptor was available. The child's own surface is the assertion — the same
    surface q12-writer-resume.py:296-309 demands.
    """
    case: dict[str, object] = {}
    with tempfile.TemporaryDirectory(prefix="mc2-q12-lease-") as tmp:
        root = pathlib.Path(tmp)
        lock = root / "cutover.lock"
        inspector = root / "inspect-descriptor-surface.py"
        inspector.write_text(INSPECTOR, encoding="utf-8")
        observed = root / "descriptor-surface.json"

        # The controller's own lease-open sequence, verbatim in shape.
        opened = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        if opened != 9:
            os.dup2(opened, 9)
            os.close(opened)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            # The env is the REAL frozen env of the command under test, so these cases move the
            # moment the manifest's lease declaration moves.
            frozen_env = core.load_manifest()["commands"][command_id]["env"]
            command = {
                "argv": ["/usr/bin/python3", str(inspector), str(observed)],
                "env": dict(frozen_env),
                "command_sha256": core.sha256(f"{command_id}-descriptor-surface".encode()),
            }
            capability = {
                "schema_version": "megacampus.q12.retained-capability/v1",
                "command_id": command_id,
                "run_id": run_id,
            }
            frozen_command = copy.deepcopy(command)
            try:
                executor.execute_ordinary(command, capability)
                case["executed"] = True
            except Exception as error:  # noqa: BLE001 — reported to the TS assertion layer
                case["executed"] = False
                case["error"] = f"{type(error).__name__}: {error}"
            # What is RECORDED must not move: the seam may add launch-time mechanics, never rewrite
            # the manifest argv/env it was handed (design D7).
            case["commandNotMutated"] = command == frozen_command
            if observed.exists():
                surface = json.loads(observed.read_bytes())
                case["childFds"] = surface["fds"]
                case["leaseTargetIsCanonicalLock"] = surface["leaseTarget"] == str(lock)
                case["childEnvVerbatim"] = surface["env"] == frozen_env
            else:
                case["childFds"] = None
                case["leaseTargetIsCanonicalLock"] = False
                case["childEnvVerbatim"] = False
        finally:
            os.close(9)
    return case


def lease_declaration_guard_case(executor: object, run_id: str) -> dict[str, object]:
    """The descriptor is frozen to 9 everywhere (q12-writer-resume.py:302-303, its surface assertion
    :152-155, the controller's ``--lease-fd choices=(9,)``). A command declaring any other descriptor
    is a manifest defect and must fail closed at the launch seam, not deep inside the child."""
    case: dict[str, object] = {}
    command = {
        "argv": ["/usr/bin/env", "true"],
        "env": {
            "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
            "LC_ALL": "C",
            "LANG": "C",
            "HOME": "/root",
            "Q12_EXTERNAL_QUIESCE_LEASE_FD": "8",
        },
        "command_sha256": core.sha256(b"lease-declaration-guard"),
    }
    capability = {
        "schema_version": "megacampus.q12.retained-capability/v1",
        "command_id": "writers.quiesce",
        "run_id": run_id,
    }
    try:
        executor.execute_ordinary(command, capability)
        case["refused"] = False
    except core.LifecycleError as error:
        case["refused"] = True
        case["reason"] = str(error)
    except Exception as error:  # noqa: BLE001 — reported to the TS assertion layer
        case["refused"] = False
        case["reason"] = f"{type(error).__name__}: {error}"
    return case


def lease_descriptor_absent_case(executor: object, run_id: str) -> dict[str, object]:
    """The controller holds ``LOCK_EX`` on descriptor 9 for the whole run (:8041-8046), so a
    lease-declaring child running without it is unreachable in practice — but ``pass_fds`` with a
    closed descriptor raises a bare ``OSError: [Errno 9] Bad file descriptor`` from deep inside
    ``subprocess``, and by the time the ordinary seam runs, the intent + capability_issued +
    capability_claimed rows are ALREADY journalled. The operator must get a reason, not a traceback.

    This asserts on ``lease_pass_fds`` DIRECTLY rather than through ``execute_ordinary``: the
    descriptor decision is made there, and driving it through ``subprocess`` is not even
    deterministic — ``subprocess`` allocates its stdout/stderr pipes before forking, and one of them
    can land on the free descriptor 9, in which case the child silently inherits an unrelated PIPE
    instead of the cutover lock. That is a second reason the guard must be an explicit ``fstat``
    rather than a reliance on ``EBADF``.
    """
    del executor, run_id
    case: dict[str, object] = {}
    frozen_env = dict(core.load_manifest()["commands"]["writers.quiesce"]["env"])
    # Make sure descriptor 9 really is closed at the moment of the call, so the case is not vacuous.
    try:
        os.close(9)
    except OSError:
        pass
    try:
        os.fstat(9)
        case["prepared"] = False  # something else in this process holds 9 — do not assert on noise
        return case
    except OSError:
        case["prepared"] = True
    try:
        case["passFds"] = list(core.lease_pass_fds(frozen_env))
        case["refused"] = False
    except core.LifecycleError as error:
        case["refused"] = True
        case["reason"] = str(error)
    except Exception as error:  # noqa: BLE001 — a bare OSError here is the defect under test
        case["refused"] = False
        case["reason"] = f"{type(error).__name__}: {error}"
    return case


def failing_child_diagnostics_case(executor: object) -> dict[str, object]:
    """2026-07-27 (mc2-94mmf): a failing frozen child must SAY WHY it failed.

    The window's C1 ``barrier.install`` exited 1 and the controller reported only
    "manifested child failed with status 1" — the child's stderr was captured and dropped, so the
    operator was blind. That is survivable before C2; after C2 the writers are already stopped and
    a blind refusal is the worst possible place to lose the reason. The message must carry the
    child's stderr tail, and it must be scrubbed: children print DSNs and credentials on failure.
    """
    secret = "b" * 64
    argv = [
        "/usr/bin/env",
        "sh",
        "-c",
        f'printf "barrier refused: capability mode mismatch\\npassword={secret}\\n" >&2; exit 1',
    ]
    command = {
        "argv": argv,
        "env": {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C"},
        "command_sha256": core.sha256(b"failing-child-diagnostics"),
    }
    capability = {
        "schema_version": "megacampus.q12.retained-capability/v1",
        "command_id": "barrier.install",
        "run_id": str(uuid.uuid4()),
    }
    try:
        executor.execute_ordinary(command, capability)
    except Exception as error:  # noqa: BLE001 — the message itself is the artifact under test
        message = str(error)
        return {
            "raised": True,
            "message": message,
            "carriesStatus": "status 1" in message,
            "carriesChildReason": "capability mode mismatch" in message,
            "leaksSecret": secret in message,
        }
    return {"raised": False}


def main() -> int:
    run_id = str(uuid.uuid4())
    result_out: dict[str, object] = {"runId": run_id}
    result_out["failingChildDiagnostics"] = failing_child_diagnostics_case(
        core.owner_custody_executor()
    )

    executor = core.owner_custody_executor()
    result_out["hasExecuteOrdinary"] = callable(getattr(executor, "execute_ordinary", None))
    result_out["leaseCase"] = descriptor_surface_case(executor, run_id, "writers.quiesce")
    result_out["noLeaseCase"] = descriptor_surface_case(executor, run_id, "migration.base.apply")
    result_out["leaseDeclarationGuard"] = lease_declaration_guard_case(executor, run_id)
    result_out["leaseDescriptorAbsent"] = lease_descriptor_absent_case(executor, run_id)

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
