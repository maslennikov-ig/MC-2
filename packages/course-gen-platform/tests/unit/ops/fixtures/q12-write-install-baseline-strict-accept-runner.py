#!/usr/bin/python3
"""No-docker focused unit harness for found-defect #16: the strict-accept posture of
``Engine.write_install_baseline`` (``deploy/qdrant/q12-lifecycle-core.py``).

Found-defect #16 (ratified): the controller's ``write_install_baseline`` runs AFTER the
frozen barrier claim, so in a real ``run_live`` install it collides with the barrier's own
authoritative ``run_root/database-barrier-baseline.json`` (mode 0400, full structural
``megacampus.q12.database-barrier-baseline/v1`` schema, load-bearing for activate/rollback
restore). The RATIFIED Option-A fix makes the controller publish-OR-strict-accept:

  * ABSENT path (fixture / fake-barrier) -> write the controller 5-key baseline at 0600
    exactly as before (unchanged behavior).
  * PRESENT path -> STRICT-ACCEPT the barrier-authoritative artifact WITHOUT writing:
    ``validate_regular_file(path, mode=0o400)`` + canonical-parseable JSON +
    ``schema_version == 'megacampus.q12.database-barrier-baseline/v1'`` +
    ``run_id == self.request['run_id']`` -> accept (emit a trace record), NEVER overwrite.
    Any failure (wrong mode incl. a 0600 leftover, unparseable / non-canonical JSON, wrong
    schema_version, wrong run_id) -> raise ``LifecycleError`` (fail closed).

This harness constructs a MINIMAL ``Engine`` (via ``__new__`` -- it never touches the DB,
docker, or the network) and exercises ``write_install_baseline`` directly across the absent
write path, the strict-accept happy path, and the fail-closed tamper matrix. Prints one JSON
result object; the TypeScript wrapper asserts on it. No production path is touched.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import stat as stat_module
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE = REPO / "deploy/qdrant/q12-lifecycle-core.py"

_spec = importlib.util.spec_from_file_location("q12_core_wib_strict", CORE)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core_wib_strict"] = core
_spec.loader.exec_module(core)

BASELINE_SCHEMA = "megacampus.q12.database-barrier-baseline/v1"
RUN_ID = "wib-strict-accept-run-0000"
CAP_HASH = "a" * 64
BASELINE_NAME = "database-barrier-baseline.json"

ROOTS: list[str] = []


def fresh_engine(run_id: str = RUN_ID):
    """A minimal Engine with only the state write_install_baseline needs (no DB/docker/net)."""
    root = tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp")
    ROOTS.append(root)
    eng = core.Engine.__new__(core.Engine)
    eng.run_root = pathlib.Path(root)
    eng.request = {"run_id": run_id, "run_root": root}
    eng.trace = []
    journal_path = eng.run_root / "phase.jsonl"
    eng.journal_fd = os.open(
        journal_path,
        os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_APPEND | os.O_DSYNC | os.O_NOFOLLOW,
        0o600,
    )
    eng.journal = [
        {
            "seq": 3,
            "phase": "maintenance_guarded",
            "outcome": "capability_claimed",
            "capability_manifest_sha256": CAP_HASH,
            "entry_hash": "b" * 64,
            "previous_hash": "c" * 64,
            "accepted_object_kind": "database_capability",
            "accepted_object_sha256": "d" * 64,
            "lease_epoch": "cutover",
        }
    ]
    return eng


def barrier_baseline_object(run_id: str = RUN_ID) -> dict:
    """The barrier's FULL 12-key structural baseline shape (q12-database-barrier.sh:2027-2037)."""
    return {
        "schema_version": BASELINE_SCHEMA,
        "run_id": run_id,
        "state": "maintenance_guarded_baseline",
        "source_baseline_sha256": "1" * 64,
        "baseline_sha256": "2" * 64,
        "predecessor_checkpoint_sha256": "3" * 64,
        "predecessor_journal_entry_hash": "4" * 64,
        "resource_manifest_sha256": "5" * 64,
        "expected_post_migration_catalog_sha256": "6" * 64,
        "database_capability_sha256": "7" * 64,
        "baseline": {
            "baseline_structural_catalog_sha256": "8" * 64,
            "cron_jobs_sha256": "9" * 64,
            "database_default_sha256": "a" * 64,
            "guarded_relations_sha256": "b" * 64,
            "pg_net_queue_count": 0,
        },
    }


