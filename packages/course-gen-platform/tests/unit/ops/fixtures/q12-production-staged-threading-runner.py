#!/usr/bin/python3
"""W7a increment 2 harness: prove the PRODUCTION drive-loop staged step
``resolve_pg_backup_generation`` threads ``on_pg_backup_done`` between pg.backup and pg.restore
(codesign 2026-07-20 §D2/§D3), unblocking pg.restore's ``<immutable-generation>`` and persisting the
staged value to the run-root authority.

Infra-free (no docker, no MC2_Q12_REAL_PG17, no /opt/megacampus writes): constructs a
``StagedValueResolver`` directly and a FAKE ``OwnerCustodyExecutor`` subclass whose
``read_pg_backup_generation`` returns a fixed shape-valid absolute generation path — the W1
capture-subclass pattern (codesign §D5a/§4). The real ``latest.json`` authority read is the
MC2_Q12_REAL_PG17 / W7-gated leg (plan Increment 5). run_root is an ephemeral /tmp dir.

Prints ONE JSON object to stdout; the TypeScript test asserts on it.
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
    manifest = core.load_manifest()
    # A shape-valid absolute generation dir exactly as the fresh pg.backup would publish
    # (backup-supabase.sh generation-<ts>-<uuid>; restore-supabase-drill.sh --generation guard).
    fake_generation = f"/opt/megacampus/backups/supabase/generation-20260721T000000Z-{run_id}"

    class FakeExecutor(core.OwnerCustodyExecutor):
        # Override ONLY the authority-read seam; all real execution logic is inherited unchanged.
        def read_pg_backup_generation(self, request, run_root):  # noqa: ANN001
            return fake_generation

    out["hasThreader"] = callable(getattr(core, "resolve_pg_backup_generation", None))
    out["hasSeam"] = callable(getattr(core.OwnerCustodyExecutor, "read_pg_backup_generation", None))

    with tempfile.TemporaryDirectory(prefix="mc2-q12-w7a-inc2-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)
        resolver = core.StagedValueResolver(qm, recovery_run_id)

        # (a) GAP proof: before the staged step, pg.restore cannot resolve — <immutable-generation> unset.
        try:
            core.resolved_command(manifest, "pg.restore", request, dict(resolver))
            out["restoreBlockedBefore"] = False
        except core.LifecycleError as error:
            out["restoreBlockedBefore"] = "unresolved command placeholder" in str(error)

        executor = FakeExecutor()
        try:
            auth = core.resolve_pg_backup_generation(executor, resolver, request, run_root)
            out["threaded"] = True
        except Exception as error:  # noqa: BLE001 — report any failure to the TS assertion layer
            out["threaded"] = False
            out["error"] = f"{type(error).__name__}: {error}"
            sys.stdout.write(json.dumps(out))
            return 0

        # (b) resolver advanced: <immutable-generation> now holds the fake authority path.
        out["generationResolved"] = resolver.value("<immutable-generation>") == fake_generation
        # (c) pg.restore now resolves and its argv carries the real generation path.
        restore = core.resolved_command(manifest, "pg.restore", request, dict(resolver))
        out["restoreResolvesAfter"] = fake_generation in restore["argv"]
        # (d) §D3: the persisted run-root authority carries the staged value (single compose↔claim
        # authority), owner-only 0400.
        persisted = json.loads(pathlib.Path(auth).read_bytes())
        out["authorityPersisted"] = persisted.get("<immutable-generation>") == fake_generation
        out["authorityMode"] = oct(pathlib.Path(auth).stat().st_mode & 0o777)
        # (e) recover-determinism seed: reload the authority → byte-identical pg.restore command_sha256.
        recovered = core.load_staged_values(run_root, run_id, qm, recovery_run_id)
        rec_sha = core.resolved_command(manifest, "pg.restore", request, recovered)["command_sha256"]
        out["recoverDeterministic"] = restore["command_sha256"] == rec_sha

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
