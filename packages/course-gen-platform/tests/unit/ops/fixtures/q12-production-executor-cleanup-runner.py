#!/usr/bin/python3
"""No-docker R8-B-1 driver for the REAL ProductionExecutor post-activate FILE-ARTIFACT seam.

Design §6b.1 R8-B-1 — the FILE-ARTIFACT half of the post-activate cleanup, driven against the
REAL ``deploy/qdrant/q12-lifecycle-core.py`` ``ProductionExecutor`` (NOT a fixture executor). No
real PostgreSQL, no docker, no barrier child runs here: the barrier cleanup child that PRODUCES the
18-key terminal proof against a real DB is downstream R8-B-2. THIS driver seeds the exact producer
artifacts the barrier child would leave on the run root (the activate v1 receipt, the 18-key
terminal proof, the prepare-recovery probe-receipt bootstrap, and the db-capability), then calls the
real ``ProductionExecutor.prepare_barrier_cleanup`` + ``execute_barrier_cleanup`` and reports the
produced v1 archive / 10-key v2 promotion / db-capability deletion for the test to assert.

The seeded probe receipt is imported byte-for-byte from the retained-barrier fixture's own
``_barrier_probe_object`` projection (the exact contract shape the frozen barrier and
``q12-writer-resume.py`` require), so the produced v2 receipt is a byte twin of the fixture's
``execute_barrier_cleanup`` v2 for the same inputs.
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
SPEC = importlib.util.spec_from_file_location("q12_lifecycle_core", CORE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load production lifecycle core")
CORE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CORE
SPEC.loader.exec_module(CORE)

FIXTURE_PATH = pathlib.Path(__file__).with_name("q12-retained-barrier-runner.py")
FIXTURE_SPEC = importlib.util.spec_from_file_location(
    "q12_retained_barrier_runner", FIXTURE_PATH
)
if FIXTURE_SPEC is None or FIXTURE_SPEC.loader is None:
    raise RuntimeError("unable to load retained-barrier fixture module")
FIXTURE = importlib.util.module_from_spec(FIXTURE_SPEC)
sys.modules[FIXTURE_SPEC.name] = FIXTURE
FIXTURE_SPEC.loader.exec_module(FIXTURE)


def _seed(path: pathlib.Path, body: bytes) -> str:
    """Publish one producer-owned immutable 0400 artifact and return its sha256."""
    CORE.immutable_publish(path, body, 0o400, [])
    return CORE.sha256(body)


def _terminal_proof(run_id: str, expected_catalog_sha256: str) -> bytes:
    """A realistic 18-key ``database-barrier-terminal-proof/v1`` (the shape the frozen barrier
    cleanup child publishes, q12-database-barrier.sh:2101-2111). The seam only hashes it; the shape
    is seeded faithfully so the digest binds a real terminal-proof body."""
    proof = {
        "schema_version": "megacampus.q12.database-barrier-terminal-proof/v1",
        "run_id": run_id,
        "operation": "cleanup",
        "state": "guard_cleanup_complete",
        "expected_post_migration_catalog_sha256": expected_catalog_sha256,
        "database_barrier_baseline_sha256": "1" * 64,
        "predecessor_receipt_sha256": "2" * 64,
        "predecessor_receipt_archive_sha256": "3" * 64,
        "database_barrier_rollback_intent_sha256": None,
        "input_checkpoint_sha256": "4" * 64,
        "intent_journal_entry_hash": "5" * 64,
        "structural_catalog_sha256": "6" * 64,
        "database_default_sha256": "7" * 64,
        "cron_jobs_sha256": "8" * 64,
        "guard_residue": {
            "q12_guard_schema_count": 0,
            "q12_guard_relation_count": 0,
            "q12_guard_function_count": 0,
            "q12_guard_type_count": 0,
            "q12_guard_trigger_count": 0,
            "q12_guard_event_trigger_count": 0,
            "barrier_era_session_count": 0,
        },
        "required_phase_receipts_sha256": None,
        "database_capability_sha256": "9" * 64,
        "completed_at": "2026-07-19T00:00:00.000Z",
    }
    if len(proof) != 18:
        raise RuntimeError("terminal proof is not 18-key")
    return CORE.complete_object(proof)


def run_file_artifact(run_root_raw: str) -> int:
    run_root = pathlib.Path(run_root_raw)
    run_id = FIXTURE.derive_run_id(run_root)
    expected_catalog_sha256 = CORE.sha256(
        f"q12:r8b1:expected-catalog:{run_id}".encode("utf-8")
    )

    # Seed the producer artifacts the frozen barrier + earlier lifecycle phases leave on the run
    # root before the post-activate cleanup file-artifact step runs.
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
    v1_body = CORE.complete_object(v1_receipt)
    v1_sha256 = _seed(run_root / "database-barrier-receipt.json", v1_body)

    probe_object = FIXTURE._barrier_probe_object(run_id, expected_catalog_sha256)
    probe_body = CORE.complete_object(probe_object)
    seeded_probe_sha256 = _seed(
        run_root / "database-barrier-probe-receipt.json", probe_body
    )

    terminal_body = _terminal_proof(run_id, expected_catalog_sha256)
    seeded_terminal_sha256 = _seed(
        run_root / "database-barrier-cleanup-terminal-proof.json", terminal_body
    )

    capability_body = b"q12-capability-synthetic-sentinel\n"
    _seed(run_root / "secrets" / "db-capability", capability_body)

    context = {
        "run_root": str(run_root),
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
    }
    executor = CORE.ProductionExecutor()
    command = executor.prepare_barrier_cleanup(context)
    outcome = executor.execute_barrier_cleanup(context, command)

    # Independently recompute the exact 10-key v2 the promotion MUST produce, byte-for-byte, from
    # the seeded producer digests — the byte-match anchor.
    expected_v2 = {
        "schema_version": "megacampus.q12.database-barrier-receipt/v2",
        "run_id": run_id,
        "state": "guard_cleanup_complete",
        "expected_catalog_sha256": expected_catalog_sha256,
        "zero_guard_residue": True,
        "last_command": "cleanup",
        "rollback_probes_verified": True,
        "probe_receipt_sha256": seeded_probe_sha256,
        "terminal_proof_sha256": seeded_terminal_sha256,
        "database_capability_deleted": True,
    }
    expected_v2_body = CORE.complete_object(expected_v2)

    v2_path = run_root / "database-barrier-receipt.json"
    archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
    capability_path = run_root / "secrets" / "db-capability"

    def mode_of(path: pathlib.Path) -> int | None:
        try:
            return path.stat().st_mode & 0o777
        except FileNotFoundError:
            return None

    report: dict[str, Any] = {
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
        "seeded_v1_sha256": v1_sha256,
        "seeded_probe_sha256": seeded_probe_sha256,
        "seeded_terminal_sha256": seeded_terminal_sha256,
        "command": command,
        "outcome": outcome,
        "v2_bytes_utf8": v2_path.read_bytes().decode("utf-8"),
        "v2_matches_expected": v2_path.read_bytes() == expected_v2_body,
        "v2_keys": sorted(json.loads(v2_path.read_bytes())),
        "v2_mode": mode_of(v2_path),
        "archive_matches_seeded_v1": archive_path.read_bytes() == v1_body,
        "archive_mode": mode_of(archive_path),
        "capability_exists": capability_path.exists()
        or capability_path.is_symlink(),
        "capability_mode": mode_of(capability_path),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_resume_failclosed(run_root_raw: str, controller: str) -> int:
    # The pre-flight require_post_activate_executor is the FIRST statement of run_live/run_recover,
    # BEFORE Engine construction / the production-run-root coupling. Passing a /tmp run root under
    # production=True proves pre-flight-first: if the Engine ran first we'd get "production run root
    # mismatch"; instead we must get the resume-specific named refusal.
    request = {
        "production": True,
        "run_root": run_root_raw,
        "run_id": FIXTURE.derive_run_id(pathlib.Path(run_root_raw)),
    }
    executor = CORE.ProductionExecutor()
    entry = CORE.run_live if controller == "run_live" else CORE.run_recover
    error = ""
    error_type = ""
    try:
        entry(request, executor)
    except CORE.LifecycleError as raised:
        error = str(raised)
        error_type = "LifecycleError"
    except Exception as raised:  # noqa: BLE001 — report any other failure verbatim
        error = str(raised)
        error_type = type(raised).__name__
    report = {
        "controller": controller,
        "error": error,
        "error_type": error_type,
        "run_root_created_journal": (
            pathlib.Path(run_root_raw) / "phase.jsonl"
        ).exists(),
        "has_execute_barrier_cleanup": hasattr(executor, "execute_barrier_cleanup"),
        "has_execute_forward_resume": hasattr(executor, "execute_forward_resume"),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


# ---------------------------------------------------------------------------------------------- #
# mc2-fjcj2 (R8-B-2): the owner-custody executor must RUN the frozen cleanup child, and must publish
# the v1 archive BEFORE it (q12-database-barrier.sh:640-645 refuses without a byte-exact archive).
# The literal process spawn is the one thing a unit driver cannot do against production PostgreSQL,
# so these modes override ONLY that seam — the same narrow, test-harness-only substitution the
# forward legs already use for the barrier's own argv. Everything else is the real production code:
# the argv resolution, the archive ordering, the failure diagnostics, and the artifact consumption.
# The real spawn against a live PG17 is proved by the MC2_Q12_REAL_PG17 full-window suite, which
# delegates to this same production implementation.
# ---------------------------------------------------------------------------------------------- #
def _seed_cleanup_predecessors(run_root: pathlib.Path) -> dict[str, Any]:
    run_id = FIXTURE.derive_run_id(run_root)
    expected_catalog_sha256 = CORE.sha256(
        f"q12:r8b2:expected-catalog:{run_id}".encode("utf-8")
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
    v1_body = CORE.complete_object(v1_receipt)
    _seed(run_root / "database-barrier-receipt.json", v1_body)
    probe_body = CORE.complete_object(
        FIXTURE._barrier_probe_object(run_id, expected_catalog_sha256)
    )
    probe_sha256 = _seed(run_root / "database-barrier-probe-receipt.json", probe_body)
    _seed(run_root / "secrets" / "db-capability", b"q12-capability-synthetic-sentinel\n")
    return {
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
        "v1_body": v1_body,
        "probe_sha256": probe_sha256,
        "context": {
            "run_root": str(run_root),
            "run_id": run_id,
            "expected_catalog_sha256": expected_catalog_sha256,
        },
    }


class _CapturingOwnerCustody(CORE.OwnerCustodyExecutor):
    """Records what production had already done when the child was launched, then stands in for the
    child by publishing exactly the artifact the frozen child publishes (the 18-key terminal proof).
    Never reimplements a production step: the archive, argv and promotion all come from the real
    class under test."""

    def __init__(self, seeded: dict[str, Any], child_exit: int = 0) -> None:
        super().__init__()
        self._seeded = seeded
        self._child_exit = child_exit
        self.observed: dict[str, Any] = {}

    def invoke_barrier_cleanup_child(self, argv: list[str]) -> None:
        run_root = pathlib.Path(self._seeded["context"]["run_root"])
        archive = run_root / "database-barrier-receipt-v1-before-cleanup.json"
        proof = run_root / "database-barrier-cleanup-terminal-proof.json"
        self.observed = {
            "child_argv": list(argv),
            "archive_existed_at_child_launch": archive.exists(),
            "archive_matched_v1_at_child_launch": archive.exists()
            and archive.read_bytes() == self._seeded["v1_body"],
            "archive_mode_at_child_launch": (
                archive.stat().st_mode & 0o777 if archive.exists() else None
            ),
            "terminal_proof_existed_at_child_launch": proof.exists(),
        }
        if self._child_exit != 0:
            raise CORE.LifecycleError(
                CORE._scrub_plan_secret_text(
                    f"barrier cleanup child failed with status {self._child_exit}: "
                    "q12 database barrier: refused for a named reason "
                    f"(dsn postgresql://q12:hunter2@pooler:5432/postgres, token {'b' * 64})"
                )
            )
        _seed(
            proof,
            _terminal_proof(self._seeded["run_id"], self._seeded["expected_catalog_sha256"]),
        )


def run_owner_custody_ownership(run_root_raw: str) -> int:
    report = {
        "owner_custody_defines_execute_barrier_cleanup": "execute_barrier_cleanup"
        in vars(CORE.OwnerCustodyExecutor),
        "owner_custody_defines_child_invoker": "invoke_barrier_cleanup_child"
        in vars(CORE.OwnerCustodyExecutor),
        "production_defines_execute_barrier_cleanup": "execute_barrier_cleanup"
        in vars(CORE.ProductionExecutor),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_owner_custody_cleanup(run_root_raw: str) -> int:
    run_root = pathlib.Path(run_root_raw)
    seeded = _seed_cleanup_predecessors(run_root)
    executor = _CapturingOwnerCustody(seeded)
    command = executor.prepare_barrier_cleanup(seeded["context"])
    outcome = executor.execute_barrier_cleanup(seeded["context"], command)

    expected_v2 = {
        "schema_version": "megacampus.q12.database-barrier-receipt/v2",
        "run_id": seeded["run_id"],
        "state": "guard_cleanup_complete",
        "expected_catalog_sha256": seeded["expected_catalog_sha256"],
        "zero_guard_residue": True,
        "last_command": "cleanup",
        "rollback_probes_verified": True,
        "probe_receipt_sha256": seeded["probe_sha256"],
        "terminal_proof_sha256": outcome["terminal_proof_sha256"],
        "database_capability_deleted": True,
    }
    receipt_path = run_root / "database-barrier-receipt.json"
    capability_path = run_root / "secrets" / "db-capability"
    report = {
        **executor.observed,
        "command": command,
        "outcome": outcome,
        "v2_matches_expected": receipt_path.read_bytes() == CORE.complete_object(expected_v2),
        "capability_exists": capability_path.exists() or capability_path.is_symlink(),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_owner_custody_child_fails(run_root_raw: str) -> int:
    """Drive the REAL ``invoke_barrier_cleanup_child`` — a real subprocess, the real returncode
    handling, the real secret scrub and the real env — by pointing the frozen argv at a stub that
    fails the way the frozen child fails. Nothing about the failure path is faked, which is what
    makes the scrub assertion meaningful."""
    run_root = pathlib.Path(run_root_raw)
    seeded = _seed_cleanup_predecessors(run_root)
    stub = run_root / "failing-cleanup-child.py"
    environment_dump = run_root / "child-environment.json"
    stub.write_text(
        "#!/usr/bin/python3\n"
        "import json, os, sys\n"
        f"json.dump(dict(os.environ), open({str(environment_dump)!r}, 'w'))\n"
        "sys.stderr.write(\n"
        "    'q12 database barrier: refused for a named reason '\n"
        "    '(dsn postgresql://q12:hunter2@pooler:5432/postgres, token ' + 'b' * 64 + ')\\n'\n"
        ")\n"
        "raise SystemExit(3)\n",
        encoding="utf-8",
    )
    stub.chmod(0o755)

    executor = CORE.OwnerCustodyExecutor()
    command = {"argv": [str(stub)], "command_sha256": CORE.sha256(CORE.canonical([str(stub)]))}
    error = ""
    error_type = ""
    try:
        executor.execute_barrier_cleanup(seeded["context"], command)
    except CORE.LifecycleError as raised:
        error, error_type = str(raised), "LifecycleError"
    except Exception as raised:  # noqa: BLE001 — an unnamed failure is itself the defect
        error, error_type = str(raised), type(raised).__name__

    child_environment: dict[str, str] = {}
    if environment_dump.exists():
        child_environment = json.loads(environment_dump.read_text(encoding="utf-8"))
    receipt_path = run_root / "database-barrier-receipt.json"
    capability_path = run_root / "secrets" / "db-capability"
    report = {
        "error": error,
        "error_type": error_type,
        "receipt_still_v1": receipt_path.read_bytes() == seeded["v1_body"],
        "capability_exists": capability_path.exists() or capability_path.is_symlink(),
        "child_ran": bool(child_environment),
        "child_env_keys": sorted(child_environment),
        "child_home": child_environment.get("HOME"),
        "expected_home": os.path.expanduser("~"),
        "child_env_has_test_overrides": any(
            key.startswith("MC2_Q12_") for key in child_environment
        ),
    }
    sys.stdout.write(json.dumps(report, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("usage: runner <mode> <run-root> [controller]")
    mode = sys.argv[1]
    run_root = sys.argv[2]
    if mode == "--file-artifact":
        return run_file_artifact(run_root)
    if mode == "--resume-failclosed":
        controller = sys.argv[3] if len(sys.argv) > 3 else "run_live"
        return run_resume_failclosed(run_root, controller)
    if mode == "--owner-custody-ownership":
        return run_owner_custody_ownership(run_root)
    if mode == "--owner-custody-cleanup":
        return run_owner_custody_cleanup(run_root)
    if mode == "--owner-custody-child-fails":
        return run_owner_custody_child_fails(run_root)
    raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    raise SystemExit(main())
