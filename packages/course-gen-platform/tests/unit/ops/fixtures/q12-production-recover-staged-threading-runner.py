#!/usr/bin/python3
"""W7a: prove the PRODUCTION staged threading also fires on the RECOVER re-drive path.

``drive_forward_sequence`` is the ONE resumable forward driver ``run_live`` AND ``run_recover``
share (design §6b.2). Two entries of the generalized recover head-dispatch table RE-DRIVE a step
whose staged callback the next command depends on:

  * head 1 ``(barrier.install, completed) -> "writers.quiesce"`` re-drives pg.backup, and
    ``pg.restore`` consumes ``<immutable-generation>`` (codesign §D2 ``on_pg_backup_done``);
  * head 4 ``(barrier.prepare-recovery, completed) -> "source.forward"`` re-drives source.forward,
    and ``reindex.plan`` consumes ``<accepted-recovery-manifest-sha256>`` /
    ``<accepted-coverage-fingerprint>`` / ``<accepted-coverage-run>`` (§D2/§D3
    ``on_source_forward_accepted``).

``WindowSnapshotHold`` is already recover-aware for ``<exported-id>``; the two later staged
authorities must be too, or a production recover from either head fails closed at the NEXT command
with "unresolved command placeholder" — after C2 has already quiesced the production writers.

This harness drives the REAL ``drive_forward_sequence`` exactly as ``run_recover`` drives it (no
caller-supplied staged hook) and asserts the next consumer resolves. Infra-free: a FAKE
``OwnerCustodyExecutor`` subclass overrides only the authority-read seams (the W1 capture-subclass
pattern, codesign §D5a/§4), the injected ``ordinary`` resolves the real frozen-manifest command the
way ``Engine.append_ordinary_lifecycle`` does, and the engine is a stub carrying only the four
attributes the driven steps touch. No docker, no MC2_Q12_REAL_PG17, no /opt/megacampus write.

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


class _StopWalk(Exception):
    """Ends the driven walk at the step under observation (never a production code path)."""


class _StubEngine:
    """Only the attributes the driven steps read: the resource-manifest publication needs
    ``checkpoint_path``/``request``/``run_root``/``trace``, and the staged threading needs
    ``executor``/``run_root``. Everything else in the walk is injected."""

    def __init__(self, request: dict, run_root: pathlib.Path, executor: object) -> None:
        self.request = request
        self.run_root = run_root
        self.executor = executor
        self.checkpoint_path = run_root / "phase-checkpoint.json"
        self.trace: list[str] = []
        self.current_resource_manifest_sha256 = "0" * 64


def _request(run_id: str, recovery_run_id: str, quiesce_manifest: str) -> dict:
    return {
        "run_id": run_id,
        "production": True,
        "recovery_run_id": recovery_run_id,
        "expected_catalog_sha256": "c" * 64,
        "release_sha": "a" * 40,
        "quiesce_manifest_path": quiesce_manifest,
        "quiesce_manifest_sha256": "0" * 64,
    }


def _drive(resume_from: str, observed: str, seed: dict[str, str]) -> dict[str, object]:
    """Drive the real forward driver from ``resume_from`` the way run_recover does — WITHOUT any
    caller-supplied staged hook — and report whether ``observed`` resolved when it was reached."""
    out: dict[str, object] = {"resumeFrom": resume_from, "observed": observed}
    run_id = str(uuid.uuid4())
    recovery_run_id = str(uuid.uuid4())
    manifest = core.load_manifest()
    generation = f"/opt/megacampus/backups/supabase/generation-20260728T000000Z-{run_id}"
    acceptance = ("d" * 64, "e" * 64, f"catalog:{recovery_run_id}")

    class FakeExecutor(core.OwnerCustodyExecutor):
        # Override ONLY the authority-read seams; the staged threading itself is the real code.
        def read_pg_backup_generation(self, request, run_root):  # noqa: ANN001
            return generation

        def read_source_forward_acceptance(self, request, run_root):  # noqa: ANN001
            return acceptance

        def open_window_snapshot(self, request, run_root):  # noqa: ANN001
            return (f"FFFFFFFF-{run_id[:8]}-1", None)

        def close_window_snapshot(self, coordinator):  # noqa: ANN001
            return None

    with tempfile.TemporaryDirectory(prefix="mc2-q12-w7a-recover-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)
        quiesce_manifest = str(run_root / f"writer-quiesce-{run_id}.json")
        request = _request(run_id, recovery_run_id, quiesce_manifest)
        values = core.StagedValueResolver(quiesce_manifest, recovery_run_id)
        for placeholder, value in seed.items():
            values._set(placeholder, value)
        executor = FakeExecutor()
        engine = _StubEngine(request, run_root, executor)

        def ordinary(command_id: str, **_keywords: object) -> dict:
            if command_id == observed:
                try:
                    core.resolved_command(manifest, command_id, request, dict(values))
                    out["resolved"] = True
                except core.LifecycleError as error:
                    out["resolved"] = False
                    out["error"] = str(error)
                raise _StopWalk(command_id)
            # Every earlier step must itself resolve, or the harness is measuring the wrong gap.
            core.resolved_command(manifest, command_id, request, dict(values))
            return {}

        try:
            core.drive_forward_sequence(
                engine,
                request,
                manifest,
                values,
                b"{}",
                str(uuid.UUID(run_id)),
                {stage: str(run_root / f"rm-{stage}.json") for stage in ("genesis", "snapshot", "targets")},
                str(run_root / "quiesce-window-mode.json"),
                core.WindowSnapshotHold(request, executor, values, run_root),
                tuple(core.sha256(f"t{index}".encode("utf-8")) for index in range(5)),
                ordinary,
                lambda _operation: None,
                resume_from=resume_from,
            )
            out["reached"] = False
        except _StopWalk:
            out["reached"] = True
        except core.LifecycleError as error:
            # A pre-observation step failed to resolve: report it rather than silently passing.
            out["reached"] = False
            out["error"] = str(error)
    return out


def main() -> int:
    run_id = str(uuid.uuid4())
    head1 = _drive("writers.quiesce", "pg.restore", {})
    head4 = _drive(
        "source.forward",
        "reindex.plan",
        {
            "<exported-id>": f"FFFFFFFF-{run_id[:8]}-1",
            "<immutable-generation>": f"/opt/megacampus/backups/supabase/generation-20260728T000000Z-{run_id}",
        },
    )
    sys.stdout.write(json.dumps({"head1": head1, "head4": head4}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
