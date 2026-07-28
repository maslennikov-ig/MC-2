#!/usr/bin/python3
"""mc2-ot8se — driver for the Q12 window pre-flight suite.

Two modes:

* ``--self-test`` (default) — drives ``q12-window-preflight.py --self-test`` through every case and
  reports the aggregation facts: exit codes, first offender, probe coverage, report mode and shape.
  No database, no host, no docker.
* ``--probes`` — drives the real probe bodies against the MANAGED-PRIVILEGE fixture (a disposable
  PostgreSQL 17.10 with a non-superuser barrier role and foreign object owners) and against
  synthetic host trees, proving each probe BITES. Requires docker.

Prints one JSON object to stdout.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[5]
PREFLIGHT = REPO / "deploy/qdrant/q12-window-preflight.py"
PROBES_MODULE = REPO / "deploy/qdrant/q12-preflight-probes.py"

BASE_ENV = {
    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
    "LC_ALL": "C",
    "LANG": "C",
    "MC2_Q12_PLAN_DOCKER": os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker"),
}


def load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


probes = load("q12_preflight_probes", PROBES_MODULE)


def run_preflight(args: "list[str]", report_dir: pathlib.Path):
    completed = subprocess.run(
        ["/usr/bin/python3", str(PREFLIGHT), "--report-dir", str(report_dir), *args],
        capture_output=True,
        text=True,
        env=BASE_ENV,
        check=False,
    )
    return completed


def newest_report(report_dir: pathlib.Path) -> pathlib.Path:
    reports = sorted(report_dir.glob("q12-window-preflight-*.json"))
    if not reports:
        raise RuntimeError("the pre-flight published no report")
    return reports[-1]


def self_test() -> dict:
    out: dict = {"frozen_ids": list(probes.FROZEN_IDS)}
    with tempfile.TemporaryDirectory(prefix="mc2-q12-preflight-") as raw:
        base = pathlib.Path(raw)
        for case, key in (
            ("all-pass", "exit_all_pass"),
            ("one-fail", "exit_with_one_fail"),
            ("unprovable-no-evidence", "exit_with_unprovable_no_evidence"),
            ("unprovable-with-evidence", "exit_with_unprovable_with_evidence"),
        ):
            directory = base / case
            directory.mkdir()
            completed = run_preflight(["--self-test", case, "--scope", "all"], directory)
            out[key] = completed.returncode
            report_path = newest_report(directory)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            if case == "one-fail":
                out["first_offender_one_fail"] = _offender_line(completed.stderr)
            if case == "unprovable-no-evidence":
                out["first_offender_unprovable_no_evidence"] = _offender_line(completed.stderr)
            if case == "all-pass":
                out["report_ids"] = [item["id"] for item in report["probes"]]
                out["report_mode"] = oct(report_path.stat().st_mode & 0o777).replace("0o", "0o")
                out["report_schema_version"] = report["schema_version"]
                out["report_summary"] = report["summary"]
                out["report_captured_at"] = report["captured_at"]
                out["report_tree_sha"] = report["tree_sha"]
                out["stdout_lines"] = [
                    line for line in completed.stdout.splitlines() if line.strip()
                ]

        # Host scope: the out-of-scope ids are NAMED, not dropped.
        directory = base / "scope-host"
        directory.mkdir()
        run_preflight(["--self-test", "all-pass", "--scope", "host"], directory)
        host_report = json.loads(newest_report(directory).read_text(encoding="utf-8"))
        out["scope_host_ids"] = [item["id"] for item in host_report["probes"]]
        out["scope_host_out_of_scope"] = list(host_report["out_of_scope"])

        # A re-run publishes a NEW report; evidence for one attempt is never overwritten.
        directory = base / "rerun"
        directory.mkdir()
        run_preflight(["--self-test", "all-pass", "--scope", "host"], directory)
        first = sorted(directory.glob("q12-window-preflight-*.json"))
        import time

        time.sleep(1.1)
        run_preflight(["--self-test", "all-pass", "--scope", "host"], directory)
        second = sorted(directory.glob("q12-window-preflight-*.json"))
        out["rerun_is_a_new_report"] = len(second) == len(first) + 1

    return out


def _offender_line(stderr: str) -> str:
    for line in stderr.splitlines():
        if "first offender:" in line:
            return line.rsplit(":", 1)[1].strip()
    return ""


# --- probe bodies against the managed-privilege fixture ------------------------------------------

fixture_module = load("q12_managed_role_fixture", HERE / "q12-managed-role-fixture.py")

# A synthetic barrier stand-in carrying the SAME frozen expression the live barrier carries, so A7
# reads its expectation the same way in the fixture and in production.
SYNTHETIC_BARRIER = '  (.guarded_relations | type == "array" and length == 9) and\n'


def fixture_script(fixture):
    def script(sql: str, *, options=None, application_name=None, role=None):
        completed = fixture.psql(
            sql,
            role or fixture_module.BARRIER_ROLE,
            options=options,
            application_name=application_name,
        )
        return probes.ScriptResult(completed.returncode, completed.stdout, completed.stderr)

    return script


def synthetic_catalog(fixture, overrides=None):
    """Build the run root's expected-post-migration-catalog shape from the LIVE fixture, so the
    healthy case is a real agreement rather than a hand-written echo of the probe."""
    raw = fixture.scalar(
        "SELECT COALESCE(jsonb_agg(jsonb_build_object("
        " 'schema', n.nspname, 'name', c.relname, 'oid', c.oid::bigint,"
        " 'relkind', c.relkind::text,"
        " 'parent_oid', (SELECT i.inhparent::bigint FROM pg_catalog.pg_inherits i"
        "                WHERE i.inhrelid = c.oid),"
        " 'owner', pg_catalog.pg_get_userbyid(c.relowner)"
        ") ORDER BY n.nspname, c.relname), '[]'::jsonb)"
        " FROM pg_catalog.pg_class c"
        " JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"
        " WHERE c.relkind IN ('r','p') AND ("
        " n.nspname = 'public'"
        " OR (n.nspname IN ('auth','storage')"
        "     AND pg_catalog.has_table_privilege(current_user, c.oid, 'TRIGGER'))"
        " OR (n.nspname = 'net' AND c.relname = 'http_request_queue'));"
    )
    catalog = {"guarded_relations": json.loads(raw)}
    if overrides:
        catalog.update(overrides)
    return catalog


STRUCTURAL_CATALOG_SQL = (
    (REPO / "deploy/qdrant/q12-structural-catalog.sql").read_text(encoding="utf-8").strip()
)


def live_cron_projection(fixture) -> list:
    """The plan capture's own reduced cron projection: jobid / username / command_sha256."""
    import hashlib

    raw = fixture.scalar(
        "SELECT COALESCE(jsonb_agg(jsonb_build_object("
        " 'jobid', job.jobid::bigint, 'username', job.username, 'command', job.command"
        ") ORDER BY job.jobid), '[]'::jsonb) FROM cron.job job;"
    )
    return [
        {
            "jobid": row["jobid"],
            "username": row["username"],
            "command_sha256": hashlib.sha256(row["command"].encode("utf-8")).hexdigest(),
        }
        for row in json.loads(raw)
    ]


