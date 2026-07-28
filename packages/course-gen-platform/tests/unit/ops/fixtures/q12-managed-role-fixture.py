#!/usr/bin/python3
"""mc2-ot8se Task 1 — the shared MANAGED-PRIVILEGE fixture.

Every Q12 fixture before this one connected to a disposable container as ``postgres``, which is a
SUPERUSER there and therefore bypasses every ownership and privilege check.  Production is a
managed Supabase PostgreSQL where ``postgres`` is **not** a superuser, owns almost nothing, and
reaches the guarded relations only through explicit grants.  That single convenience is what let two
of the nine live-window defects through:

* ``cron.job`` (mc2-34eua) — owned by ``supabase_admin``, granted to ``postgres`` as SELECT only.
  A superuser can ``LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`` and ``CREATE TRIGGER`` on it; the
  production role gets 42501 both ways, and it was the only one of 76 candidate relations out of
  reach.
* the auth/storage ownership split (mc2-ipwyc) — ``CREATE TRIGGER`` needs only the TRIGGER
  privilege, ``DROP TRIGGER`` needs OWNERSHIP.  A superuser never notices; the production role
  armed guards it could not disarm.

This module stands the production shape up instead, once, so every pre-flight probe is written and
proven against it:

* ``mc2_barrier`` — LOGIN, NOT superuser.  Owns its own ``q12_probe`` schema and the ``public``
  relations (production's ``postgres`` owns the application schema) and nothing else.
* ``mc2_auth_admin`` / ``mc2_storage_admin`` / ``mc2_net_admin`` — own ``auth`` / ``storage`` /
  ``net`` and their tables, and grant ``TRIGGER, SELECT, INSERT, UPDATE, DELETE`` to ``mc2_barrier``
  (exactly the grant set that puts production's 22 auth + 5 storage tables into the guarded set).
* ``mc2_cron_admin`` — owns ``cron`` and ``cron.job``, and grants ``mc2_barrier`` **SELECT only**
  plus ``EXECUTE`` on ``cron.alter_job``: the retained, privilege-free cron path.
* ``supabase_admin`` — created under its production name with no objects, so E1 can reason about
  the managed boundary role that ``quiesce_client_backends()`` refuses to terminate.

The fixture is a disposable ``postgres:17.10-bookworm`` container.  Callers connect **as a role**
(``-U``), not through ``SET ROLE``, so ``current_user`` in every probe is the role whose privileges
are under test.  ``stop()`` is idempotent and callers must run it from ``finally``.
"""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass

IMAGE = "postgres:17.10-bookworm"
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
PASSWORD = "q12-managed-fixture-only"

BARRIER_ROLE = "mc2_barrier"
AUTH_OWNER = "mc2_auth_admin"
STORAGE_OWNER = "mc2_storage_admin"
NET_OWNER = "mc2_net_admin"
CRON_OWNER = "mc2_cron_admin"
# Created under its PRODUCTION name: quiesce_client_backends() matches on `usename='supabase_admin'`
# literally, so a fixture that renamed it would not exercise E1's managed-boundary branch.
MANAGED_ROLE = "supabase_admin"

# Small stand-ins for production's 47 public / 22 auth / 5 storage / 1 net guarded relations. The
# probes assert the SHAPE (privileges, ownership, schema membership), never the production counts,
# so three-and-two is as decisive as twenty-two-and-five and runs in seconds.
PUBLIC_TABLES = ("courses", "documents", "lessons")
# `oauth_authorizations` is the exact relation production named in the mc2-ipwyc failure.
AUTH_TABLES = ("users", "sessions", "oauth_authorizations")
STORAGE_TABLES = ("buckets", "objects")
NET_QUEUE = "http_request_queue"

GUARDED_RELATIONS = (
    tuple(("public", name) for name in PUBLIC_TABLES)
    + tuple(("auth", name) for name in AUTH_TABLES)
    + tuple(("storage", name) for name in STORAGE_TABLES)
    + (("net", NET_QUEUE),)
)

# The eight cron rows production carries, reduced to the projection the plan capture keeps.
CRON_JOBS = tuple(
    (index, f"select public.job_{index}()") for index in range(1, 9)
)


class FixtureError(RuntimeError):
    """Fail-closed fixture rejection."""


