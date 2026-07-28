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

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile

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
    finally:
        fixture.stop()
    return out


def main(argv: "list[str]") -> int:
    if "--probes" in argv:
        sys.stdout.write(json.dumps(probe_suite(), sort_keys=True) + "\n")
        return 0
    sys.stdout.write(json.dumps(self_test(), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