def structural_sha(fixture, *, pg_catalog: bool) -> str:
    """Measure the frozen structural catalog in ONE named search_path context.

    `pg_catalog=False` reproduces mc2-2rzf6's producer: the ambient search_path, under which
    pg_get_indexdef and friends suppress the schema qualifier and the same database hashes
    differently.
    """
    binding = "SET LOCAL search_path = pg_catalog;\n" if pg_catalog else ""
    sql = (
        "BEGIN READ ONLY;\n"
        f"{binding}"
        f"COPY (SELECT structural_sha256 FROM (\n{STRUCTURAL_CATALOG_SQL}\n) AS capture)"
        " TO STDOUT;\n"
        "COMMIT;\n"
    )
    completed = fixture.psql(sql)
    if completed.returncode != 0:
        raise RuntimeError(f"structural capture failed: {completed.stderr.strip()}")
    return completed.stdout.strip()


def hold_session(fixture, *, role, in_transaction, application_name=None):
    """Open a psql session on the fixture and LEAVE IT OPEN, so E1/E2 see a real backend."""
    argv = [fixture_module.DOCKER, "exec", "-i"]
    if application_name is not None:
        argv += ["-e", f"PGAPPNAME={application_name}"]
    argv += [
        fixture.container_id, "psql", "-X", "--no-psqlrc", "-U", role, "-d", "postgres", "-tAq",
    ]
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    proc.stdin.write("BEGIN;\nSELECT 1;\n" if in_transaction else "SELECT 1;\n")
    proc.stdin.flush()
    # Wait for the backend to actually register in pg_stat_activity before the probe reads it.
    for _ in range(100):
        seen = fixture.scalar(
            "SELECT count(*)::int FROM pg_catalog.pg_stat_activity"
            f" WHERE usename = '{role}'"
            + (
                f" AND application_name = '{application_name}'"
                if application_name is not None
                else ""
            )
            + (" AND xact_start IS NOT NULL" if in_transaction else "")
            + ";"
        )
        if seen != "0":
            break
        time.sleep(0.1)
    return proc


def release_session(proc) -> None:
    try:
        proc.stdin.close()
    except OSError:
        pass
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def make_context(fixture, catalog, barrier_text=SYNTHETIC_BARRIER):
    return probes.Context(
        scope="database",
        script=fixture_script(fixture),
        catalog=catalog,
        barrier_text=barrier_text,
    )


def run_one(context, probe_id: str) -> dict:
    for probe in probes.PROBES:
        if probe["id"] == probe_id:
            try:
                return probe["run"](context)
            except Exception as error:  # noqa: BLE001 — a probe failure is a verdict
                return probes.verdict(probe_id, probes.FAIL, f"probe raised: {error}")
    raise RuntimeError(f"unknown probe {probe_id}")


def record(out: dict, key: str, result: dict) -> None:
    out[key] = result["verdict"]
    out[f"{key}_detail"] = result["detail"]
    out[f"{key}_evidence"] = result["evidence"]


