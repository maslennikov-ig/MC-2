#!/usr/bin/python3
"""Real-PG17 harness for the Task-9 baseline.json producer (R2).

Self-manages a disposable Supabase-shaped source, exercises
LivePlanExecutor.produce_run_root_baseline through the manifest tool's fixture-only
client-override seam (a docker-exec psql wrapper), and drives the three
validateTransition negatives. Prints one JSON result object to stdout; the TypeScript
test asserts on it. No production path is touched.
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
TSX = REPO / "packages/course-gen-platform/node_modules/.bin/tsx"
TOOL = REPO / "deploy/postgres/q12-source-manifest.ts"
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
IMAGE = "postgres:17.10-bookworm"
PW = "q12-r2-baseline-producer-pw"

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
    cid = f"mc2-q12-r2-src-{os.getpid()}-{int(time.time())}"
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
            raise RuntimeError(f"seed/mutation failed: {result.stderr.strip()}")

    try:
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)
        dexec(SEED)

        work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-plan-work-", dir="/tmp"))
        run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-plan-", dir="/tmp"))
        run_root.chmod(0o700)
        # The manifest tool + coordinator reach the source through the real hardcoded host
        # PostgreSQL 17 client over libpq (production route), via a loopback service file to the
        # container's published port. Seeding stays on docker-exec; the TOOL is byte-untouched.
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
        executor = core.LivePlanExecutor()
        executor.docker = DOCKER
        executor.source_container = None
        executor._source_service = service_env

        baseline = executor.produce_run_root_baseline(request, work, run_root)
        baseline_bytes = baseline.read_bytes()
        baseline_obj = json.loads(baseline_bytes)

        def cap_with_baseline(baseline_path: pathlib.Path, name: str) -> dict:
            coordinator, snapshot = executor._open_snapshot_coordinator(request, work)
            try:
                env = {
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C", "LANG": "C",
                    "TMPDIR": "/tmp", **service_env,
                }
                completed = subprocess.run(
                    [str(TSX), str(TOOL), "capture", "--snapshot", snapshot,
                     "--baseline", str(baseline_path), "--output", str(run_root / name)],
                    cwd=str(REPO), env=env, capture_output=True, text=True,
                )
                message = (completed.stderr or completed.stdout).strip().splitlines()
                return {"rc": completed.returncode, "msg": message[-1] if message else ""}
            finally:
                executor._close_snapshot_coordinator(coordinator)

        # NEGATIVE 1b (seed-shape): 7 cron rows -> cardinality. Writable, so run first.
        dexec("DELETE FROM cron.job WHERE jobid=8;")
        neg1b = cap_with_baseline(baseline, "cutover-neg1b.json")
        dexec("INSERT INTO cron.job (jobid,schedule,command) VALUES (8,'*/5 * * * *','select 8');")

        # NEGATIVE 2: the lossy database-barrier-baseline.json digest projection.
        digest = run_root / "barrier-digest-baseline.json"
        digest.write_text(json.dumps({
            "schema_version": "megacampus.q12.database-barrier-baseline/v1",
            "baseline": {
                "baseline_structural_catalog_sha256": "a" * 64,
                "database_default_sha256": "b" * 64, "cron_jobs_sha256": "c" * 64,
                "guarded_relations_sha256": "d" * 64, "pg_net_queue_count": 0,
            },
        }))
        neg2 = cap_with_baseline(digest, "cutover-neg2.json")

        # NEGATIVE 1a (incomplete delta): cron off + read-only but NO q12_guard. Read-only last.
        dexec("UPDATE cron.job SET active=false; ALTER DATABASE postgres SET default_transaction_read_only=on;")
        neg1a = cap_with_baseline(baseline, "cutover-neg1a.json")

        sys.stdout.write(json.dumps({
            "baseline_mode": oct(baseline.stat().st_mode & 0o777),
            "baseline_cron_active": sum(1 for j in baseline_obj.get("cron_jobs", []) if j.get("active")),
            "baseline_cron_count": len(baseline_obj.get("cron_jobs", [])),
            "intermediate_removed": not (run_root / "source-manifest-baseline.json").exists(),
            "neg1a": neg1a, "neg1b": neg1b, "neg2": neg2,
        }) + "\n")
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
