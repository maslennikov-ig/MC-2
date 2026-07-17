#!/usr/bin/python3
"""Q12 plan capture helper: read-only structural/guarded projection of one database.

This helper emits, for a single database at one point in time, the exact evidence
the Q12 expected-post-migration-catalog builder needs:

* the canonical structural catalog SHA-256 (via the frozen
  ``q12-structural-catalog.sql`` projection),
* the frozen ``guarded_relations`` set (schema/name/oid/relkind/parent_oid/owner),
* the reduced ``cron_jobs`` projection (jobid/username/command_sha256),
* every ``public`` ordinary/partitioned relation shape, so the plan builder can
  diff post-migration relations against the pre-migration set,
* the database identity/owner and the source migration frontier.

It never writes to the target, never prints credentials, and issues one
``REPEATABLE READ READ ONLY`` transaction.  Two execution seams are supported:
libpq (host ``psql`` over TCP/TLS, used for the remote source) and
``docker exec`` (used for the isolated restored target and for tests).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys

STRUCTURAL_CATALOG_FILE = pathlib.Path(__file__).with_name("q12-structural-catalog.sql")
# A docker/compose object name; anchored so a seam value can never inject argv.
CONTAINER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")

GUARDED_RELATIONS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'schema', n.nspname,
  'name', c.relname,
  'oid', c.oid::bigint,
  'relkind', c.relkind::text,
  'parent_oid', (SELECT i.inhparent::bigint FROM pg_catalog.pg_inherits i WHERE i.inhrelid = c.oid),
  'owner', pg_catalog.pg_get_userbyid(c.relowner)
) ORDER BY n.nspname, c.relname), '[]'::jsonb)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND (
    n.nspname = 'public'
    OR (n.nspname IN ('auth', 'storage')
        AND pg_catalog.has_table_privilege('postgres', c.oid, 'TRIGGER'))
    OR (n.nspname = 'cron' AND c.relname = 'job')
    OR (n.nspname = 'net' AND c.relname = 'http_request_queue')
  )
""".strip()

PUBLIC_RELATIONS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'schema', n.nspname,
  'name', c.relname,
  'relkind', c.relkind::text,
  'parent_schema', parent_namespace.nspname,
  'parent_name', parent.relname,
  'owner', pg_catalog.pg_get_userbyid(c.relowner)
) ORDER BY n.nspname, c.relname), '[]'::jsonb)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_inherits inheritance ON inheritance.inhrelid = c.oid
LEFT JOIN pg_catalog.pg_class parent ON parent.oid = inheritance.inhparent
LEFT JOIN pg_catalog.pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public'
""".strip()

CRON_JOBS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'jobid', jobid::bigint,
  'username', username,
  'command', command
) ORDER BY jobid), '[]'::jsonb)
FROM cron.job
""".strip()

IDENTITY_SQL = """
SELECT jsonb_build_object(
  'database', pg_catalog.current_database(),
  'database_owner', (
    SELECT pg_catalog.pg_get_userbyid(d.datdba)
    FROM pg_catalog.pg_database d
    WHERE d.datname = pg_catalog.current_database()
  ),
  'migration_frontier', COALESCE(
    (SELECT max(version)::text FROM supabase_migrations.schema_migrations), ''
  )
)
""".strip()


class CaptureError(RuntimeError):
    """Fail-closed capture rejection."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validated_binary(path: str, label: str) -> str:
    if not (os.path.isabs(path) and not os.path.islink(path) and os.path.isfile(path)):
        raise CaptureError(f"{label} must be an absolute non-symlink regular file")
    return path


def _psql_argv(container: str | None) -> list[str]:
    if container is not None:
        if not CONTAINER_RE.fullmatch(container):
            raise CaptureError("invalid --container value")
        docker = _validated_binary(
            os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker"), "MC2_Q12_PLAN_DOCKER"
        )
        return [
            docker,
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "--no-psqlrc",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-tAq",
            "-v",
            "ON_ERROR_STOP=1",
        ]
    binary = _validated_binary(
        os.environ.get("MC2_Q12_PLAN_PSQL", "/usr/lib/postgresql/17/bin/psql"), "MC2_Q12_PLAN_PSQL"
    )
    return [
        binary,
        "-X",
        "--no-psqlrc",
        "--no-password",
        "-tAq",
        "-v",
        "ON_ERROR_STOP=1",
    ]


def run_sql(sql: str, container: str | None) -> str:
    completed = subprocess.run(
        _psql_argv(container),
        input=sql,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0 or completed.stderr.strip():
        raise CaptureError(
            f"psql failed (status {completed.returncode}): {completed.stderr.strip()}"
        )
    return completed.stdout.strip()


def read_only_wrap(body: str) -> str:
    """One read-only transaction; COPY the body's single query to STDOUT as text."""
    return (
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        f"COPY ({body}) TO STDOUT;\n"
        "COMMIT;\n"
    )


def capture(container: str | None) -> dict[str, object]:
    structural_sql = STRUCTURAL_CATALOG_FILE.read_text(encoding="utf-8").strip()
    if ";" in structural_sql:
        raise CaptureError("structural catalog SQL must be one semicolon-free query")
    structural_sha256 = run_sql(
        read_only_wrap(f"SELECT structural_sha256 FROM (\n{structural_sql}\n) AS plan_capture"),
        container,
    )
    if len(structural_sha256) != 64 or any(ch not in "0123456789abcdef" for ch in structural_sha256):
        raise CaptureError("structural catalog SHA-256 is malformed")

    identity = json.loads(run_sql(read_only_wrap(IDENTITY_SQL), container))
    guarded = json.loads(run_sql(read_only_wrap(GUARDED_RELATIONS_SQL), container))
    public_relations = json.loads(run_sql(read_only_wrap(PUBLIC_RELATIONS_SQL), container))
    cron_raw = json.loads(run_sql(read_only_wrap(CRON_JOBS_SQL), container))

    cron_jobs = [
        {
            "jobid": row["jobid"],
            "username": row["username"],
            "command_sha256": sha256_hex(row["command"].encode("utf-8")),
        }
        for row in cron_raw
    ]

    return {
        "schema_version": "megacampus.q12.plan-capture/v1",
        "database": identity["database"],
        "database_owner": identity["database_owner"],
        "migration_frontier": identity["migration_frontier"],
        "structural_sha256": structural_sha256,
        "guarded_relations": guarded,
        "cron_jobs": cron_jobs,
        "public_relations": public_relations,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Q12 plan capture helper")
    parser.add_argument("--container", default=None)
    arguments = parser.parse_args(argv)
    output = capture(arguments.container)
    sys.stdout.write(json.dumps(output, ensure_ascii=False, sort_keys=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (CaptureError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"q12 plan capture rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
