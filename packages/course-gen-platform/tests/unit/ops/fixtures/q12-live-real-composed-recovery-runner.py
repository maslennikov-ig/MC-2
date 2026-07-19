#!/usr/bin/env python3
"""R8-B-2-iv-2: the REAL crash + fail-closed-refusal leg of the §6b.6 composed mid-barrier recovery.

This reuses (imports, does NOT fork) the ratified DUAL-BIND fusion harness
``q12-live-real-full-window-runner.py`` (iv-PART-1): the same disposable ``postgres:17.10-bookworm``
loopback container, the same bwrap dual-bind claim sandbox, the same in-netns pooler-identity proxy,
the same real frozen barrier legs, the same executor-owned ``--real-claim`` subprocess boundary.

It drives the FEASIBLE portion of the §6b.6 obligation against the REAL barrier:

  * PHASE CRASH — ``run_live`` with a scoped mid-``barrier.install`` crash AT ``capability_claimed``
    (the two-process boundary): the delegated install claim durably journals its
    ``capability_claimed/cutover`` row and then raises BEFORE the real barrier runs
    (``RealBarrierWrapperExecutor.crash_operation`` -> ``MC2_Q12_FW_CRASH_AT_CLAIM`` -> the
    ``after_journal_fsync`` seam), so ``launch_claim`` reports restartRequired, ``delegate_claim``
    raises, and ``run_live`` rejects with the durable head left at
    ``barrier.install/capability_claimed/cutover``. The REAL install barrier NEVER executes, so the
    container is untouched (the cheapest crash point).

  * PHASE REFUSAL — a SEPARATE lease session (the crash released the canonical FD-9 lease when it
    finished; this reacquires it under a fresh flock + fresh executor) runs ``run_recover`` on that
    mid-lifecycle claimed head. ``run_recover`` FAILS CLOSED with the EXACT standalone-supervisor
    pointer ``q12-live-cutover.sh install`` and leaves the durable journal BYTE-for-byte unchanged
    (the §6b.6 condition-7 / R5-D2 pointer path). This is the REAL twin of the fixture proof
    q12-live-controller.test.ts:1102-1145.

The supervisor + recover convergence tail of §6b.6 (recovery_reacquired + a second capability_claimed
+ completed under ``cutover-recovery-1``, then recover to the full composed journal) is DEFERRED: the
frozen barrier ``install`` command is cutover-only (q12-database-barrier.sh:420-433 pins the install
input checkpoint to ``lease_epoch == "cutover"`` with no recovery-epoch grammar; only cleanup/rollback
carry it at :444-598), so a REAL forward-op recovery-epoch re-claim cannot complete without a frozen-
barrier edit (re-ratification). See the artifact.

Prints ONE JSON result object to stdout.
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
FW_RUNNER = FIXTURES / "q12-live-real-full-window-runner.py"


def _load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Reuse the whole ratified iv-PART-1 fusion machinery (container seed / catalog build / quiesce /
# dual-bind executor / real barrier legs / crash seam). The --real-claim and --real-cleanup handlers
# stay owned by fw: RealBarrierWrapperExecutor.launch_claim spawns fw's file for those subprocesses.
fw = _load("q12_fw_runner", FW_RUNNER)
CORE = fw.CORE
r4c = fw.r4c
DOCKER = fw.DOCKER
IMAGE = fw.IMAGE
PW = fw.PW
POOLER_HOST = fw.POOLER_HOST
POOLER_USER = fw.POOLER_USER
RUN_ID = fw.RUN_ID
REPO = fw.REPO
canonical = fw.canonical


def _setup_composed_root(cid: str, scratch: pathlib.Path, trust_root: pathlib.Path, run_id: str):
    """Stand up one disposable container + the controller run root + the barrier trust scaffolding,
    exactly as fw.main() does (container -> seed -> real catalog -> quiesce -> run-root inputs ->
    dual-bind trust root). Returns (context, catalog_body, catalog_sha256, quiesce_path, seed_counts,
    run_root)."""
    subprocess.run(
        [DOCKER, "run", "-d", "--name", cid, "-e", f"POSTGRES_PASSWORD={PW}",
         "-p", "127.0.0.1::5432", IMAGE],
        check=True, capture_output=True,
    )
    for _ in range(300):
        ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"], capture_output=True)
        logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
        if ready.returncode == 0 and "init process complete" in logs:
            break
        time.sleep(0.2)
    seed = subprocess.run(
        [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=fw.SEED_SQL, text=True, capture_output=True,
    )
    if seed.returncode != 0:
        raise RuntimeError(f"seed failed: {seed.stderr.strip()}")
    for guc in ("cron.database_name TO 'postgres'", "cron.launch_active_jobs TO 'on'"):
        subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
            input=f"ALTER DATABASE postgres SET {guc};", text=True, capture_output=True, check=True,
        )

    catalog, _baseline_sha, after_base_sha, after_obs_sha, seed_counts = fw._build_expected_catalog(cid)
    catalog_body = (canonical(catalog) + "\n").encode("utf-8")
    catalog_sha256 = CORE.sha256(catalog_body)

    quiesce_path = scratch / "writer-quiesce.json"
    fw._write_quiesce_manifest(quiesce_path, run_id)

    run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp"))
    run_root.chmod(0o700)
    run_secrets = run_root / "secrets"
    run_secrets.mkdir(mode=0o700)
    secrets_dir = trust_root / "secrets"
    trust_mount = trust_root / "backups" / "q12" / run_id
    for directory in (secrets_dir, trust_mount):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    for ancestor in (trust_root, trust_root / "backups", trust_root / "backups" / "q12", trust_mount, secrets_dir):
        ancestor.chmod(0o700)

    project_root = trust_root / "project" / "packages"
    project_root.mkdir(parents=True, mode=0o700)
    os.symlink(REPO / "packages/course-gen-platform", project_root / "course-gen-platform")
    node_copy = trust_root / "node-bin"
    shutil.copyfile(pathlib.Path(shutil.which("node") or "/usr/bin/node").resolve(), node_copy)
    node_copy.chmod(0o700)

    cert_path = scratch / "proxy-cert.pem"
    key_path = scratch / "proxy-key.pem"
    r4c._generate_self_signed(cert_path, key_path, POOLER_HOST)
    (secrets_dir / "supabase_db_url").write_text(
        f"postgresql://{POOLER_USER}:{PW}@{POOLER_HOST}:5432/postgres\n", encoding="utf-8"
    )
    (secrets_dir / "supabase_db_url").chmod(0o600)
    (secrets_dir / "prod-ca-2021.crt").write_bytes(cert_path.read_bytes())
    (secrets_dir / "prod-ca-2021.crt").chmod(0o644)

    (run_secrets / "db-capability").write_text(f"{fw.CAPABILITY}\n", encoding="utf-8")
    (run_secrets / "db-capability").chmod(0o400)
    (run_root / "expected-post-migration-catalog.json").write_bytes(catalog_body)
    (run_root / "expected-post-migration-catalog.json").chmod(0o400)
    probe_body = (canonical(fw._probe_object(run_id, catalog_sha256)) + "\n").encode("utf-8")
    (run_root / "database-barrier-probe-receipt.json").write_bytes(probe_body)
    (run_root / "database-barrier-probe-receipt.json").chmod(0o400)

    fakehosts = scratch / "fakehosts"
    fakehosts.write_text(
        f"127.0.0.1 localhost {POOLER_HOST}\n::1 localhost ip6-localhost ip6-loopback\n",
        encoding="utf-8",
    )

    context = fw.FullWindowContext(
        cid, str(trust_root), run_root, run_root.parent / "cutover.lock", fakehosts,
        str(node_copy), str(trust_root / "project"), str(cert_path), str(key_path),
    )
    context.migration_catalog_sha = {
        "migration.base.apply": after_base_sha,
        "migration.observability.apply": after_obs_sha,
    }
    return context, catalog_body, catalog_sha256, quiesce_path, seed_counts, run_root


def _build_request(run_root: pathlib.Path, run_id: str, quiesce_path: pathlib.Path,
                   catalog_sha256: str, lock_stat) -> dict:
    return {
        "run_root": str(run_root), "run_id": run_id,
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64, "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": CORE.sha256(quiesce_path.read_bytes()),
        "expected_catalog_sha256": catalog_sha256, "rotation_required": False,
        "lease_fd": 9, "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
        "quiesce_manifest_path": str(quiesce_path),
    }


def main() -> int:
    cid = f"mc2-q12-cr-src-{os.getpid()}-{int(time.time())}"
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-cr-scratch-", dir="/tmp"))
    trust_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-barrier-", dir="/tmp"))
    trust_root.chmod(0o700)
    run_id = RUN_ID
    run_root = None
    try:
        context, _catalog_body, catalog_sha256, quiesce_path, seed_counts, run_root = _setup_composed_root(
            cid, scratch, trust_root, run_id
        )

        # ---- PHASE CRASH: run_live crashes mid-barrier.install AT capability_claimed ----
        lock_stat = fw._open_lease(context.cutover_lock)
        crash_executor = fw.RealBarrierWrapperExecutor(context)
        crash_executor.crash_operation = "install"
        crash_rc = 0
        crash_error = ""
        try:
            CORE.run_live(_build_request(run_root, run_id, quiesce_path, catalog_sha256, lock_stat), crash_executor)
        except Exception as error:  # noqa: BLE001 - the crash MUST reject
            crash_rc = 2
            crash_error = f"{type(error).__name__}: {error}"
        finally:
            os.close(9)  # release the canonical lease (the crashed process is done)

        crashed_rows = [json.loads(line) for line in (run_root / "phase.jsonl").read_text().splitlines()]
        crashed_head = crashed_rows[-1]
        journal_after_crash = (run_root / "phase.jsonl").read_bytes()

        # ---- PHASE REFUSAL: a SEPARATE lease session reacquires the released FD-9 lease and runs
        #      run_recover on the mid-lifecycle claimed head -> named fail-closed refusal, no mutation.
        lock_stat2 = fw._open_lease(context.cutover_lock)
        refusal_executor = fw.RealBarrierWrapperExecutor(context)  # fresh session, no crash
        refusal_rc = 0
        refusal_error = ""
        try:
            CORE.run_recover(_build_request(run_root, run_id, quiesce_path, catalog_sha256, lock_stat2), refusal_executor)
        except Exception as error:  # noqa: BLE001 - recover MUST fail closed
            refusal_rc = 2
            refusal_error = f"{type(error).__name__}: {error}"
        finally:
            os.close(9)

        journal_after_refusal = (run_root / "phase.jsonl").read_bytes()

        sys.stdout.write(json.dumps({
            "seed_counts": seed_counts,
            "catalog_sha256": catalog_sha256,
            "run_id": run_id,
            "crash_rc": crash_rc,
            "crash_error": crash_error,
            "crashed_rows_len": len(crashed_rows),
            "crashed_head": {
                "command_id": crashed_head["command_id"],
                "outcome": crashed_head["outcome"],
                "lease_epoch": crashed_head["lease_epoch"],
            },
            "crashed_tail_shape": [
                [r["command_id"], r["outcome"], r["lease_epoch"]] for r in crashed_rows[-4:]
            ],
            "refusal_rc": refusal_rc,
            "refusal_error": refusal_error,
            "journal_byte_unchanged": journal_after_crash == journal_after_refusal,
            "journal_after_crash_sha256": CORE.sha256(journal_after_crash),
            "journal_after_refusal_sha256": CORE.sha256(journal_after_refusal),
        }) + "\n")
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)
        if not os.environ.get("MC2_Q12_CR_KEEP"):
            shutil.rmtree(trust_root, ignore_errors=True)
            shutil.rmtree(scratch, ignore_errors=True)
            if run_root is not None:
                shutil.rmtree(run_root, ignore_errors=True)
        else:
            sys.stderr.write(f"KEEP run_root={run_root}\n")


if __name__ == "__main__":
    raise SystemExit(main())
