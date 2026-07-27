#!/usr/bin/env python3
"""R4 Sub-round C: the non-negotiable real-PG17 validateTransition POSITIVE.

Proves END-TO-END, against a disposable, full-Supabase-shaped PostgreSQL 17.10
source, that R2's baseline.json producer (LivePlanExecutor.produce_run_root_baseline)
plus a REAL, unmodified `deploy/qdrant/q12-database-barrier.sh install` cutover
PASSES the REAL, unmodified `deploy/postgres/q12-source-manifest.ts` validateTransition
-- no stubbing of the barrier, no stubbing of the DB mutation, no weakening of
validateTransition.

The barrier's real DB-mutation path hardcodes the production connection identity
(host aws-1-us-east-2.pooler.supabase.com, port 5432, user postgres.<project-ref>)
with zero test-mode relaxation for that identity check, so this harness drives it
for real via:
  1. An unprivileged user+mount+net namespace (unshare) scoped to just the barrier
     invocation, giving it a private loopback where port 5432 is free (the host's
     real port 5432 is legitimately occupied by an unrelated project) and a
     namespace-local /etc/hosts override mapping the frozen hostname to 127.0.0.1.
     This never touches the host's real /etc/hosts or any other process.
  2. q12-pooler-identity-proxy.py bound to that namespace's 127.0.0.1:5432,
     terminating the barrier's mandatory TLS handshake for that hostname (protected
     test mode already waives the production CA sha256 pin) and rewriting only the
     StartupMessage "user" field from the pooler-style tenant username to the
     disposable source's real "postgres" role -- mirroring what Supabase's own
     pooler does upstream -- before relaying every other byte unmodified into the
     disposable container via `docker exec` (the docker control channel, not host
     TCP networking, so it needs no route out of the namespace).
No SQL is generated or altered by this harness for the mutation path; the barrier
computes and executes it. Prints one JSON result object to stdout.
"""
from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE = REPO / "deploy/qdrant/q12-lifecycle-core.py"
TSX = REPO / "packages/course-gen-platform/node_modules/.bin/tsx"
TOOL = REPO / "deploy/postgres/q12-source-manifest.ts"
BARRIER = REPO / "deploy/qdrant/q12-database-barrier.sh"
PROXY = pathlib.Path(__file__).with_name("q12-pooler-identity-proxy.py")
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
IMAGE = "postgres:17.10-bookworm"
PW = "q12-r4c-real-barrier-pw"
POOLER_HOST = "aws-1-us-east-2.pooler.supabase.com"
POOLER_USER = "postgres.diqooqbuchsliypgwksu"
RUN_ID = "123e4567-e89b-42d3-a456-426614174000"

_spec = importlib.util.spec_from_file_location("q12_core_r4c", CORE)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core_r4c"] = core
_spec.loader.exec_module(core)

PUBLIC_COUNT = 47
AUTH_COUNT = 22
STORAGE_NAMES = [
    "buckets",
    "buckets_analytics",
    "objects",
    "s3_multipart_uploads",
    "s3_multipart_uploads_parts",
]
CRON_COUNT = 8

