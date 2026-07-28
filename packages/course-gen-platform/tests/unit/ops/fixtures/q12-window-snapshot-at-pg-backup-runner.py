#!/usr/bin/python3
"""mc2-6fnrt harness: the W3 window snapshot coordinator must open AT the pg.backup step, not
before ``barrier.install``.

FOUND ON PRODUCTION 2026-07-28 (window attempt #9). ``prepare_window_source`` published the
pre-maintenance baseline and then opened+HELD the snapshot coordinator, and ``run_live`` kept that
held source session alive across the whole group-2 ``barrier.install``. The frozen barrier's
``quiesce_client_backends()`` terminates EVERY client backend except its own pid and exactly-idle
``supabase_admin`` — so the barrier kills the controller's own coordinator, and the controller then
fails closed on the dead session. The W2/W3 codesign
(docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md:62,94) always said the
real ``<exported-id>`` is "resolved at pg.backup open"; the implementation resolved it upfront.

This harness is INFRA-FREE (no docker, no live PostgreSQL, no /opt/megacampus writes). It proves
four things:

  1. SPLIT SEAM     — ``publish_window_baseline`` publishes baseline.json WITHOUT opening a
                      coordinator, and ``open_window_snapshot`` opens+holds one WITHOUT producing a
                      baseline. The pre-maintenance baseline must still be captured before
                      barrier.install (cron active + writable); only the HELD session moves.
  2. FORK           — production ``resolve_window_values`` publishes the baseline and opens NOTHING.
  3. STAGED HOLD    — ``WindowSnapshotHold.exported_id()`` opens the coordinator on FIRST call,
                      resolves ``<exported-id>``, persists the run-root staged authority, unblocks
                      pg.backup's argv, reuses (never re-opens) on a second call, and ``release()``
                      closes the held session exactly once.
  4. CALL-SITE ORDER— a REAL full fixture ``run_live`` window drive, with the hold class wrapped by
                      a recorder, shows the first ``exported_id()`` call happens when
                      ``barrier.install`` is ALREADY durably completed and NO ``pg.backup`` row
                      exists yet — i.e. after the barrier's client quiesce, at the pg.backup step.

Prints ONE JSON object to stdout; the TypeScript test asserts on it.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
import uuid
from typing import Any

FIXTURES = pathlib.Path(__file__).resolve().parent
REPO = FIXTURES.parents[5]
RETAINED_RUNNER = FIXTURES / "q12-retained-barrier-runner.py"

_spec = importlib.util.spec_from_file_location("q12_retained_runner", RETAINED_RUNNER)
retained = importlib.util.module_from_spec(_spec)
sys.modules["q12_retained_runner"] = retained
_spec.loader.exec_module(retained)
core = retained.CORE

QUIESCE_MANIFEST = "/opt/megacampus/backups/q12/x/writer-quiesce-x.json"


class _SentinelCoordinator:
    """Stand-in for the held psql child; identity-compared, never spoken to."""


def _write_quiesce_manifest(path: pathlib.Path, run_id: str) -> None:
    """The writer-quiesce/v1 preimage a full fixture window consumes (same shape the live-controller
    and full-window harnesses build; copied rather than imported so this runner stays infra-free)."""

    def writer(klass: str, service: str, index: int) -> dict[str, Any]:
        digit = str(index % 10)
        return {
            "class": klass,
            "id": digit * 64,
            "name": f"megacampus-{service}",
            "project": (
                "megacampus-blue" if klass in ("production-api", "production-web") else "megacampus"
            ),
            "service": service,
            "config_files": "/opt/megacampus/docker-compose.production.yml",
            "working_dir": "/opt/megacampus",
            "image_id": f"sha256:{digit * 64}",
            "image_ref": f"ghcr.io/megacampus/{service}@sha256:{digit * 64}",
            "prior_running": True,
            "prior_status": "running",
            "healthcheck_present": service in ("api", "web"),
            "prior_health_status": "healthy" if service in ("api", "web") else None,
            "prior_restart_policy": {"name": "unless-stopped", "maximum_retry_count": 0},
            "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
        }

    services = ["api", "web", "worker", "worker-stage6", "worker-stage7"]
    kind = lambda service: "api" if service == "api" else "web" if service == "web" else "worker"
    writers = [writer(f"production-{kind(s)}", s, i + 1) for i, s in enumerate(services)]
    writers += [writer(f"development-{kind(s)}", f"{s}-dev", i + 6) for i, s in enumerate(services)]
    value = {
        "schema_version": "megacampus.q12.writer-quiesce/v1",
        "run_id": run_id,
        "status": "quiesced",
        "barrier": {
            "state": "recovery_ready_guarded",
            "zero_guard_residue": False,
            "expected_catalog_sha256": "a" * 64,
            "probe_receipt_sha256": "b" * 64,
        },
        "writers": writers,
    }
    path.write_bytes(core.complete_object(value))
    path.chmod(0o400)


def _seam_split(out: dict[str, Any]) -> None:
    """(1) The executor exposes the baseline producer and the coordinator opener SEPARATELY."""
    out["hasPublishWindowBaseline"] = callable(
        getattr(core.OwnerCustodyExecutor, "publish_window_baseline", None)
    )
    out["hasOpenWindowSnapshot"] = callable(
        getattr(core.OwnerCustodyExecutor, "open_window_snapshot", None)
    )
    out["hasHold"] = callable(getattr(core, "WindowSnapshotHold", None))
    if not (out["hasPublishWindowBaseline"] and out["hasOpenWindowSnapshot"] and out["hasHold"]):
        return

    calls = {"baseline": 0, "open": 0, "close": 0}
    sentinel = _SentinelCoordinator()

    def fake_baseline(self, request, workdir, run_root):  # noqa: ANN001
        calls["baseline"] += 1
        path = pathlib.Path(run_root) / "baseline.json"
        core.immutable_publish(path, core.complete_object({"baseline": {"probe": "v"}}), 0o400, [])
        return path

    def fake_open(self, request, workdir):  # noqa: ANN001
        calls["open"] += 1
        return sentinel, "ffffffff-ffffffff-1"

    def fake_close(self, proc):  # noqa: ANN001
        assert proc is sentinel, proc
        calls["close"] += 1

    original = (
        core.SourceSnapshotSeam.produce_baseline,
        core.SourceSnapshotSeam.open_snapshot,
        core.SourceSnapshotSeam.close_snapshot,
    )
    core.SourceSnapshotSeam.produce_baseline = fake_baseline
    core.SourceSnapshotSeam.open_snapshot = fake_open
    core.SourceSnapshotSeam.close_snapshot = fake_close
    try:
        executor = core.OwnerCustodyExecutor()
        request = {"run_id": str(uuid.uuid4())}
        with tempfile.TemporaryDirectory(prefix="mc2-q12-6fnrt-seam-") as tmp:
            root = pathlib.Path(tmp)
            root.chmod(0o700)
            baseline_path = executor.publish_window_baseline(request, root)
            # The baseline leg publishes 0400 baseline.json and opens NO coordinator.
            out["baselineLegPublishes"] = pathlib.Path(baseline_path).exists()
            out["baselineLegMode"] = oct(pathlib.Path(baseline_path).stat().st_mode & 0o777)
            out["baselineLegOpensNothing"] = calls == {"baseline": 1, "open": 0, "close": 0}
            # The coordinator leg opens+HOLDS and produces NO second baseline.
            exported_id, coordinator = executor.open_window_snapshot(request, root)
            out["openLegExportedId"] = exported_id
            out["openLegHolds"] = coordinator is sentinel
            out["openLegProducesNoBaseline"] = calls == {"baseline": 1, "open": 1, "close": 0}
            executor.close_window_snapshot(coordinator)
            out["openLegReleases"] = calls["close"] == 1
            # No libpq service file may survive at rest in the durable run root.
            out["noLibpqAtRest"] = not any(
                entry.name.startswith("pgservice") or entry.suffix == ".conf"
                for entry in root.iterdir()
            )
    finally:
        (
            core.SourceSnapshotSeam.produce_baseline,
            core.SourceSnapshotSeam.open_snapshot,
            core.SourceSnapshotSeam.close_snapshot,
        ) = original


def _fork(out: dict[str, Any]) -> None:
    """(2) Production ``resolve_window_values`` publishes the baseline and opens NOTHING."""
    opened = {"count": 0}

    class NoOpenExecutor:
        def publish_window_baseline(self, request, run_root):  # noqa: ANN001
            path = pathlib.Path(run_root) / "baseline.json"
            path.write_text("{}\n", encoding="utf-8")
            return path

        def open_window_snapshot(self, request, run_root):  # noqa: ANN001
            opened["count"] += 1
            raise AssertionError("the fork must not open the window snapshot coordinator")

    recovery_run_id = str(uuid.uuid4())
    request = {
        "run_id": str(uuid.uuid4()),
        "production": True,
        "recovery_run_id": recovery_run_id,
    }
    with tempfile.TemporaryDirectory(prefix="mc2-q12-6fnrt-fork-") as tmp:
        root = pathlib.Path(tmp)
        root.chmod(0o700)
        values = core.resolve_window_values(request, NoOpenExecutor(), root, QUIESCE_MANIFEST)
        out["forkReturnsResolver"] = isinstance(values, core.StagedValueResolver)
        out["forkOpenedCount"] = opened["count"]
        out["forkPublishedBaseline"] = (root / "baseline.json").exists()
        # <exported-id> is NOT resolved yet: nothing before pg.backup may consume it.
        try:
            values.value("<exported-id>")
            out["forkExportedIdUnresolved"] = False
        except core.LifecycleError:
            out["forkExportedIdUnresolved"] = True
        # The upfront authorities are still seeded.
        out["forkUpfrontSeeded"] = (
            values.value("<quiesce-manifest>") == QUIESCE_MANIFEST
            and values.value("<recovery-run-id>") == recovery_run_id
        )


def _staged_hold(out: dict[str, Any]) -> None:
    """(3) The hold opens on first use, persists, unblocks pg.backup, reuses, and releases once."""
    if not callable(getattr(core, "WindowSnapshotHold", None)):
        return
    manifest = core.load_manifest()
    run_id = str(uuid.uuid4())
    recovery_run_id = str(uuid.uuid4())
    request = {
        "run_id": run_id,
        "production": True,
        "recovery_run_id": recovery_run_id,
        "expected_catalog_sha256": "c" * 64,
        "release_sha": "a" * 40,
    }
    exported = "abcdef01-23456789-1"
    sentinel = _SentinelCoordinator()
    calls = {"open": 0, "close": 0}

    class CountingExecutor:
        def open_window_snapshot(self, request, run_root):  # noqa: ANN001
            calls["open"] += 1
            return exported, sentinel

        def close_window_snapshot(self, coordinator):  # noqa: ANN001
            assert coordinator is sentinel, coordinator
            calls["close"] += 1

    with tempfile.TemporaryDirectory(prefix="mc2-q12-6fnrt-hold-") as tmp:
        run_root = pathlib.Path(tmp)
        run_root.chmod(0o700)
        resolver = core.StagedValueResolver(QUIESCE_MANIFEST, recovery_run_id)
        # GAP: before the staged open, pg.backup cannot resolve its argv.
        try:
            core.resolved_command(manifest, "pg.backup", request, dict(resolver))
            out["backupBlockedBefore"] = False
        except core.LifecycleError as error:
            out["backupBlockedBefore"] = "unresolved command placeholder" in str(error)

        hold = core.WindowSnapshotHold(request, CountingExecutor(), resolver, run_root)
        out["holdIdleBeforeUse"] = calls["open"] == 0
        first = hold.exported_id()
        out["holdExportedId"] = first == exported
        out["holdOpenedOnce"] = calls["open"] == 1
        out["holdHolds"] = hold.coordinator is sentinel
        out["holdResolved"] = resolver.value("<exported-id>") == exported
        # pg.backup's argv now carries the live snapshot id.
        backup = core.resolved_command(manifest, "pg.backup", request, dict(resolver))
        out["backupResolvesAfter"] = exported in backup["argv"]
        # D3: the run-root staged authority carries it, so a recover re-drive is byte-identical.
        authority = core.staged_values_authority_path(run_root, run_id)
        persisted = json.loads(authority.read_bytes())
        out["holdPersisted"] = persisted.get("<exported-id>") == exported
        out["holdAuthorityMode"] = oct(authority.stat().st_mode & 0o777)
        # A second use (deploy.prepare's targets manifest) REUSES — it must not open a second session.
        out["holdReuses"] = hold.exported_id() == exported and calls["open"] == 1
        hold.release()
        out["holdReleasedOnce"] = calls["close"] == 1 and hold.coordinator is None
        hold.release()
        out["holdReleaseIdempotent"] = calls["close"] == 1
        # An already-resolved authority (recover re-drive past pg.backup) never re-opens.
        reloaded = core.load_staged_values(run_root, run_id, QUIESCE_MANIFEST, recovery_run_id)
        second_hold = core.WindowSnapshotHold(request, CountingExecutor(), reloaded, run_root)
        out["holdRecoverReuses"] = second_hold.exported_id() == exported and calls["open"] == 1


def _call_site_order(out: dict[str, Any]) -> None:
    """(4) A REAL fixture ``run_live`` window: the FIRST exported_id() call sees barrier.install
    durably completed and NO pg.backup row — the codesign's "at pg.backup open" call site."""
    if not callable(getattr(core, "WindowSnapshotHold", None)):
        return
    observations: list[dict[str, Any]] = []
    base = core.WindowSnapshotHold

    class RecordingHold(base):
        def exported_id(self):
            journal = pathlib.Path(self._run_root) / "phase.jsonl"
            rows = []
            if journal.exists():
                rows = [
                    json.loads(line)
                    for line in journal.read_bytes().splitlines()
                    if line.strip()
                ]
            observations.append(
                {
                    "installCompleted": any(
                        row.get("command_id") == "barrier.install"
                        and row.get("outcome") == "completed"
                        for row in rows
                    ),
                    "pgBackupRows": sum(
                        1 for row in rows if row.get("command_id") == "pg.backup"
                    ),
                    "rowCount": len(rows),
                }
            )
            return super().exported_id()

    core.WindowSnapshotHold = RecordingHold
    try:
        root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-6fnrt-"))
        root.chmod(0o700)
        run_id = retained.derive_run_id(root)
        holder = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-6fnrt-qm-"))
        holder.chmod(0o700)
        quiesce_path = holder / f"writer-quiesce-{run_id}.json"
        _write_quiesce_manifest(quiesce_path, run_id)
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            status = retained.run_live_fixture(
                {
                    "runRoot": str(root),
                    "liveController": True,
                    "runId": run_id,
                    "quiesceManifestPath": str(quiesce_path),
                }
            )
        out["fixtureDriveStatus"] = status
        out["observations"] = observations
        if observations:
            first = observations[0]
            out["opensAfterInstall"] = first["installCompleted"] is True
            out["opensBeforePgBackup"] = first["pgBackupRows"] == 0
        journal = pathlib.Path(root) / "phase.jsonl"
        rows = [
            json.loads(line) for line in journal.read_bytes().splitlines() if line.strip()
        ]
        out["fixtureRowCount"] = len(rows)
        out["fixturePgBackupRan"] = any(row.get("command_id") == "pg.backup" for row in rows)
    finally:
        core.WindowSnapshotHold = base


def main() -> int:
    out: dict[str, Any] = {}
    for stage in (_seam_split, _fork, _staged_hold, _call_site_order):
        try:
            stage(out)
        except Exception as error:  # noqa: BLE001 — report to the TS assertion layer
            out[f"error_{stage.__name__}"] = f"{type(error).__name__}: {error}"
    sys.stdout.write(json.dumps(out, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
