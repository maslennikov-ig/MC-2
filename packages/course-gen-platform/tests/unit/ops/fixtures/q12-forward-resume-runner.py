#!/usr/bin/python3
"""No-docker W1 driver for the REAL owner-custody forward-resume seam.

Design §W1 (docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md) — the RESUME
half of the post-activate cutover: the server-side owner-custody child that, AFTER the barrier
cleanup produced the exact 10-key ``database-barrier-receipt/v2``, fail-closed validates that v2
receipt (a byte twin of q12-writer-resume.py:1088-1134 / the retained-barrier fixture's
``execute_forward_resume``) and then drives the REAL writer-fleet resume
(``source-recovery-run.sh --operation resume-writers-only --resume-mode forward --run-id <run-id>``)
under the inherited FD9 cutover lease.

This driver exercises the real ``deploy/qdrant/q12-lifecycle-core.py`` ``OwnerCustodyExecutor``
(NOT a fixture executor). The single un-unit-testable boundary — actually shelling the writer-fleet
resume child — is isolated behind ``OwnerCustodyExecutor._invoke_resume``; a capturing subclass
records the resolved argv/env the real seam would exec, so every other leg (v2 validation, frozen
``writers.resume.forward`` manifest resolution, the FD9 lease env, the validated-receipt-sha binding,
fail-closed-before-drive) is exercised for real. A separate leg drives the REAL ``_invoke_resume``
against a disposable child to prove the nonzero-exit fail-closed.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import sys
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO_ROOT / "deploy/qdrant/q12-lifecycle-core.py"


def _load(name: str, path: pathlib.Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CORE = _load("q12_lifecycle_core", CORE_PATH)
FIXTURE = _load(
    "q12_retained_barrier_runner",
    pathlib.Path(__file__).with_name("q12-retained-barrier-runner.py"),
)
CLEANUP = _load(
    "q12_production_executor_cleanup_runner",
    pathlib.Path(__file__).with_name("q12-production-executor-cleanup-runner.py"),
)


def _seed_v2_run_root(run_root: pathlib.Path) -> dict[str, Any]:
    """Seed the producer artifacts and run the REAL ProductionExecutor barrier cleanup so a genuine
    10-key ``database-barrier-receipt/v2`` (+ its probe receipt) sits on disk — exactly the state
    ``execute_forward_resume`` validates at the top of the resume half."""
    run_id = FIXTURE.derive_run_id(run_root)
    expected_catalog_sha256 = CORE.sha256(
        f"q12:w1:expected-catalog:{run_id}".encode("utf-8")
    )
    v1_receipt = {
        "schema_version": "megacampus.q12.database-barrier-receipt/v1",
        "run_id": run_id,
        "state": "activated",
        "zero_guard_residue": False,
        "expected_catalog_sha256": expected_catalog_sha256,
        "last_command": "activate",
        "rollback_probes_verified": True,
        "probe_receipt_sha256": "a" * 64,
    }
    CLEANUP._seed(run_root / "database-barrier-receipt.json", CORE.complete_object(v1_receipt))
    probe_body = CORE.complete_object(
        FIXTURE._barrier_probe_object(run_id, expected_catalog_sha256)
    )
    CLEANUP._seed(run_root / "database-barrier-probe-receipt.json", probe_body)
    CLEANUP._seed(
        run_root / "database-barrier-cleanup-terminal-proof.json",
        CLEANUP._terminal_proof(run_id, expected_catalog_sha256),
    )
    CLEANUP._seed(run_root / "secrets" / "db-capability", b"q12-capability-synthetic-sentinel\n")

    context = {
        "run_root": str(run_root),
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
    }
    production = CORE.ProductionExecutor()
    command = production.prepare_barrier_cleanup(context)
    outcome = production.execute_barrier_cleanup(context, command)
    v2_bytes = (run_root / "database-barrier-receipt.json").read_bytes()
    return {
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
        "release_sha": CORE.sha256(f"q12:w1:release:{run_id}".encode("utf-8")),
        "cleanup_outcome": outcome,
        "v2_sha256": CORE.sha256(v2_bytes),
    }


def _capturing_executor(calls: list[dict[str, Any]]) -> Any:
    class CapturingOwnerCustodyExecutor(CORE.OwnerCustodyExecutor):
        def _invoke_resume(self, argv: list[str], env: dict[str, str]) -> None:
            calls.append({"argv": list(argv), "env": dict(env)})

    return CapturingOwnerCustodyExecutor()


def run_invoke(run_root_raw: str) -> int:
    run_root = pathlib.Path(run_root_raw)
    seed = _seed_v2_run_root(run_root)
    calls: list[dict[str, Any]] = []
    executor = _capturing_executor(calls)
    context = {
        "run_root": str(run_root),
        "run_id": seed["run_id"],
        "expected_catalog_sha256": seed["expected_catalog_sha256"],
        "release_sha": seed["release_sha"],
    }
    resume = executor.execute_forward_resume(context, seed["cleanup_outcome"])
    report = {
        "run_id": seed["run_id"],
        "seeded_v2_sha256": seed["v2_sha256"],
        "resume": resume,
        "invoke_count": len(calls),
        "resume_argv": calls[0]["argv"] if calls else None,
        "resume_env": calls[0]["env"] if calls else None,
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_tampered(run_root_raw: str) -> int:
    """Corrupt the v2 receipt after seeding: the gate must fail closed BEFORE any resume drive."""
    run_root = pathlib.Path(run_root_raw)
    seed = _seed_v2_run_root(run_root)
    receipt_path = run_root / "database-barrier-receipt.json"
    tampered = json.loads(receipt_path.read_bytes())
    tampered["state"] = "activated"  # not guard_cleanup_complete -> not the terminal authority
    os.chmod(receipt_path, 0o600)
    receipt_path.write_bytes(CORE.complete_object(tampered))
    os.chmod(receipt_path, 0o400)
    calls: list[dict[str, Any]] = []
    executor = _capturing_executor(calls)
    context = {
        "run_root": str(run_root),
        "run_id": seed["run_id"],
        "expected_catalog_sha256": seed["expected_catalog_sha256"],
        "release_sha": seed["release_sha"],
    }
    error = ""
    error_type = ""
    try:
        executor.execute_forward_resume(context, seed["cleanup_outcome"])
    except CORE.LifecycleError as raised:
        error, error_type = str(raised), "LifecycleError"
    except Exception as raised:  # noqa: BLE001 — report any other failure verbatim
        error, error_type = str(raised), type(raised).__name__
    report = {"error": error, "error_type": error_type, "invoke_count": len(calls)}
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_tampered_projection(run_root_raw: str) -> int:
    """Seed a valid v2, then rewrite the probe receipt with a hash-CONSISTENT but semantically
    DIRTY nested projection (residue rows > 0) and re-bind the barrier's probe_receipt_sha256 to it.
    The pre-drive gate must still fail closed (nested projection predicate, a twin of
    q12-writer-resume.py:1122-1134) BEFORE any writer-fleet resume is driven."""
    run_root = pathlib.Path(run_root_raw)
    seed = _seed_v2_run_root(run_root)
    probe_path = run_root / "database-barrier-probe-receipt.json"
    probe = json.loads(probe_path.read_bytes())
    probe["residue"]["guard_probe_rows"] = 1  # dirty: a non-zero-residue rollback
    probe_body = CORE.complete_object(probe)
    os.chmod(probe_path, 0o600)
    probe_path.write_bytes(probe_body)
    os.chmod(probe_path, 0o400)
    receipt_path = run_root / "database-barrier-receipt.json"
    barrier = json.loads(receipt_path.read_bytes())
    barrier["probe_receipt_sha256"] = CORE.sha256(probe_body)  # keep the hash check satisfied
    os.chmod(receipt_path, 0o600)
    receipt_path.write_bytes(CORE.complete_object(barrier))
    os.chmod(receipt_path, 0o400)
    calls: list[dict[str, Any]] = []
    executor = _capturing_executor(calls)
    context = {
        "run_root": str(run_root),
        "run_id": seed["run_id"],
        "expected_catalog_sha256": seed["expected_catalog_sha256"],
        "release_sha": seed["release_sha"],
    }
    error = ""
    error_type = ""
    try:
        executor.execute_forward_resume(context, seed["cleanup_outcome"])
    except CORE.LifecycleError as raised:
        error, error_type = str(raised), "LifecycleError"
    except Exception as raised:  # noqa: BLE001
        error, error_type = str(raised), type(raised).__name__
    report = {"error": error, "error_type": error_type, "invoke_count": len(calls)}
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_child_nonzero(run_root_raw: str) -> int:
    """Drive the REAL _invoke_resume against a disposable child that exits nonzero, under a real
    FD9 lease, to prove the resume seam fails closed on a failed writer-fleet resume."""
    run_root = pathlib.Path(run_root_raw)
    child = run_root / "fake-resume-child.sh"
    child.write_text("#!/bin/sh\necho boom 1>&2\nexit 7\n")
    os.chmod(child, 0o755)
    lease = os.open(str(run_root / "cutover.lock.probe"), os.O_RDWR | os.O_CREAT, 0o600)
    if lease != 9:
        os.dup2(lease, 9)
        os.close(lease)
    executor = CORE.OwnerCustodyExecutor()
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C", "HOME": "/root",
           "Q12_EXTERNAL_QUIESCE_LEASE_FD": "9"}
    error = ""
    error_type = ""
    try:
        executor._invoke_resume([str(child)], env)
    except CORE.LifecycleError as raised:
        error, error_type = str(raised), "LifecycleError"
    except Exception as raised:  # noqa: BLE001
        error, error_type = str(raised), type(raised).__name__
    finally:
        os.close(9)
    report = {"error": error, "error_type": error_type}
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_preflight(run_root_raw: str) -> int:
    """The wired owner-custody executor passes require_post_activate_executor; main()'s factory
    returns exactly that type. The bare ProductionExecutor still lacks the resume hook."""
    request = {"production": True, "run_root": run_root_raw, "run_id": "unused"}
    wired = CORE.owner_custody_executor()
    error = ""
    error_type = ""
    try:
        CORE.require_post_activate_executor(request, wired)
    except CORE.LifecycleError as raised:
        error, error_type = str(raised), "LifecycleError"
    report = {
        "factory_type": type(wired).__name__,
        "factory_is_owner_custody": isinstance(wired, CORE.OwnerCustodyExecutor),
        "preflight_error": error,
        "preflight_error_type": error_type,
        "wired_has_forward_resume": hasattr(wired, "execute_forward_resume"),
        "wired_has_barrier_cleanup": hasattr(wired, "execute_barrier_cleanup"),
        "bare_has_forward_resume": hasattr(CORE.ProductionExecutor(), "execute_forward_resume"),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("usage: runner <mode> <run-root>")
    mode, run_root = sys.argv[1], sys.argv[2]
    if mode == "--invoke":
        return run_invoke(run_root)
    if mode == "--tampered":
        return run_tampered(run_root)
    if mode == "--tampered-projection":
        return run_tampered_projection(run_root)
    if mode == "--child-nonzero":
        return run_child_nonzero(run_root)
    if mode == "--preflight":
        return run_preflight(run_root)
    raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    raise SystemExit(main())