def probe_suite() -> dict:
    out: dict = {}
    fixture = fixture_module.start_managed_fixture()
    try:
        healthy_catalog = synthetic_catalog(fixture)
        context = make_context(fixture, healthy_catalog)

        # Hard invariant 1, proven rather than declared: the wrapper's assertion aborts the whole
        # script when the transaction is NOT read-only. Same body, `BEGIN` instead of
        # `BEGIN READ ONLY` — it must fail closed, or every probe below is measuring nothing.
        wrapped = probes.read_only("SELECT 1")
        out["read_only_wrapper_says_read_only"] = "BEGIN READ ONLY;" in wrapped
        ok = fixture.psql(wrapped)
        broken = fixture.psql(wrapped.replace("BEGIN READ ONLY;", "BEGIN;"))
        out["read_only_guard_passes_when_read_only"] = ok.returncode == 0
        out["read_only_guard_bites_when_writable"] = broken.returncode != 0
        out["read_only_guard_bite_stderr"] = " ".join(broken.stderr.split())[:200]
        for probe_id in ("A1", "A2", "A3", "A4", "A5", "A6", "A7"):
            record(out, f"{probe_id.lower()}_healthy", run_one(context, probe_id))
        out["a7_barrier_expectation"] = probes.barrier_expected_count(context)

        # --- A1: identity drift, two shapes -----------------------------------------------------
        drifted = json.loads(json.dumps(healthy_catalog))
        for entry in drifted["guarded_relations"]:
            if entry["schema"] == "auth" and entry["name"] == "users":
                entry["owner"] = "mc2_storage_admin"
        record(out, "a1_owner_drift", run_one(make_context(fixture, drifted), "A1"))

        vanished = json.loads(json.dumps(healthy_catalog))
        vanished["guarded_relations"].append(
            {
                "schema": "public",
                "name": "vanished",
                "oid": 999999,
                "relkind": "r",
                "parent_oid": None,
                "owner": fixture_module.BARRIER_ROLE,
            }
        )
        record(out, "a1_missing_relation", run_one(make_context(fixture, vanished), "A1"))

        # --- A2/A4: cron.job in the guarded set (the mc2-34eua shape) ---------------------------
        with_cron = json.loads(json.dumps(healthy_catalog))
        with_cron["guarded_relations"].append(
            {
                "schema": "cron",
                "name": "job",
                "oid": 999998,
                "relkind": "r",
                "parent_oid": None,
                "owner": fixture_module.CRON_OWNER,
            }
        )
        cron_context = make_context(fixture, with_cron)
        record(out, "a2_select_only", run_one(cron_context, "A2"))
        record(out, "a4_cron_present", run_one(cron_context, "A4"))

        # --- A7: count drift, against the plan and against the barrier --------------------------
        short = json.loads(json.dumps(healthy_catalog))
        short["guarded_relations"] = short["guarded_relations"][:-1]
        record(out, "a7_count_drift", run_one(make_context(fixture, short), "A7"))
        record(
            out,
            "a7_barrier_drift",
            run_one(
                make_context(
                    fixture,
                    healthy_catalog,
                    barrier_text=SYNTHETIC_BARRIER.replace("length == 9", "length == 75"),
                ),
                "A7",
            ),
        )

        # --- A3/A6: a revoked TRIGGER privilege, restored afterwards -----------------------------
        fixture.psql(
            "REVOKE TRIGGER ON auth.oauth_authorizations FROM mc2_barrier;",
            role=fixture_module.AUTH_OWNER,
        )
        record(out, "a3_one_revoked", run_one(make_context(fixture, healthy_catalog), "A3"))
        fixture.psql(
            "GRANT TRIGGER ON auth.oauth_authorizations TO mc2_barrier;",
            role=fixture_module.AUTH_OWNER,
        )

        fixture.psql(
            "REVOKE TRIGGER ON net.http_request_queue FROM mc2_barrier;",
            role=fixture_module.NET_OWNER,
        )
        record(out, "a6_revoked", run_one(make_context(fixture, healthy_catalog), "A6"))
        fixture.psql(
            "GRANT TRIGGER ON net.http_request_queue TO mc2_barrier;",
            role=fixture_module.NET_OWNER,
        )

        # --- A5: a q12_guard schema owned by somebody else ---------------------------------------
        fixture.superuser(f"CREATE SCHEMA q12_guard AUTHORIZATION {fixture_module.AUTH_OWNER};")
        record(out, "a5_foreign_guard", run_one(make_context(fixture, healthy_catalog), "A5"))
        fixture.superuser("DROP SCHEMA q12_guard;")

        # --- Group B: the pooled session ---------------------------------------------------------
        healthy_b = make_context(fixture, healthy_catalog)
        # B1 scans real source bytes: the LIVE barrier (which must carry no unmatched dependence)
        # plus a synthetic runner that does depend on startup-option delivery.
        healthy_b.option_dependence_sources = {
            "q12-database-barrier.sh": (REPO / "deploy/qdrant/q12-database-barrier.sh").read_text(
                encoding="utf-8"
            )
        }
        for probe_id in ("B1", "B2", "B3", "B4"):
            record(out, f"{probe_id.lower()}_healthy", run_one(healthy_b, probe_id))
        barrier_text = healthy_b.option_dependence_sources["q12-database-barrier.sh"]
        wants = probes.OPTION_DEPENDENCE_RE.findall(barrier_text)
        states = probes.SESSION_SET_RE.findall(barrier_text)
        out["b1_live_barrier_option_sites"] = len(wants)
        out["b1_live_barrier_unmatched"] = sum(
            max(0, wants.count(value) - states.count(value)) for value in sorted(set(wants))
        )

        dependent = make_context(fixture, healthy_catalog)
        dependent.option_dependence_sources = {
            # A runner that asks the CONNECTION for read-only and never states it in the session:
            # exactly the shape that was fatal after install set the database default.
            "fake-runner.js": 'const c = new Client({...conn, options:"-c '
            'default_transaction_read_only=on"}); await c.query("SELECT 1");'
        }
        record(out, "b1_dependent_runner", run_one(dependent, "B1"))

        # B2: a faithful transaction-mode-pooling fake — each transaction lands on a DIFFERENT
        # backend, which is exactly what Supavisor's port 6543 does. Not a stubbed verdict: the
        # same probe body runs, against a seam that reassigns the connection per transaction.
        def transaction_mode_script(sql: str, *, options=None, application_name=None, role=None):
            pieces = [piece for piece in sql.split("COMMIT;") if piece.strip()]
            stdout: list[str] = []
            for piece in pieces:
                completed = fixture.psql(
                    piece + "COMMIT;\n",
                    role or fixture_module.BARRIER_ROLE,
                    options=options,
                    application_name=application_name,
                )
                if completed.returncode != 0:
                    return probes.ScriptResult(
                        completed.returncode, "".join(stdout), completed.stderr
                    )
                stdout.append(completed.stdout)
            return probes.ScriptResult(0, "".join(stdout), "")

        pooled = make_context(fixture, healthy_catalog)
        pooled.script = transaction_mode_script
        record(out, "b2_transaction_mode", run_one(pooled, "B2"))

        # B3: a pooler that rewrites application_name in flight.
        def rewriting_script(sql: str, *, options=None, application_name=None, role=None):
            completed = fixture.psql(
                sql,
                role or fixture_module.BARRIER_ROLE,
                options=options,
                application_name="supavisor-rewrote-this",
            )
            return probes.ScriptResult(completed.returncode, completed.stdout, completed.stderr)

        rewritten = make_context(fixture, healthy_catalog)
        rewritten.script = rewriting_script
        record(out, "b3_rewritten", run_one(rewritten, "B3"))

        # B4: the database owned by another role.
        fixture.superuser(f"ALTER DATABASE postgres OWNER TO {fixture_module.AUTH_OWNER};")
        record(out, "b4_foreign_owner", run_one(make_context(fixture, healthy_catalog), "B4"))
        fixture.superuser(f"ALTER DATABASE postgres OWNER TO {fixture_module.BARRIER_ROLE};")

        # --- Groups C, D, E -----------------------------------------------------------------------
        healthy_catalog["cron_jobs"] = live_cron_projection(fixture)
        healthy_catalog["baseline_structural_sha256"] = structural_sha(fixture, pg_catalog=True)
        cde = make_context(fixture, healthy_catalog)
        cde.structural_catalog_sql = STRUCTURAL_CATALOG_SQL
        for probe_id in ("C1", "C2", "C3", "C4", "C5", "C6", "D1", "E1", "E2"):
            record(out, f"{probe_id.lower()}_healthy", run_one(cde, probe_id))

        # C5/C6 evidence must name something that actually exists, not a plausible string.
        out["c5_evidence_names_a_real_artifact"] = "mc2-6fnrt" in probes.C5_EVIDENCE
        out["c6_evidence_names_a_real_artifact"] = (
            REPO / "packages/course-gen-platform/tests/unit/ops/q12-guard-trigger-ownership.test.ts"
        ).is_file()

        # C1: EXECUTE revoked.
        fixture.psql(
            "REVOKE EXECUTE ON FUNCTION"
            " cron.alter_job(bigint, text, text, text, text, boolean) FROM mc2_barrier;",
            role=fixture_module.CRON_OWNER,
        )
        record(out, "c1_revoked", run_one(make_context(fixture, healthy_catalog), "C1"))
        fixture.psql(
            "GRANT EXECUTE ON FUNCTION"
            " cron.alter_job(bigint, text, text, text, text, boolean) TO mc2_barrier;",
            role=fixture_module.CRON_OWNER,
        )

        # C2: a changed command, and a job left paused by a previous attempt.
        fixture.psql("UPDATE cron.job SET command = 'select public.tampered()' WHERE jobid = 3;",
                     role=fixture_module.CRON_OWNER)
        record(out, "c2_command_drift", run_one(make_context(fixture, healthy_catalog), "C2"))
        fixture.psql("UPDATE cron.job SET command = 'select public.job_3()' WHERE jobid = 3;",
                     role=fixture_module.CRON_OWNER)
        fixture.psql("UPDATE cron.job SET active = false WHERE jobid = 5;",
                     role=fixture_module.CRON_OWNER)
        record(out, "c2_paused_job", run_one(make_context(fixture, healthy_catalog), "C2"))
        fixture.psql("UPDATE cron.job SET active = true WHERE jobid = 5;",
                     role=fixture_module.CRON_OWNER)

        # C3: a queued pg_net request.
        fixture.psql("INSERT INTO net.http_request_queue VALUES (1);",
                     role=fixture_module.NET_OWNER)
        record(out, "c3_nonempty", run_one(make_context(fixture, healthy_catalog), "C3"))
        fixture.psql("DELETE FROM net.http_request_queue;", role=fixture_module.NET_OWNER)

        # C4: residue from an earlier attempt.
        fixture.psql(
            "CREATE SCHEMA q12_guard;"
            " CREATE FUNCTION q12_guard.enforce_write_barrier() RETURNS trigger"
            " LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'x'; END $fn$;"
        )
        record(out, "c4_residue", run_one(make_context(fixture, healthy_catalog), "C4"))
        fixture.psql("DROP SCHEMA q12_guard CASCADE;")

        # D1: the mc2-2rzf6 regression guard — a catalog captured under the AMBIENT search_path.
        ambient = structural_sha(fixture, pg_catalog=False)
        out["d1_contexts_differ"] = ambient != healthy_catalog["baseline_structural_sha256"]
        drifted_catalog = dict(healthy_catalog)
        drifted_catalog["baseline_structural_sha256"] = ambient
        ambient_context = make_context(fixture, drifted_catalog)
        ambient_context.structural_catalog_sql = STRUCTURAL_CATALOG_SQL
        record(out, "d1_ambient_search_path", run_one(ambient_context, "D1"))

        # E1/E2: sessions held open across the probe, exactly as attempt #9 held its coordinator.
        managed = hold_session(fixture, role=fixture_module.MANAGED_ROLE, in_transaction=True)
        try:
            record(out, "e1_busy_managed_backend", run_one(make_context(fixture, healthy_catalog), "E1"))
            # …and the same backend with pg_read_all_stats revoked: pg_stat_activity nulls its
            # columns, and E1 must refuse rather than count zero. quiesce_client_backends() runs
            # SECURITY DEFINER as this role and would be just as blind.
            fixture.superuser(f"REVOKE pg_read_all_stats FROM {fixture_module.BARRIER_ROLE};")
            record(out, "e1_invisible_backend", run_one(make_context(fixture, healthy_catalog), "E1"))
            fixture.superuser(f"GRANT pg_read_all_stats TO {fixture_module.BARRIER_ROLE};")
        finally:
            release_session(managed)

        ours = hold_session(
            fixture,
            role=fixture_module.BARRIER_ROLE,
            in_transaction=False,
            application_name="megacampus-q12-w3-snapshot-coordinator",
        )
        try:
            record(out, "e2_our_session_alive", run_one(make_context(fixture, healthy_catalog), "E2"))
        finally:
            release_session(ours)
    finally:
        fixture.stop()
    return out


