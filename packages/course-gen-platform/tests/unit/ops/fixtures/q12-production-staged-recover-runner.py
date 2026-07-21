#!/usr/bin/python3
"""W7a increment 4 harness: prove the production staged-threading path is RECOVER re-drive-safe
(codesign §D2/§D3 resolve-once). A recover reconstructs the resolver from the persisted run-root
authority (``load_staged_values``); re-driving a staged step must byte-match the persisted value
(idempotent) or fail closed as DRIFT — never silently corrupt the authority.

Infra-free: FAKE ``OwnerCustodyExecutor`` subclasses whose ``read_pg_backup_generation`` returns a
chosen value (same-again vs drifted). Prints ONE JSON object; the TS test asserts on it.
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


def _fake_executor(generation: str):
    class FakeExecutor(core.OwnerCustodyExecutor):
        def read_pg_backup_generation(self, request, run_root):  # noqa: ANN001
            return generation

    return FakeExecutor()


def main() -> int:
    out: dict[str, object] = {}
    run_id = str(uuid.uuid4())
    recovery_run_id = str(uuid.uuid4())
    qm = "/opt/megacampus/backups/q12/x/writer-quiesce-x.json"
    request = {
        "run_id": run_id,
        "production": True,
        "recovery_run_id": recovery_run_id,
        "expected_catalog_sha256": "c" * 64,
        "release_sha": "a" * 40,
    }
    gen_a = f"/opt/megacampus/backups/supabase/generation-20260721T000000Z-{run_id}"
    gen_b = f"/opt/megacampus/backups/supabase/generation-20260721T111111Z-{run_id}"

    with tempfile.TemporaryDirectory(prefix="mc2-q12-w7a-inc4-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)

        # Live forward run: resolve + persist the generation authority.
        resolver = core.StagedValueResolver(qm, recovery_run_id)
        auth = core.resolve_pg_backup_generation(_fake_executor(gen_a), resolver, request, run_root)
        first = json.loads(pathlib.Path(auth).read_bytes()).get("<immutable-generation>")

        # (1) recover re-drive with the SAME value is idempotent: reconstruct from the authority, then
        # re-resolve the same generation — no raise, authority byte-stable.
        recovered = core.load_staged_values(run_root, run_id, qm, recovery_run_id)
        idempotent = True
        try:
            core.resolve_pg_backup_generation(_fake_executor(gen_a), recovered, request, run_root)
        except core.LifecycleError:
            idempotent = False
        after_same = json.loads(pathlib.Path(auth).read_bytes()).get("<immutable-generation>")
        out["idempotentSameValue"] = idempotent and after_same == first == gen_a

        # (2) recover re-drive with a DRIFTED value fails closed and does NOT corrupt the authority.
        recovered2 = core.load_staged_values(run_root, run_id, qm, recovery_run_id)
        drift_failed = False
        try:
            core.resolve_pg_backup_generation(_fake_executor(gen_b), recovered2, request, run_root)
        except core.LifecycleError:
            drift_failed = True
        after_drift = json.loads(pathlib.Path(auth).read_bytes()).get("<immutable-generation>")
        out["driftFailsClosed"] = drift_failed
        out["authorityUncorrupted"] = after_drift == gen_a

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
