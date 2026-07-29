#!/usr/bin/python3
"""mc2-awi6q: drive the REAL controller into the REAL C2 child and report what the child accepted.

Window attempt #11 (2026-07-28) opened with mc2-lzft4 fixed, so ``q12-writer-resume.py`` ran in
production for the first time — and refused before quiescing a single writer, AFTER the barrier had
already put the database into ``maintenance_guarded``. Two independent controller/child contract
gaps, both of the environment-substitution class (the child was written against fixtures that stood
in for the production step):

  1. the child demanded the ``writers.quiesce`` INTENT row carry ``0×64``, while the controller
     carries the predecessor's capability digest forward (the ratified D5J item-6 carry rule);
  2. the child reads ``writer-quiesce-capability-checkpoint-<run-id>-<epoch>.json`` and
     ``writer-quiesce-input-checkpoint-<run-id>-<epoch>.json``, which the controller never
     published — the same shape as mc2-orsez for the barrier child.

This harness closes both against the real code rather than against a hand-built journal. It drives
the production ``Engine.append_ordinary_lifecycle`` for ``writers.quiesce`` over a journal prefix
whose SHAPE is the one production really wrote (asserted below against the captured attempt-#11
journal), and its ``execute_ordinary`` seam launches the ACTUAL child in quiesce mode with
``fault_point=before-inventory`` — the point the child reaches only after every journal, checkpoint,
capability and residue expectation has passed, and before it touches Docker or the network.

Nothing here publishes the two checkpoints on the controller's behalf: if the controller stops
publishing them, the child stops reaching the boundary and the negative cases below stop being
distinguishable from the positive one.

Infra-free: an ephemeral /tmp run root, no /opt/megacampus, no docker, no network, no production.
Prints ONE JSON object to stdout; the TypeScript test asserts on it.
"""

from __future__ import annotations

import fcntl
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO / "deploy/qdrant/q12-lifecycle-core.py"
CHILD_PATH = REPO / "deploy/qdrant/q12-writer-resume.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE_PATH)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)

# The journal prefix production really wrote before C2, captured from window attempt #11
# (run root 8915724a-23ba-42f1-8c25-c08110ca5dc6, now burnt). Only the SHAPE is reproduced — the
# digests below are this run's own — but the shape is what the child validates, and reproducing it
# from the captured rows is what keeps this harness from drifting back into a convenient fixture.
CAPTURED_PREFIX = [
    ("preflight", "intent", "operator.self-check"),
    ("preflight", "capability_issued", "operator.self-check"),
    ("preflight", "capability_claimed", "operator.self-check"),
    ("preflight", "completed", "operator.self-check"),
    ("maintenance_guarded", "intent", "barrier.install"),
    ("maintenance_guarded", "capability_issued", "barrier.install"),
    ("maintenance_guarded", "capability_claimed", "barrier.install"),
    ("maintenance_guarded", "completed", "barrier.install"),
]


def publish_child_input(path: pathlib.Path, value: dict, mode: int) -> None:
    """An operator/barrier-owned input the child reads. NOT one of the controller publications
    under test — those must come from the controller or the harness proves nothing."""
    data = core.complete_object(value)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(descriptor, data)
        os.fchmod(descriptor, mode)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


# The exact expression the fix replaced. Reinstating it in a scratch copy of the child is the only
# way to keep the RED visible: the positive case below cannot tell "the carry rule is accepted" from
# "the carry rule is never reached". If this literal stops matching the shipped child, the guard
# raises rather than quietly passing.
FIXED_CARRY_EXPRESSION = """            and all(
                entry["capability_manifest_sha256"]
                == (carried_before[entry["seq"]] if entry["outcome"] == "intent" else opened.digest)
                for entry in epoch_rows
            ),
"""
LEGACY_CARRY_EXPRESSION = (
    '            and all(entry["capability_manifest_sha256"] in '
    '({"intent": "0" * 64}.get(entry["outcome"], opened.digest),) for entry in epoch_rows),\n'
)