# --- host probes against a synthetic deploy tree --------------------------------------------------

preflight_module = load("q12_window_preflight", PREFLIGHT)

COMPOSE_FIXTURE = """services:
  qdrant:
    image: qdrant/qdrant:v1.18.2@sha256:{qdrant}
  operator:
    image: ghcr.io/example/qdrant-operator@sha256:${{QDRANT_OPERATOR_IMAGE_SHA256}}
"""
ENV_FIXTURE = "SOME_OTHER=value\nQDRANT_OPERATOR_IMAGE_SHA256={operator}\nPASSWORD=not-read\n"

QDRANT_DIGEST = "a" * 64
OPERATOR_DIGEST = "b" * 64
QDRANT_REF = f"qdrant/qdrant@sha256:{QDRANT_DIGEST}"
OPERATOR_REF = f"ghcr.io/example/qdrant-operator@sha256:{OPERATOR_DIGEST}"


def fake_host(root: pathlib.Path, *, images, processes, containers, free, gh=None):
    """A HostAdapter over a real temp tree with scripted docker/du answers.

    Real files (so mode/owner/sha256 are measured, not mocked) and scripted subprocesses (so the
    probe's docker and du parsing is exercised without a live daemon).
    """

    def run(argv):
        if argv[:3] == ["docker", "image", "inspect"]:
            reference = argv[-1]
            identity = images.get(reference)
            if identity is None:
                return probes.ScriptResult(1, "", f"Error: No such image: {reference}")
            return probes.ScriptResult(0, identity + "\n", "")
        if argv[:2] == ["docker", "ps"]:
            return probes.ScriptResult(0, "".join(f"{cid}\n" for cid, _, _ in containers), "")
        if argv[:2] == ["docker", "inspect"]:
            return probes.ScriptResult(
                0, "".join(f"/{name}\t{started}\n" for _, name, started in containers), ""
            )
        if argv[0] == "du":
            path = pathlib.Path(argv[-1])
            total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
            return probes.ScriptResult(0, f"{total}\t{path}\n", "")
        if gh is not None and argv[0] == gh:
            return probes.ScriptResult(0, "[]", "")
        return probes.ScriptResult(127, "", f"unexpected argv: {argv}")

    return probes.HostAdapter(
        deploy_root=root,
        run=run,
        processes=lambda: list(processes),
        disk_free_bytes=lambda _path: free,
        backup_root=root / "backups",
        compose_file=root / "h1-compose.yml",
        env_file=root / "h1-env",
        gh=gh,
        self_pid=os.getpid(),
    )