def plant(eng, data: bytes, mode: int) -> pathlib.Path:
    path = eng.run_root / BASELINE_NAME
    with open(path, "wb") as handle:
        handle.write(data)
    os.chmod(path, mode)
    return path


def observe(path: pathlib.Path) -> dict:
    st = os.stat(path, follow_symlinks=False)
    data = path.read_bytes()
    parsed = None
    try:
        parsed = json.loads(data.decode("utf-8"))
    except Exception:
        parsed = None
    return {
        "mode": oct(stat_module.S_IMODE(st.st_mode)),
        "uid": st.st_uid,
        "gid": st.st_gid,
        "sha256": core.sha256(data),
        "keys": sorted(parsed.keys()) if isinstance(parsed, dict) else None,
        "schema_version": parsed.get("schema_version") if isinstance(parsed, dict) else None,
        "run_id": parsed.get("run_id") if isinstance(parsed, dict) else None,
    }


def call(eng) -> dict:
    try:
        eng.write_install_baseline(CAP_HASH)
        return {"raised": False, "error_type": None, "is_lifecycle": False, "message": None}
    except Exception as error:  # noqa: BLE001 -- classify for the wrapper
        return {
            "raised": True,
            "error_type": type(error).__name__,
            "is_lifecycle": isinstance(error, core.LifecycleError),
            "message": str(error),
        }


def main() -> int:
    out: dict = {}

    # ---- Case A: ABSENT path -> writes the controller 5-key baseline at 0600 (unchanged) -------
    eng = fresh_engine()
    result = call(eng)
    obs = observe(eng.run_root / BASELINE_NAME)
    out["absent_write"] = {
        "call": result,
        "observed": obs,
        "trace": list(eng.trace),
    }

    # ---- Case B: PRESENT barrier 0400 authoritative artifact -> STRICT-ACCEPT (no write) --------
    eng = fresh_engine()
    barrier_bytes = core.complete_object(barrier_baseline_object())
    plant(eng, barrier_bytes, 0o400)
    before = observe(eng.run_root / BASELINE_NAME)
    result = call(eng)
    after = observe(eng.run_root / BASELINE_NAME)
    out["strict_accept"] = {
        "call": result,
        "before": before,
        "after": after,
        "byte_unchanged": before["sha256"] == after["sha256"],
        "trace": list(eng.trace),
    }

    # ---- Case C: TAMPER a 0600 leftover -> fail closed -----------------------------------------
    eng = fresh_engine()
    plant(eng, barrier_baseline_bytes_0600 := core.complete_object(barrier_baseline_object()), 0o600)
    out["tamper_0600"] = {"call": call(eng)}

    # ---- Case D: TAMPER 0400 with the WRONG run_id -> fail closed -------------------------------
    eng = fresh_engine()
    plant(eng, core.complete_object(barrier_baseline_object("some-other-run-id")), 0o400)
    out["tamper_wrong_run_id"] = {"call": call(eng)}

    # ---- Case E: TAMPER 0400 with the WRONG schema_version -> fail closed -----------------------
    eng = fresh_engine()
    wrong_schema = barrier_baseline_object()
    wrong_schema["schema_version"] = "megacampus.q12.database-barrier-baseline/v2"
    plant(eng, core.complete_object(wrong_schema), 0o400)
    out["tamper_wrong_schema"] = {"call": call(eng)}

    # ---- Case F: TAMPER 0400 with NON-CANONICAL bytes (correct schema + run_id) -> fail closed --
    eng = fresh_engine()
    pretty = json.dumps(barrier_baseline_object(), indent=2, sort_keys=True).encode("utf-8") + b"\n"
    plant(eng, pretty, 0o400)
    out["tamper_noncanonical"] = {"call": call(eng)}

    # ---- Case G: TAMPER 0400 with UNPARSEABLE bytes -> fail closed ------------------------------
    eng = fresh_engine()
    plant(eng, b"this is not json at all\n", 0o400)
    out["tamper_unparseable"] = {"call": call(eng)}

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        import shutil

        for value in ROOTS:
            shutil.rmtree(value, ignore_errors=True)
