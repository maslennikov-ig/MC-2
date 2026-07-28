#!/usr/bin/python3
"""mc2-ot8se Task 1 driver: prove the managed-privilege fixture really is production-shaped.

Prints one JSON object to stdout. The container is removed in ``finally`` even on failure.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    # Registered BEFORE exec_module: dataclasses resolves string annotations through
    # sys.modules[cls.__module__], which is None for an unregistered file-loaded module.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


fixture_module = _load("q12_managed_role_fixture", "q12-managed-role-fixture.py")


def main() -> int:
    fixture = fixture_module.start_managed_fixture()
    try:
        barrier_is_superuser = fixture.scalar(
            "SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user;"
        )
        auth_table_owner = fixture.scalar(
            "SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c"
            " JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"
            " WHERE n.nspname = 'auth' AND c.relname = 'oauth_authorizations';"
        )
        owns_auth_table = fixture.scalar(
            "SELECT pg_catalog.pg_get_userbyid(c.relowner) = current_user"
            " FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"
            " WHERE n.nspname = 'auth' AND c.relname = 'oauth_authorizations';"
        )
        has_trigger_auth = fixture.scalar(
            "SELECT pg_catalog.has_table_privilege(current_user,"
            " 'auth.oauth_authorizations', 'TRIGGER');"
        )
        has_select_cron = fixture.scalar(
            "SELECT pg_catalog.has_table_privilege(current_user, 'cron.job', 'SELECT');"
        )
        has_trigger_net = fixture.scalar(
            "SELECT pg_catalog.has_table_privilege(current_user,"
            " 'net.http_request_queue', 'TRIGGER');"
        )
        has_database_create = fixture.scalar(
            "SELECT pg_catalog.has_database_privilege(current_user,"
            " pg_catalog.current_database(), 'CREATE');"
        )
        can_execute_alter_job = fixture.scalar(
            "SELECT pg_catalog.has_function_privilege(current_user,"
            " 'cron.alter_job(bigint, text, text, text, text, boolean)', 'EXECUTE');"
        )
        managed_role_present = fixture.scalar(
            "SELECT count(*)::int FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin';"
        )
        guarded_relation_count = fixture.scalar(
            "SELECT count(*)::int FROM pg_catalog.pg_class c"
            " JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"
            " WHERE c.relkind IN ('r','p') AND ("
            " n.nspname = 'public'"
            " OR (n.nspname IN ('auth','storage')"
            "     AND pg_catalog.has_table_privilege(current_user, c.oid, 'TRIGGER'))"
            " OR (n.nspname = 'net' AND c.relname = 'http_request_queue'));"
        )

        # LOCK TABLE ... IN ACCESS EXCLUSIVE MODE is what barrier.install needs on every guarded
        # relation. Rolled back immediately; the fixture is disposable regardless.
        lock_auth = fixture.psql(
            "BEGIN; LOCK TABLE auth.oauth_authorizations IN ACCESS EXCLUSIVE MODE; ROLLBACK;"
        )
        lock_cron = fixture.psql("BEGIN; LOCK TABLE cron.job IN ACCESS EXCLUSIVE MODE; ROLLBACK;")

        # CREATE TRIGGER needs the privilege; DROP TRIGGER needs OWNERSHIP (mc2-ipwyc).
        created = fixture.psql(
            "CREATE SCHEMA q12_probe;"
            " CREATE FUNCTION q12_probe.refuse() RETURNS trigger LANGUAGE plpgsql"
            " AS $fn$ BEGIN RAISE EXCEPTION 'probe'; END $fn$;"
            " CREATE TRIGGER q12_probe_row BEFORE INSERT OR UPDATE OR DELETE"
            " ON auth.oauth_authorizations FOR EACH ROW EXECUTE FUNCTION q12_probe.refuse();"
        )
        dropped = fixture.psql("DROP TRIGGER q12_probe_row ON auth.oauth_authorizations;")

        sys.stdout.write(
            json.dumps(
                {
                    "barrier_is_superuser": barrier_is_superuser == "t",
                    "barrier_owns_auth_table": owns_auth_table == "t",
                    "auth_table_owner": auth_table_owner,
                    "barrier_has_trigger_on_auth_table": has_trigger_auth == "t",
                    "barrier_can_lock_auth_table": lock_auth.returncode == 0,
                    "barrier_can_lock_auth_table_stderr": lock_auth.stderr.strip(),
                    "barrier_can_lock_cron_job": lock_cron.returncode == 0,
                    "barrier_can_lock_cron_job_stderr": lock_cron.stderr.strip(),
                    "barrier_has_select_on_cron_job": has_select_cron == "t",
                    "barrier_can_create_trigger_on_auth_table": created.returncode == 0,
                    "barrier_can_drop_that_trigger": dropped.returncode == 0,
                    "barrier_can_drop_that_trigger_stderr": dropped.stderr.strip(),
                    "barrier_has_database_create": has_database_create == "t",
                    "barrier_has_trigger_on_net_queue": has_trigger_net == "t",
                    "barrier_can_execute_cron_alter_job": can_execute_alter_job == "t",
                    "managed_role_present": managed_role_present == "1",
                    "guarded_relation_count": int(guarded_relation_count),
                },
                sort_keys=True,
            )
            + "\n"
        )
        return 0
    finally:
        fixture.stop()


if __name__ == "__main__":
    raise SystemExit(main())