def localise_manifest(manifest: dict) -> dict:
    """The synthetic deploy tree belongs to whoever runs the suite, not to `claude-deploy`.

    Only the OWNER NAMES are rebound; mode, path and sha256 stay exactly as tracked, so H2's
    identity and byte checks are all still exercised for real against a real filesystem.
    """
    import grp
    import pwd

    user = pwd.getpwuid(os.getuid()).pw_name
    group = grp.getgrgid(os.getgid()).gr_name
    local = json.loads(json.dumps(manifest))
    for asset in local["assets"]:
        if asset.get("owner") is not None:
            asset["owner"] = user
            asset["group"] = group
    return local


def build_deploy_tree(root: pathlib.Path, manifest: dict) -> None:
    """Materialise the manifest's assets under a synthetic deploy root, byte-for-byte from the
    repository, with the modes the manifest declares."""
    for asset in manifest["assets"]:
        source = REPO / asset["path"]
        target = root / asset["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        if asset.get("mode") is not None:
            os.chmod(target, int(asset["mode"], 8))
    # H1's compose/env fixtures live BESIDE the tree, not in it: overwriting the real
    # docker-compose.infra.yml would make H2 report a byte difference the operator never made.
    (root / "h1-compose.yml").write_text(
        COMPOSE_FIXTURE.format(qdrant=QDRANT_DIGEST), encoding="utf-8"
    )
    (root / "h1-env").write_text(ENV_FIXTURE.format(operator=OPERATOR_DIGEST), encoding="utf-8")
    generation = root / "backups/supabase/generation-20260728T000000Z-probe"
    generation.mkdir(parents=True)
    (generation / "dump.sql").write_bytes(b"x" * 4096)


def host_context(root: pathlib.Path, manifest: dict, host) -> "probes.Context":
    return probes.Context(scope="host", manifest=manifest, host=host)


def old_start() -> str:
    return "2020-01-01T00:00:00.123456789Z"


def recent_start() -> str:
    import datetime

    now = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=3)
    return now.strftime("%Y-%m-%dT%H:%M:%S.000000000Z")


