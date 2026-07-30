#!/usr/bin/python3
"""W7a increment 3 harness: prove the PRODUCTION drive-loop staged step
``resolve_source_forward_acceptance`` threads ``on_source_forward_accepted`` between source.forward
and reindex.plan (codesign 2026-07-20 §D2/§D3), unblocking the three ``<accepted-*>`` placeholders
reindex.plan consumes and persisting them to the run-root authority.

Infra-free (no operator stack, no MC2_Q12_REAL_PG17): a FAKE ``OwnerCustodyExecutor`` subclass whose
``read_source_forward_acceptance`` returns fixed shape-valid values — the W1 capture-subclass pattern.
The REAL acceptance read (recovery manifest sha + coverage fingerprint/run, owned by the TS
source-recovery acceptance authority) is the MC2_Q12_REAL_PG17 / W7-gated leg (plan Increment 5); the
base ``OwnerCustodyExecutor.read_source_forward_acceptance`` fail-closes with a named W5/W7 refusal.

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
    fake_sha = "d" * 64
    fake_fingerprint = "e" * 64
    fake_run = f"catalog:{recovery_run_id}"

    class FakeExecutor(core.OwnerCustodyExecutor):
        # Override ONLY the acceptance-read seam; all real execution logic inherited unchanged.
        def read_source_forward_acceptance(self, request, run_root):  # noqa: ANN001
            return (fake_sha, fake_fingerprint, fake_run)

    out["hasThreader"] = callable(getattr(core, "resolve_source_forward_acceptance", None))
    out["hasSeam"] = callable(
        getattr(core.OwnerCustodyExecutor, "read_source_forward_acceptance", None)
    )
    # W7a real leg: the base seam now READS the on-disk source.forward acceptance authority and must
    # fail closed when it is absent (never a silent success). Use a guaranteed-empty run root.
    out["baseSeamFailsClosedOnMissing"] = False
    with tempfile.TemporaryDirectory(prefix="mc2-q12-inc3-empty-") as empty:
        try:
            core.OwnerCustodyExecutor().read_source_forward_acceptance(request, pathlib.Path(empty))
        except core.LifecycleError as error:
            out["baseSeamFailsClosedOnMissing"] = (
                "missing" in str(error) or "acceptance" in str(error)
            )
        except Exception:  # noqa: BLE001
            out["baseSeamFailsClosedOnMissing"] = False

    with tempfile.TemporaryDirectory(prefix="mc2-q12-w7a-inc3-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)
        resolver = core.StagedValueResolver(qm, recovery_run_id)

        # (a) GAP proof: before the staged step, reindex.plan cannot resolve — the three <accepted-*>
        # placeholders are unset.
        try:
            core.resolved_command(manifest, "reindex.plan", request, dict(resolver))
            out["reindexBlockedBefore"] = False
        except core.LifecycleError as error:
            out["reindexBlockedBefore"] = "unresolved command placeholder" in str(error)

        executor = FakeExecutor()
        try:
            auth = core.resolve_source_forward_acceptance(executor, resolver, request, run_root)
            out["threaded"] = True
        except Exception as error:  # noqa: BLE001
            out["threaded"] = False
            out["error"] = f"{type(error).__name__}: {error}"
            sys.stdout.write(json.dumps(out))
            return 0

        # (b) resolver advanced: all three accepted placeholders now hold the fake values.
        out["acceptanceResolved"] = (
            resolver.value("<accepted-recovery-manifest-sha256>") == fake_sha
            and resolver.value("<accepted-coverage-fingerprint>") == fake_fingerprint
            and resolver.value("<accepted-coverage-run>") == fake_run
        )
        # (c) reindex.plan now resolves and its argv carries the accepted values.
        reindex = core.resolved_command(manifest, "reindex.plan", request, dict(resolver))
        out["reindexResolvesAfter"] = all(
            value in reindex["argv"] for value in (fake_sha, fake_fingerprint, fake_run)
        )
        # (d) §D3 single authority: persisted + owner-only 0400.
        persisted = json.loads(pathlib.Path(auth).read_bytes())
        out["authorityPersisted"] = (
            persisted.get("<accepted-recovery-manifest-sha256>") == fake_sha
            and persisted.get("<accepted-coverage-fingerprint>") == fake_fingerprint
            and persisted.get("<accepted-coverage-run>") == fake_run
        )
        out["authorityMode"] = oct(pathlib.Path(auth).stat().st_mode & 0o777)
        # (e) recover-determinism: reload authority → byte-identical reindex.plan command_sha256.
        recovered = core.load_staged_values(run_root, run_id, qm, recovery_run_id)
        rec_sha = core.resolved_command(manifest, "reindex.plan", request, recovered)["command_sha256"]
        out["recoverDeterministic"] = reindex["command_sha256"] == rec_sha

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
