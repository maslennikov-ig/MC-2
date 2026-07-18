#!/usr/bin/env python3
"""Defect-4 fold-in: focused, no-barrier real-PG17 proof for
deploy/postgres/q12-source-manifest.ts's cron.job relations row_sha256
`active`-column normalization.

This is deliberately NOT the full R4 Sub-round C barrier harness
(q12-live-real-barrier-cutover-runner.py) -- it drives the REAL, unmodified
`deploy/postgres/q12-source-manifest.ts capture` command (real PostgreSQL
17.10, real extensions.digest, no stubbing) against a disposable source with a
real `cron.job` table, but with no q12_guard barrier installed at all, so
there is no write-barrier trigger to route around and no dependency on the
separately tracked, out-of-scope relations-array ordering defect that
q12-live-real-barrier-cutover.test.ts's own end-to-end run surfaces once the
cron.job content mismatch this fold-in fixes is resolved (see that test file's
header for the STOP-and-report on that unrelated 7th defect).

Three `capture` invocations against the SAME disposable source, each reading a
fresh REPEATABLE READ snapshot after the prior mutation:
  1. baseline    -- cron.job rows as seeded (active=true, real command/schedule).
  2. sanctioned  -- ONLY `active` flipped false on every row (the exact
     barrier.install maintenance delta), command/schedule untouched.
  3. tampered    -- sanctioned, PLUS a real content change (command mutated on
     one row) -- proves the exclusion does not accidentally hide anything
     other than `active`.

Prints one JSON object with the three `cron.job` relation row_sha256/row_count
pairs; the caller test asserts baseline==sanctioned (the fix) and
baseline!=tampered / sanctioned!=tampered (the fail-closed tamper proof).
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

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE = REPO / "deploy/qdrant/q12-lifecycle-core.py"
TSX = REPO / "packages/course-gen-platform/node_modules/.bin/tsx"
TOOL = REPO / "deploy/postgres/q12-source-manifest.ts"
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
IMAGE = "postgres:17.10-bookworm"
PW = "q12-cron-hash-fixture-pw"

_spec = importlib.util.spec_from_file_location("q12_core_cron_hash", CORE)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core_cron_hash"] = core
_spec.loader.exec_module(core)

# Minimal but real pg_cron-shaped table plus the two other hard (non-optional)
# schema/relation references catalogSql() always queries (net.http_request_queue,
# supabase_migrations.schema_migrations); both are legitimately empty here.
SEED_SQL = """
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;

CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint PRIMARY KEY,
  schedule text NOT NULL,
  command text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost',
  nodeport int NOT NULL DEFAULT 5432,
  database text NOT NULL DEFAULT 'postgres',
  username text NOT NULL DEFAULT 'postgres',
  active boolean NOT NULL DEFAULT true,
  jobname text UNIQUE
);
INSERT INTO cron.job (jobid, schedule, command, jobname) VALUES
  (1, '*/5 * * * *', 'select 1', 'job-1'),
  (2, '*/10 * * * *', 'select 2', 'job-2');

CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text);

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
"""


def main() -> int:
    cid = f"mc2-q12-cronhash-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [DOCKER, "run", "-d", "--name", cid, "-e", f"POSTGRES_PASSWORD={PW}", "-p", "127.0.0.1::5432", IMAGE],
        check=True,
        capture_output=True,
    )
    work = None
    try:
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)

        def dexec_must(sql: str) -> None:
            result = subprocess.run(
                [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
                input=sql,
                text=True,
                capture_output=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"seed/mutation failed: {result.stderr.strip()}")

        dexec_must(SEED_SQL)

        published = subprocess.run([DOCKER, "port", cid, "5432/tcp"], capture_output=True, text=True).stdout.strip()
        host_port = published.rsplit(":", 1)[-1]
        work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-cronhash-work-", dir="/tmp"))
        service_file = work / "source.service"
        service_file.write_text(
            f"[q12plan]\nhost=127.0.0.1\nport={host_port}\ndbname=postgres\nuser=postgres\n"
            f"password={PW}\nsslmode=disable\n"
        )
        service_file.chmod(0o600)
        service_env = {"PGSERVICEFILE": str(service_file), "PGSERVICE": "q12plan"}

        executor = core.LivePlanExecutor()
        executor.docker = DOCKER
        executor.source_container = None
        executor._source_service = service_env

        def capture(output_path: pathlib.Path) -> subprocess.CompletedProcess:
            coordinator, snapshot = executor._open_snapshot_coordinator({}, work)
            try:
                return subprocess.run(
                    [str(TSX), str(TOOL), "capture", "--snapshot", snapshot, "--output", str(output_path)],
                    cwd=str(REPO),
                    env={
                        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                        "LC_ALL": "C",
                        "LANG": "C",
                        "TMPDIR": "/tmp",
                        **service_env,
                    },
                    capture_output=True,
                    text=True,
                )
            finally:
                executor._close_snapshot_coordinator(coordinator)

        def cron_job_relation(path: pathlib.Path) -> dict:
            manifest = json.loads(path.read_text(encoding="utf-8"))
            for relation in manifest["cutover_snapshot"]["relations"]:
                if relation["schema"] == "cron" and relation["name"] == "job":
                    return {"row_sha256": relation["row_sha256"], "row_count": relation["row_count"]}
            raise RuntimeError("cron.job relation absent from capture output")

        # 1. baseline: active=true, untampered.
        baseline_path = work / "state-baseline.json"
        baseline_result = capture(baseline_path)
        if baseline_result.returncode != 0:
            raise RuntimeError(f"baseline capture failed: {baseline_result.stderr.strip()}")
        baseline = cron_job_relation(baseline_path)

        # 2. sanctioned: ONLY `active` flips (the exact barrier.install delta).
        dexec_must("UPDATE cron.job SET active = false;")
        sanctioned_path = work / "state-sanctioned.json"
        sanctioned_result = capture(sanctioned_path)
        if sanctioned_result.returncode != 0:
            raise RuntimeError(f"sanctioned-mutation capture failed: {sanctioned_result.stderr.strip()}")
        sanctioned = cron_job_relation(sanctioned_path)

        # 3. tampered: sanctioned PLUS a real content change (command mutated).
        dexec_must("UPDATE cron.job SET command = command || ' -- tampered' WHERE jobid = 1;")
        tampered_path = work / "state-tampered.json"
        tampered_result = capture(tampered_path)
        if tampered_result.returncode != 0:
            raise RuntimeError(f"tampered-mutation capture failed: {tampered_result.stderr.strip()}")
        tampered = cron_job_relation(tampered_path)

        sys.stdout.write(
            json.dumps(
                {
                    "baseline": baseline,
                    "sanctioned": sanctioned,
                    "tampered": tampered,
                }
            )
            + "\n"
        )
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)
        if work is not None:
            import shutil

            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