def host_suite() -> dict:
    out: dict = {}
    manifest_path = REPO / "deploy/qdrant/q12-deployed-asset-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    out["manifest_schema_version"] = manifest["schema_version"]
    out["command_manifest_sha256"] = hashlib.sha256(
        (REPO / "deploy/qdrant/q12-command-manifest.json").read_bytes()
    ).hexdigest()

    # The ratchet: every manifest entry must still describe the tree.
    stale, missing = [], []
    for asset in manifest["assets"]:
        source = REPO / asset["path"]
        if not source.is_file():
            missing.append(asset["path"])
            continue
        if hashlib.sha256(source.read_bytes()).hexdigest() != asset["sha256"]:
            stale.append(asset["path"])
    out["manifest_stale_entries"] = sorted(stale)
    out["manifest_missing_from_tree"] = sorted(missing)

    healthy_images = {
        QDRANT_REF: "sha256:qdrant-id",
        OPERATOR_REF: "sha256:operator-id",
        probes.hold_tag_for("qdrant/qdrant"): "sha256:qdrant-id",
        probes.hold_tag_for("ghcr.io/example/qdrant-operator"): "sha256:operator-id",
    }
    quiet_containers = [("c1", "megacampus-api-dev", old_start())]

    with tempfile.TemporaryDirectory(prefix="mc2-q12-host-") as raw:
        root = pathlib.Path(raw)
        build_deploy_tree(root, manifest)
        # H2 is driven against a locally-owned copy of the tracked manifest: same paths, same modes,
        # same hashes, owner names rebound to whoever runs the suite.
        manifest = localise_manifest(manifest)
        healthy = fake_host(
            root, images=healthy_images, processes=[], containers=quiet_containers, free=1 << 40
        )
        context = host_context(root, manifest, healthy)
        for probe_id in ("H1", "H2", "H3", "H4", "H5"):
            record(out, f"{probe_id.lower()}_healthy", run_one(context, probe_id))

        # --- H2: one changed byte, a wrong mode, a wrong owner, a missing file -------------------
        target = root / "deploy/qdrant/q12-database-barrier.sh"
        original = target.read_bytes()
        os.chmod(target, 0o644)
        target.write_bytes(original + b"\n")
        os.chmod(target, 0o555)
        record(out, "h2_changed_byte", run_one(host_context(root, manifest, healthy), "H2"))
        os.chmod(target, 0o644)
        target.write_bytes(original)
        os.chmod(target, 0o555)

        os.chmod(target, 0o755)
        record(out, "h2_wrong_mode", run_one(host_context(root, manifest, healthy), "H2"))
        os.chmod(target, 0o555)

        # A CI-delivered asset's mode changing is NOT a failure: scp rewrites it every deploy.
        ci_asset = root / "scripts/deploy_blue_green.sh"
        os.chmod(ci_asset, 0o700)
        record(out, "h2_ci_mode_change", run_one(host_context(root, manifest, healthy), "H2"))

        removed = root / "deploy/qdrant/q12-live-smoke.sh"
        removed_bytes = removed.read_bytes()
        removed.unlink()
        record(out, "h2_missing_file", run_one(host_context(root, manifest, healthy), "H2"))
        removed.write_bytes(removed_bytes)
        os.chmod(removed, 0o555)

        wrong_owner = json.loads(json.dumps(manifest))
        for asset in wrong_owner["assets"]:
            if asset["path"] == "deploy/qdrant/q12-privileged-launch.sh":
                asset["owner"] = "nobody-at-all"
                asset["group"] = "nobody-at-all"
        record(out, "h2_wrong_owner", run_one(host_context(root, wrong_owner, healthy), "H2"))

        # --- H1: an absent image, and a present-but-untagged one ---------------------------------
        absent = dict(healthy_images)
        absent.pop(OPERATOR_REF)
        record(
            out,
            "h1_image_absent",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root, images=absent, processes=[], containers=quiet_containers, free=1 << 40
                    ),
                ),
                "H1",
            ),
        )
        untagged = dict(healthy_images)
        untagged.pop(probes.hold_tag_for("ghcr.io/example/qdrant-operator"))
        record(
            out,
            "h1_hold_tag_missing",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=untagged,
                        processes=[],
                        containers=quiet_containers,
                        free=1 << 40,
                    ),
                ),
                "H1",
            ),
        )

        # --- H3: a running controller, and the pre-flight's own command line ---------------------
        controller = [
            (4242, ["/usr/bin/python3", "/opt/megacampus/deploy/qdrant/q12-lifecycle-core.py",
                    "controller", "--run-id", "x"])
        ]
        record(
            out,
            "h3_controller_running",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=healthy_images,
                        processes=controller,
                        containers=quiet_containers,
                        free=1 << 40,
                    ),
                ),
                "H3",
            ),
        )
        # Only the pre-flight itself is running — including a second pre-flight process, which a
        # `pgrep -f q12` pattern would happily report as a controller.
        self_only = [
            (os.getpid(), ["/usr/bin/python3", "/opt/megacampus/deploy/qdrant/q12-window-preflight.py"]),
            (9999, ["/usr/bin/python3", "/opt/megacampus/deploy/qdrant/q12-window-preflight.py",
                    "--scope", "host"]),
        ]
        record(
            out,
            "h3_only_preflight_running",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=healthy_images,
                        processes=self_only,
                        containers=quiet_containers,
                        free=1 << 40,
                    ),
                ),
                "H3",
            ),
        )

        # --- H4: a deploy in flight, and a dev container restarted inside the quiet window -------
        deploying = [(5151, ["/usr/bin/bash", "/opt/megacampus/scripts/deploy_dev.sh"])]
        record(
            out,
            "h4_deploy_in_flight",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=healthy_images,
                        processes=deploying,
                        containers=quiet_containers,
                        free=1 << 40,
                    ),
                ),
                "H4",
            ),
        )
        record(
            out,
            "h4_recent_dev_restart",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=healthy_images,
                        processes=[],
                        containers=[("c1", "megacampus-api-dev", recent_start())],
                        free=1 << 40,
                    ),
                ),
                "H4",
            ),
        )

        # --- H5: free space at or below the high-water mark ---------------------------------------
        record(
            out,
            "h5_disk_full",
            run_one(
                host_context(
                    root,
                    manifest,
                    fake_host(
                        root,
                        images=healthy_images,
                        processes=[],
                        containers=quiet_containers,
                        free=1024,
                    ),
                ),
                "H5",
            ),
        )
    return out


