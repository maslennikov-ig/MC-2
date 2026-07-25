#!/usr/bin/python3
"""W7a real leg: prove the DEPLOYED OwnerCustodyExecutor.read_source_forward_acceptance BASE seam
reads the on-disk source.forward acceptance authority (written by the TS emit-entrypoint into the
run_root) and returns the exact ``(recovery_manifest_sha256, coverage_fingerprint, coverage_run)``
triple, whose coverage_run is the `catalog:<recovery-run-id>` authority token (amendment
2026-07-25) — mirroring the proven read_pg_backup_generation pattern (parse + validate + fail-closed).

Infra-free: no docker/source/Qdrant — a plain on-disk authority JSON in a /tmp run_root. Prints ONE
JSON object; the TS test asserts on it. This is the read half of the real leg; the write half is the
TS emit-entrypoint + source-recovery-run.sh forward wiring; the real values are window-grade (W7).
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE = REPO / "deploy/qdrant/q12-lifecycle-core.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)

AUTHORITY_NAME = "source-forward-acceptance.json"


def _write(run_root: pathlib.Path, payload: object) -> None:
    (run_root / AUTHORITY_NAME).write_text(json.dumps(payload), encoding="utf-8")


def main() -> int:
    out: dict[str, object] = {}
    recovery_run_id = str(uuid.uuid4())
    request = {
        "run_id": str(uuid.uuid4()),
        "production": True,
        "recovery_run_id": recovery_run_id,
    }
    manifest_sha = "a" * 64
    fingerprint = "b" * 64
    coverage_run = f"catalog:{recovery_run_id}"
    executor = core.OwnerCustodyExecutor()

    # The seam exists on the DEPLOYED executor.
    out["hasSeam"] = hasattr(executor, "read_source_forward_acceptance")

    # (1) a valid authority round-trips to the exact triple.
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-ok-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)
        _write(run_root, {
            "schema": "megacampus.q12.source-forward-acceptance/v1",
            "recovery_manifest_sha256": manifest_sha,
            "coverage_fingerprint": fingerprint,
            "coverage_run": coverage_run,
        })
        try:
            got = executor.read_source_forward_acceptance(request, run_root)
            out["readOk"] = got == (manifest_sha, fingerprint, coverage_run)
            out["error"] = None
        except core.LifecycleError as exc:
            out["readOk"] = False
            out["error"] = str(exc)

    # (2) missing authority fails closed.
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-missing-") as tmp:
        run_root = pathlib.Path(tmp)
        missing_failed = False
        try:
            executor.read_source_forward_acceptance(request, run_root)
        except core.LifecycleError:
            missing_failed = True
        out["missingFailsClosed"] = missing_failed

    # (3) malformed sha256 fails closed (never a silent pass).
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-badsha-") as tmp:
        run_root = pathlib.Path(tmp)
        _write(run_root, {
            "recovery_manifest_sha256": "not-a-sha",
            "coverage_fingerprint": fingerprint,
            "coverage_run": coverage_run,
        })
        bad_sha_failed = False
        try:
            executor.read_source_forward_acceptance(request, run_root)
        except core.LifecycleError:
            bad_sha_failed = True
        out["malformedShaFailsClosed"] = bad_sha_failed

    # (4) malformed coverage_run (not a catalog:<recovery-run-id> token) fails closed.
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-badrun-") as tmp:
        run_root = pathlib.Path(tmp)
        _write(run_root, {
            "recovery_manifest_sha256": manifest_sha,
            "coverage_fingerprint": fingerprint,
            "coverage_run": "only-one-part",
        })
        bad_run_failed = False
        try:
            executor.read_source_forward_acceptance(request, run_root)
        except core.LifecycleError:
            bad_run_failed = True
        out["malformedRunFailsClosed"] = bad_run_failed

    # (5) the legacy org:course:run ledger triple is no longer an authority and fails closed.
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-legacy-") as tmp:
        run_root = pathlib.Path(tmp)
        _write(run_root, {
            "recovery_manifest_sha256": manifest_sha,
            "coverage_fingerprint": fingerprint,
            "coverage_run": f"{uuid.uuid4()}:{uuid.uuid4()}:{uuid.uuid4()}",
        })
        legacy_failed = False
        try:
            executor.read_source_forward_acceptance(request, run_root)
        except core.LifecycleError:
            legacy_failed = True
        out["legacyTripleFailsClosed"] = legacy_failed

    # (6) a well-formed token naming ANOTHER recovery run fails closed (defense in depth: the
    # wrapper and the TS adapter enforce the same equality, so all three layers must agree).
    with tempfile.TemporaryDirectory(prefix="mc2-q12-sfa-foreign-") as tmp:
        run_root = pathlib.Path(tmp)
        _write(run_root, {
            "recovery_manifest_sha256": manifest_sha,
            "coverage_fingerprint": fingerprint,
            "coverage_run": f"catalog:{uuid.uuid4()}",
        })
        foreign_failed = False
        try:
            executor.read_source_forward_acceptance(request, run_root)
        except core.LifecycleError:
            foreign_failed = True
        out["foreignRunFailsClosed"] = foreign_failed

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
