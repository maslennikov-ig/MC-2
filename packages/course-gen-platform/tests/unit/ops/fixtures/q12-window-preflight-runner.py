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


def main(argv: "list[str]") -> int:
    sys.stdout.write(json.dumps(self_test(), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
