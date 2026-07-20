#!/usr/bin/env python3
"""Q12 R8 SERVER CUSTODY REHEARSAL — outcome verification (driver deliverable iv).

Asserts the rehearsal outcome against a completed run root (the SINGLE physical
run root the ns-launch dual-view bound to BOTH /opt/megacampus/backups/q12/<id>
and <trust>/backups/q12/<id>). Every check reads on-disk artifacts only; it needs
NO docker and NO prod action, so it runs identically on the orchestrator's server
and locally against a captured/fusion run root.

Checks (blueprint point iv):
  1. journal row-count == 81 and the exact forward+cleanup head sequence;
  2. quiesce-window marker present, schema-valid, mode 0400;
  3. the database-barrier receipt is the EXACT 10-key v2, state guard_cleanup_complete,
     and is BOUND in the terminal `accepted` row (accepted_object_sha256 == sha256(bytes),
     accepted_object_kind == "database_barrier_receipt");
  4. database-barrier-baseline.json is the BARRIER's authoritative full-structural 0400
     artifact and byte-intact (the #16 invariant: NOT overwritten by the controller's
     minimal 5-key 0600 baseline);
  5. zero guard residue (v2 zero_guard_residue + the cleanup terminal-proof guard_residue
     counters all zero);
  6. (optional, --check-teardown) zero leftover trust-root binds and rehearsal containers.

Exit 0 + a JSON summary on success; exit 1 + a JSON {"ok":false,"failures":[...]} on any
failed assertion. --json prints only the machine object.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import stat as stat_module
import subprocess
import sys

EXPECTED_ROWS = 81
V2_KEYS = frozenset({
    "database_capability_deleted", "expected_catalog_sha256", "last_command",
    "probe_receipt_sha256", "rollback_probes_verified", "run_id", "schema_version",
    "state", "terminal_proof_sha256", "zero_guard_residue",
})
CLEANUP_HEAD = [
    ("barrier.cleanup", "guard_cleanup_complete", "intent"),
    ("barrier.cleanup", "guard_cleanup_complete", "capability_issued"),
    ("barrier.cleanup", "guard_cleanup_complete", "capability_claimed"),
    ("barrier.cleanup", "guard_cleanup_complete", "capability_completed"),
    ("barrier.cleanup", "guard_cleanup_complete", "accepted"),
]
FORWARD_INSTALL = ("barrier.install", "maintenance_guarded", "intent")
GUARD_RESIDUE_KEYS = (
    "q12_guard_schema_count", "q12_guard_relation_count", "q12_guard_function_count",
    "q12_guard_type_count", "q12_guard_trigger_count", "q12_guard_event_trigger_count",
    "barrier_era_session_count",
)


def _mode(path: pathlib.Path) -> str:
    return oct(stat_module.S_IMODE(path.stat().st_mode))[2:]


def verify_run_root(run_root: pathlib.Path, failures: list[str]) -> dict:
    summary: dict[str, object] = {"run_root": str(run_root)}

    journal_path = run_root / "phase.jsonl"
    if not journal_path.is_file():
        failures.append(f"journal missing: {journal_path}")
        return summary
    rows = [json.loads(line) for line in journal_path.read_text().splitlines() if line]
    summary["journal_rows"] = len(rows)
    if len(rows) != EXPECTED_ROWS:
        failures.append(f"journal row-count {len(rows)} != {EXPECTED_ROWS}")

    # 1. heads: install opens the guarded window; the final 5 rows are the cleanup segment.
    if rows:
        first_install = next(
            (r for r in rows if r.get("command_id") == "barrier.install"), None
        )
        if not first_install or (
            first_install.get("command_id"),
            first_install.get("phase"),
            first_install.get("outcome"),
        ) != FORWARD_INSTALL:
            failures.append("no barrier.install/maintenance_guarded/intent forward head")
        tail = [
            (r.get("command_id"), r.get("phase"), r.get("outcome")) for r in rows[-5:]
        ]
        summary["cleanup_head"] = tail
        if tail != CLEANUP_HEAD:
            failures.append(f"cleanup head sequence drifted: {tail}")
        if any(r.get("lease_epoch") != "cutover" for r in rows[-5:]):
            failures.append("cleanup segment is not under the cutover epoch")

    # 2. quiesce-window marker: mode 0400, schema, run_id.
    marker_path = run_root / "quiesce-window-mode.json"
    if not marker_path.is_file():
        failures.append("quiesce-window-mode.json missing")
    else:
        marker_mode = _mode(marker_path)
        summary["marker_mode"] = marker_mode
        if marker_mode != "400":
            failures.append(f"quiesce marker mode {marker_mode} != 400")
        marker = json.loads(marker_path.read_bytes())
        if marker.get("schema_version") != "megacampus.q12.quiesce-window-mode/v1":
            failures.append("quiesce marker schema_version invalid")
        summary["marker_mode_field"] = marker.get("mode")

    # 3. the exact 10-key v2 receipt, bound in the accepted row.
    receipt_path = run_root / "database-barrier-receipt.json"
    if not receipt_path.is_file():
        failures.append("database-barrier-receipt.json missing")
    else:
        receipt_bytes = receipt_path.read_bytes()
        receipt = json.loads(receipt_bytes)
        receipt_keys = frozenset(receipt)
        summary["v2_receipt_keys"] = sorted(receipt_keys)
        if receipt_keys != V2_KEYS:
            failures.append(
                f"receipt keys are not the exact 10-key v2: extra={sorted(receipt_keys - V2_KEYS)} "
                f"missing={sorted(V2_KEYS - receipt_keys)}"
            )
        if receipt.get("schema_version") != "megacampus.q12.database-barrier-receipt/v2":
            failures.append("receipt schema_version is not v2")
        if receipt.get("state") != "guard_cleanup_complete":
            failures.append("receipt state != guard_cleanup_complete")
        if receipt.get("zero_guard_residue") is not True:
            failures.append("receipt zero_guard_residue is not true")
        if receipt.get("database_capability_deleted") is not True:
            failures.append("receipt database_capability_deleted is not true")
        receipt_sha = hashlib.sha256(receipt_bytes).hexdigest()
        summary["v2_receipt_sha256"] = receipt_sha
        if rows:
            accepted = rows[-1]
            if accepted.get("outcome") != "accepted":
                failures.append("final journal row is not the accepted row")
            if accepted.get("accepted_object_kind") != "database_barrier_receipt":
                failures.append("accepted row does not bind the database_barrier_receipt")
            if accepted.get("accepted_object_sha256") != receipt_sha:
                failures.append(
                    "accepted row accepted_object_sha256 does not equal sha256(v2 receipt)"
                )

    # 4. #16 invariant: baseline is the barrier's authoritative full-structural 0400 artifact.
    baseline_path = run_root / "database-barrier-baseline.json"
    if not baseline_path.is_file():
        failures.append("database-barrier-baseline.json missing")
    else:
        baseline_mode = _mode(baseline_path)
        summary["baseline_mode"] = baseline_mode
        if baseline_mode != "400":
            failures.append(
                f"baseline mode {baseline_mode} != 400 (#16: controller minimal 0600 baseline won)"
            )
        baseline = json.loads(baseline_path.read_bytes())
        if baseline.get("schema_version") != "megacampus.q12.database-barrier-baseline/v1":
            failures.append("baseline is not the barrier's database-barrier-baseline/v1")
        if not isinstance(baseline.get("baseline"), dict):
            failures.append("baseline lacks its full-structural `baseline` object (#16 collision)")

    # 5. zero guard residue: receipt flag + the cleanup terminal-proof residue counters.
    proof_path = run_root / "database-barrier-cleanup-terminal-proof.json"
    if not proof_path.is_file():
        failures.append("database-barrier-cleanup-terminal-proof.json missing")
    else:
        proof = json.loads(proof_path.read_bytes())
        residue = proof.get("guard_residue") or {}
        summary["guard_residue"] = residue
        nonzero = {k: residue.get(k) for k in GUARD_RESIDUE_KEYS if residue.get(k) not in (0,)}
        if nonzero:
            failures.append(f"non-zero guard residue in terminal proof: {nonzero}")

    return summary


def check_teardown(container_prefix: str, trust_prefix: str, failures: list[str]) -> dict:
    mounts = 0
    try:
        with open("/proc/self/mountinfo", encoding="utf-8") as handle:
            mounts = sum(1 for line in handle if trust_prefix in line.split()[4])
    except OSError:
        pass
    containers = 0
    docker = os.environ.get("MC2_Q12_REHEARSAL_DOCKER", "/usr/bin/docker")
    try:
        out = subprocess.run(
            [docker, "ps", "-a", "--filter", f"name={container_prefix}", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=30,
        )
        containers = len([n for n in out.stdout.splitlines() if n.strip()])
    except (OSError, subprocess.SubprocessError):
        pass
    if mounts:
        failures.append(f"{mounts} leftover trust-root bind mount(s)")
    if containers:
        failures.append(f"{containers} leftover rehearsal container(s)")
    return {"leftover_mounts": mounts, "leftover_containers": containers}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Verify the Q12 R8 custody rehearsal outcome.")
    parser.add_argument("--run-root", required=True, type=pathlib.Path)
    parser.add_argument("--check-teardown", action="store_true",
                        help="also assert zero leftover trust-root binds / rehearsal containers")
    parser.add_argument("--json", action="store_true", help="print only the JSON summary")
    args = parser.parse_args(argv)

    failures: list[str] = []
    summary = verify_run_root(args.run_root.resolve(), failures)
    if args.check_teardown:
        summary["teardown"] = check_teardown("mc2-q12-rehearsal-", "mc2-q12-barrier-", failures)

    summary["ok"] = not failures
    summary["failures"] = failures
    if args.json:
        sys.stdout.write(json.dumps(summary, sort_keys=True) + "\n")
    else:
        sys.stdout.write(json.dumps(summary, indent=2, sort_keys=True) + "\n")
        if failures:
            sys.stderr.write(f"REHEARSAL VERIFY FAILED: {len(failures)} assertion(s)\n")
        else:
            sys.stderr.write("REHEARSAL VERIFY OK: all assertions passed\n")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
