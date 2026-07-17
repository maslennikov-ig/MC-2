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
# The exported-snapshot id shape from pg_export_snapshot() (backup-supabase.sh).
SNAPSHOT_RE = re.compile(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+")

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

ROLES_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'name', rolname,
  'rolsuper', rolsuper,
  'rolinherit', rolinherit,
  'rolcreaterole', rolcreaterole,
  'rolcreatedb', rolcreatedb,
  'rolcanlogin', rolcanlogin,
  'rolreplication', rolreplication,
  'rolconnlimit', rolconnlimit,
  'rolvaliduntil', CASE WHEN rolvaliduntil IS NULL THEN NULL ELSE rolvaliduntil::text END,
  'rolbypassrls', rolbypassrls
) ORDER BY rolname), '[]'::jsonb)
FROM pg_catalog.pg_roles
WHERE rolname !~ '^pg_' AND rolname <> 'cli_login_postgres'
""".strip()

MEMBERSHIPS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'member', m.rolname,
  'role', r.rolname,
  'grantor', g.rolname,
  'admin_option', am.admin_option,
  'inherit_option', am.inherit_option,
  'set_option', am.set_option
) ORDER BY m.rolname, r.rolname, g.rolname), '[]'::jsonb)
FROM pg_catalog.pg_auth_members am
JOIN pg_catalog.pg_roles m ON m.oid = am.member
JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
JOIN pg_catalog.pg_roles g ON g.oid = am.grantor
WHERE m.rolname !~ '^pg_' AND r.rolname !~ '^pg_' AND g.rolname !~ '^pg_'
""".strip()

ROLE_SETTINGS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'role', COALESCE(r.rolname, ''),
  'database', NULL,
  'name', pg_catalog.split_part(entry.setting, '=', 1),
  'value', pg_catalog.substr(entry.setting, pg_catalog.strpos(entry.setting, '=') + 1)
) ORDER BY COALESCE(r.rolname, ''), entry.setting), '[]'::jsonb)
FROM pg_catalog.pg_db_role_setting drs
CROSS JOIN LATERAL pg_catalog.unnest(drs.setconfig) AS entry(setting)
LEFT JOIN pg_catalog.pg_roles r ON r.oid = drs.setrole
WHERE drs.setdatabase = 0
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


def _validated_binary(path: str, label: str, *, allow_symlink: bool = False) -> str:
    # os.path.isfile follows symlinks, so a symlinked system binary (e.g. the
    # Docker Desktop docker shim) still resolves to a regular file; psql keeps the
    # stricter non-symlink contract.
    if not os.path.isabs(path) or not os.path.isfile(path):
        raise CaptureError(f"{label} must be an absolute regular file")
    if not allow_symlink and os.path.islink(path):
        raise CaptureError(f"{label} must be an absolute non-symlink regular file")
    return path


def _validated_dbname(dbname: str) -> str:
    # The drill restores into restore_test, not postgres; route capture explicitly
    # rather than silently reading the wrong database.
    if not CONTAINER_RE.fullmatch(dbname):
        raise CaptureError("invalid --dbname value")
    return dbname


def _psql_argv(container: str | None, dbname: str) -> list[str]:
    _validated_dbname(dbname)
    if container is not None:
        if not CONTAINER_RE.fullmatch(container):
            raise CaptureError("invalid --container value")
        docker = _validated_binary(
            os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker"),
            "MC2_Q12_PLAN_DOCKER",
            allow_symlink=True,
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
            dbname,
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
        "-d",
        dbname,
    ]


