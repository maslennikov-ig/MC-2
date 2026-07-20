#!/usr/bin/env python3
"""Found-defect #13 RED/GREEN isolation repro: the barrier restore-loop's
`UPDATE cron.job` variable/column conflict on a real PostgreSQL 17.10.

The frozen `q12-database-barrier.sh` `write_restore_sql` block (shared by
`activate` + `rollback`) iterates the captured cron jobs with a plpgsql loop
variable named `job` and restores each row with an `UPDATE cron.job ...`. When
the UPDATE target table `cron.job` is UNALIASED, PostgreSQL's default
`plpgsql.variable_conflict=error` cannot decide whether the `job` in
`(job->>'active')` / `(job->>'jobid')` is the plpgsql loop variable or the
implicit whole-row alias of the `cron.job` target table, and raises
`column reference "job" is ambiguous` -- so real `activate`/`rollback` abort
inside the restore loop. Aliasing the UPDATE target (`cron.job AS
restore_target`) removes the implicit `job` table alias, so `job` unambiguously
resolves to the loop variable.

This focused isolation repro stands up a minimal disposable postgres:17.10
container with a BARE `cron.job` table (jobid,active) -- no pg_cron extension
needed to trigger the parse-time conflict -- and runs both restore-loop SQL
forms:

  * OLD (unaliased): expected to RAISE `column reference "job" is ambiguous`.
  * NEW (aliased):   expected to SUCCEED and flip `active` to the captured value.

It also reads the live `deploy/qdrant/q12-database-barrier.sh` and asserts the
NEW aliased two-line statement is present verbatim and the OLD unaliased form is
absent -- so the repro stays bound to the real barrier bytes (fails if the fix is
reverted). Prints one JSON result object to stdout.

Gated behind the real-PG17 harness (MC2_Q12_REAL_PG17=1); disposable container
only, torn down in `finally`.
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

# The two mirrored restore-loop UPDATE forms, byte-for-byte as they appear (old)
# / now appear (new) in write_restore_sql of q12-database-barrier.sh:1727-1728.
OLD_UPDATE = (
    "    UPDATE cron.job SET active=(job->>'active')::boolean\n"
    "      WHERE jobid=(job->>'jobid')::bigint;"
)
NEW_UPDATE = (
    "    UPDATE cron.job AS restore_target SET active=(job->>'active')::boolean\n"
    "      WHERE restore_target.jobid=(job->>'jobid')::bigint;"
)

CAPTURED = '{"cron_jobs":[{"jobid":1,"active":true}]}'


def _restore_block(update_stmt: str) -> str:
    return (
        "DO $restore$\n"
        f"DECLARE saved jsonb := '{CAPTURED}'::jsonb; job jsonb;\n"
        "BEGIN\n"
        "  FOR job IN SELECT value FROM jsonb_array_elements(saved->'cron_jobs')\n"
        "  LOOP\n"
        f"{update_stmt}\n"
        "  END LOOP;\n"
        "END $restore$;\n"
    )


def main() -> int:
    barrier_text = BARRIER.read_text(encoding="utf-8")
    fix_present = NEW_UPDATE in barrier_text
    old_form_absent = OLD_UPDATE not in barrier_text

    cid = f"mc2-q12-cronloop-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [DOCKER, "run", "-d", "--name", cid, "-e", "POSTGRES_PASSWORD=probe", IMAGE],
        check=True,
        capture_output=True,
    )

    def dexec(sql: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )

    def dexec_scalar(sql: str) -> str:
        result = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-q", "-t", "-A",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )
        return result.stdout.strip()

    try:
        for _ in range(150):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)

        # A BARE cron.job table is enough to trigger the parse-time conflict.
        setup = dexec(
            "CREATE SCHEMA cron;\n"
            "CREATE TABLE cron.job (jobid bigint PRIMARY KEY, active boolean);\n"
            "INSERT INTO cron.job VALUES (1, false);\n"
        )

        old_result = dexec(_restore_block(OLD_UPDATE))
        new_result = dexec(_restore_block(NEW_UPDATE))
        active_after_new = dexec_scalar("SELECT active FROM cron.job WHERE jobid=1;")

        sys.stdout.write(
            json.dumps({
                "setup_rc": setup.returncode,
                "setup_stderr": setup.stderr,
                "fix_present_in_barrier": fix_present,
                "old_form_absent_from_barrier": old_form_absent,
                "old_rc": old_result.returncode,
                "old_stderr": old_result.stderr.strip(),
                "new_rc": new_result.returncode,
                "new_stderr": new_result.stderr.strip(),
                "active_after_new": active_after_new,
            }) + "\n"
        )
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