# --- the cutover gate -----------------------------------------------------------------------------

CUTOVER_SHELL = REPO / "deploy/qdrant/q12-live-cutover.sh"


def write_report(directory: pathlib.Path, stamp: str, report: dict) -> pathlib.Path:
    path = directory / f"q12-window-preflight-{stamp}.json"
    path.write_text(json.dumps(report, sort_keys=True) + "\n", encoding="utf-8")
    return path


def green_report(manifest_sha: str, captured_at: str, *, scope="all", probes_override=None) -> dict:
    return {
        "schema_version": "megacampus.q12.window-preflight/v1",
        "captured_at": captured_at,
        "tree_sha": "0" * 40,
        "tree_sha_source": "asset-manifest",
        "scope": scope,
        "run_root": "/opt/megacampus/backups/q12/probe",
        "probes": probes_override
        if probes_override is not None
        else [
            {"id": probe_id, "verdict": "pass", "detail": "measured", "evidence": None}
            for probe_id in probes.FROZEN_IDS
        ],
        "out_of_scope": [],
        "summary": {"pass": len(probes.FROZEN_IDS), "fail": 0, "unprovable": 0},
        "asset_manifest_sha256": manifest_sha,
    }


def stamp_for(minutes_ago: int) -> "tuple[str, str]":
    import datetime

    moment = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes_ago)
    captured = moment.strftime("%Y-%m-%dT%H:%M:%SZ")
    return captured, captured.replace(":", "").replace("-", "")