@dataclass
class ManagedFixture:
    container_id: str

    def psql(
        self,
        sql: str,
        role: str = BARRIER_ROLE,
        *,
        options: str | None = None,
        application_name: str | None = None,
        dbname: str = "postgres",
    ) -> subprocess.CompletedProcess:
        """Run a multi-statement script on ONE fresh connection as ``role``.

        ``options`` is the libpq startup-``options`` surface (spelled ``PGOPTIONS``) — the exact
        parameter the Supavisor pooler silently drops in production, which probe B1 measures.
        """
        argv = [DOCKER, "exec", "-i"]
        if options is not None:
            argv += ["-e", f"PGOPTIONS={options}"]
        if application_name is not None:
            argv += ["-e", f"PGAPPNAME={application_name}"]
        argv += [
            self.container_id,
            "psql",
            "-X",
            "--no-psqlrc",
            "-U",
            role,
            "-d",
            dbname,
            "-tAq",
            "-v",
            "ON_ERROR_STOP=1",
        ]
        return subprocess.run(argv, input=sql, text=True, capture_output=True)

    def scalar(
        self,
        sql: str,
        role: str = BARRIER_ROLE,
        *,
        options: str | None = None,
        application_name: str | None = None,
    ) -> str:
        completed = self.psql(sql, role, options=options, application_name=application_name)
        if completed.returncode != 0:
            raise FixtureError(f"fixture query failed: {completed.stderr.strip()}")
        return completed.stdout.strip()

    def superuser(self, sql: str) -> subprocess.CompletedProcess:
        """Escape hatch for fixture SETUP only. No probe may use it: the whole point of this
        module is that probes never see superuser rights."""
        return self.psql(sql, role="postgres")

    def stop(self) -> None:
        subprocess.run([DOCKER, "rm", "-f", self.container_id], capture_output=True)


def _wait_ready(container_id: str) -> None:
    for _ in range(300):
        ready = subprocess.run(
            [DOCKER, "exec", container_id, "pg_isready", "-U", "postgres"], capture_output=True
        )
        # BOTH streams: the entrypoint's "init process complete" banner is written to stdout while
        # the server's own log lines go to stderr, and which of the two `docker logs` surfaces the
        # banner on varies by docker version. Reading only one stream made this loop spin for its
        # full 60s and then fail closed on a container that was ready in three.
        logs = subprocess.run([DOCKER, "logs", container_id], capture_output=True, text=True)
        if ready.returncode == 0 and "init process complete" in (logs.stdout + logs.stderr):
            return
        time.sleep(0.2)
    raise FixtureError("fixture container did not become ready")


