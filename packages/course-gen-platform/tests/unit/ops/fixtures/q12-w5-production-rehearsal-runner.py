#!/usr/bin/python3
"""W5 production-rehearsal harness (plan Task 5): the newly-wired production value machinery
end-to-end against a disposable PostgreSQL 17.10 source.

This drives the REAL production functions (no fakes) as an integration:
  1. resolve_window_values(production request) -> opens the REAL W3 window snapshot
     (OwnerCustodyExecutor.open_window_snapshot: real pg_export_snapshot() <exported-id> + a real
     0400 baseline.json) and seeds a StagedValueResolver;
  2. persist_staged_values -> the run-root staged-values authority (0400);
  3. load_staged_values -> reload it and prove resolved_command("pg.backup") recomputes a
     BYTE-IDENTICAL command_sha256 on the recover twin (D5J determinism, D3);
  4. close_window_snapshot -> release the held source session cleanly;
  5. accept_real_run(D4) -> accept on a terminal receipt + real coverage, reject a non-zero child.

Explicit IN-WINDOW-only residual (#21, bounded to W7 / the full-window production harness): the FULL
run_live forward window with the real database-barrier dual-bind, and the real data-movement children
(pg.backup / pg.restore / source.forward / reindex.* / deploy.*) against the real source + target +
Qdrant + nginx, are NOT exercised here — they need the production stack and the owner-gated window.

Prints one JSON result object to stdout; the TypeScript test asserts on it. No production path is
mutated; the manifest tool is byte-untouched; run_root is an ephemeral /tmp dir (no /opt/megacampus).
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE = REPO / "deploy/qdrant/q12-lifecycle-core.py"
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
IMAGE = "postgres:17.10-bookworm"
PW = "q12-w5-rehearsal-pw"

_spec = importlib.util.spec_from_file_location("q12_core", CORE)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)

SEED = """
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigint PRIMARY KEY, schedule text NOT NULL, command text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost', nodeport int NOT NULL DEFAULT 5432,
  database text NOT NULL DEFAULT 'postgres', username text NOT NULL DEFAULT 'postgres',
  active boolean NOT NULL DEFAULT true);
INSERT INTO cron.job (jobid, schedule, command)
  SELECT g, '*/5 * * * *', 'select ' || g FROM generate_series(1,8) g;
CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260101000000');
CREATE TABLE public.courses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
"""


def main() -> int:
    cid = f"mc2-q12-w5-src-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [DOCKER, "run", "-d", "--name", cid, "-e", f"POSTGRES_PASSWORD={PW}",
         "-p", "127.0.0.1::5432", IMAGE],
        check=True, capture_output=True,
    )

    def dexec(sql: str) -> None:
        result = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"seed failed: {result.stderr.strip()}")

    try:
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)
        dexec(SEED)

        run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w5-root-", dir="/tmp"))
        run_root.chmod(0o700)
        published = subprocess.run(
            [DOCKER, "port", cid, "5432/tcp"], capture_output=True, text=True
        ).stdout.strip()
        port = published.rsplit(":", 1)[-1]
        work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w5-work-", dir="/tmp"))
        service_file = work / "source.service"
        service_file.write_text(
            f"[q12plan]\nhost=127.0.0.1\nport={port}\ndbname=postgres\nuser=postgres\n"
            f"password={PW}\nsslmode=disable\n"
        )
        service_file.chmod(0o600)
        service_env = {"PGSERVICEFILE": str(service_file), "PGSERVICE": "q12plan"}

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
        # The DEPLOYED window executor with the disposable PG17 source injected.
        executor = core.OwnerCustodyExecutor()
        executor.docker = DOCKER
        executor.source_container = None
        executor._source_service = service_env

        # (1) production fork: real snapshot + baseline + seeded resolver + HELD coordinator
        values, exported_id, coordinator = core.resolve_window_values(request, executor, run_root, qm)
        snapshot_shaped = bool(core.PLAN_SNAPSHOT_RE.fullmatch(exported_id))
        baseline_ok = (run_root / "baseline.json").exists()
        is_resolver = isinstance(values, core.StagedValueResolver)
        # P2c: no source-connection file left at rest in the durable run_root
        no_libpq_at_rest = not any(run_root.glob("libpq*"))

        # (2) persist the staged authority (0400)
        auth = core.persist_staged_values(run_root, run_id, values)
        auth_mode = oct(auth.stat().st_mode & 0o777)

        # (3) recover twin: reload the authority and prove pg.backup command_sha256 is byte-identical
        manifest = core.load_manifest()
        live_sha = core.resolved_command(manifest, "pg.backup", request, values)["command_sha256"]
        recovered = core.load_staged_values(run_root, run_id, qm, recovery_run_id)
        rec_sha = core.resolved_command(manifest, "pg.backup", request, recovered)["command_sha256"]
        determinism_ok = live_sha == rec_sha and exported_id in " ".join(
            core.resolved_command(manifest, "pg.backup", request, values)["argv"]
        )

        # (4) release the held source session cleanly
        executor.close_window_snapshot(coordinator)
        released = coordinator.poll() == 0

        # (5) D4 oracle: accept on a terminal receipt + real coverage; reject a non-zero child
        good_journal = {"coverage": f"{run_id}:course-x:run-y"}
        accepted = True
        try:
            core.accept_real_run([0, 0, 0], {"state": "guard_cleanup_complete"}, good_journal)
        except core.LifecycleError:
            accepted = False
        rejected_nonzero = False
        try:
            core.accept_real_run([0, 1], {"state": "guard_cleanup_complete"}, good_journal)
        except core.LifecycleError:
            rejected_nonzero = True

        sys.stdout.write(json.dumps({
            "snapshot_shaped": snapshot_shaped,
            "baseline_ok": baseline_ok,
            "is_resolver": is_resolver,
            "no_libpq_at_rest": no_libpq_at_rest,
            "auth_mode": auth_mode,
            "determinism_ok": determinism_ok,
            "released": released,
            "oracle_accepted": accepted,
            "oracle_rejected_nonzero": rejected_nonzero,
        }) + "\n")
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