SEED_SQL = f"""
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
INSERT INTO cron.job (jobid, schedule, command)
  SELECT g, '*/5 * * * *', 'select ' || g FROM generate_series(1,{CRON_COUNT}) g;

-- mc2-7ohdj: model the MANAGED pg_cron privilege shape, not the convenient one. On the real
-- Supabase source cron.job is owned by supabase_admin and the connecting postgres role holds only
-- SELECT (ACL 'postgres=r*'); it is not superuser and not a member of supabase_admin, so a direct
-- write raises 42501 'permission denied for table job' -- MEASURED on production, and the reason
-- five window attempts died at barrier.install. pg_cron's own alter_job succeeds there because it
-- reaches the catalog below the SQL ACL layer (also measured, with a semantically empty call).
-- This container has no pg_cron at all, so cron.job used to be a plain superuser-owned table and
-- every local suite passed on a write production forbids. The trigger below reproduces the
-- CONSTRAINT and the function reproduces the sanctioned API, so the barrier is now exercised
-- against the same wall it meets in production.
CREATE FUNCTION cron.q12_test_deny_direct_write() RETURNS trigger
LANGUAGE plpgsql AS $deny$
BEGIN
  IF current_setting('q12test.cron_api', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'permission denied for table job' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $deny$;
CREATE TRIGGER q12_test_cron_job_managed_acl
  BEFORE INSERT OR UPDATE OR DELETE ON cron.job
  FOR EACH ROW EXECUTE FUNCTION cron.q12_test_deny_direct_write();
CREATE FUNCTION cron.alter_job(
  job_id bigint,
  schedule text DEFAULT NULL,
  command text DEFAULT NULL,
  database text DEFAULT NULL,
  username text DEFAULT NULL,
  active boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $alter$
BEGIN
  PERFORM set_config('q12test.cron_api', 'on', true);
  UPDATE cron.job AS target SET
    schedule = COALESCE(alter_job.schedule, target.schedule),
    command  = COALESCE(alter_job.command,  target.command),
    database = COALESCE(alter_job.database, target.database),
    username = COALESCE(alter_job.username, target.username),
    active   = COALESCE(alter_job.active,   target.active)
  WHERE target.jobid = alter_job.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'could not find valid entry for job %', alter_job.job_id;
  END IF;
  PERFORM set_config('q12test.cron_api', 'off', true);
END $alter$;

CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text);

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260101000000', ARRAY['SELECT 1'], 'seed');

CREATE SCHEMA auth;
DO $do$
DECLARE i int;
BEGIN
  FOR i IN 0..{AUTH_COUNT - 1} LOOP
    EXECUTE format('CREATE TABLE auth.auth_table_%s (id bigint PRIMARY KEY)', lpad(i::text, 2, '0'));
  END LOOP;
END $do$;

CREATE SCHEMA storage;
{chr(10).join(f"CREATE TABLE storage.{name} (id text PRIMARY KEY);" for name in STORAGE_NAMES)}

DO $do$
DECLARE i int;
BEGIN
  FOR i IN 0..{PUBLIC_COUNT - 1} LOOP
    EXECUTE format('CREATE TABLE public.public_table_%s (id bigint PRIMARY KEY)', lpad(i::text, 2, '0'));
  END LOOP;
END $do$;
"""


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_hex(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def write_canonical(path: pathlib.Path, value, mode: int) -> None:
    path.write_text(f"{canonical(value)}\n", encoding="utf-8")
    path.chmod(mode)


def main() -> int:
    cid = f"mc2-q12-r4c-src-{os.getpid()}-{int(time.time())}"
    docker_run = subprocess.run(
        [
            DOCKER,
            "run",
            "-d",
            "--name",
            cid,
            "-e",
            f"POSTGRES_PASSWORD={PW}",
            "-p",
            "127.0.0.1::5432",
            IMAGE,
        ],
        check=True,
        capture_output=True,
    )
    del docker_run

    def dexec(sql: str, database: str = "postgres") -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                DOCKER,
                "exec",
                "-i",
                cid,
                "psql",
                "-X",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "postgres",
                "-d",
                database,
            ],
            input=sql,
            text=True,
            capture_output=True,
        )

    def dexec_must(sql: str) -> None:
        result = dexec(sql)
        if result.returncode != 0:
            raise RuntimeError(f"seed/query failed: {result.stderr.strip()}")

    def dexec_json(sql: str):
        wrapped = f"SELECT coalesce(json_agg(row_data), '[]'::json) FROM ({sql}) row_data;"
        result = subprocess.run(
            [
                DOCKER,
                "exec",
                "-i",
                cid,
                "psql",
                "-X",
                "-t",
                "-A",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "postgres",
                "-d",
                "postgres",
            ],
            input=wrapped,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"catalog query failed: {result.stderr.strip()}")
        return json.loads(result.stdout.strip())

    root = None
    try:
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)
        dexec_must(SEED_SQL)

        # 1. Real pre-guard structural catalog hash (the value the barrier's own
        #    canonical structural query must reproduce, byte for byte).
        structural_catalog_sql_path = REPO / "deploy/qdrant/q12-structural-catalog.sql"
        structural_query = structural_catalog_sql_path.read_text(encoding="utf-8")
        structural_result = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=f"SELECT structural_sha256 FROM ({structural_query}) canonical;",
            text=True,
            capture_output=True,
        )
        if structural_result.returncode != 0:
            raise RuntimeError(f"structural catalog query failed: {structural_result.stderr.strip()}")
        baseline_structural_sha256 = structural_result.stdout.strip()

        # 2. Real oids/owners for the 76 guarded relations, queried live from the
        #    seeded source (not fabricated) so the barrier's OID/owner identity
        #    checks match exactly.
        public_rows = dexec_json(
            "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname"
        )
        auth_rows = dexec_json(
            "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='auth' AND c.relkind IN ('r','p') ORDER BY c.relname"
        )
        storage_rows = dexec_json(
            "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='storage' AND c.relkind IN ('r','p') ORDER BY c.relname"
        )
        cron_row = dexec_json(
            "SELECT c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='cron' AND c.relname='job'"
        )[0]
        net_row = dexec_json(
            "SELECT c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='net' AND c.relname='http_request_queue'"
        )[0]
        cron_jobs_real = dexec_json("SELECT jobid, command FROM cron.job ORDER BY jobid")

        if len(public_rows) != PUBLIC_COUNT or len(auth_rows) != AUTH_COUNT or len(storage_rows) != len(STORAGE_NAMES):
            raise RuntimeError(
                f"seed counts drifted: public={len(public_rows)} auth={len(auth_rows)} storage={len(storage_rows)}"
            )

        guarded_relations = (
            [
                {
                    "schema": "public",
                    "name": row["name"],
                    "oid": row["oid"],
                    "relkind": "r",
                    "parent_oid": None,
                    "owner": row["owner"],
                }
                for row in public_rows
            ]
            + [
                {
                    "schema": "auth",
                    "name": row["name"],
                    "oid": row["oid"],
                    "relkind": "r",
                    "parent_oid": None,
                    "owner": row["owner"],
                }
                for row in auth_rows
            ]
            + [
                {
                    "schema": "storage",
                    "name": row["name"],
                    "oid": row["oid"],
                    "relkind": "r",
                    "parent_oid": None,
                    "owner": row["owner"],
                }
                for row in storage_rows
            ]
            + [
                {
                    "schema": "cron",
                    "name": "job",
                    "oid": cron_row["oid"],
                    "relkind": "r",
                    "parent_oid": None,
                    "owner": cron_row["owner"],
                },
                {
                    "schema": "net",
                    "name": "http_request_queue",
                    "oid": net_row["oid"],
                    "relkind": "r",
                    "parent_oid": None,
                    "owner": net_row["owner"],
                },
            ]
        )
        if len(guarded_relations) != 76:
            raise RuntimeError(f"guarded_relations count drifted: {len(guarded_relations)}")

        cron_jobs_catalog = [
            {
                "jobid": row["jobid"],
                "username": "postgres",
                "command_sha256": sha256_hex(row["command"].encode("utf-8")),
            }
            for row in cron_jobs_real
        ]

        expected_post_migration_catalog_sha256 = "b" * 64
        expected_catalog = {
            "schema_version": "megacampus.q12.expected-post-migration-catalog/v1",
            "database": "postgres",
            "database_owner": "postgres",
            "release_sha": "1" * 40,
            "migration_frontier": "20260704150249",
            "baseline_structural_sha256": baseline_structural_sha256,
            "expected_post_migration_catalog_sha256": expected_post_migration_catalog_sha256,
            "inventory_counts": {"public": PUBLIC_COUNT, "auth": AUTH_COUNT, "storage": 5, "cron_jobs": CRON_COUNT, "pg_net_queue": 0},
            "guarded_relations": guarded_relations,
            "cron_jobs": cron_jobs_catalog,
            "migrations": {
                "20260711140000": {
                    "catalog_sha256": "c" * 64,
                    "migration_file_sha256": "e" * 64,
                    "relations": [
                        {
                            "schema": "public",
                            "name": "document_evidence_runs",
                            "relkind": "r",
                            "parent_schema": None,
                            "parent_name": None,
                            "owner": "postgres",
                        }
                    ],
                },
                "20260711151000": {
                    "catalog_sha256": expected_post_migration_catalog_sha256,
                    "migration_file_sha256": "f" * 64,
                    "relations": [
                        {
                            "schema": "public",
                            "name": "document_evidence_observability_totals",
                            "relkind": "r",
                            "parent_schema": None,
                            "parent_name": None,
                            "owner": "postgres",
                        }
                    ],
                },
            },
        }
        catalog_body = f"{canonical(expected_catalog)}\n"
        catalog_sha256 = sha256_hex(catalog_body.encode("utf-8"))

        # 3. Real host-side access to the (pre-mutation) source, matching R2's
        #    runner exactly, to produce the Task-9 baseline.json. This "plan run
        #    root" is unrelated to the barrier's own run-root layout below; it only
        #    has to satisfy LivePlanExecutor's own conventions.
        published = subprocess.run([DOCKER, "port", cid, "5432/tcp"], capture_output=True, text=True).stdout.strip()
        host_port = published.rsplit(":", 1)[-1]
        work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-r4c-work-", dir="/tmp"))
        plan_run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-r4c-plan-", dir="/tmp"))
        plan_run_root.chmod(0o700)
        service_file = work / "source.service"
        service_file.write_text(
            f"[q12plan]\nhost=127.0.0.1\nport={host_port}\ndbname=postgres\nuser=postgres\n"
            f"password={PW}\nsslmode=disable\n"
        )
        service_file.chmod(0o600)
        service_env = {"PGSERVICEFILE": str(service_file), "PGSERVICE": "q12plan"}

        request = {"run_root": str(plan_run_root), "run_id": str(uuid.uuid4())}
        executor = core.LivePlanExecutor()
        executor.docker = DOCKER
        executor.source_container = None
        executor._source_service = service_env

        baseline_path = executor.produce_run_root_baseline(request, work, plan_run_root)
        baseline_obj = json.loads(baseline_path.read_bytes())
        baseline_cron_active = sum(1 for job in baseline_obj.get("cron_jobs", []) if job.get("active"))
        baseline_cron_count = len(baseline_obj.get("cron_jobs", []))

        # 4. The real-barrier trust boundary (protected test mode; the barrier's
        #    real DB-mutation identity check has no test-mode relaxation, so the
        #    connection identity itself must be the frozen production string --
        #    resolved locally via the namespace-scoped hosts override below). The
        #    barrier derives its OWN run_root deterministically from the
        #    capability file's path (dirname(dirname(...))), so that layout is
        #    fixed by the barrier's contract, not a free choice of this harness.
        root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-barrier-", dir="/tmp"))
        root.chmod(0o700)
        project_dir = root / "project" / "packages" / "course-gen-platform"
        secrets_dir = root / "secrets"
        barrier_run_root = root / "backups" / "q12" / RUN_ID
        run_secrets_dir = barrier_run_root / "secrets"
        for directory in (project_dir.parent, secrets_dir, barrier_run_root, run_secrets_dir):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.chmod(0o700)
        # Path.mkdir(parents=True) only applies `mode` to the leaf; explicitly
        # tighten every ancestor up to `root` itself (the barrier's run_root check
        # requires an EXACT 0700, and require_safe_parent_chain requires the whole
        # chain to be non-group/world-writable).
        for ancestor in (root, root / "backups", root / "backups" / "q12", barrier_run_root):
            ancestor.chmod(0o700)
        os.symlink(REPO / "packages/course-gen-platform", project_dir)

        real_node = pathlib.Path(shutil.which("node") or "/usr/bin/node").resolve()
        node_copy = root / "node-bin"
        shutil.copyfile(real_node, node_copy)
        node_copy.chmod(0o700)

        db_url_file = secrets_dir / "supabase_db_url"
        db_url_file.write_text(
            f"postgresql://{POOLER_USER}:{PW}@{POOLER_HOST}:5432/postgres\n", encoding="utf-8"
        )
        db_url_file.chmod(0o600)

        cert_path = root / "proxy-cert.pem"
        key_path = root / "proxy-key.pem"
        _generate_self_signed(cert_path, key_path, POOLER_HOST)
        ca_file = secrets_dir / "prod-ca.crt"
        ca_file.write_bytes(cert_path.read_bytes())
        ca_file.chmod(0o644)

        capability_file = run_secrets_dir / "db-capability"
        capability_file.write_text("q12-r4c-capability-synthetic-sentinel\n", encoding="utf-8")
        capability_file.chmod(0o400)

        catalog_file = barrier_run_root / "expected-catalog.json"
        catalog_file.write_text(catalog_body, encoding="utf-8")
        catalog_file.chmod(0o400)

        write_canonical(
            barrier_run_root / "database-barrier-input-checkpoint-install-cutover.json",
            {
                "schema_version": "megacampus.q12.cutover-checkpoint/v1",
                "run_id": RUN_ID,
                "seq": 3,
                "phase": "maintenance_guarded",
                "journal_entry_hash": "1" * 64,
                "previous_journal_entry_hash": "0" * 64,
                "journal_device": "1",
                "journal_inode": "1",
                "accepted_object_kind": "none",
                "accepted_object_sha256": None,
                "resume_authority_sha256": None,
                "lease_epoch": "cutover",
            },
            0o600,
        )
        write_canonical(
            barrier_run_root / "phase.jsonl",
            {
                "schema": "megacampus.q12.cutover-journal/v1",
                "run_id": RUN_ID,
                "seq": 3,
                "phase": "maintenance_guarded",
                "outcome": "capability_claimed",
                "timestamp": "2026-07-14T07:00:00.000Z",
                "release_sha": "1" * 40,
                "operator_digest": "2" * 64,
                "command_id": "barrier.install",
                "command_sha256": "3" * 64,
                "lease_epoch": "cutover",
                "previous_hash": "0" * 64,
                "entry_hash": "1" * 64,
                "rotation_required": True,
                "resource_manifest_sha256": "d" * 64,
                "quiesce_manifest_sha256": "0" * 64,
                "capability_manifest_sha256": "c" * 64,
                "accepted_object_kind": "none",
                "accepted_object_sha256": None,
            },
            0o600,
        )

        # 5. Drive the REAL, unmodified barrier `install` against the REAL
        #    disposable source, entirely inside a private, ephemeral user+mount+net
        #    namespace scoped to this one invocation.
        fakehosts = root / "fakehosts"
        fakehosts.write_text(
            f"127.0.0.1 localhost\n127.0.0.1 {POOLER_HOST}\n::1 localhost ip6-localhost ip6-loopback\n",
            encoding="utf-8",
        )
        ready_file = root / "proxy-ready"
        wrapper_script = root / "run-barrier.sh"
        wrapper_script.write_text(
            f"""#!/usr/bin/env bash
set -euo pipefail
ip link set lo up
mount --bind {shlex_quote(str(fakehosts))} /etc/hosts
python3 {shlex_quote(str(PROXY))} --cert {shlex_quote(str(cert_path))} --key {shlex_quote(str(key_path))} \\
  --container {shlex_quote(cid)} --ready-file {shlex_quote(str(ready_file))} &
proxy_pid=$!
for _ in $(seq 1 100); do
  [ -f {shlex_quote(str(ready_file))} ] && break
  sleep 0.1
done
set +e
bash {shlex_quote(str(BARRIER))} install \\
  --run-id {shlex_quote(RUN_ID)} \\
  --db-url-file {shlex_quote(str(db_url_file))} \\
  --ca-file {shlex_quote(str(ca_file))} \\
  --q12-db-capability-file {shlex_quote(str(capability_file))} \\
  --expected-post-migration-catalog {shlex_quote(str(catalog_file))} \\
  --expected-post-migration-catalog-sha256 {catalog_sha256}
barrier_rc=$?
set -e
kill "$proxy_pid" 2>/dev/null || true
exit "$barrier_rc"
""",
            encoding="utf-8",
        )
        wrapper_script.chmod(0o700)

        barrier_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": os.environ.get("HOME", "/root"),
            "LC_ALL": "C",
            "LANG": "C",
            "MC2_Q12_BARRIER_TEST_MODE": "mc2-synthetic-q12-database-barrier-test-only",
            "MC2_Q12_BARRIER_TEST_ROOT": str(root),
            "MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY": str(root / "project"),
            "MC2_Q12_BARRIER_TEST_NODE": str(node_copy),
        }
        barrier_result = subprocess.run(
            ["unshare", "--user", "--map-root-user", "--mount", "--net", "bash", str(wrapper_script)],
            env=barrier_env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        receipt_path = barrier_run_root / "database-barrier-receipt.json"
        receipt_obj = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else None

        # 6. The REAL q12-source-manifest.ts capture against the NOW-transitioned
        #    source, invoking the REAL validateTransition.
        cutover_path = plan_run_root / "cutover.json"
        capture_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "LC_ALL": "C",
            "LANG": "C",
            "TMPDIR": "/tmp",
            **service_env,
        }
        coordinator, snapshot = executor._open_snapshot_coordinator(request, work)
        try:
            capture_result = subprocess.run(
                [
                    str(TSX),
                    str(TOOL),
                    "capture",
                    "--snapshot",
                    snapshot,
                    "--baseline",
                    str(baseline_path),
                    "--output",
                    str(cutover_path),
                ],
                cwd=str(REPO),
                env=capture_env,
                capture_output=True,
                text=True,
            )
        finally:
            executor._close_snapshot_coordinator(coordinator)

        post_state = dexec_json(
            "SELECT (SELECT count(*) FROM cron.job WHERE active) AS cron_active, "
            "(SELECT current_setting('default_transaction_read_only')) AS read_only"
        )[0]
        # Diagnostic only (never asserted on by the frozen tool/barrier): surfaces
        # whether q12_guard exists post-attempt, since the barrier's own generic
        # `database command failed` message deliberately swallows the real
        # underlying Postgres error text.
        guard_schema_present = dexec_json(
            "SELECT count(*) AS present FROM pg_namespace WHERE nspname='q12_guard'"
        )[0]["present"]
        # Post-mortem structural proof of the q12_guard install surface itself
        # (tables/functions/event trigger), independent of the frozen tool's own
        # (separately gated) validateTransition acceptance.
        guard_tables = dexec_json(
            "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname='q12_guard' AND c.relkind='r' ORDER BY c.relname"
        )
        guard_functions = dexec_json(
            "SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='q12_guard' ORDER BY p.proname"
        )
        guard_event_trigger_count = dexec_json(
            "SELECT count(*) AS n FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start'"
        )[0]["n"]

        sys.stdout.write(
            json.dumps(
                {
                    "seed_counts": {
                        "public": len(public_rows),
                        "auth": len(auth_rows),
                        "storage": len(storage_rows),
                        "cron": CRON_COUNT,
                        "net": 0,
                    },
                    "baseline_cron_active": baseline_cron_active,
                    "baseline_cron_count": baseline_cron_count,
                    "barrier_rc": barrier_result.returncode,
                    "barrier_stderr": barrier_result.stderr,
                    "barrier_stdout": barrier_result.stdout,
                    "receipt": receipt_obj,
                    "receipt_state": receipt_obj.get("state") if receipt_obj else None,
                    "post_install_cron_active": post_state["cron_active"],
                    "post_install_read_only": post_state["read_only"],
                    "capture_rc": capture_result.returncode,
                    "capture_stderr": capture_result.stderr,
                    "capture_stdout": capture_result.stdout,
                    "post_mortem_q12_guard_schema_present": bool(guard_schema_present),
                    "post_mortem_q12_guard_tables": [row["name"] for row in guard_tables],
                    "post_mortem_q12_guard_functions": [row["name"] for row in guard_functions],
                    "post_mortem_q12_guard_event_trigger_count": guard_event_trigger_count,
                }
            )
            + "\n"
        )
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)
        if root is not None:
            shutil.rmtree(root, ignore_errors=True)
        if "work" in locals():
            shutil.rmtree(work, ignore_errors=True)
        if "plan_run_root" in locals():
            shutil.rmtree(plan_run_root, ignore_errors=True)


def shlex_quote(value: str) -> str:
    import shlex

    return shlex.quote(value)


def _generate_self_signed(cert_path: pathlib.Path, key_path: pathlib.Path, hostname: str) -> None:
    result = subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key_path),
            "-out",
            str(cert_path),
            "-days",
            "2",
            "-subj",
            f"/CN={hostname}",
            "-addext",
            f"subjectAltName=DNS:{hostname}",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"self-signed certificate generation failed: {result.stderr.strip()}")
    key_path.chmod(0o600)
    cert_path.chmod(0o644)


if __name__ == "__main__":
    raise SystemExit(main())