def run_sql(sql: str, container: str | None, dbname: str) -> str:
    completed = subprocess.run(
        _psql_argv(container, dbname),
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
    return _decode_copy(completed.stdout.strip())


_COPY_ESCAPES = {"\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}


def _decode_copy(text: str) -> str:
    """Reverse PostgreSQL COPY TO STDOUT text-format backslash escaping so a jsonb
    value that itself contains quotes/commas/backslashes parses back cleanly."""
    if "\\" not in text:
        return text
    result: list[str] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char == "\\" and index + 1 < length:
            nxt = text[index + 1]
            result.append(_COPY_ESCAPES.get(nxt, nxt))
            index += 2
            continue
        result.append(char)
        index += 1
    return "".join(result)


def read_only_wrap(body: str, snapshot: str | None = None) -> str:
    """One read-only transaction; COPY the body's single query to STDOUT as text.

    When a snapshot id is supplied it is pinned with SET TRANSACTION SNAPSHOT so
    every projection reads the exact instant the backup coordinator exported."""
    binding = ""
    if snapshot is not None:
        if not SNAPSHOT_RE.fullmatch(snapshot):
            raise CaptureError("invalid --snapshot value")
        binding = f"SET TRANSACTION SNAPSHOT '{snapshot}';\n"
    return (
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        f"{binding}"
        f"COPY ({body}) TO STDOUT;\n"
        "COMMIT;\n"
    )


def capture_roles(container: str | None, dbname: str = "postgres", snapshot: str | None = None) -> dict[str, object]:
    """Read-only §3 role plane: roles / membership edges / cluster role settings.

    Usable against a fresh isolate (no application schema yet), so the plan can
    diff the source role plane against the isolate before restore."""
    return {
        "schema_version": "megacampus.q12.plan-role-capture/v1",
        "source_roles": json.loads(run_sql(read_only_wrap(ROLES_SQL, snapshot), container, dbname)),
        "source_memberships": json.loads(run_sql(read_only_wrap(MEMBERSHIPS_SQL, snapshot), container, dbname)),
        "source_role_settings": json.loads(run_sql(read_only_wrap(ROLE_SETTINGS_SQL, snapshot), container, dbname)),
    }


def capture(container: str | None, dbname: str = "postgres", snapshot: str | None = None) -> dict[str, object]:
    structural_sql = STRUCTURAL_CATALOG_FILE.read_text(encoding="utf-8").strip()
    if ";" in structural_sql:
        raise CaptureError("structural catalog SQL must be one semicolon-free query")
    structural_sha256 = run_sql(
        read_only_wrap(f"SELECT structural_sha256 FROM (\n{structural_sql}\n) AS plan_capture", snapshot),
        container,
        dbname,
    )
    if len(structural_sha256) != 64 or any(ch not in "0123456789abcdef" for ch in structural_sha256):
        raise CaptureError("structural catalog SHA-256 is malformed")

    identity = json.loads(run_sql(read_only_wrap(IDENTITY_SQL, snapshot), container, dbname))
    guarded = json.loads(run_sql(read_only_wrap(GUARDED_RELATIONS_SQL, snapshot), container, dbname))
    public_relations = json.loads(run_sql(read_only_wrap(PUBLIC_RELATIONS_SQL, snapshot), container, dbname))
    cron_raw = json.loads(run_sql(read_only_wrap(CRON_JOBS_SQL, snapshot), container, dbname))

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
        **capture_roles(container, dbname, snapshot),
    }


def capture_structural_payload(
    container: str | None, dbname: str = "postgres", snapshot: str | None = None
) -> dict[str, object]:
    """Read-only diagnostic projection: the FULL canonical structural catalog payload
    — the exact pre-hash jsonb ``q12-structural-catalog.sql`` hashes into
    ``structural_sha256``. Selecting the query's ``payload`` column (instead of
    ``structural_sha256``) leaves the frozen SQL byte-identical. Used ONLY to explain
    an equality-proof mismatch; never part of the frozen capture output."""
    structural_sql = STRUCTURAL_CATALOG_FILE.read_text(encoding="utf-8").strip()
    if ";" in structural_sql:
        raise CaptureError("structural catalog SQL must be one semicolon-free query")
    payload = json.loads(
        run_sql(
            read_only_wrap(f"SELECT payload FROM (\n{structural_sql}\n) AS plan_capture", snapshot),
            container,
            dbname,
        )
    )
    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != "megacampus.q12.structural-catalog-payload/v1"
    ):
        raise CaptureError("structural catalog payload is malformed")
    return payload


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Q12 plan capture helper")
    parser.add_argument("--container", default=None)
    parser.add_argument("--roles-only", action="store_true")
    parser.add_argument("--structural-payload", action="store_true")
    parser.add_argument("--dbname", default="postgres")
    parser.add_argument("--snapshot", default=None)
    arguments = parser.parse_args(argv)
    dbname = _validated_dbname(arguments.dbname)
    snapshot = arguments.snapshot
    if snapshot is not None and not SNAPSHOT_RE.fullmatch(snapshot):
        raise CaptureError("invalid --snapshot value")
    if arguments.structural_payload:
        output: dict[str, object] = capture_structural_payload(arguments.container, dbname, snapshot)
    elif arguments.roles_only:
        output = capture_roles(arguments.container, dbname, snapshot)
    else:
        output = capture(arguments.container, dbname, snapshot)
    sys.stdout.write(json.dumps(output, ensure_ascii=False, sort_keys=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (CaptureError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"q12 plan capture rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