def legacy_child(directory: pathlib.Path) -> pathlib.Path:
    """A scratch copy of the child carrying the pre-mc2-awi6q 0×64 intent expectation."""
    source = CHILD_PATH.read_text(encoding="utf-8")
    if source.count(FIXED_CARRY_EXPRESSION) != 1:
        raise RuntimeError(
            "the mc2-awi6q carry expression is no longer present verbatim in q12-writer-resume.py; "
            "re-derive FIXED_CARRY_EXPRESSION before trusting this guard"
        )
    path = directory / "q12-writer-resume-legacy.py"
    path.write_text(
        source.replace(FIXED_CARRY_EXPRESSION, LEGACY_CARRY_EXPRESSION), encoding="utf-8"
    )
    return path


def spawn_child(
    run_root: pathlib.Path, run_id: str, lock: pathlib.Path, child: pathlib.Path = CHILD_PATH
) -> dict[str, object]:
    """Run the REAL child exactly as the frozen wrapper does: inherited held lease on FD 9."""
    # q12-writer-resume.py:141 demands its environment be EXACTLY the frozen manifest env for
    # writers.quiesce — the child is launched with nothing else, so the harness must not either.
    environment = dict(core.load_manifest()["commands"]["writers.quiesce"]["env"])
    completed = subprocess.run(
        [
            "/usr/bin/python3",
            str(child),
            "quiesce",
            run_id,
            str(run_root),
            "/usr/bin/docker",
            str(lock),
            str(os.getuid()),
            str(os.getgid()),
            "0",
            "before-inventory",
            "/usr/bin/curl",
        ],
        env=environment,
        pass_fds=(9,),
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        # The child SIGKILLs itself at the before-inventory boundary, so -9 IS the pass signal:
        # everything the child validates about the controller's output already succeeded.
        "returncode": completed.returncode,
        "reachedInventoryBoundary": completed.returncode == -9,
        "stderr": completed.stderr.strip()[-400:],
    }


