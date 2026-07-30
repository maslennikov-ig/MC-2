#!/usr/bin/python3
"""mc2-wl5vn — exercise the drill's restore use-list derivation against archive shapes.

WHY.  C3 dumps a database C1 has already guarded, so the archive carries the ``q12_guard`` event
trigger.  Replaying it as the image superuser reverses the ownership pairing supautils demands
(``mc2-ipwyc`` keeps ``q12_guard`` owned by the managed non-superuser ``postgres``), and the restore
dies:

    ERROR: Superuser owned event trigger must execute a superuser owned function

The remedy (owner decision, 2026-07-30) is to skip exactly that archive entry.  The dangerous
failure mode is not "the exclusion does not fire" — that reproduces the known error loudly.  It is
"the exclusion fires too widely": a use-list that quietly drops a production object restores a
smaller database, and every comparison downstream then measures the archive it was handed rather
than the archive C3 took.  That is what this fixture is for.

WHAT IT RUNS.  The shipped bytes, not a copy: the ``build_restore_toc`` python block is extracted
from the tracked ``deploy/postgres/restore-supabase-drill.sh`` at run time and executed as-is.  If
the drill's block is edited, this fixture follows it; if the block is deleted, extraction fails
loudly instead of silently testing nothing.

WHAT IT CANNOT CARRY, stated rather than papered over.  Building a real custom-format archive needs
a live PostgreSQL server, which a unit suite must not require — the repo already has one class of
docker-gated cases that never run in CI and rot unnoticed (``mc2-qd12b``).  ``pg_restore`` is
therefore replaced by a stub that answers single-entry extraction from a scripted TOC.  What the
stub CANNOT prove is that a real ``pg_restore --use-list`` accepts the generated file and that a
real Supabase 17.6 then restores clean; that proof comes only from the drill running against a
production generation, and is recorded on ``mc2-wl5vn``.

    q12-restore-guard-exclusion-runner.py

Prints one JSON object on stdout.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

SCHEMA = "megacampus.q12.restore-guard-exclusion/v1"
REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
DRILL = REPO_ROOT / "deploy/postgres/restore-supabase-drill.sh"
PYTHON = sys.executable or "/usr/bin/python3"


def extract_block() -> str:
    """Return the python heredoc inside build_restore_toc(), from the tracked drill."""
    lines = DRILL.read_text(encoding="utf-8").splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.startswith("build_restore_toc()"))
    except StopIteration:
        raise SystemExit("build_restore_toc is absent from the drill")
    opener = next(i for i in range(start, len(lines)) if lines[i].rstrip().endswith("<<'PY'"))
    closer = next(i for i in range(opener + 1, len(lines)) if lines[i] == "PY")
    return "\n".join(lines[opener + 1 : closer]) + "\n"


# Each case is (toc lines, {dump_id: SQL the stub returns}).  The TOC lines use the real
# `pg_restore --list` shape: "<dumpId>; <tableoid> <oid> <DESC> <schema> <tag...> <owner>".
HEADER = [";", "; Archive created at 2026-07-29 04:11:02 UTC", ";     TOC Entries: 9", ";"]
TABLE = "3411; 1259 16401 TABLE public courses postgres"
PGRST = "4402; 3466 41001 EVENT TRIGGER - pgrst_ddl_watch supabase_admin"
GUARD = "4403; 3466 41002 EVENT TRIGGER - q12_guard_ddl_command_start postgres"
RENAMED = "4403; 3466 41002 EVENT TRIGGER - barrier_ddl_start postgres"
GUARD_COMMENT = "4404; 0 0 COMMENT - EVENT TRIGGER q12_guard_ddl_command_start postgres"
PGRST_COMMENT = "4405; 0 0 COMMENT - EVENT TRIGGER pgrst_ddl_watch supabase_admin"

PGRST_SQL = (
    "CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end\n"
    "   EXECUTE FUNCTION extensions.pgrst_ddl_watch();\n"
)
GUARD_SQL = (
    "CREATE EVENT TRIGGER q12_guard_ddl_command_start ON ddl_command_start\n"
    "   EXECUTE FUNCTION q12_guard.enforce_ddl_barrier();\n"
    "ALTER EVENT TRIGGER q12_guard_ddl_command_start OWNER TO postgres;\n"
)
RENAMED_SQL = GUARD_SQL.replace("q12_guard_ddl_command_start", "barrier_ddl_start")

CASES: dict[str, tuple[list[str], dict[str, str]]] = {
    # The archive C3 actually takes during a window.
    "guarded": ([*HEADER, TABLE, PGRST, GUARD], {"4402": PGRST_SQL, "4403": GUARD_SQL}),
    # Scheduled mode: no barrier has ever run, so nothing may be skipped.
    "unguarded": ([*HEADER, TABLE, PGRST], {"4402": PGRST_SQL}),
    # Derived, not declared: the trigger's NAME carries no authority, its function's schema does.
    "renamed_guard": ([*HEADER, TABLE, RENAMED], {"4403": RENAMED_SQL}),
    # A comment on a skipped object would fail on an object that is no longer there.
    "guarded_comment": (
        [*HEADER, TABLE, PGRST, GUARD, PGRST_COMMENT, GUARD_COMMENT],
        {"4402": PGRST_SQL, "4403": GUARD_SQL},
    ),
    # Fail closed: an EVENT TRIGGER entry whose SQL cannot be read is not assumed innocent.
    "unparsable": ([*HEADER, TABLE, GUARD], {"4403": "-- nothing useful here\n"}),
    # Fail closed: extraction itself broke.
    "extraction_failed": ([*HEADER, TABLE, GUARD], {}),
}

STUB = '''#!/usr/bin/python3
import json, pathlib, re, sys
answers = json.loads(pathlib.Path(sys.argv[0] + ".answers.json").read_text())
listed = [l for l in pathlib.Path(sys.argv[sys.argv.index("--use-list") + 1]).read_text().splitlines()
          if l.strip() and not l.startswith(";")]
if len(listed) != 1:
    sys.exit("stub expects exactly one selected entry")
dump_id = re.match(r"\\s*(\\d+);", listed[0]).group(1)
if dump_id not in answers:
    sys.stderr.write("stub: no answer for entry\\n")
    sys.exit(1)
sys.stdout.write(answers[dump_id])
'''


def run_case(name: str, toc: list[str], answers: dict[str, str], block: str) -> dict[str, object]:
    work = pathlib.Path(tempfile.mkdtemp(prefix=f"mc2-wl5vn-{name}-"))
    try:
        stub = work / "pg_restore_stub.py"
        stub.write_text(STUB, encoding="utf-8")
        stub.chmod(0o700)
        (work / "pg_restore_stub.py.answers.json").write_text(json.dumps(answers), encoding="utf-8")
        toc_path = work / "archive.toc"
        toc_path.write_text("\n".join(toc) + "\n", encoding="utf-8")
        block_path = work / "build_restore_toc.py"
        block_path.write_text(block, encoding="utf-8")

        done = subprocess.run(
            [
                PYTHON, str(block_path),
                str(stub),
                str(work / "database.dump"),
                str(toc_path),
                str(work / "restore.toc"),
                str(work / "restore-exclusions.json"),
                str(work / "one-entry.toc"),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        result: dict[str, object] = {
            "exit_code": done.returncode,
            "stdout": done.stdout.strip(),
            "stderr": done.stderr.strip(),
        }
        report = work / "restore-exclusions.json"
        listing = work / "restore.toc"
        if report.exists():
            result["report"] = json.loads(report.read_text(encoding="utf-8"))
        if listing.exists():
            produced = listing.read_text(encoding="utf-8").splitlines()
            result["restore_list"] = produced
            result["commented_out"] = [
                original for original, line in zip(toc, produced) if line == ";" + original
            ]
            result["identical_to_toc"] = produced == toc
        result["one_entry_scratch_left"] = (work / "one-entry.toc").exists()
        return result
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    block = extract_block()
    cases = {name: run_case(name, toc, answers, block) for name, (toc, answers) in CASES.items()}
    print(json.dumps({"schema": SCHEMA, "drill": str(DRILL.relative_to(REPO_ROOT)), "cases": cases},
                     indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
