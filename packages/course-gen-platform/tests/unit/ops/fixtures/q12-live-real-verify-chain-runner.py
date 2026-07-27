#!/usr/bin/env python3
"""R8-B-2-i: the real-PG17 barrier VERIFY chain, extending the R4 install harness.

Drives, against the SAME disposable, full-Supabase-shaped PostgreSQL 17.10 source
the R4 harness stands up, the next real barrier steps AFTER `install`/
`maintenance_guarded`: the frozen `q12-database-barrier.sh verify-extended`
subcommand run once after the base migration (`--after-migration 20260711140000`
-> `20260711140000_guard_verified`) and once after the observability migration
(`--after-migration 20260711151000` -> `20260711151000_guard_verified`), with each
real migration applied to the container between the barrier steps.

Scaffolding REUSE (not a fork): every container/seed/identity/proxy/namespace/
catalog/journal helper is imported from the R4 runner
(`q12-live-real-barrier-cutover-runner.py`) -- SEED_SQL, canonical, sha256_hex,
write_canonical, _generate_self_signed, and the frozen identity constants (PW,
POOLER_HOST, POOLER_USER, RUN_ID, IMAGE, DOCKER, PROXY, BARRIER, REPO). This file
adds only the verify-chain extension on top of that shared harness: the real
migration application (a real CREATE TABLE for each frozen guarded relation plus a
real `q12_guard.extend_guard` under the stored capability, exactly as the
production migration packet does) and the two real `verify-extended` barrier
invocations.

Nothing about the barrier's own DB mutation path is stubbed: each `verify-extended`
runs for real via the same unprivileged user+mount+net namespace + pooler-identity
TLS proxy the R4 install leg uses (the barrier's production connection identity has
no test-mode relaxation). No `MC2_Q12_BARRIER_TEST_MODE` relaxation of the DB
command itself. Prints one JSON result object to stdout.

The migration structural hashes baked into the immutable expected-catalog are REAL:
a pre-install preflight applies each migration inside a rolled-back transaction on
the clean seeded source and captures the canonical structural catalog sha256, so
`migrations.<key>.catalog_sha256` is the genuine post-migration structural hash the
frozen `q12_guard.verify_expected_guards` recomputes and compares. The structural
catalog deliberately excludes the q12_guard schema, its enforce_write_barrier
triggers, and its event trigger, so the post-install (guarded) structural hash
equals the clean-target migration hash -- that identity is what makes the real
verify-extended checkpoint comparison pass.
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

FIXTURES = pathlib.Path(__file__).resolve().parent
R4_RUNNER = FIXTURES / "q12-live-real-barrier-cutover-runner.py"

# Import the R4 runner as a module and reuse its harness scaffolding verbatim.
_spec = importlib.util.spec_from_file_location("q12_r4c_runner", R4_RUNNER)
r4c = importlib.util.module_from_spec(_spec)
sys.modules["q12_r4c_runner"] = r4c
_spec.loader.exec_module(r4c)

canonical = r4c.canonical
sha256_hex = r4c.sha256_hex
write_canonical = r4c.write_canonical
SEED_SQL = r4c.SEED_SQL
PUBLIC_COUNT = r4c.PUBLIC_COUNT
AUTH_COUNT = r4c.AUTH_COUNT
STORAGE_NAMES = r4c.STORAGE_NAMES
CRON_COUNT = r4c.CRON_COUNT
PW = r4c.PW
POOLER_HOST = r4c.POOLER_HOST
POOLER_USER = r4c.POOLER_USER
RUN_ID = r4c.RUN_ID
IMAGE = r4c.IMAGE
DOCKER = r4c.DOCKER
PROXY = r4c.PROXY
BARRIER = r4c.BARRIER
REPO = r4c.REPO

# The capability the install stores and the migration replays. The barrier's node
# runner reads it minus one trailing newline; the migration session must supply the
# identical bytes so q12_guard.assert_capability's digest matches active_run.
CAPABILITY = "q12-r8b2i-verify-chain-capability-sentinel"
CAP_SHA = sha256_hex(CAPABILITY.encode("utf-8"))

BASE_MIGRATION = "20260711140000"
OBS_MIGRATION = "20260711151000"

# A minimal but REAL migration for each frozen guarded relation the expected
# catalog names: the same single stable relation the production catalog guards for
# each checkpoint (public.document_evidence_runs / _observability_totals). The DDL
# used to compute the preflight structural hash and the DDL replayed post-install
# are byte-identical, so the checkpoint structural comparison is exact.
BASE_DDL = "CREATE TABLE public.document_evidence_runs (id bigint PRIMARY KEY);"
OBS_DDL = "CREATE TABLE public.document_evidence_observability_totals (id bigint PRIMARY KEY);"

BASE_RELATIONS = [
    {
        "schema": "public",
        "name": "document_evidence_runs",
        "relkind": "r",
        "parent_schema": None,
        "parent_name": None,
        "owner": "postgres",
    }
]
OBS_RELATIONS = [
    {
        "schema": "public",
        "name": "document_evidence_observability_totals",
        "relkind": "r",
        "parent_schema": None,
        "parent_name": None,
        "owner": "postgres",
    }
]
BASE_FILE_SHA = sha256_hex(BASE_DDL.encode("utf-8"))
OBS_FILE_SHA = sha256_hex(OBS_DDL.encode("utf-8"))


def shlex_quote(value: str) -> str:
    import shlex

    return shlex.quote(value)


def main() -> int:  # noqa: C901 - the harness is intentionally linear/explicit
    cid = f"mc2-q12-r8b2i-src-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [
            DOCKER, "run", "-d", "--name", cid,
            "-e", f"POSTGRES_PASSWORD={PW}",
            "-p", "127.0.0.1::5432",
            IMAGE,
        ],
        check=True,
        capture_output=True,
    )

    def dexec(sql: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )

    def dexec_must(sql: str) -> None:
        result = dexec(sql)
        if result.returncode != 0:
            raise RuntimeError(f"seed/query failed: {result.stderr.strip()}")

    def dexec_scalar(sql: str) -> str:
        result = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-q", "-t", "-A",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"scalar query failed: {result.stderr.strip()}")
        return result.stdout.strip()

    def dexec_json(sql: str):
        wrapped = f"SELECT coalesce(json_agg(row_data), '[]'::json) FROM ({sql}) row_data;"
        result = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-t", "-A",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=wrapped, text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"catalog query failed: {result.stderr.strip()}")
        return json.loads(result.stdout.strip())

    structural_query = (REPO / "deploy/qdrant/q12-structural-catalog.sql").read_text(encoding="utf-8")

    def structural_after(*ddls: str) -> str:
        """Structural sha256 of the seeded source with the given DDL(s) applied
        inside a rolled-back transaction (leaves the clean baseline intact)."""
        body = "BEGIN;\n" + "".join(f"{ddl}\n" for ddl in ddls)
        body += f"SELECT structural_sha256 FROM (\n{structural_query}\n) canonical;\n"
        body += "ROLLBACK;\n"
        return dexec_scalar(body)

    root = None
    try:
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)
        dexec_must(SEED_SQL)

        # Supabase-source fidelity: the real Supabase `postgres` database carries
        # database-level (setrole=0) pg_cron GUCs, and the frozen structural catalog
        # DELIBERATELY filters exactly cron.database_name / cron.launch_active_jobs
        # (q12-structural-catalog.sql:69) -- i.e. the frozen contract assumes the source
        # already has a database-level pg_db_role_setting row. The install barrier captures
        # that pre-existing row as the baseline `database_settings` BEFORE it appends its own
        # `default_transaction_read_only=on`; prepare-recovery's readiness proof then requires
        # the post-install row (minus setconfig) to equal that baseline row
        # (q12-database-barrier.sh:1615-1618). A minimal source with NO database-level row
        # cannot satisfy that: install would CREATE the row, making the readiness comparison
        # '{}' vs {setrole,setdatabase} diverge. Seeding these two filtered GUCs restores
        # source fidelity WITHOUT changing any structural sha256 (they are filtered from the
        # structural catalog), so the R8-B-2-i verify-chain assertions are unaffected.
        dexec_must("ALTER DATABASE postgres SET cron.database_name TO 'postgres';")
        dexec_must("ALTER DATABASE postgres SET cron.launch_active_jobs TO 'on';")

        # 1. Real structural hashes: baseline (clean), after base, after base+obs.
        baseline_structural_sha256 = structural_after()
        after_base_structural_sha256 = structural_after(BASE_DDL)
        after_obs_structural_sha256 = structural_after(BASE_DDL, OBS_DDL)

        # 2. Real oids/owners for the 76 guarded relations (queried live).
        def rows(schema: str):
            return dexec_json(
                "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
                "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "JOIN pg_roles r ON r.oid=c.relowner "
                f"WHERE n.nspname='{schema}' AND c.relkind IN ('r','p') ORDER BY c.relname"
            )

        public_rows = rows("public")
        auth_rows = rows("auth")
        storage_rows = rows("storage")
        cron_row = dexec_json(
            "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
            "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='cron' AND c.relname='job'"
        )[0]
        net_row = dexec_json(
            "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
            "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
            "WHERE n.nspname='net' AND c.relname='http_request_queue'"
        )[0]
        cron_jobs_real = dexec_json("SELECT jobid, command FROM cron.job ORDER BY jobid")

        if len(public_rows) != PUBLIC_COUNT or len(auth_rows) != AUTH_COUNT or len(storage_rows) != len(STORAGE_NAMES):
            raise RuntimeError(
                f"seed counts drifted: public={len(public_rows)} auth={len(auth_rows)} storage={len(storage_rows)}"
            )

        def guarded(schema, name, oid, owner):
            return {"schema": schema, "name": name, "oid": oid, "relkind": "r",
                    "parent_oid": None, "owner": owner}

        guarded_relations = (
            [guarded("public", r["name"], r["oid"], r["owner"]) for r in public_rows]
            + [guarded("auth", r["name"], r["oid"], r["owner"]) for r in auth_rows]
            + [guarded("storage", r["name"], r["oid"], r["owner"]) for r in storage_rows]
            + [guarded("cron", "job", cron_row["oid"], cron_row["owner"]),
               guarded("net", "http_request_queue", net_row["oid"], net_row["owner"])]
        )
        if len(guarded_relations) != 76:
            raise RuntimeError(f"guarded_relations count drifted: {len(guarded_relations)}")

        cron_jobs_catalog = [
            {"jobid": r["jobid"], "username": "postgres",
             "command_sha256": sha256_hex(r["command"].encode("utf-8"))}
            for r in cron_jobs_real
        ]

        # 3. The immutable expected catalog -- migration hashes are the REAL
        #    post-migration structural hashes captured in step 1.
        expected_catalog = {
            "schema_version": "megacampus.q12.expected-post-migration-catalog/v1",
            "database": "postgres",
            "database_owner": "postgres",
            "release_sha": "1" * 40,
            "migration_frontier": "20260704150249",
            "baseline_structural_sha256": baseline_structural_sha256,
            "expected_post_migration_catalog_sha256": after_obs_structural_sha256,
            "inventory_counts": {"public": PUBLIC_COUNT, "auth": AUTH_COUNT, "storage": 5, "cron_jobs": CRON_COUNT, "pg_net_queue": 0},
            "guarded_relations": guarded_relations,
            "cron_jobs": cron_jobs_catalog,
            "migrations": {
                BASE_MIGRATION: {
                    "catalog_sha256": after_base_structural_sha256,
                    "migration_file_sha256": BASE_FILE_SHA,
                    "relations": BASE_RELATIONS,
                },
                OBS_MIGRATION: {
                    "catalog_sha256": after_obs_structural_sha256,
                    "migration_file_sha256": OBS_FILE_SHA,
                    "relations": OBS_RELATIONS,
                },
            },
        }
        catalog_body = f"{canonical(expected_catalog)}\n"
        catalog_sha256 = sha256_hex(catalog_body.encode("utf-8"))

        # 4. Barrier run-root scaffolding (mirrors the R4 install harness exactly).
        root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-barrier-", dir="/tmp"))
        root.chmod(0o700)
        project_dir = root / "project" / "packages" / "course-gen-platform"
        secrets_dir = root / "secrets"
        barrier_run_root = root / "backups" / "q12" / RUN_ID
        run_secrets_dir = barrier_run_root / "secrets"
        for directory in (project_dir.parent, secrets_dir, barrier_run_root, run_secrets_dir):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.chmod(0o700)
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
        r4c._generate_self_signed(cert_path, key_path, POOLER_HOST)
        ca_file = secrets_dir / "prod-ca.crt"
        ca_file.write_bytes(cert_path.read_bytes())
        ca_file.chmod(0o644)

        capability_file = run_secrets_dir / "db-capability"
        capability_file.write_text(f"{CAPABILITY}\n", encoding="utf-8")
        capability_file.chmod(0o400)

        catalog_file = barrier_run_root / "expected-catalog.json"
        catalog_file.write_text(catalog_body, encoding="utf-8")
        catalog_file.chmod(0o400)

        # install child-input checkpoint + cutover journal (same as R4).
        write_canonical(
            barrier_run_root / "database-barrier-input-checkpoint-install-cutover.json",
            {
                "schema_version": "megacampus.q12.cutover-checkpoint/v1",
                "run_id": RUN_ID, "seq": 3, "phase": "maintenance_guarded",
                "journal_entry_hash": "1" * 64, "previous_journal_entry_hash": "0" * 64,
                "journal_device": "1", "journal_inode": "1",
                "accepted_object_kind": "none", "accepted_object_sha256": None,
                "resume_authority_sha256": None, "lease_epoch": "cutover",
            },
            0o600,
        )
        write_canonical(
            barrier_run_root / "phase.jsonl",
            {
                "schema": "megacampus.q12.cutover-journal/v1", "run_id": RUN_ID, "seq": 3,
                "phase": "maintenance_guarded", "outcome": "capability_claimed",
                "timestamp": "2026-07-14T07:00:00.000Z", "release_sha": "1" * 40,
                "operator_digest": "2" * 64, "command_id": "barrier.install",
                "command_sha256": "3" * 64, "lease_epoch": "cutover", "previous_hash": "0" * 64,
                "entry_hash": "1" * 64, "rotation_required": True,
                "resource_manifest_sha256": "d" * 64, "quiesce_manifest_sha256": "0" * 64,
                "capability_manifest_sha256": "c" * 64, "accepted_object_kind": "none",
                "accepted_object_sha256": None,
            },
            0o600,
        )

        fakehosts = root / "fakehosts"
        fakehosts.write_text(
            f"127.0.0.1 localhost\n127.0.0.1 {POOLER_HOST}\n::1 localhost ip6-localhost ip6-loopback\n",
            encoding="utf-8",
        )

        barrier_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": os.environ.get("HOME", "/root"),
            "LC_ALL": "C", "LANG": "C",
            "MC2_Q12_BARRIER_TEST_MODE": "mc2-synthetic-q12-database-barrier-test-only",
            "MC2_Q12_BARRIER_TEST_ROOT": str(root),
            "MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY": str(root / "project"),
            "MC2_Q12_BARRIER_TEST_NODE": str(node_copy),
        }

        def run_barrier(op: str, after_migration: str | None = None):
            """Drive one real barrier subcommand inside a private user+mount+net
            namespace behind the pooler-identity TLS proxy (no DB-command stub)."""
            ready_file = root / f"proxy-ready-{op}-{after_migration or 'none'}"
            wrapper = root / f"run-barrier-{op}-{after_migration or 'none'}.sh"
            after_arg = (
                f"  --after-migration {shlex_quote(after_migration)} \\\n" if after_migration else ""
            )
            wrapper.write_text(
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
bash {shlex_quote(str(BARRIER))} {shlex_quote(op)} \\
  --run-id {shlex_quote(RUN_ID)} \\
  --db-url-file {shlex_quote(str(db_url_file))} \\
  --ca-file {shlex_quote(str(ca_file))} \\
  --q12-db-capability-file {shlex_quote(str(capability_file))} \\
  --expected-post-migration-catalog {shlex_quote(str(catalog_file))} \\
{after_arg}  --expected-post-migration-catalog-sha256 {catalog_sha256}
barrier_rc=$?
set -e
kill "$proxy_pid" 2>/dev/null || true
exit "$barrier_rc"
""",
                encoding="utf-8",
            )
            wrapper.chmod(0o700)
            return subprocess.run(
                ["unshare", "--user", "--map-root-user", "--mount", "--net", "bash", str(wrapper)],
                env=barrier_env, capture_output=True, text=True, timeout=120,
            )

        def require_leg(op: str, result):
            """mc2-vcmd7 (fixture side): every leg's exit status is load-bearing. A nonzero child
            used to surface only as a downstream artifact being absent, several frames later, with
            the barrier's own reason discarded — the same blindness the barrier itself had. Fail
            here, with its words."""
            if result.returncode != 0:
                stderr = result.stderr or ""
                # The barrier's own lines are what matter; the sandbox's docker/proxy chatter can
                # bury them, so surface them preferentially and keep a tail as the fallback.
                own = [line for line in stderr.splitlines() if line.startswith("q12 ")]
                detail = " | ".join(own[-6:]) if own else stderr.strip()[-2000:]
                raise SystemExit(f"real barrier {op} failed ({result.returncode}): {detail}")
            return result

        receipt_path = barrier_run_root / "database-barrier-receipt.json"

        def read_receipt():
            return json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else None

        # 5. install -> maintenance_guarded (the R4 acceptance, re-driven here).
        install_result = require_leg("install", run_barrier("install"))
        install_receipt = read_receipt()

        def apply_migration(migration: str, ddl: str, relations, file_sha: str, catalog_sha: str):
            """Replay a real migration under the stored capability: a real CREATE
            TABLE for the frozen guarded relation plus a real q12_guard.extend_guard,
            in one transaction -- the production migration packet's guard-publication
            step (scripts/migrations/document-evidence-approved.ts:applyQ12BasePacket)."""
            relations_json = canonical(relations)
            sql = (
                "SET default_transaction_read_only = off;\n"
                f"SET megacampus.q12_capability = '{CAPABILITY}';\n"
                "BEGIN;\n"
                f"{ddl}\n"
                f"SELECT q12_guard.extend_guard('{migration}', "
                f"'{relations_json}'::jsonb, '{file_sha}', '{catalog_sha}');\n"
                "COMMIT;\n"
            )
            return dexec(sql)

        def guard_surface():
            tables = dexec_json(
                "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname='q12_guard' AND c.relkind='r' ORDER BY c.relname"
            )
            functions = dexec_json(
                "SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE n.nspname='q12_guard' ORDER BY p.proname"
            )
            evt = dexec_json(
                "SELECT count(*) AS n FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start'"
            )[0]["n"]
            guards = dexec_json(
                "SELECT migration, catalog_sha256, migration_file_sha256 "
                "FROM q12_guard.migration_guards ORDER BY migration"
            )
            return {
                "tables": [r["name"] for r in tables],
                "functions": [r["name"] for r in functions],
                "event_trigger_count": evt,
                "migration_guards": guards,
            }

        # 6. probe receipt (0400) -- the owner-checked predecessor verify-extended
        #    re-validates (q12-database-barrier.sh:311-336). Byte shape is the
        #    fixture composer's _barrier_probe_object with our real catalog sha.
        probe_receipt = {
            "schema_version": "megacampus.q12.database-barrier-probes/v1",
            "run_id": RUN_ID,
            "expected_catalog_sha256": catalog_sha256,
            "completed_at": "2026-07-14T08:00:00.000Z",
            "probes": {
                "postgrest_anon": "rejected",
                "postgrest_authenticated": "rejected",
                "postgrest_service_role_without_capability": "rejected",
                "postgrest_service_role_with_capability": "rolled_back",
                "postgrest_preference_applied": "tx=rollback",
                "auth_profile": "rejected_zero_residue",
                "storage_object": "rejected_zero_metadata_zero_bytes",
                "cron_rpc": "rejected_exact_jobs_unchanged",
                "pg_net_rpc": "rejected_zero_queue_zero_external_request",
                "direct_supervisor": "rolled_back",
            },
            "residue": {
                "guard_probe_rows": 0,
                "auth_rows": 0,
                "storage_metadata_rows": 0,
                "storage_object_bytes": 0,
                "cron_job_set_unchanged": True,
                "pg_net_queue_rows": 0,
                "external_requests": 0,
            },
        }
        probe_receipt_file = barrier_run_root / "database-barrier-probe-receipt.json"
        probe_receipt_file.write_text(f"{canonical(probe_receipt)}\n", encoding="utf-8")
        probe_receipt_file.chmod(0o400)

        # 7. verify-after-base: apply base migration, then real verify-extended.
        base_migration_result = apply_migration(
            BASE_MIGRATION, BASE_DDL, BASE_RELATIONS, BASE_FILE_SHA, after_base_structural_sha256
        )
        verify_base_result = run_barrier("verify-extended", BASE_MIGRATION)
        verify_base_receipt = read_receipt()
        surface_after_base = guard_surface()

        # 8. verify-after-observability: apply obs migration, then real verify-extended.
        obs_migration_result = apply_migration(
            OBS_MIGRATION, OBS_DDL, OBS_RELATIONS, OBS_FILE_SHA, after_obs_structural_sha256
        )
        verify_obs_result = run_barrier("verify-extended", OBS_MIGRATION)
        verify_obs_receipt = read_receipt()
        surface_after_obs = guard_surface()

        post_state = dexec_json(
            "SELECT (SELECT count(*) FROM cron.job WHERE active) AS cron_active, "
            "(SELECT current_setting('default_transaction_read_only')) AS read_only"
        )[0]

        def db_lifecycle_state():
            return dexec_json(
                "SELECT (SELECT activated FROM q12_guard.active_run WHERE singleton) AS activated, "
                "(SELECT count(*) FROM cron.job WHERE active) AS cron_active, "
                "(SELECT current_setting('default_transaction_read_only')) AS read_only"
            )[0]

        # 9. prepare-recovery (R8-B-2-ii): the frozen forward successor of
        #    verify-after-observability. The barrier re-validates the verify-obs receipt
        #    as its predecessor (state 20260711151000_guard_verified, last_command
        #    verify-extended, rollback_probes_verified=true, probe_receipt_sha256 bound to
        #    the same owner-checked probe receipt -- q12-database-barrier.sh:344-359), runs
        #    the real read-only recovery-readiness + quiesce proof against the guarded DB,
        #    and reaches recovery_ready_guarded (rollback_probes_verified=true, bound
        #    probe_receipt_sha256). Captured non-raising so the verify chain result stands
        #    independently.
        prepare_recovery_result = require_leg("prepare-recovery", run_barrier("prepare-recovery"))
        prepare_recovery_receipt = read_receipt()
        surface_after_prepare = guard_surface()
        prepare_db_state = db_lifecycle_state()

        # 10. activate (R8-B-2-ii): the normal activation path (write_restore_sql false).
        #     Restores cron/read_only to the captured baseline, drops the probe table, sets
        #     activated=true under the append-only guard, verifies verify_activated_state,
        #     and reaches activated (last_command=activate, rollback_probes_verified=true).
        activate_result = require_leg("activate", run_barrier("activate"))
        activate_receipt = read_receipt()
        surface_after_activate = guard_surface()
        activate_db_state = db_lifecycle_state()

        # The probe receipt bytes the barrier binds into every post-verify receipt: its
        # sha256 is what rollback_probes_verified pins as probe_receipt_sha256.
        probe_receipt_body_sha256 = sha256_hex(f"{canonical(probe_receipt)}\n".encode("utf-8"))

        # 11. Anti-weakening guard probe (found-defect #14 GREEN, R8-B-2-ii defrost).
        #     With the durable-guard triggers still live post-activate and the capability
        #     supplied, EVERY q12_guard-table write must still trip the append-only guard
        #     as SQLSTATE P0001 'Q12 durable guard truth is append-only' -- NOT the pre-fix
        #     42703 'record "old" has no field "run_id"'. This exercises the REAL installed
        #     enforce_write_barrier (not a mirror) and proves the #14 nested-IF restructure
        #     did not weaken the guard: the run_id-less baseline / migration_guards fall to
        #     the append-only RAISE (their OLD.run_id is never evaluated now), and the
        #     active_run non-flip UPDATE (activated already true) also lands on it via inner
        #     fall-through. Each probe UPDATE RAISES and rolls back, so no state changes.
        def guard_probe(update_sql: str):
            # Defrost P3: assert the LITERAL SQLSTATE, not just the message. Wrap the guarded write in
            # a DO/EXCEPTION handler that captures SQLSTATE and RAISE NOTICE 'Q12_PROBE_SQLSTATE=%'
            # then re-RAISEs, so the probe still trips (rc != 0, the append-only message on stderr)
            # AND the exact code is emitted -- an unambiguous marker independent of psql's verbose
            # formatting. The append-only guard uses plpgsql's default raise_exception (P0001); a
            # regression to the pre-#14 42703 'record "old" has no field "run_id"' would surface both
            # a different captured SQLSTATE and that message.
            body = update_sql.rstrip().rstrip(";")
            result = dexec(
                "\\set VERBOSITY verbose\n"
                f"SET megacampus.q12_capability = '{CAPABILITY}';\n"
                "DO $q12probe$\nBEGIN\n"
                f"  {body};\n"
                "EXCEPTION WHEN OTHERS THEN\n"
                "  RAISE NOTICE 'Q12_PROBE_SQLSTATE=%', SQLSTATE;\n"
                "  RAISE;\n"
                "END\n$q12probe$;\n"
            )
            return {"rc": result.returncode, "stderr": (result.stderr or "").strip()}

        guard_probe_active_run = guard_probe(
            "UPDATE q12_guard.active_run SET expected_catalog=expected_catalog WHERE singleton;"
        )
        guard_probe_baseline = guard_probe(
            "UPDATE q12_guard.baseline SET baseline=baseline WHERE singleton;"
        )
        guard_probe_migration_guards = guard_probe(
            "UPDATE q12_guard.migration_guards SET relation_set=relation_set;"
        )

        # 12. R8-B-2-iii: drive the REAL frozen barrier `cleanup` OFF the activated state, then prove
        #     the R8-B-1 controller seam consumes the REAL terminal proof end-to-end. The barrier
        #     cleanup (bytes f183aa3c, same real proxy/namespace/no-DB-relaxation path as every other
        #     leg) has a predecessor gate (q12-database-barrier.sh:636-700) requiring: the install
        #     baseline (already published by the install leg), the activate receipt (already at
        #     database-barrier-receipt.json), AND a byte-exact predecessor-receipt ARCHIVE the
        #     CONTROLLER must create BEFORE the barrier runs. Create the archive first.
        def barrier_canonical(value) -> str:
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

        activate_receipt_bytes = receipt_path.read_bytes()
        archive_path = barrier_run_root / "database-barrier-receipt-v1-before-cleanup.json"
        archive_path.write_bytes(activate_receipt_bytes)
        archive_path.chmod(0o400)

        # 13. CONTROLLER-JOURNAL half (orchestrate_post_activate_cleanup's authority, core.py:3362):
        #     rewrite phase.jsonl as a REAL hash-chained guard_cleanup_complete lifecycle to the
        #     claimed boundary the frozen barrier validates (q12-database-barrier.sh:507-553). A
        #     minimal 3-row block (intent -> capability_issued -> capability_claimed), all
        #     phase=guard_cleanup_complete / command_id=barrier.cleanup / lease_epoch=cutover, is the
        #     smallest valid controller journal: the barrier filters the cleanup rows by phase+command_id
        #     and only requires them to be a valid trailing contiguous hash-chain block, so prior
        #     forward rows are optional here. The fake-hash install journal the verify legs used cannot
        #     drive cleanup (the cleanup projection re-hashes every entry), so a fresh real chain is built.
        cleanup_cap_manifest_sha = sha256_hex(b"q12-r8b2iii-cleanup-capability-manifest")
        cleanup_rows_spec = [
            ("intent", "0" * 64),
            ("capability_issued", cleanup_cap_manifest_sha),
            ("capability_claimed", cleanup_cap_manifest_sha),
        ]
        cleanup_entries = []
        previous_hash = "0" * 64
        for seq, (outcome, cap_manifest) in enumerate(cleanup_rows_spec, start=1):
            entry = {
                "schema": "megacampus.q12.cutover-journal/v1",
                "run_id": RUN_ID,
                "seq": seq,
                "phase": "guard_cleanup_complete",
                "outcome": outcome,
                "timestamp": f"2026-07-14T09:00:0{seq}.000Z",
                "release_sha": "1" * 40,
                "operator_digest": "2" * 64,
                "command_id": "barrier.cleanup",
                "command_sha256": "3" * 64,
                "lease_epoch": "cutover",
                "previous_hash": previous_hash,
                "rotation_required": False,
                "resource_manifest_sha256": "d" * 64,
                "quiesce_manifest_sha256": "0" * 64,
                "capability_manifest_sha256": cap_manifest,
                "accepted_object_kind": "none",
                "accepted_object_sha256": None,
            }
            entry_hash = sha256_hex(barrier_canonical(entry).encode("utf-8"))
            entry["entry_hash"] = entry_hash
            cleanup_entries.append(entry)
            previous_hash = entry_hash
        cleanup_intent = cleanup_entries[0]
        cleanup_head = cleanup_entries[-1]
        phase_journal = barrier_run_root / "phase.jsonl"
        phase_journal.write_text(
            "".join(f"{barrier_canonical(e)}\n" for e in cleanup_entries), encoding="utf-8"
        )
        phase_journal.chmod(0o600)

        # The frozen barrier's cleanup input checkpoint = the cutover-checkpoint projection of the
        # claimed head, with journal_device/journal_inode bound to the journal file it will stat
        # (q12-database-barrier.sh:582-597). The device/inode are stable across the mount namespace.
        journal_stat = phase_journal.stat()
        cleanup_input_checkpoint = {
            "schema_version": "megacampus.q12.cutover-checkpoint/v1",
            "run_id": RUN_ID,
            "seq": cleanup_head["seq"],
            "phase": "guard_cleanup_complete",
            "journal_entry_hash": cleanup_head["entry_hash"],
            "previous_journal_entry_hash": cleanup_head["previous_hash"],
            "journal_device": str(journal_stat.st_dev),
            "journal_inode": str(journal_stat.st_ino),
            "accepted_object_kind": "none",
            "accepted_object_sha256": None,
            "resume_authority_sha256": None,
            "lease_epoch": "cutover",
        }
        checkpoint_path = (
            barrier_run_root / "database-barrier-input-checkpoint-cleanup-cutover.json"
        )
        checkpoint_path.write_text(
            f"{barrier_canonical(cleanup_input_checkpoint)}\n", encoding="utf-8"
        )
        checkpoint_path.chmod(0o600)

        # 14. Drive the REAL frozen barrier cleanup (drive 1): real DROP SCHEMA q12_guard CASCADE,
        #     zero-residue proof, and the 18-key terminal proof publication.
        cleanup_terminal_proof_path = (
            barrier_run_root / "database-barrier-cleanup-terminal-proof.json"
        )
        cleanup_result = require_leg("cleanup", run_barrier("cleanup"))
        cleanup_terminal_proof = (
            json.loads(cleanup_terminal_proof_path.read_text(encoding="utf-8"))
            if cleanup_terminal_proof_path.exists()
            else None
        )
        cleanup_terminal_proof_sha256_after_barrier = (
            sha256_hex(cleanup_terminal_proof_path.read_bytes())
            if cleanup_terminal_proof_path.exists()
            else None
        )
        # Independently confirm q12_guard is really gone (live catalog query, not the proof's own report).
        # LOAD-BEARING (stage-iii review P3-1): do NOT delete this as redundant with the terminal proof.
        # Under test_mode=1 + real_reconnect_test=0 the frozen barrier's terminal-reconnect residue
        # re-check BYPASSES the fresh-connection gate (q12-database-barrier.sh:1952) and reports a
        # SYNTHETIC residue (:2063-2074); THIS independent second-observer live
        # pg_namespace/pg_class/pg_proc/pg_event_trigger query is therefore the genuine real-DB
        # zero-residue proof, not a duplicate of the terminal proof's self-report.
        guard_residue_db = dexec_json(
            "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='q12_guard') AS schema_count, "
            "(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname='q12_guard') AS relation_count, "
            "(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='q12_guard') AS function_count, "
            "(SELECT count(*) FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start') "
            "AS event_trigger_count"
        )[0]

        # 15. Cleanup re-drive idempotence: a second cleanup drive re-validates the existing terminal
        #     proof exact (barrier :764-808 early branch, before any DB work) and exits 0. Runs BEFORE
        #     the seam deletes the capability the barrier re-reads.
        cleanup_rerun_result = run_barrier("cleanup")
        cleanup_terminal_proof_sha256_after_rerun = (
            sha256_hex(cleanup_terminal_proof_path.read_bytes())
            if cleanup_terminal_proof_path.exists()
            else None
        )

        # 16. R8-B-1 seam: the REAL ProductionExecutor archives the v1 activate receipt, promotes it in
        #     place to the exact 10-key database-barrier-receipt/v2 binding the REAL barrier-produced
        #     terminal-proof + probe digests, and deletes the db-capability -- driven against the REAL
        #     run_root the barrier cleanup just populated (not a seeded fixture proof).
        core_spec = importlib.util.spec_from_file_location(
            "q12_lifecycle_core", REPO / "deploy/qdrant/q12-lifecycle-core.py"
        )
        core = importlib.util.module_from_spec(core_spec)
        sys.modules["q12_lifecycle_core"] = core
        core_spec.loader.exec_module(core)

        seam_context = {
            "run_root": str(barrier_run_root),
            "run_id": RUN_ID,
            "expected_catalog_sha256": catalog_sha256,
        }
        executor = core.ProductionExecutor()
        seam_command = executor.prepare_barrier_cleanup(seam_context)
        seam_outcome = executor.execute_barrier_cleanup(seam_context, seam_command)

        v2_receipt_bytes = receipt_path.read_bytes()
        v2_receipt = json.loads(v2_receipt_bytes)
        archive_after_seam_bytes = archive_path.read_bytes()

        # Independently recompute the exact 10-key v2 the promotion MUST produce (byte-match anchor to
        # the fixture contract, q12-retained-barrier-runner.py:731-742) from the REAL barrier-produced
        # terminal-proof digest + real probe digest.
        expected_v2 = {
            "schema_version": "megacampus.q12.database-barrier-receipt/v2",
            "run_id": RUN_ID,
            "state": "guard_cleanup_complete",
            "expected_catalog_sha256": catalog_sha256,
            "zero_guard_residue": True,
            "last_command": "cleanup",
            "rollback_probes_verified": True,
            "probe_receipt_sha256": seam_outcome.get("probe_receipt_sha256"),
            "terminal_proof_sha256": seam_outcome.get("terminal_proof_sha256"),
            "database_capability_deleted": True,
        }
        expected_v2_body = core.complete_object(expected_v2)
        capability_exists_after_seam = (
            capability_file.exists() or capability_file.is_symlink()
        )

        sys.stdout.write(
            json.dumps({
                "seed_counts": {"public": len(public_rows), "auth": len(auth_rows),
                                "storage": len(storage_rows), "cron": CRON_COUNT, "net": 0},
                "catalog_sha256": catalog_sha256,
                "baseline_structural_sha256": baseline_structural_sha256,
                "after_base_structural_sha256": after_base_structural_sha256,
                "after_obs_structural_sha256": after_obs_structural_sha256,
                "install_rc": install_result.returncode,
                "install_stderr": install_result.stderr,
                "install_receipt_state": install_receipt.get("state") if install_receipt else None,
                "base_migration_rc": base_migration_result.returncode,
                "base_migration_stderr": base_migration_result.stderr,
                "verify_base_rc": verify_base_result.returncode,
                "verify_base_stdout": verify_base_result.stdout,
                "verify_base_stderr": verify_base_result.stderr,
                "verify_base_receipt": verify_base_receipt,
                "verify_base_receipt_state": verify_base_receipt.get("state") if verify_base_receipt else None,
                "surface_after_base": surface_after_base,
                "obs_migration_rc": obs_migration_result.returncode,
                "obs_migration_stderr": obs_migration_result.stderr,
                "verify_obs_rc": verify_obs_result.returncode,
                "verify_obs_stdout": verify_obs_result.stdout,
                "verify_obs_stderr": verify_obs_result.stderr,
                "verify_obs_receipt": verify_obs_receipt,
                "verify_obs_receipt_state": verify_obs_receipt.get("state") if verify_obs_receipt else None,
                "surface_after_obs": surface_after_obs,
                "post_verify_cron_active": post_state["cron_active"],
                "post_verify_read_only": post_state["read_only"],
                "probe_receipt": probe_receipt,
                "probe_receipt_sha256": probe_receipt_body_sha256,
                "prepare_recovery_rc": prepare_recovery_result.returncode,
                "prepare_recovery_stdout": prepare_recovery_result.stdout,
                "prepare_recovery_stderr": prepare_recovery_result.stderr,
                "prepare_recovery_receipt": prepare_recovery_receipt,
                "prepare_recovery_receipt_state":
                    prepare_recovery_receipt.get("state") if prepare_recovery_receipt else None,
                "surface_after_prepare": surface_after_prepare,
                "prepare_db_state": prepare_db_state,
                "activate_rc": activate_result.returncode,
                "activate_stdout": activate_result.stdout,
                "activate_stderr": activate_result.stderr,
                "activate_receipt": activate_receipt,
                "activate_receipt_state": activate_receipt.get("state") if activate_receipt else None,
                "surface_after_activate": surface_after_activate,
                "activate_db_state": activate_db_state,
                "guard_probe_active_run": guard_probe_active_run,
                "guard_probe_baseline": guard_probe_baseline,
                "guard_probe_migration_guards": guard_probe_migration_guards,
                # ---- R8-B-2-iii: real frozen barrier cleanup + R8-B-1 seam ----
                "cleanup_rc": cleanup_result.returncode,
                "cleanup_stdout": cleanup_result.stdout,
                "cleanup_stderr": cleanup_result.stderr,
                "cleanup_terminal_proof": cleanup_terminal_proof,
                "cleanup_terminal_proof_key_count": len(cleanup_terminal_proof)
                if cleanup_terminal_proof
                else 0,
                "cleanup_intent_journal_entry_hash": cleanup_intent["entry_hash"],
                "guard_residue_db": guard_residue_db,
                "cleanup_rerun_rc": cleanup_rerun_result.returncode,
                "cleanup_rerun_stdout": cleanup_rerun_result.stdout,
                "cleanup_rerun_stderr": cleanup_rerun_result.stderr,
                "cleanup_terminal_proof_sha256_after_barrier": cleanup_terminal_proof_sha256_after_barrier,
                "cleanup_terminal_proof_sha256_after_rerun": cleanup_terminal_proof_sha256_after_rerun,
                "seam_command": seam_command,
                "seam_outcome": seam_outcome,
                "v2_receipt": v2_receipt,
                "v2_receipt_keys": sorted(v2_receipt),
                "v2_bytes_utf8": v2_receipt_bytes.decode("utf-8"),
                "v2_matches_expected_contract": v2_receipt_bytes == expected_v2_body,
                "archive_matches_activate_receipt": archive_after_seam_bytes
                == activate_receipt_bytes,
                "capability_exists_after_seam": capability_exists_after_seam,
            }) + "\n"
        )
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)
        if root is not None:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