def main() -> int:
    out: dict[str, object] = {}
    work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp"))
    os.chmod(work, 0o700)
    # Scratch space that is NOT the run root: the child rejects unknown residue inside it.
    aside = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-awi6q-aside-"))
    lock = work.parent / f"{work.name}.lock"
    try:
        run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"file://{work}"))
        request = {
            "run_id": run_id,
            "run_root": str(work),
            "release_sha": "a" * 40,
            "operator_digest": "b" * 64,
            "resource_manifest_sha256": "0" * 64,
            "quiesce_manifest_sha256": "0" * 64,
            "expected_catalog_sha256": "c" * 64,
        }
        manifest = core.load_manifest()

        opened = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        if opened != 9:
            os.dup2(opened, 9)
            os.close(opened)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)

        class Executor:
            def execute_ordinary(self, command: dict, capability: dict) -> dict:
                capability_checkpoint = (
                    work / f"writer-quiesce-capability-checkpoint-{run_id}-cutover.json"
                )
                input_checkpoint = work / f"writer-quiesce-input-checkpoint-{run_id}-cutover.json"
                claimed = work / "capabilities/claimed/writers.quiesce--cutover.json"
                fixed = work / "phase-checkpoint.json"
                intent_row = next(
                    row for row in engine.journal if row["phase"] == "quiesced" and row["outcome"] == "intent"
                )
                head = engine.journal[-1]

                def projection(path: pathlib.Path) -> dict:
                    return json.loads(path.read_bytes())

                out["publishedCapabilityCheckpoint"] = {
                    "exists": capability_checkpoint.is_file(),
                    "mode": oct(capability_checkpoint.stat().st_mode & 0o777),
                    "nlink": capability_checkpoint.stat().st_nlink,
                    "aliasesFixedCheckpoint": capability_checkpoint.stat().st_ino
                    == fixed.stat().st_ino,
                    "projectsRow": projection(capability_checkpoint)["journal_entry_hash"]
                    == intent_row["entry_hash"],
                    "digestMatchesCapability": core.sha256(capability_checkpoint.read_bytes())
                    == json.loads(claimed.read_bytes())["capability_input_checkpoint_sha256"],
                    "residue": (work / f"{capability_checkpoint.name}.publishing").exists(),
                }
                out["publishedInputCheckpoint"] = {
                    "exists": input_checkpoint.is_file(),
                    "mode": oct(input_checkpoint.stat().st_mode & 0o777),
                    "nlink": input_checkpoint.stat().st_nlink,
                    "aliasesFixedCheckpoint": input_checkpoint.stat().st_ino == fixed.stat().st_ino,
                    "projectsRow": projection(input_checkpoint)["journal_entry_hash"]
                    == head["entry_hash"],
                    "byteIdenticalToFixedCheckpoint": input_checkpoint.read_bytes()
                    == fixed.read_bytes(),
                    "residue": (work / f"{input_checkpoint.name}.publishing").exists(),
                }

                out["child"] = spawn_child(work, run_id, lock)
                out["legacyChild"] = spawn_child(work, run_id, lock, legacy_child(aside))
                # Each controller publication is load-bearing: withdraw one and the child must
                # refuse. Without these the positive case could pass on an unrelated path.
                for label, path in (
                    ("childWithoutCapabilityCheckpoint", capability_checkpoint),
                    ("childWithoutInputCheckpoint", input_checkpoint),
                ):
                    withdrawn = aside / path.name
                    shutil.move(str(path), str(withdrawn))
                    try:
                        out[label] = spawn_child(work, run_id, lock)
                    finally:
                        shutil.move(str(withdrawn), str(path))

                return {
                    "schema_version": "megacampus.q12.retained-command-result/v1",
                    "command_id": command["command_sha256"] and "writers.quiesce",
                    "capability_sha256": core.sha256(core.complete_object(capability)),
                    "result_sha256": core.sha256(b"q12-awi6q-harness"),
                    "status": "accepted",
                }

        engine = core.Engine(request=request, executor=Executor())

        # The prefix, in production's own shape: each command's issued/claimed/completed rows carry
        # that command's capability digest, and each INTENT row inherits the predecessor's.
        digests = {
            "operator.self-check": core.sha256(b"capability-operator-self-check"),
            "barrier.install": core.sha256(b"capability-barrier-install"),
        }
        for phase, outcome, command_id in CAPTURED_PREFIX:
            carried = engine.journal[-1]["capability_manifest_sha256"] if engine.journal else "0" * 64
            engine.append(
                phase,
                outcome,
                command_id,
                core.sha256(command_id.encode()),
                "cutover",
                carried if outcome == "intent" else digests[command_id],
            )

        publish_child_input(
            work / "quiesce-window-mode.json",
            {
                "schema_version": "megacampus.q12.quiesce-window-mode/v1",
                "run_id": run_id,
                "mode": "cutover",
            },
            0o400,
        )
        publish_child_input(
            work / "database-barrier-receipt.json",
            {
                "schema_version": "megacampus.q12.database-barrier-receipt/v1",
                "run_id": run_id,
                "state": "maintenance_guarded",
                "zero_guard_residue": False,
                "expected_catalog_sha256": request["expected_catalog_sha256"],
                "last_command": "install",
                "rollback_probes_verified": False,
                "probe_receipt_sha256": None,
            },
            0o400,
        )
        secrets = work / "secrets"
        secrets.mkdir(mode=0o700)
        capability_file = secrets / "db-capability"
        descriptor = os.open(capability_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
        os.write(descriptor, b"postgresql://harness-not-a-credential/\n")
        os.close(descriptor)

        engine.append_ordinary_lifecycle(
            manifest,
            "writers.quiesce",
            {},
            quiesce_object_sha256=core.sha256(b"writer-quiesce-manifest"),
        )

        rows = [
            {
                "seq": row["seq"],
                "phase": row["phase"],
                "outcome": row["outcome"],
                "command_id": row["command_id"],
                "capability_manifest_sha256": row["capability_manifest_sha256"],
            }
            for row in engine.journal
        ]
        out["journal"] = rows
        intent = next(r for r in rows if r["phase"] == "quiesced" and r["outcome"] == "intent")
        predecessor = rows[intent["seq"] - 2]
        out["quiesceIntent"] = {
            "carriesPredecessorDigest": intent["capability_manifest_sha256"]
            == predecessor["capability_manifest_sha256"],
            "isZero": intent["capability_manifest_sha256"] == "0" * 64,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(aside, ignore_errors=True)
        try:
            os.unlink(lock)
        except FileNotFoundError:
            pass
    sys.stdout.write(json.dumps(out, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