def _setup_sql() -> str:
    statements: list[str] = [
        # pgcrypto in `extensions` is what q12-structural-catalog.sql hashes through
        # (encode(extensions.digest(...))); without it probe D1 cannot run at all.
        "CREATE SCHEMA extensions;",
        "CREATE EXTENSION pgcrypto WITH SCHEMA extensions;",
        f"CREATE ROLE {BARRIER_ROLE} LOGIN;",
        f"CREATE ROLE {AUTH_OWNER} LOGIN;",
        f"CREATE ROLE {STORAGE_OWNER} LOGIN;",
        f"CREATE ROLE {NET_OWNER} LOGIN;",
        f"CREATE ROLE {CRON_OWNER} LOGIN;",
        f"CREATE ROLE {MANAGED_ROLE} LOGIN;",
        # Production's `postgres` can CREATE in the database (it owns q12_guard during a window)
        # and owns the application schema; it owns nothing else.
        f"GRANT CREATE ON DATABASE postgres TO {BARRIER_ROLE};",
        # `extensions` stays owned by another role, as it is in managed Supabase; the barrier role
        # only gets USAGE. Without it every structural-catalog measurement dies on
        # `permission denied for schema extensions` — a managed-privilege detail a superuser
        # fixture cannot show you.
        f"GRANT USAGE ON SCHEMA extensions TO {BARRIER_ROLE};",
        # pg_subscription.subconninfo is superuser-only by default. The frozen structural catalog
        # hashes that column, and it demonstrably reaches it on production (the plan measured
        # a2b25324… as `postgres` on 2026-07-28), so the fixture grants the same reachability
        # rather than pretending the projection is smaller than it is.
        f"GRANT SELECT ON pg_catalog.pg_subscription TO {BARRIER_ROLE};",
        f"GRANT SELECT ON pg_catalog.pg_user_mapping TO {BARRIER_ROLE};",
        # pg_stat_activity NULLs usename/state/backend_type/xact_start for every backend the
        # reading role neither owns nor can see through pg_read_all_stats. quiesce_client_backends()
        # is SECURITY DEFINER owned by this role, so it reads exactly what this role reads: without
        # this membership it would see a managed backend as an unclassifiable NULL row. Probe E1
        # refuses on an invisible backend for that reason; this grant is what makes the HEALTHY
        # case healthy, and the pre-flight measures whether production actually holds it.
        f"GRANT pg_read_all_stats TO {BARRIER_ROLE};",
        f"ALTER SCHEMA public OWNER TO {BARRIER_ROLE};",
        f"ALTER DATABASE postgres OWNER TO {BARRIER_ROLE};",
    ]

    # A user-defined type in `public`, used as a column type. This is what makes the structural
    # catalog SEARCH-PATH SENSITIVE: pg_catalog.format_type renders `q12_probe_status` when public
    # is on the search_path and `public.q12_probe_status` when it is not, so the same database
    # hashes to two different values in the two contexts. That is mc2-2rzf6 in miniature, and
    # without it probe D1's regression guard would prove nothing.
    statements.append(
        f"SET ROLE {BARRIER_ROLE};"
        " CREATE TYPE public.q12_probe_status AS ENUM ('draft', 'ready');"
        " RESET ROLE;"
    )
    for table in PUBLIC_TABLES:
        statements.append(
            f"SET ROLE {BARRIER_ROLE};"
            f" CREATE TABLE public.{table}(id bigint PRIMARY KEY,"
            "   status public.q12_probe_status NOT NULL DEFAULT 'draft');"
            " RESET ROLE;"
        )

    for owner, schema, tables in (
        (AUTH_OWNER, "auth", AUTH_TABLES),
        (STORAGE_OWNER, "storage", STORAGE_TABLES),
        (NET_OWNER, "net", (NET_QUEUE,)),
    ):
        statements.append(f"CREATE SCHEMA {schema} AUTHORIZATION {owner};")
        for table in tables:
            statements.append(
                f"SET ROLE {owner};"
                f" CREATE TABLE {schema}.{table}(id bigint PRIMARY KEY);"
                # The production grant set: everything LOCK TABLE and CREATE TRIGGER need, and
                # nothing that confers ownership.
                f" GRANT TRIGGER, SELECT, INSERT, UPDATE, DELETE ON {schema}.{table}"
                f" TO {BARRIER_ROLE};"
                " RESET ROLE;"
            )
        statements.append(f"GRANT USAGE ON SCHEMA {schema} TO {BARRIER_ROLE};")

    # cron: SELECT only on the job table (mc2-34eua), EXECUTE on alter_job (the retained pause).
    statements.append(f"CREATE SCHEMA cron AUTHORIZATION {CRON_OWNER};")
    statements.append(
        f"SET ROLE {CRON_OWNER};"
        " CREATE TABLE cron.job(jobid bigint PRIMARY KEY, schedule text, command text,"
        " nodename text, nodeport int, database text, username text, active boolean);"
        f" GRANT SELECT ON cron.job TO {BARRIER_ROLE};"
        " CREATE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL,"
        " command text DEFAULT NULL, database text DEFAULT NULL, username text DEFAULT NULL,"
        " active boolean DEFAULT NULL) RETURNS void LANGUAGE sql AS $fn$ SELECT NULL::void $fn$;"
        f" REVOKE ALL ON FUNCTION cron.alter_job(bigint, text, text, text, text, boolean)"
        " FROM PUBLIC;"
        f" GRANT EXECUTE ON FUNCTION cron.alter_job(bigint, text, text, text, text, boolean)"
        f" TO {BARRIER_ROLE};"
        " RESET ROLE;"
    )
    statements.append(f"GRANT USAGE ON SCHEMA cron TO {BARRIER_ROLE};")
    values = ",".join(
        f"({jobid}, '*/5 * * * *', '{command}', 'localhost', 5432, 'postgres', 'postgres', true)"
        for jobid, command in CRON_JOBS
    )
    statements.append(f"SET ROLE {CRON_OWNER}; INSERT INTO cron.job VALUES {values}; RESET ROLE;")

    # The migration-frontier table the plan capture and the frozen structural catalog both read;
    # its column set is the one q12-structural-catalog.sql projects (version/name/statements).
    statements.append(
        "CREATE SCHEMA supabase_migrations;"
        " CREATE TABLE supabase_migrations.schema_migrations("
        "   version text PRIMARY KEY, name text, statements text[]);"
        " INSERT INTO supabase_migrations.schema_migrations"
        "   VALUES ('20260711151000', 'document_evidence_observability_totals', ARRAY['SELECT 1']);"
        f" GRANT USAGE ON SCHEMA supabase_migrations TO {BARRIER_ROLE};"
        f" GRANT SELECT ON supabase_migrations.schema_migrations TO {BARRIER_ROLE};"
    )
    return "\n".join(statements) + "\n"


def start_managed_fixture(docker: str = DOCKER) -> ManagedFixture:
    """Stand up the managed privilege shape in a disposable container.

    Raises ``FixtureError`` and removes the container if any setup statement fails, so a partly
    built fixture can never be handed to a probe.
    """
    container_id = f"mc2-q12-managed-{os.getpid()}-{int(time.time() * 1000)}"
    subprocess.run(
        [
            docker,
            "run",
            "-d",
            "--name",
            container_id,
            "-e",
            f"POSTGRES_PASSWORD={PASSWORD}",
            IMAGE,
            "-c",
            # E1 reads pg_stat_activity across sessions; the default is already enough, but pinning
            # it keeps the fixture independent of image defaults.
            "track_activities=on",
        ],
        check=True,
        capture_output=True,
    )
    fixture = ManagedFixture(container_id=container_id)
    try:
        _wait_ready(container_id)
        setup = fixture.superuser(_setup_sql())
        if setup.returncode != 0:
            raise FixtureError(f"fixture setup failed: {setup.stderr.strip()}")
        # Fail closed if the shape the whole module promises did not materialise.
        if fixture.scalar(
            "SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user;"
        ) != "f":
            raise FixtureError("fixture barrier role is a superuser")
    except Exception:
        fixture.stop()
        raise
    return fixture
