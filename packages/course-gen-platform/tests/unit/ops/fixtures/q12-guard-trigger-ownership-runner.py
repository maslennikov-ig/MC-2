#!/usr/bin/python3
"""mc2-ipwyc RED/GREEN isolation repro on real PostgreSQL 17.10: the barrier can CREATE its guard
triggers on tables it does not own but cannot DROP them one by one, and its own writable-session
proof cannot survive the read-only default it installs.

BOTH FOUND ON PRODUCTION 2026-07-28 while restoring the database after live-window attempt #9.

FINDING 1 — DROP TRIGGER needs OWNERSHIP; CREATE TRIGGER only needs the TRIGGER privilege.
  The guarded set is selected by "postgres has TRIGGER on this relation", which is exactly how the
  22 auth + 5 storage tables get in — but those are owned by supabase_auth_admin /
  supabase_storage_admin. The frozen `$restore$` block (SHARED by activate and rollback) dropped its
  triggers per relation with `DROP TRIGGER %I ON %I.%I`, which on production raised
  `must be owner of relation oauth_authorizations`. activate and cleanup run that same block, so it
  would have failed identically PAST the point of no return.

  `DROP FUNCTION ... CASCADE` removes the dependent triggers WITHOUT re-checking each dependent
  object's ownership — which is how the production restore actually succeeded (through
  DROP SCHEMA q12_guard CASCADE). The barrier fix is the narrowest form of that: inside the same
  transaction, drop the guard function CASCADE, then re-create the function and the six
  q12_guard_immutable triggers, which live on tables the barrier role DOES own. Net state is
  identical to the per-relation drops; only the dependency path changes.

  In the container `postgres` is a superuser and bypasses every ownership check, so this repro
  models the MANAGED privilege split explicitly: a non-superuser `mc2_barrier` role (production's
  `postgres`) and an `mc2_table_owner` role that owns the guarded table and grants only TRIGGER.

FINDING 2 — the barrier's activate/cleanup client connects through the Supavisor POOLER with
  `options: "-c default_transaction_read_only=off"`, and the pooler never delivers that startup
  parameter to PostgreSQL. Measured against the live pooler on 2026-07-28: with
  `-c default_transaction_read_only=on`, `default_transaction_read_only` still read `off` — the
  option has no effect at all. PostgreSQL's own precedence is intact (this repro shows the startup
  option beating the database default when it IS delivered); the option simply never arrives.
  So after the barrier's install sets the database default read-only, its own reconnect inherits
  read-only and the `transaction_read_only='off'` session proof cannot pass. Only a session-level
  `SET` (the GUC is USERSET, and the pooler DSN is session-mode port 5432) clears it. This models
  the pooled connection by omitting the startup option entirely.

The repro also binds itself to the LIVE barrier bytes: the per-relation DROP TRIGGER loops must be
GONE and the CASCADE form + the explicit session SET must be PRESENT, so it goes red if the fix is
reverted. Prints one JSON object to stdout; disposable container only, torn down in `finally`.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import time

REPO = pathlib.Path(__file__).resolve().parents[6]
BARRIER = REPO / "deploy/qdrant/q12-database-barrier.sh"
IMAGE = "postgres:17.10-bookworm"
DOCKER = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")

# The retired per-relation drop, byte-for-byte as it appeared twice in the barrier's $restore$
# block. It must be ABSENT; the CASCADE form and the explicit session SET must be PRESENT.
RETIRED_DROP_LOOP = (
    "  LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I',"
    "trigger_row.tgname,trigger_row.nspname,trigger_row.relname); END LOOP;"
)
LIVE_CASCADE = "DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE;"
LIVE_SESSION_SET = 'await client.query("SET default_transaction_read_only=off")'

# The barrier's own guard-function body is not what this repro exercises; a minimal stand-in with
# the same shape (SECURITY DEFINER trigger function in q12_guard) is enough to prove the ownership
# and dependency semantics, which is all the barrier fix relies on.
GUARD_FUNCTION = (
    "CREATE FUNCTION q12_guard.enforce_write_barrier() RETURNS trigger\n"
    "  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,q12_guard AS $fn$\n"
    "  BEGIN RAISE EXCEPTION 'Q12 write barrier'; END $fn$;\n"
)


def main() -> int:
    barrier_text = BARRIER.read_text(encoding="utf-8")

    cid = f"mc2-q12-ownership-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [DOCKER, "run", "-d", "--name", cid, "-e", "POSTGRES_PASSWORD=probe", IMAGE],
        check=True,
        capture_output=True,
    )

    def psql(sql: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )

    def scalar(sql: str, options: str | None = None) -> str:
        argv = [DOCKER, "exec", "-i"]
        if options is not None:
            # PGOPTIONS is the libpq spelling of the barrier client's `options: "-c ...=off"`
            # startup parameter — the exact surface the pooler drops.
            argv += ["-e", f"PGOPTIONS={options}"]
        argv += [cid, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
                 "-U", "postgres", "-d", "postgres"]
        return subprocess.run(argv, input=sql, text=True, capture_output=True).stdout.strip()

    def count(sql: str) -> str:
        return scalar(sql)

    try:
        for _ in range(150):
            ready = subprocess.run(
                [DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True
            )
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)

        # ---- the managed privilege split: a non-superuser barrier role, a foreign table owner ----
        setup = psql(
            "CREATE ROLE mc2_barrier LOGIN;\n"
            "CREATE ROLE mc2_table_owner LOGIN;\n"
            "GRANT CREATE ON SCHEMA public TO mc2_table_owner, mc2_barrier;\n"
            "GRANT CREATE ON DATABASE postgres TO mc2_barrier;\n"
            "SET ROLE mc2_table_owner;\n"
            "CREATE TABLE public.oauth_authorizations(id bigint PRIMARY KEY);\n"
            "GRANT TRIGGER, SELECT, INSERT, UPDATE, DELETE ON public.oauth_authorizations"
            " TO mc2_barrier;\n"
            "RESET ROLE;\n"
        )
        # The barrier role owns its guard schema, its function, and its OWN durable-truth table;
        # the guarded relation stays foreign-owned, exactly as auth/storage tables are.
        guard = psql(
            "SET ROLE mc2_barrier;\n"
            "CREATE SCHEMA q12_guard;\n"
            f"{GUARD_FUNCTION}"
            "CREATE TABLE q12_guard.active_run(singleton boolean PRIMARY KEY, activated boolean);\n"
            "INSERT INTO q12_guard.active_run VALUES(true,false);\n"
            "CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE\n"
            "  ON public.oauth_authorizations FOR EACH ROW\n"
            "  EXECUTE FUNCTION q12_guard.enforce_write_barrier();\n"
            "CREATE TRIGGER q12_guard_immutable BEFORE INSERT OR UPDATE OR DELETE\n"
            "  ON q12_guard.active_run FOR EACH ROW\n"
            "  EXECUTE FUNCTION q12_guard.enforce_write_barrier();\n"
        )
        foreign_owned = count(
            "SELECT count(*)::int FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner"
            " WHERE c.relname='oauth_authorizations' AND r.rolname='mc2_table_owner';"
        )
        created = count(
            "SELECT count(*)::int FROM pg_trigger WHERE tgname='q12_guard_row'"
            " AND NOT tgisinternal;"
        )

        # ---- FINDING 1 RED: the role that CREATEd the trigger cannot DROP it ----
        dropped = psql(
            "SET ROLE mc2_barrier;\n"
            "DROP TRIGGER q12_guard_row ON public.oauth_authorizations;\n"
        )

        # ---- FINDING 1 GREEN: the barrier's activate sequence, in ONE transaction ----
        # Drop the function CASCADE FIRST (removes every dependent trigger with no ownership
        # re-check), do the restore work while the guard is off, then re-create the function and the
        # immutable triggers on the tables the barrier role DOES own. Re-creating last also keeps the
        # restore's own writes independent of the immutable trigger's narrow exemptions.
        activate = psql(
            "SET ROLE mc2_barrier;\n"
            "BEGIN;\n"
            f"{LIVE_CASCADE}\n"
            "UPDATE q12_guard.active_run SET activated=true WHERE singleton;\n"
            f"{GUARD_FUNCTION}"
            "CREATE TRIGGER q12_guard_immutable BEFORE INSERT OR UPDATE OR DELETE\n"
            "  ON q12_guard.active_run FOR EACH ROW\n"
            "  EXECUTE FUNCTION q12_guard.enforce_write_barrier();\n"
            "COMMIT;\n"
        )
        guarded_relation_triggers = count(
            "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid"
            " WHERE c.relname='oauth_authorizations' AND NOT t.tgisinternal;"
        )
        immutable_triggers = count(
            "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid"
            " JOIN pg_namespace n ON n.oid=c.relnamespace"
            " WHERE n.nspname='q12_guard' AND t.tgname='q12_guard_immutable'"
            " AND NOT t.tgisinternal;"
        )
        function_present = count(
            "SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace"
            " WHERE n.nspname='q12_guard' AND p.proname='enforce_write_barrier';"
        )
        activated = count("SELECT activated FROM q12_guard.active_run WHERE singleton;")
        # The barrier can still write through its own guarded table only via the re-created trigger's
        # refusal — proving the re-created immutable guard is armed, not a decoration.
        immutable_armed = psql(
            "SET ROLE mc2_barrier;\n"
            "INSERT INTO q12_guard.active_run VALUES(false,false);\n"
        )

        # ---- FINDING 2: a pooled session never receives the startup option ----
        psql("ALTER DATABASE postgres SET default_transaction_read_only=on;")
        pooled = scalar("SELECT current_setting('transaction_read_only');")
        direct = scalar(
            "SELECT current_setting('transaction_read_only');",
            options="-c default_transaction_read_only=off",
        )
        after_session_set = scalar(
            "SET default_transaction_read_only=off;\n"
            "SELECT current_setting('transaction_read_only');"
        )
        psql("ALTER DATABASE postgres RESET default_transaction_read_only;")

        sys.stdout.write(
            json.dumps(
                {
                    "setup_rc": setup.returncode,
                    "setup_stderr": setup.stderr.strip(),
                    "guard_rc": guard.returncode,
                    "guard_stderr": guard.stderr.strip(),
                    "relation_is_foreign_owned": foreign_owned == "1",
                    "trigger_created_without_ownership": created == "1",
                    "drop_trigger_rc": dropped.returncode,
                    "drop_trigger_stderr": dropped.stderr.strip(),
                    "activate_rc": activate.returncode,
                    "activate_stderr": activate.stderr.strip(),
                    "guarded_relation_triggers_after": guarded_relation_triggers,
                    "immutable_triggers_after": immutable_triggers,
                    "guard_function_present_after": function_present,
                    "activated_after": activated,
                    "immutable_rc": immutable_armed.returncode,
                    "immutable_stderr": immutable_armed.stderr.strip(),
                    "read_only_pooled_no_option": pooled,
                    "read_only_with_startup_option": direct,
                    "read_only_after_session_set": after_session_set,
                    "retired_drop_loop_absent": RETIRED_DROP_LOOP not in barrier_text,
                    "cascade_form_present": LIVE_CASCADE in barrier_text,
                    "session_set_present": LIVE_SESSION_SET in barrier_text,
                },
                sort_keys=True,
            )
            + "\n"
        )
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