def run_gate(report_dir: pathlib.Path, deploy_root: pathlib.Path):
    return subprocess.run(
        [
            "/usr/bin/python3",
            str(PREFLIGHT),
            "--assert-fresh-report",
            "--report-dir",
            str(report_dir),
            "--deploy-root",
            str(deploy_root),
        ],
        capture_output=True,
        text=True,
        env=BASE_ENV,
        check=False,
    )


def gate_suite() -> dict:
    out: dict = {}
    manifest_source = REPO / "deploy/qdrant/q12-deployed-asset-manifest.json"
    manifest_sha = hashlib.sha256(manifest_source.read_bytes()).hexdigest()

    with tempfile.TemporaryDirectory(prefix="mc2-q12-gate-") as raw:
        base = pathlib.Path(raw)
        deploy_root = base / "deploy-root"
        (deploy_root / "deploy/qdrant").mkdir(parents=True)
        (deploy_root / "deploy/qdrant/q12-deployed-asset-manifest.json").write_bytes(
            manifest_source.read_bytes()
        )

        def case(name: str, build) -> None:
            directory = base / name
            directory.mkdir()
            build(directory)
            completed = run_gate(directory, deploy_root)
            out[name] = completed.returncode
            out[f"{name}_stderr"] = (
                "ok"
                if completed.returncode == 0
                else " ".join(completed.stderr.split())[:300]
            )

        fresh_captured, fresh_stamp = stamp_for(1)
        case(
            "accepts_green",
            lambda d: write_report(d, fresh_stamp, green_report(manifest_sha, fresh_captured)),
        )
        out["accepts_green_stderr"] = "ok" if out["accepts_green"] == 0 else out["accepts_green_stderr"]

        case("refuses_missing", lambda d: None)

        stale_captured, stale_stamp = stamp_for(90)
        case(
            "refuses_stale",
            lambda d: write_report(d, stale_stamp, green_report(manifest_sha, stale_captured)),
        )
        case(
            "refuses_other_tree",
            lambda d: write_report(d, fresh_stamp, green_report("f" * 64, fresh_captured)),
        )
        red = [
            {
                "id": probe_id,
                "verdict": "fail" if probe_id == "C3" else "pass",
                "detail": "measured",
                "evidence": None,
            }
            for probe_id in probes.FROZEN_IDS
        ]
        case(
            "refuses_red",
            lambda d: write_report(
                d, fresh_stamp, green_report(manifest_sha, fresh_captured, probes_override=red)
            ),
        )
        hollow = [
            {
                "id": probe_id,
                "verdict": "unprovable" if probe_id == "C5" else "pass",
                "detail": "measured",
                "evidence": None,
            }
            for probe_id in probes.FROZEN_IDS
        ]
        case(
            "refuses_unprovable_without_evidence",
            lambda d: write_report(
                d, fresh_stamp, green_report(manifest_sha, fresh_captured, probes_override=hollow)
            ),
        )
        case(
            "refuses_host_scope",
            lambda d: write_report(
                d, fresh_stamp, green_report(manifest_sha, fresh_captured, scope="host")
            ),
        )

    # The shell wiring: which modes the gate covers, and that the exec line did not move.
    shell = CUTOVER_SHELL.read_text(encoding="utf-8")
    out["shell_gates_live"] = "$mode == live" in shell and "--assert-fresh-report" in shell
    out["shell_gates_supervisor"] = "$mode == supervisor" in shell
    out["shell_exempts_plan"] = "$mode == plan" not in shell
    out["shell_exempts_recover"] = "$mode == recover" not in shell
    out["shell_exec_line_unchanged"] = (
        'exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" "$mode" "$@"\n' in shell
    )
    helped = subprocess.run(
        ["/usr/bin/bash", str(CUTOVER_SHELL), "live", "--help"],
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"},
        check=False,
    )
    out["shell_live_help_status"] = helped.returncode
    return out


def main(argv: "list[str]") -> int:
    if "--gate" in argv:
        sys.stdout.write(json.dumps(gate_suite(), sort_keys=True) + "\n")
        return 0
    if "--probes" in argv:
        sys.stdout.write(json.dumps(probe_suite(), sort_keys=True) + "\n")
        return 0
    if "--host" in argv:
        sys.stdout.write(json.dumps(host_suite(), sort_keys=True) + "\n")
        return 0
    sys.stdout.write(json.dumps(self_test(), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
