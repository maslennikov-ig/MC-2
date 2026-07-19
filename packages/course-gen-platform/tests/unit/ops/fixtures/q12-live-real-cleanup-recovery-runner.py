#!/usr/bin/env python3
"""R8-B-2-iv-3 (b', ratified after found-defect #19): the REAL SATISFIABLE cleanup-crash recover
probe on the ratified DUAL-BIND fusion harness.

Found-defect #19 (ACCEPTED/RATIFIED): the §6b.6 composed supervisor->recover story with the
recovery-epoch shape (recovery_reacquired + a second capability_claimed under cutover-recovery-1,
+2 rows) is NOT reachable from the controller fusion for EITHER direction:

  * forward ops -> the controller CAN mint a recovery epoch (resume_retained_chain), but the frozen
    barrier install child pins its input checkpoint to lease_epoch=="cutover"
    (q12-database-barrier.sh:421/432/439), so a real forward-op recovery-epoch re-claim never
    completes (found-defect #18);
  * cleanup    -> the frozen barrier cleanup child ACCEPTS a recovery epoch (:444-598, epoch grammar
    :514-518), but the controller NEVER mints one: barrier.cleanup is not in OPERATIONS
    (q12-lifecycle-core.py:27-33) so run_supervisor cannot target it (:4058-4065), and the sole
    controller cleanup driver (orchestrate_post_activate_cleanup, :3386-3517) is hardcoded
    cutover-only (publish_cleanup_capability :1791/1797, append_cleanup_row :1838).

So the +2 recovery-epoch composed probe is DEFERRED to the server rehearsal (W-side / source-
recovery-run.sh custody). This probe covers what IS real and satisfiable from the controller
fusion: the cutover cleanup-crash recover convergence -- the REAL twin of the fixture head-8
precedent q12-live-controller.test.ts:1046 ("mid-cleanup crash (barrier.cleanup/capability_claimed):
recover resumes the cleanup segment and converges").

Flow (two disposable ``postgres:17.10-bookworm`` loopback containers):

  * TWIN     -- an UNINTERRUPTED real ``run_live`` (container A) drives the whole forward window +
    the journaled 5-row cleanup segment through the real frozen barrier cleanup child + the real
    R8-B-1 seam -> the 81-row uninterrupted oracle.
  * CRASH    -- a fresh root/container B drives the same window through activate INTO the cleanup
    segment, then CRASHES mid-cleanup AT ``barrier.cleanup/capability_claimed`` (epoch CUTOVER): the
    controller journals the intent/capability_issued/capability_claimed cleanup rows durably, then
    the ``execute_barrier_cleanup`` hook raises BEFORE the real barrier cleanup child runs (the
    container's q12_guard is still installed). ``run_live`` rejects; the durable head is
    ``barrier.cleanup/capability_claimed/cutover`` (76 forward + 3 cleanup = 79 rows).
  * RECOVER  -- ``run_recover`` on that same container B / run root resumes the cleanup segment UNDER
    CUTOVER (NO supervisor, NO recovery epoch -- the controller's only cleanup path): the real
    frozen barrier cleanup child now runs FOR REAL (accepting
    ``database-barrier-input-checkpoint-cleanup-cutover.json``), drops q12_guard, promotes the exact
    10-key v2 receipt, deletes the db capability (real R8-B-1 seam), and the controller appends the
    capability_completed + accepted rows -> 81 rows, +0 vs the twin.

The convergence oracle is asserted in the .test.ts with the EXISTING blessed/parity/convergence
exclusions ONLY (withConvergenceExclusions drops the per-run barrier.cleanup command_sha256 +
accepted_object_sha256, exactly the fixture head-8 precedent) -- NO broadening.

Prints ONE JSON result object to stdout. Reuses (imports, does NOT fork) the composed-recovery
runner (its ``_setup_composed_root`` / ``_build_request``) and, through it, the iv-PART-1 fusion
harness (container seed / dual-bind executor / real barrier legs / real cleanup seam).
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
CR_RUNNER = FIXTURES / "q12-live-real-composed-recovery-runner.py"


def _load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


cr = _load("q12_cr_runner", CR_RUNNER)
fw = cr.fw
CORE = cr.CORE
DOCKER = cr.DOCKER
RUN_ID = cr.RUN_ID


class CleanupCrashWrapperExecutor(fw.RealBarrierWrapperExecutor):
    """The iv-PART-1 fusion executor + an additive, gated crash seam scoped to the cleanup segment.

    ``orchestrate_post_activate_cleanup`` (q12-lifecycle-core.py:3467-3483) durably journals the
    barrier.cleanup intent / capability_issued / capability_claimed rows BEFORE it calls the
    ``execute_barrier_cleanup`` hook (:3503, between the claimed and completed rows). So raising in
    this hook when ``crash_cleanup`` is set leaves the durable head at
    ``barrier.cleanup/capability_claimed/cutover`` with the REAL barrier cleanup child NOT run (the
    cheapest, container-preserving mid-cleanup crash point). Default False => the iv-PART-1 real
    cleanup seam is intact (used verbatim by the twin and by the recover leg)."""

    def __init__(self, context: "fw.FullWindowContext") -> None:
        super().__init__(context)
        self.crash_cleanup = False

    def execute_barrier_cleanup(self, context: dict, command: dict) -> dict:
        if self.crash_cleanup:
            raise CORE.LifecycleError(
                "injected crash mid-cleanup at barrier.cleanup/capability_claimed/cutover"
            )
        return super().execute_barrier_cleanup(context, command)


def _provision(tag: str, run_id: str) -> dict:
    cid = f"mc2-q12-clr-{tag}-{os.getpid()}-{int(time.time())}"
    scratch = pathlib.Path(tempfile.mkdtemp(prefix=f"mc2-q12-clr-{tag}-scratch-", dir="/tmp"))
    trust_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-barrier-", dir="/tmp"))
    trust_root.chmod(0o700)
    context, catalog_body, catalog_sha256, quiesce_path, seed_counts, run_root = (
        cr._setup_composed_root(cid, scratch, trust_root, run_id)
    )
    return {
        "cid": cid,
        "scratch": scratch,
        "trust_root": trust_root,
        "context": context,
        "catalog_body": catalog_body,
        "catalog_sha256": catalog_sha256,
        "quiesce_path": quiesce_path,
        "seed_counts": seed_counts,
        "run_root": run_root,
    }


def _teardown(provision: dict | None) -> None:
    if provision is None:
        return
    subprocess.run([DOCKER, "rm", "-f", provision["cid"]], capture_output=True)
    if os.environ.get("MC2_Q12_CLR_KEEP"):
        sys.stderr.write(f"KEEP {provision['cid']} run_root={provision['run_root']}\n")
        return
    for key in ("trust_root", "scratch", "run_root"):
        shutil.rmtree(provision[key], ignore_errors=True)


def _rows(run_root: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in (run_root / "phase.jsonl").read_text().splitlines()]


def _request(provision: dict, lock_stat) -> dict:
    return cr._build_request(
        provision["run_root"], RUN_ID, provision["quiesce_path"],
        provision["catalog_sha256"], lock_stat,
    )


def _run_uninterrupted(provision: dict) -> list[dict]:
    context = provision["context"]
    lock_stat = fw._open_lease(context.cutover_lock)
    executor = fw.RealBarrierWrapperExecutor(context)
    try:
        CORE.run_live(_request(provision, lock_stat), executor)
    finally:
        os.close(9)
    return _rows(provision["run_root"])


def _run_crash_then_recover(provision: dict) -> dict:
    context = provision["context"]
    run_root = provision["run_root"]

    # ---- CRASH: run_live drives the window into cleanup, then crashes at capability_claimed ----
    lock_stat = fw._open_lease(context.cutover_lock)
    crash_executor = CleanupCrashWrapperExecutor(context)
    crash_executor.crash_cleanup = True
    crash_error = "MISSING: run_live did not raise on the injected mid-cleanup crash"
    crash_rc = 0
    try:
        CORE.run_live(_request(provision, lock_stat), crash_executor)
    except Exception as error:  # noqa: BLE001 - the crash MUST reject
        crash_rc = 2
        crash_error = f"{type(error).__name__}: {error}"
    finally:
        os.close(9)
    crashed_rows = _rows(run_root)

    # ---- RECOVER: a fresh lease session + fresh executor resumes the cleanup segment under cutover.
    lock_stat2 = fw._open_lease(context.cutover_lock)
    recover_executor = CleanupCrashWrapperExecutor(context)  # crash_cleanup defaults False
    output = None
    recover_rc = 0
    recover_error = ""
    try:
        output = CORE.run_recover(_request(provision, lock_stat2), recover_executor)
    except Exception as error:  # noqa: BLE001 - a recover divergence is a FOUND DEFECT (surface it)
        recover_rc = 2
        recover_error = f"{type(error).__name__}: {error}"
    finally:
        os.close(9)
    recovered_rows = _rows(run_root)

    # ---- DB truth AFTER recover: the guard is dropped, so activation truth comes from the durable
    #      v1 archive (guard-free); q12_guard residue is queried directly.
    archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
    activate_archive = json.loads(archive_path.read_bytes()) if archive_path.exists() else {}
    guard_residue_db = fw._dexec_json(
        provision["cid"],
        "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='q12_guard') AS schema_count, "
        "(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='q12_guard') AS relation_count, "
        "(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
        "WHERE n.nspname='q12_guard') AS function_count, "
        "(SELECT count(*) FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start') "
        "AS event_trigger_count",
    )[0]

    receipt_path = run_root / "database-barrier-receipt.json"
    v2_receipt_bytes = receipt_path.read_bytes() if receipt_path.exists() else b""
    v2_receipt = json.loads(v2_receipt_bytes) if v2_receipt_bytes else None
    capability_file = run_root / "secrets" / "db-capability"
    capability_exists_after = capability_file.exists() or capability_file.is_symlink()

    post = (output or {}).get("postActivate") or {}
    cleanup = post.get("cleanup") or {}
    resume = post.get("resume") or {}

    return {
        "crash_rc": crash_rc,
        "crash_error": crash_error,
        "crashed_rows": crashed_rows,
        "recover_rc": recover_rc,
        "recover_error": recover_error,
        "recovered_rows": recovered_rows,
        "activate_archive_state": activate_archive.get("state"),
        "guard_residue_db": guard_residue_db,
        "v2_receipt": v2_receipt,
        "v2_receipt_keys": sorted(v2_receipt) if v2_receipt else [],
        "v2_receipt_sha256": CORE.sha256(v2_receipt_bytes) if v2_receipt_bytes else None,
        "capability_exists_after": capability_exists_after,
        "post_activate_cleanup_status": cleanup.get("status"),
        "post_activate_resume_status": resume.get("status"),
        "post_activate_resume_validated_sha256": resume.get("validated_receipt_sha256"),
        "child_executions": recover_executor.child_executions,
    }


def main() -> int:
    twin_provision: dict | None = None
    crash_provision: dict | None = None
    shared_scratch: pathlib.Path | None = None
    try:
        # ONE shared quiesce manifest for BOTH runs. The manifest content is run_id-derived (identical
        # for twin and crash), but derive_joined_fixture_values pins the <quiesce-manifest> substitution
        # to the manifest PATH (q12-lifecycle-core.py:729), so command_sha256 for any leg embedding it
        # (e.g. source.forward) would differ if the twin and crash used two different filesystem paths.
        # A single cutover window has a SINGLE quiesce manifest, so both runs share ONE path -- exactly
        # as the iv-PART-1 runner shares one quiesce path between the composer twin and the live run.
        shared_scratch = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-clr-shared-", dir="/tmp"))
        shared_quiesce = shared_scratch / "writer-quiesce.json"
        fw._write_quiesce_manifest(shared_quiesce, RUN_ID)

        # TWIN (container A): the uninterrupted 81-row oracle, same run id + quiesce + catalog shape.
        twin_provision = _provision("twin", RUN_ID)
        twin_provision["quiesce_path"] = shared_quiesce
        twin_rows = _run_uninterrupted(twin_provision)

        # CRASH + RECOVER (container B): mid-cleanup crash then cutover recover convergence.
        crash_provision = _provision("crash", RUN_ID)
        crash_provision["quiesce_path"] = shared_quiesce
        outcome = _run_crash_then_recover(crash_provision)

        sys.stdout.write(json.dumps({
            "run_id": RUN_ID,
            "twin_seed_counts": twin_provision["seed_counts"],
            "crash_seed_counts": crash_provision["seed_counts"],
            "twin_catalog_sha256": twin_provision["catalog_sha256"],
            "crash_catalog_sha256": crash_provision["catalog_sha256"],
            "twin_journal": twin_rows,
            **outcome,
        }) + "\n")
        return 0
    finally:
        _teardown(twin_provision)
        _teardown(crash_provision)
        if shared_scratch is not None and not os.environ.get("MC2_Q12_CLR_KEEP"):
            shutil.rmtree(shared_scratch, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
