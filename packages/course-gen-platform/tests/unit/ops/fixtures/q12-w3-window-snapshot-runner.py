#!/usr/bin/python3
"""Real-PG17 harness for the W3-struct window snapshot seam (plan Task 1, live leg).

Self-manages a disposable Supabase-shaped source and exercises
OwnerCustodyExecutor.open_window_snapshot against it through the real host PostgreSQL 17
client over libpq (the production route), via a loopback service file to the container's
published port. Proves that the window executor (not just LivePlanExecutor) can:
  * publish a 0400 pre-maintenance baseline.json (OQ6), and
  * open+HOLD a REAL pg_export_snapshot() coordinator whose <exported-id> (OQ5) is
    snapshot-shaped and still live (poll() is None) until close_window_snapshot releases it.
Prints one JSON result object to stdout; the TypeScript test asserts on it. No production
path is touched; the manifest tool is byte-untouched.
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
PW = "q12-w3-window-snapshot-pw"

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
    cid = f"mc2-q12-w3-src-{os.getpid()}-{int(time.time())}"
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

        work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w3-work-", dir="/tmp"))
        run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-w3-root-", dir="/tmp"))
        run_root.chmod(0o700)
        published = subprocess.run(
            [DOCKER, "port", cid, "5432/tcp"], capture_output=True, text=True
        ).stdout.strip()
        port = published.rsplit(":", 1)[-1]
        service_file = work / "source.service"
        service_file.write_text(
            f"[q12plan]\nhost=127.0.0.1\nport={port}\ndbname=postgres\nuser=postgres\n"
            f"password={PW}\nsslmode=disable\n"
        )
        service_file.chmod(0o600)
        service_env = {"PGSERVICEFILE": str(service_file), "PGSERVICE": "q12plan"}

        request = {"run_root": str(run_root), "run_id": str(uuid.uuid4())}
        # The DEPLOYED window executor — not LivePlanExecutor — reaching the real source.
        executor = core.OwnerCustodyExecutor()
        executor.docker = DOCKER
        executor.source_container = None
        executor._source_service = service_env

        # mc2-6fnrt: the two legs are now separate — the pre-maintenance baseline is published
        # before barrier.install, the HELD coordinator is opened later, at the pg.backup step.
        baseline_path = executor.publish_window_baseline(request, run_root)
        # mc2-6fnrt: each leg derives its OWN ephemeral libpq service file and clears the cache
        # afterwards (no cleartext password at rest, and the two connects are now separated by
        # the whole barrier install + writer quiesce). Production re-derives from
        # request["db_url_file"]; this harness has no DSN file, so it re-injects the loopback
        # service env the disposable container needs.
        executor._source_service = service_env
        exported_id, coordinator = executor.open_window_snapshot(request, run_root)
        # The exported snapshot must still be HELD (the exporting session open) so pg.backup can
        # bind it; assert the coordinator is alive before we release it.
        held_alive = coordinator.poll() is None
        snapshot_shaped = bool(core.PLAN_SNAPSHOT_RE.fullmatch(exported_id))
        baseline_obj = json.loads(pathlib.Path(baseline_path).read_bytes())
        result = {
            "exported_id": exported_id,
            "snapshot_shaped": snapshot_shaped,
            "held_alive": held_alive,
            "baseline_mode": oct(pathlib.Path(baseline_path).stat().st_mode & 0o777),
            "baseline_cron_active": sum(1 for j in baseline_obj.get("cron_jobs", []) if j.get("active")),
            "baseline_cron_count": len(baseline_obj.get("cron_jobs", [])),
            "intermediate_removed": not (run_root / "source-manifest-baseline.json").exists(),
            # P2c: the source-connection libpq file must never persist at rest in the durable run_root.
            "no_libpq_at_rest_in_run_root": not any(run_root.glob("libpq*")),
        }
        # Release the held coordinator (COMMIT + close); it must exit cleanly.
        executor.close_window_snapshot(coordinator)
        result["released"] = coordinator.poll() == 0
        sys.stdout.write(json.dumps(result) + "\n")
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
