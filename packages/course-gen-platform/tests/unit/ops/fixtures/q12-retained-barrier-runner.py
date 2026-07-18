#!/usr/bin/python3
"""No-I/O adapter for the Root-owned retained barrier production core."""

from __future__ import annotations

import importlib.util
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO_ROOT / "deploy/qdrant/q12-lifecycle-core.py"
SPEC = importlib.util.spec_from_file_location("q12_lifecycle_core", CORE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load production lifecycle core")
CORE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CORE
SPEC.loader.exec_module(CORE)
run_supervisor = CORE.run_supervisor
run_claim = CORE.run_claim

FIXTURE_COORDINATION_LOCK = pathlib.Path(
    "/tmp/.mc2-q12-retained-barrier-fixture.lock"
)
FIXTURE_COORDINATION_TIMEOUT_SECONDS = 120.0

# Design §6b.1 R8-I-A: driving the FROZEN q12-database-barrier.sh `cleanup` child FOR REAL
# against the controller's own journal. The child runs in the frozen barrier's own protected
# TEST MODE (the sandbox the R4-B/database-barrier rounds already use) so NO real PostgreSQL is
# needed here — the real full-PG17 window is downstream R8-B. The child validates the journal to
# the guard_cleanup_complete/capability_claimed boundary, performs the (sandboxed) DB cleanup,
# and publishes the 18-key terminal proof; the controller owns the journal + the v1->v2 promotion.
FROZEN_BARRIER = REPO_ROOT / "deploy/qdrant/q12-database-barrier.sh"
BARRIER_TEST_MODE_TOKEN = "mc2-synthetic-q12-database-barrier-test-only"
CAPABILITY_SENTINEL = "q12-capability-synthetic-sentinel"
URI_PASSWORD_SENTINEL = "q12-uri-password-synthetic-sentinel"


def _barrier_expected_catalog() -> dict[str, Any]:
    """The frozen barrier's expected-post-migration-catalog/v1 (the reusable shape the
    deployed-barrier test uses), enough for the cleanup child's baseline/terminal checks."""
    public_relations = [
        {
            "schema": "public",
            "name": f"public_table_{index:02d}",
            "oid": 100 + index,
            "relkind": "p" if index == 0 else "r",
            "parent_oid": 100 if index == 1 else None,
            "owner": "postgres",
        }
        for index in range(47)
    ]
    auth_relations = [
        {
            "schema": "auth",
            "name": f"auth_table_{index:02d}",
            "oid": 200 + index,
            "relkind": "r",
            "parent_oid": None,
            "owner": "postgres",
        }
        for index in range(22)
    ]
    storage_relations = [
        {
            "schema": "storage",
            "name": name,
            "oid": 300 + index,
            "relkind": "r",
            "parent_oid": None,
            "owner": "postgres",
        }
        for index, name in enumerate(
            ["buckets", "buckets_analytics", "objects", "s3_multipart_uploads",
             "s3_multipart_uploads_parts"]
        )
    ]
    return {
        "schema_version": "megacampus.q12.expected-post-migration-catalog/v1",
        "database": "postgres",
        "database_owner": "postgres",
        "release_sha": "1" * 40,
        "migration_frontier": "20260704150249",
        "baseline_structural_sha256": "a" * 64,
        "expected_post_migration_catalog_sha256": "b" * 64,
        "inventory_counts": {"public": 47, "auth": 22, "storage": 5, "cron_jobs": 8,
                             "pg_net_queue": 0},
        "guarded_relations": [
            *public_relations,
            *auth_relations,
            *storage_relations,
            {"schema": "cron", "name": "job", "oid": 400, "relkind": "r",
             "parent_oid": None, "owner": "postgres"},
            {"schema": "net", "name": "http_request_queue", "oid": 401, "relkind": "r",
             "parent_oid": None, "owner": "postgres"},
        ],
        "cron_jobs": [
            {"jobid": index + 1, "username": "postgres", "command_sha256": str(index) * 64}
            for index in range(8)
        ],
        "migrations": {
            "20260711140000": {
                "catalog_sha256": "c" * 64,
                "migration_file_sha256": "e" * 64,
                "relations": [
                    {"schema": "public", "name": "document_evidence_runs", "relkind": "r",
                     "parent_schema": None, "parent_name": None, "owner": "postgres"},
                ],
            },
            "20260711151000": {
                "catalog_sha256": "b" * 64,
                "migration_file_sha256": "f" * 64,
                "relations": [
                    {"schema": "public", "name": "document_evidence_observability_totals",
                     "relkind": "r", "parent_schema": None, "parent_name": None,
                     "owner": "postgres"},
                ],
            },
        },
    }


def _barrier_probe_object(run_id: str, expected_catalog_sha256: str) -> dict[str, Any]:
    """The megacampus.q12.database-barrier-probes/v1 object the forward resume gate re-validates
    (q12-writer-resume.py:1108-1133) and the cleanup v1 receipt binds."""
    return {
        "schema_version": "megacampus.q12.database-barrier-probes/v1",
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
        "completed_at": "2026-07-18T00:00:00.000Z",
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


class RealBarrierCleanupChild:
    """Builds the frozen barrier's protected-test-mode sandbox from the controller's OWN journal
    and runs `q12-database-barrier.sh cleanup` FOR REAL against it (no real PG — the barrier's own
    test-mode reconnect gate is skipped, exactly as the R4-B/database-barrier rounds sandbox it).

    Split into prepare()/execute() because the controller must journal rows 1-3 (intent ->
    capability_issued -> capability_claimed) BEFORE the barrier can validate to the claimed
    boundary: prepare() lays out the static scaffolding + computes the frozen cleanup invocation's
    own command (argv + command_sha256), and execute() copies the by-then-extended controller
    journal into the sandbox, binds the input checkpoint, and invokes the real child.
    """

    def __init__(self, controller_run_root: pathlib.Path, run_id: str,
                 controller_expected_catalog_sha256: str) -> None:
        self.controller_run_root = controller_run_root
        self.run_id = run_id
        self.controller_expected_catalog_sha256 = controller_expected_catalog_sha256
        # The frozen barrier's protected test root MUST be a real /tmp/mc2-q12-barrier-* directory
        # (q12-database-barrier.sh:95), so the sandbox is a top-level temp dir (not under the
        # controller run root), created 0700 by mkdtemp, and torn down after the child exits.
        self.sandbox = pathlib.Path(
            tempfile.mkdtemp(prefix="mc2-q12-barrier-cleanup-", dir="/tmp")
        )
        self.trust_root = self.sandbox
        self.barrier_run_root = self.sandbox / "backups" / "q12" / run_id
        self.capability_file = self.barrier_run_root / "secrets" / "db-capability"
        self.catalog_file = self.barrier_run_root / "expected-catalog.json"
        self.baseline_file = self.barrier_run_root / "database-barrier-baseline.json"
        self.receipt_file = self.barrier_run_root / "database-barrier-receipt.json"
        self.probe_file = self.barrier_run_root / "database-barrier-probe-receipt.json"
        self.terminal_proof_file = (
            self.barrier_run_root / "database-barrier-cleanup-terminal-proof.json"
        )
        self.command_sha256: str | None = None
        self.catalog_sha256: str | None = None

    def _write_protected(self, path: pathlib.Path, body: bytes, mode: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(body)
        os.chmod(path, mode)

    def prepare(self) -> dict[str, Any]:
        for directory in (
            self.sandbox / "project" / "packages" / "course-gen-platform",
            self.sandbox / "secrets",
            self.barrier_run_root / "secrets",
        ):
            directory.mkdir(parents=True, exist_ok=True)
        # The frozen barrier rejects any group/world-writable parent in the chain up to the trust
        # boundary (require_safe_parent_chain), so every created directory must be mode 0700.
        for directory in (
            self.sandbox,
            self.sandbox / "secrets",
            self.sandbox / "project",
            self.sandbox / "project" / "packages",
            self.sandbox / "project" / "packages" / "course-gen-platform",
            self.sandbox / "backups",
            self.sandbox / "backups" / "q12",
            self.barrier_run_root,
            self.barrier_run_root / "secrets",
        ):
            os.chmod(directory, 0o700)
        db_url = self.sandbox / "secrets" / "supabase_db_url"
        ca_file = self.sandbox / "secrets" / "prod-ca.crt"
        self._write_protected(
            db_url,
            (
                f"postgresql://postgres.diqooqbuchsliypgwksu:{URI_PASSWORD_SENTINEL}"
                "@aws-1-us-east-2.pooler.supabase.com:5432/postgres\n"
            ).encode("utf-8"),
            0o600,
        )
        self._write_protected(ca_file, b"synthetic-ca\n", 0o644)
        self._write_protected(
            self.capability_file, f"{CAPABILITY_SENTINEL}\n".encode("utf-8"), 0o400
        )
        catalog = _barrier_expected_catalog()
        catalog_body = (json.dumps(catalog, indent=2) + "\n").encode("utf-8")
        self._write_protected(self.catalog_file, catalog_body, 0o400)
        self.catalog_sha256 = CORE.sha256(catalog_body)
        probe = _barrier_probe_object(self.run_id, self.catalog_sha256)
        probe_body = CORE.complete_object(probe)
        self._write_protected(self.probe_file, probe_body, 0o400)
        probe_sha256 = CORE.sha256(probe_body)
        capability_sha256 = CORE.sha256(CAPABILITY_SENTINEL.encode("utf-8"))
        guarded_relations_sha256 = CORE.sha256(CORE.canonical(catalog["guarded_relations"]))
        baseline_projection = {
            "baseline_structural_catalog_sha256": catalog["baseline_structural_sha256"],
            "database_default_sha256": "6" * 64,
            "cron_jobs_sha256": "7" * 64,
            "guarded_relations_sha256": guarded_relations_sha256,
            "pg_net_queue_count": 0,
        }
        baseline = {
            "schema_version": "megacampus.q12.database-barrier-baseline/v1",
            "run_id": self.run_id,
            "state": "maintenance_guarded_baseline",
            "source_baseline_sha256": "8" * 64,
            "baseline_sha256": CORE.sha256(CORE.canonical(baseline_projection)),
            "predecessor_checkpoint_sha256": "9" * 64,
            "predecessor_journal_entry_hash": "a" * 64,
            "resource_manifest_sha256": "b" * 64,
            "expected_post_migration_catalog_sha256": catalog[
                "expected_post_migration_catalog_sha256"
            ],
            "database_capability_sha256": capability_sha256,
            "baseline": baseline_projection,
        }
        self._write_protected(self.baseline_file, CORE.complete_object(baseline), 0o400)
        receipt = {
            "schema_version": "megacampus.q12.database-barrier-receipt/v1",
            "run_id": self.run_id,
            "state": "activated",
            "zero_guard_residue": False,
            "expected_catalog_sha256": self.catalog_sha256,
            "last_command": "activate",
            "rollback_probes_verified": True,
            "probe_receipt_sha256": probe_sha256,
        }
        receipt_body = CORE.complete_object(receipt)
        self._write_protected(self.receipt_file, receipt_body, 0o400)
        self._write_protected(
            self.barrier_run_root / "database-barrier-receipt-v1-before-cleanup.json",
            receipt_body,
            0o400,
        )
        fake_node = self.sandbox / "fake-node"
        self._write_protected(
            fake_node,
            (
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                'if [[ ( "$3" == cleanup || "$3" == rollback ) && '
                '-n "${MC2_Q12_FAKE_TERMINAL_RESULT:-}" ]]; then\n'
                '  [[ -n "${14:-}" ]] || exit 84\n'
                '  printf \'%s\\n\' "$MC2_Q12_FAKE_TERMINAL_RESULT" > "${14}"\n'
                "fi\n"
            ).encode("utf-8"),
            0o700,
        )
        self.fake_node = fake_node
        self.db_url = db_url
        self.ca_file = ca_file
        self.terminal_child_result = {
            "structural_catalog_sha256": catalog["expected_post_migration_catalog_sha256"],
            "database_default_sha256": baseline_projection["database_default_sha256"],
            "cron_jobs_sha256": baseline_projection["cron_jobs_sha256"],
            "guard_residue": {
                "q12_guard_schema_count": 0,
                "q12_guard_relation_count": 0,
                "q12_guard_function_count": 0,
                "q12_guard_type_count": 0,
                "q12_guard_trigger_count": 0,
                "q12_guard_event_trigger_count": 0,
                "barrier_era_session_count": 0,
            },
        }
        argv = [
            "bash",
            str(FROZEN_BARRIER),
            "cleanup",
            "--run-id",
            self.run_id,
            "--db-url-file",
            str(db_url),
            "--ca-file",
            str(ca_file),
            "--q12-db-capability-file",
            str(self.capability_file),
            "--expected-post-migration-catalog",
            str(self.catalog_file),
            "--expected-post-migration-catalog-sha256",
            self.catalog_sha256,
        ]
        self.argv = argv
        self.command_sha256 = CORE.sha256(CORE.canonical(argv))
        self.probe_sha256 = probe_sha256
        return {"argv": argv, "command_sha256": self.command_sha256}

    def execute(self) -> None:
        # Copy the controller's OWN journal (76 forward rows + the 3 cleanup rows) into the
        # barrier sandbox; the frozen child validates these exact bytes to the claimed boundary.
        controller_journal = (self.controller_run_root / "phase.jsonl").read_bytes()
        sandbox_journal = self.barrier_run_root / "phase.jsonl"
        self._write_protected(sandbox_journal, controller_journal, 0o600)
        rows = [json.loads(line) for line in controller_journal.splitlines()]
        head = rows[-1]
        if not (
            head["phase"] == "guard_cleanup_complete"
            and head["outcome"] == "capability_claimed"
            and head["command_id"] == "barrier.cleanup"
        ):
            raise CORE.LifecycleError("barrier cleanup child requires a claimed-boundary head")
        journal_stat = sandbox_journal.stat()
        # The frozen barrier's child input checkpoint IS the core's own cutover-checkpoint
        # projection of the claimed head (identical key set, CORE.CHECKPOINT_KEYS): reuse the
        # controller-published phase-checkpoint.json (authored by Engine.append, NOT reimplemented
        # here) and rebind ONLY journal_device/journal_inode to the sandbox journal copy the barrier
        # will stat. Reusing the core projection keeps this adapter free of any serializer schema.
        core_checkpoint = json.loads(
            (self.controller_run_root / "phase-checkpoint.json").read_bytes()
        )
        if core_checkpoint["journal_entry_hash"] != head["entry_hash"]:
            raise CORE.LifecycleError("controller checkpoint is not at the claimed cleanup head")
        core_checkpoint["journal_device"] = str(journal_stat.st_dev)
        core_checkpoint["journal_inode"] = str(journal_stat.st_ino)
        self._write_protected(
            self.barrier_run_root
            / f"database-barrier-input-checkpoint-cleanup-{head['lease_epoch']}.json",
            CORE.complete_object(core_checkpoint),
            0o600,
        )
        environ = {
            "PATH": os.environ.get("PATH", "/usr/sbin:/usr/bin:/sbin:/bin"),
            "LC_ALL": "C",
            "LANG": "C",
            "MC2_Q12_BARRIER_TEST_MODE": BARRIER_TEST_MODE_TOKEN,
            "MC2_Q12_BARRIER_TEST_ROOT": str(self.trust_root),
            "MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY": str(self.sandbox / "project"),
            "MC2_Q12_BARRIER_TEST_NODE": str(self.fake_node),
            "MC2_Q12_FAKE_TERMINAL_RESULT": CORE.canonical(self.terminal_child_result).decode(
                "utf-8"
            ),
        }
        completed = subprocess.run(
            self.argv,
            check=False,
            close_fds=True,
            env=environ,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode != 0:
            shutil.rmtree(self.sandbox, ignore_errors=True)
            raise CORE.LifecycleError(
                "frozen barrier cleanup child failed: "
                f"rc={completed.returncode} {completed.stderr.strip()}"
            )
        if not self.terminal_proof_file.exists():
            shutil.rmtree(self.sandbox, ignore_errors=True)
            raise CORE.LifecycleError("frozen barrier cleanup child produced no terminal proof")
        # Capture the child's real terminal proof digest + the v1 receipt bytes (the archive
        # source) BEFORE tearing down the barrier-side sandbox.
        self.terminal_proof_sha256 = CORE.sha256(self.terminal_proof_file.read_bytes())
        self.v1_receipt_bytes = self.receipt_file.read_bytes()
        shutil.rmtree(self.sandbox, ignore_errors=True)


def acquire_fixture_coordination_lock() -> int:
    """Serialize test runners without changing the production canonical lease."""
    flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC
    descriptor = os.open(FIXTURE_COORDINATION_LOCK, flags, 0o600)
    try:
        identity = os.fstat(descriptor)
        if (
            not stat.S_ISREG(identity.st_mode)
            or identity.st_uid != os.getuid()
            or identity.st_gid != os.getgid()
            or stat.S_IMODE(identity.st_mode) != 0o600
            or identity.st_nlink != 1
        ):
            raise RuntimeError("unsafe test fixture coordination lock")
        deadline = time.monotonic() + FIXTURE_COORDINATION_TIMEOUT_SECONDS
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return descriptor
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("timed out waiting for test fixture coordination lock")
                time.sleep(0.01)
    except Exception:
        os.close(descriptor)
        raise


class NoIoExecutor:
    """Returns immutable synthetic results and never performs an external effect."""

    def __init__(self) -> None:
        self.root: pathlib.Path | None = None
        self.child_executions = 0
        self.attempted_effects: list[str] = []
        self.claim_process_pid: int | None = None
        self.claim_process_boundary = False
        self.launcher_owned_claim_mutation = False
        self.durable_reloads = 0
        self.actual_deployed_wrapper = False
        self.claim_fault = "none"
        self.frontier_claim_fault = "none"
        self.frontier_claim_command: str | None = None
        self.root_fault = "none"
        self.injected_boundary_observed: str | None = None
        self.continuous_lease = False
        self.claim_path_mutation: str | None = None
        self.clear_journal_append_flag = False
        self.parent_fd8_restored = False
        self.checkpoint_repair_case: str | None = None
        self.checkpoint_repair_performed = False
        self.resumed_with_production_shape = False
        self.ancestor_symlink_rejected = False
        self.lease_session_retained_after_failed_validation: bool | None = None
        # R8-I-B: inject a crash INSIDE the journaled post-activate cleanup segment so a mid-cleanup
        # durable head (guard_cleanup_complete/capability_claimed/barrier.cleanup) can be constructed
        # for the recover convergence probe. None => no injected cleanup crash.
        self.cleanup_crash_after: str | None = None

    def _claim_sandbox(self, argv: list[str]) -> tuple[list[str], list[str]]:
        if self.root is None:
            raise RuntimeError("fixture root is unavailable")
        run_id = argv[argv.index("--run-id") + 1]
        capability_index = argv.index("--capability") + 1
        capability = pathlib.Path(argv[capability_index])
        if self.claim_path_mutation == "symlink":
            link = self.root / "capability-link.json"
            link.symlink_to(capability)
            capability = link
        elif self.claim_path_mutation == "dotdot":
            capability = capability.parent / ".." / capability.parent.name / capability.name
        elif self.claim_path_mutation == "parent-symlink":
            alias = self.root / "capability-parent-link"
            alias.symlink_to(capability.parent, target_is_directory=True)
            capability = alias / capability.name
        production_root = pathlib.Path("/opt/megacampus/backups/q12") / run_id
        raw_capability = os.fspath(capability)
        root_prefix = f"{self.root}/"
        if not raw_capability.startswith(root_prefix):
            raise RuntimeError("fixture capability escaped root")
        relative = raw_capability[len(root_prefix) :]
        rewritten = list(argv)
        rewritten[capability_index] = os.fspath(production_root / relative)
        sandbox = [
            "/usr/bin/bwrap", "--unshare-all", "--die-with-parent",
            "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
            "--tmpfs", "/opt", "--dir", "/opt/megacampus",
            "--dir", "/opt/megacampus/backups", "--dir", "/opt/megacampus/backups/q12",
            "--dir", os.fspath(production_root), "--bind", os.fspath(self.root),
            os.fspath(production_root),
            "--bind", os.fspath(self.root.parent / "cutover.lock"),
            "/opt/megacampus/backups/q12/cutover.lock",
        ]
        return sandbox, rewritten

    def _run_with_inherited_fd8(self, command: list[str], journal_fd: int) -> subprocess.CompletedProcess[str]:
        try:
            saved_fd_8 = os.dup(8)
        except OSError:
            saved_fd_8 = None
        child_journal_fd = journal_fd
        separately_opened = None
        if self.clear_journal_append_flag:
            if self.root is None:
                raise RuntimeError("fixture root is unavailable")
            separately_opened = os.open(self.root / "phase.jsonl", os.O_RDWR | os.O_DSYNC)
            child_journal_fd = separately_opened
        try:
            os.dup2(child_journal_fd, 8, inheritable=True)
            return subprocess.run(
                command,
                check=False,
                close_fds=True,
                pass_fds=(8, 9),
                env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"},
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        finally:
            if saved_fd_8 is None:
                os.close(8)
            else:
                os.dup2(saved_fd_8, 8)
                os.close(saved_fd_8)
            if separately_opened is not None:
                os.close(separately_opened)
            self.parent_fd8_restored = True

    def execute(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]:
        self.child_executions += 1
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": capability["command_id"],
            "capability_sha256": CORE.sha256(CORE.complete_object(capability)),
            "result_sha256": CORE.sha256(f"accepted:{capability['command_id']}".encode()),
            "status": "accepted",
        }

    def launch_claim(self, argv: list[str], journal_fd: int) -> dict[str, Any]:
        sandbox, rewritten = self._claim_sandbox(argv)
        command_id = argv[argv.index("--command-id") + 1]
        fault = (
            self.frontier_claim_fault
            if command_id == self.frontier_claim_command
            else self.claim_fault
        )
        child = self._run_with_inherited_fd8(
            [*sandbox, "--",
                "/usr/bin/python3",
                str(pathlib.Path(__file__).resolve()),
                "--claim-noio",
                "--fault",
                fault,
                *rewritten,
            ],
            journal_fd,
        )
        if child.returncode != 0:
            raise CORE.LifecycleError(
                f"delegated claim failed ({child.returncode}): {child.stderr.strip()}"
            )
        response = json.loads(child.stdout)
        self.claim_process_pid = int(response["claimProcessPid"])
        self.claim_process_boundary = bool(response["claimProcessBoundary"])
        self.launcher_owned_claim_mutation = bool(response["launcherOwnedClaimMutation"])
        self.child_executions += int(bool(response["childExecuted"]))
        self.durable_reloads += 1
        if response.get("boundary"):
            self.injected_boundary_observed = str(response["boundary"])
        return response

    def after_claim_move(self) -> None:
        if self.claim_fault == "after-move":
            raise CORE.LifecycleError("injected stop after launcher claim move")

    def after_claim_checkpoint(self) -> None:
        if self.claim_fault == "after-claim-checkpoint":
            raise CORE.LifecycleError("injected stop after launcher claim checkpoint")

    def after_journal_fsync(self, entry: dict[str, Any]) -> None:
        boundary = None
        if self.root_fault == "selector-row" and entry["outcome"] == "intent":
            boundary = "selector-row"
        elif self.root_fault == "issuance-row" and entry["outcome"] in (
            "capability_issued",
            "recovery_reacquired",
        ):
            boundary = "issuance-row"
        elif self.root_fault == "completed-row" and entry["outcome"] == "completed":
            boundary = "completed-row"
        elif self.claim_fault == "claim-row" and entry["outcome"] == "capability_claimed":
            boundary = "claim-row"
        if boundary:
            self.injected_boundary_observed = boundary
            raise CORE.LifecycleError(f"injected stop at {boundary}")

    def after_checkpoint_publication(self, entry: dict[str, Any]) -> None:
        if self.root_fault == "completed-checkpoint" and entry["outcome"] == "completed":
            self.injected_boundary_observed = "completed-checkpoint"
            raise CORE.LifecycleError("injected stop at completed-checkpoint")

    def after_result_publication(self) -> None:
        if self.claim_fault == "result-publication":
            self.injected_boundary_observed = "result-publication"
            raise CORE.LifecycleError("injected stop at result-publication")

    def after_completion_move(self) -> None:
        if self.root_fault == "completion-move":
            self.injected_boundary_observed = "completion-move"
            raise CORE.LifecycleError("injected stop at completion-move")

    def before_checkpoint_repair(
        self, checkpoint_path: pathlib.Path, next_path: pathlib.Path
    ) -> None:
        if self.checkpoint_repair_case != "identity-swap":
            return
        victim = checkpoint_path.with_name("checkpoint-identity-victim.json")
        replacement = checkpoint_path.with_name("checkpoint-identity-replacement.json")
        original = checkpoint_path.read_bytes()
        victim.write_bytes(original)
        victim.chmod(0o600)
        replacement.write_bytes(b'{"identity":"replacement"}\n')
        replacement.chmod(0o600)
        os.replace(replacement, checkpoint_path)
        CORE.fsync_directory(checkpoint_path.parent)

    def before_checkpoint_publication_cas(
        self,
        entry: dict[str, Any],
        checkpoint_path: pathlib.Path,
        next_path: pathlib.Path,
    ) -> None:
        if self.claim_fault != "checkpoint-cas-swap" or entry["outcome"] != "capability_claimed":
            return
        victim = checkpoint_path.with_name("claim-checkpoint-cas-victim.json")
        replacement = checkpoint_path.with_name("claim-checkpoint-cas-replacement.json")
        victim.write_bytes(checkpoint_path.read_bytes())
        victim.chmod(0o600)
        replacement.write_bytes(b'{"claim-cas":"replacement"}\n')
        replacement.chmod(0o600)
        os.replace(replacement, checkpoint_path)
        CORE.fsync_directory(checkpoint_path.parent)


class LiveOrdinaryExecutor(NoIoExecutor):
    """R4 Sub-round A: run_live-scoped ordinary-execution seam (no-I/O, real-shaped result).

    Adds execute_ordinary ONLY on run_live's own executor — run_joined_fixture keeps the
    plain NoIoExecutor (no execute_ordinary attribute), so the closed composer's ordinary
    results stay the original "q12-joined-fixture" projection untouched. The result here is
    real-shaped (same RESULT_KEYS, capability_sha256 bound to the row digest) and
    deterministically distinct from that fixture tag, without ever touching the journal.
    """

    def execute_ordinary(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]:
        self.child_executions += 1
        run_id = capability["run_id"]
        command_id = capability["command_id"]
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": command_id,
            "capability_sha256": CORE.sha256(CORE.complete_object(capability)),
            "result_sha256": CORE.sha256(f"q12-live-real-child:{command_id}:{run_id}".encode()),
            "status": "accepted",
        }

    # Design §6b.1 R8-I-A — POST-ACTIVATE CLEANUP IS JOURNALED, barrier run FOR REAL. The
    # controller journals the guard_cleanup_complete/barrier.cleanup rows itself (through the core
    # append cleanup caller); this seam owns only the file-artifact production the frozen barrier
    # and §6b.5 assign to the controller side: it runs the REAL frozen q12-database-barrier.sh
    # cleanup child against the controller's OWN journal (no real PG — the barrier's own protected
    # test mode is used, exactly as the R4-B/database-barrier rounds sandbox the DB child), then
    # promotes the archived v1 receipt to the exact 10-key v2 the forward resume gate requires and
    # records the db-capability deletion. prepare() returns the frozen cleanup command's own
    # command_sha256 for the rows; execute() runs the child AFTER rows 1-3 exist.

    def prepare_barrier_cleanup(self, context: dict[str, Any]) -> dict[str, Any]:
        self._cleanup_child = RealBarrierCleanupChild(
            pathlib.Path(context["run_root"]),
            context["run_id"],
            context["expected_catalog_sha256"],
        )
        return self._cleanup_child.prepare()

    def execute_barrier_cleanup(
        self, context: dict[str, Any], command: dict[str, Any]
    ) -> dict[str, Any]:
        child = self._cleanup_child
        # R8-I-B crash probe: raise AFTER the controller journaled the guard_cleanup_complete/
        # capability_claimed row (rows 1-3) but BEFORE the barrier child ran / the receipt was
        # promoted, leaving a mid-cleanup durable head for the recover convergence probe to resume.
        if getattr(self, "cleanup_crash_after", None) == "capability_claimed":
            shutil.rmtree(child.sandbox, ignore_errors=True)
            raise CORE.LifecycleError("injected crash after cleanup capability_claimed")
        # Run the frozen barrier cleanup child FOR REAL: it validates the controller journal to
        # the claimed boundary, performs the sandboxed DB cleanup, and publishes the terminal proof.
        child.execute()
        run_root = pathlib.Path(context["run_root"])
        run_id = context["run_id"]
        expected_catalog_sha256 = context["expected_catalog_sha256"]
        # Controller-side probe receipt in the controller run root (the forward resume gate re-reads
        # it, q12-writer-resume.py:1108-1133). Its digest binds the v2 receipt's probe_receipt_sha256.
        probe_object = _barrier_probe_object(run_id, expected_catalog_sha256)
        probe_body = CORE.complete_object(probe_object)
        probe_path = run_root / "database-barrier-probe-receipt.json"
        CORE.immutable_publish(probe_path, probe_body, 0o400, [])
        probe_digest = CORE.sha256(probe_body)
        # v1 -> v2 promotion: archive the activate v1 receipt (0400), then write the exact 10-key
        # megacampus.q12.database-barrier-receipt/v2 the forward resume gate requires key-for-key
        # (q12-writer-resume.py:1090-1104). terminal_proof_sha256 binds the REAL barrier-child proof.
        archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
        CORE.immutable_publish(archive_path, child.v1_receipt_bytes, 0o400, [])
        receipt_object = {
            "schema_version": "megacampus.q12.database-barrier-receipt/v2",
            "run_id": run_id,
            "state": "guard_cleanup_complete",
            "expected_catalog_sha256": expected_catalog_sha256,
            "zero_guard_residue": True,
            "last_command": "cleanup",
            "rollback_probes_verified": True,
            "probe_receipt_sha256": probe_digest,
            "terminal_proof_sha256": child.terminal_proof_sha256,
            "database_capability_deleted": True,
        }
        receipt_body = CORE.complete_object(receipt_object)
        receipt_path = run_root / "database-barrier-receipt.json"
        CORE.immutable_publish(receipt_path, receipt_body, 0o400, [])
        receipt_digest = CORE.sha256(receipt_body)
        return {
            "status": "guard_cleanup_complete",
            "ok": True,
            "cleanup_receipt_path": str(receipt_path),
            "cleanup_receipt_sha256": receipt_digest,
            "cleanup_receipt_archive_path": str(archive_path),
            "probe_receipt_path": str(probe_path),
            "probe_receipt_sha256": probe_digest,
            "terminal_proof_sha256": child.terminal_proof_sha256,
            "command_sha256": command["command_sha256"],
            "receipt": receipt_object,
        }

    def execute_forward_resume(
        self, context: dict[str, Any], cleanup: dict[str, Any]
    ) -> dict[str, Any]:
        run_root = pathlib.Path(context["run_root"])
        run_id = context["run_id"]
        # Fail-closed validation, a byte twin of q12-writer-resume.py's forward branch
        # (:1088-1134). run_live does NOT reimplement this gate — it lives HERE, in the child.
        barrier_path = run_root / "database-barrier-receipt.json"
        barrier_bytes = barrier_path.read_bytes()
        barrier = json.loads(barrier_bytes)
        if set(barrier) != {
            "schema_version",
            "run_id",
            "state",
            "expected_catalog_sha256",
            "zero_guard_residue",
            "last_command",
            "rollback_probes_verified",
            "probe_receipt_sha256",
            "terminal_proof_sha256",
            "database_capability_deleted",
        }:
            raise CORE.LifecycleError("database barrier receipt key set is not exact")
        if barrier_bytes != CORE.complete_object(barrier):
            raise CORE.LifecycleError("database barrier receipt is not canonical bytes")
        hex64 = lambda value: isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value))
        if not (
            barrier["schema_version"] == "megacampus.q12.database-barrier-receipt/v2"
            and barrier["run_id"] == run_id
            and barrier["state"] == "guard_cleanup_complete"
            and barrier["zero_guard_residue"] is True
            and barrier["database_capability_deleted"] is True
            and hex64(barrier["expected_catalog_sha256"])
            and hex64(barrier["terminal_proof_sha256"])
        ):
            raise CORE.LifecycleError("database barrier receipt v2 is not exact terminal authority")
        if not (
            barrier["last_command"] == "cleanup"
            and barrier["rollback_probes_verified"] is True
            and hex64(barrier["probe_receipt_sha256"])
        ):
            raise CORE.LifecycleError("forward cleanup receipt is invalid")
        probe_path = run_root / "database-barrier-probe-receipt.json"
        probe_bytes = probe_path.read_bytes()
        if CORE.sha256(probe_bytes) != barrier["probe_receipt_sha256"]:
            raise CORE.LifecycleError("database barrier probe receipt hash mismatch")
        probe = json.loads(probe_bytes)
        if set(probe) != {
            "schema_version",
            "run_id",
            "expected_catalog_sha256",
            "completed_at",
            "probes",
            "residue",
        }:
            raise CORE.LifecycleError("database barrier probe receipt key set is not exact")
        if not (
            probe["schema_version"] == "megacampus.q12.database-barrier-probes/v1"
            and probe["run_id"] == run_id
            and probe["expected_catalog_sha256"] == barrier["expected_catalog_sha256"]
            and isinstance(probe["completed_at"], str)
            and re.fullmatch(
                r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z",
                probe["completed_at"],
            )
        ):
            raise CORE.LifecycleError("database barrier probe receipt binding is invalid")
        return {
            "status": "resumed",
            "ok": True,
            "validated_receipt_sha256": CORE.sha256(barrier_bytes),
        }


class SandboxedDeployedWrapperExecutor(NoIoExecutor):
    """Runs the unmodified shell launcher; only its fixed child is sandbox-mounted."""

    def __init__(self, root: pathlib.Path) -> None:
        super().__init__()
        self.root = root

    def launch_claim(self, argv: list[str], journal_fd: int) -> dict[str, Any]:
        fake_child = self.root / "sandbox-q12-database-barrier.sh"
        fake_child.write_text("#!/usr/bin/bash\nset -euo pipefail\nprintf 'sandbox-accepted\\n'\n", encoding="utf-8")
        fake_child.chmod(0o700)
        wrapper = REPO_ROOT / "deploy/qdrant/q12-capability-run.sh"
        sandbox, rewritten = self._claim_sandbox(argv)
        child = self._run_with_inherited_fd8(
            [*sandbox,
                "--dir",
                "/opt/megacampus/deploy",
                "--dir",
                "/opt/megacampus/deploy/qdrant",
                "--ro-bind",
                str(fake_child),
                "/opt/megacampus/deploy/qdrant/q12-database-barrier.sh",
                "--",
                "/usr/bin/bash",
                str(wrapper),
                *rewritten,
            ],
            journal_fd,
        )
        if child.returncode != 0:
            raise CORE.LifecycleError(
                f"sandboxed deployed launcher failed ({child.returncode}): {child.stderr.strip()}"
            )
        response = json.loads(child.stdout)
        self.actual_deployed_wrapper = True
        self.claim_process_pid = int(response["claimProcessPid"])
        self.claim_process_boundary = bool(response["claimProcessBoundary"])
        self.launcher_owned_claim_mutation = bool(response["launcherOwnedClaimMutation"])
        self.child_executions += int(bool(response["childExecuted"]))
        self.durable_reloads += 1
        return response


class LiveSandboxedDeployedWrapperExecutor(SandboxedDeployedWrapperExecutor, LiveOrdinaryExecutor):
    """R4 Sub-round B: run_live's in-process barrier claims (barrier.install, ...) cross the
    REAL deployed q12-capability-run.sh wrapper (unmodified; only its DB-barrier child is
    sandbox-faked) via SandboxedDeployedWrapperExecutor.launch_claim, while ordinary
    lifecycles keep Sub-round A's LiveOrdinaryExecutor.execute_ordinary seam. Multiple
    inheritance composes both without duplicating either method: MRO resolves launch_claim
    from SandboxedDeployedWrapperExecutor and execute_ordinary from LiveOrdinaryExecutor, both
    sharing NoIoExecutor's state. The barrier claim result lands ONLY in the per-barrier
    retained-result side file (Engine.finish -> self.results), never the journal, so the
    journal stays a byte/order twin of the closed composer regardless of which barrier
    executor variant runs (design
    docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §3/§6.4; the real-DB
    transition itself is a separate real-PG17 round — the DB-barrier child stays sandbox-faked
    here)."""


def write_audit(
    root: pathlib.Path, executor: NoIoExecutor, output: dict[str, Any] | None = None
) -> None:
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    (root / "effects.json").write_text("[]\n", encoding="utf-8")
    (root / "executor-audit.json").write_text(
        json.dumps(
            {
                "childExecutions": executor.child_executions,
                "attemptedEffects": executor.attempted_effects,
                "enteredRunSupervisor": True,
                "enteredRunClaim": True,
                "supervisorPid": os.getpid(),
                "claimProcessPid": executor.claim_process_pid,
                "claimProcessBoundary": executor.claim_process_boundary,
                "launcherOwnedClaimMutation": executor.launcher_owned_claim_mutation,
                "durableReloads": executor.durable_reloads,
                "actualDeployedWrapper": executor.actual_deployed_wrapper,
                "injectedBoundaryObserved": executor.injected_boundary_observed,
                "leaseFd9Validated": bool(output and output.get("leaseFd9Validated")),
                "canonicalLeaseFd9Validated": bool(
                    output and output.get("canonicalLeaseFd9Validated")
                ),
                "inheritedJournalIdentityValidated": bool(
                    output and output.get("inheritedJournalIdentityValidated")
                ),
                "parentFd8Restored": executor.parent_fd8_restored,
                "checkpointRepairCase": executor.checkpoint_repair_case,
                "checkpointRepairPerformed": executor.checkpoint_repair_performed,
                "resumedWithProductionShape": executor.resumed_with_production_shape,
                "ancestorSymlinkRejected": executor.ancestor_symlink_rejected,
                "leaseSessionRetainedAfterFailedValidation": (
                    executor.lease_session_retained_after_failed_validation
                ),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def derive_run_id(run_root: pathlib.Path) -> str:
    # Deterministic per-root run id, shaped as a lower-case UUIDv4. R8-I-A drives the FROZEN
    # q12-database-barrier.sh cleanup child against the controller's own journal, and the frozen
    # barrier requires --run-id to be a UUIDv4 (`-4xxx-[89ab]xxx-`, q12-database-barrier.sh:72).
    # The composer and the live controller both derive their run id here, so forcing the v4 shape
    # (version + RFC-4122 variant bits over the same uuid5 entropy) is parity-neutral: both twins
    # still bind the identical id, only now barrier-acceptable.
    seed = uuid.uuid5(uuid.NAMESPACE_URL, str(run_root))
    return str(uuid.UUID(int=seed.int, version=4))


def open_directory_chain(path: pathlib.Path, label: str) -> int:
    directory_fd = os.open(
        "/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    )
    try:
        for component in path.parts[1:]:
            next_fd = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=directory_fd,
            )
            os.close(directory_fd)
            directory_fd = next_fd
    except OSError as error:
        os.close(directory_fd)
        raise RuntimeError(f"{label} ancestor symlink or unsafe directory") from error
    return directory_fd


def fixture_root(raw: Any) -> pathlib.Path:
    if not isinstance(raw, str) or not raw.startswith("/tmp/"):
        raise RuntimeError("fixture root must be an absolute path below /tmp")
    if os.path.normpath(raw) != raw:
        raise RuntimeError("fixture root must be normalized")
    root = pathlib.Path(raw)
    root_fd = open_directory_chain(root, "fixture root")
    try:
        root_stat = os.fstat(root_fd)
        if (
            not stat.S_ISDIR(root_stat.st_mode)
            or stat.S_IMODE(root_stat.st_mode) != 0o700
            or root_stat.st_uid != os.geteuid()
            or root_stat.st_gid != os.getegid()
        ):
            raise RuntimeError("fixture root must be a safe owner-only real directory")
    finally:
        os.close(root_fd)
    return root


def existing_quiesce_manifest_sha256(
    root: pathlib.Path, raw_path: Any, mutation: Any
) -> str:
    if not isinstance(raw_path, str) or not raw_path.startswith("/"):
        raise RuntimeError("existing quiesce manifest path must be absolute")
    if os.path.normpath(raw_path) != raw_path:
        raise RuntimeError("existing quiesce manifest path must be normalized")
    path = pathlib.Path(raw_path)
    try:
        relative = path.relative_to(root)
    except ValueError as error:
        raise RuntimeError("existing quiesce manifest path is outside fixture root") from error
    if not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
        raise RuntimeError("existing quiesce manifest path is unsafe")

    directory_fd = open_directory_chain(root, "fixture root")
    file_fd: int | None = None
    try:
        for component in relative.parts[:-1]:
            next_fd = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=directory_fd,
            )
            os.close(directory_fd)
            directory_fd = next_fd
        filename = relative.parts[-1]
        try:
            file_fd = os.open(
                filename,
                os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=directory_fd,
            )
        except OSError as error:
            raise RuntimeError("existing quiesce manifest is missing or unsafe") from error
        before = os.fstat(file_fd)
        if (
            not stat.S_ISREG(before.st_mode)
            or stat.S_IMODE(before.st_mode) != 0o400
            or before.st_uid != os.geteuid()
            or before.st_gid != os.getegid()
            or before.st_nlink != 1
            or before.st_size <= 0
            or before.st_size > 4 * 1024 * 1024
        ):
            raise RuntimeError("existing quiesce manifest file identity/mode/link is unsafe")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(file_fd)
        identity = lambda item: (
            item.st_dev,
            item.st_ino,
            stat.S_IMODE(item.st_mode),
            item.st_uid,
            item.st_gid,
            item.st_nlink,
            item.st_size,
            item.st_mtime_ns,
            item.st_ctime_ns,
        )
        if identity(after) != identity(before):
            raise RuntimeError("existing quiesce manifest changed while hashing")

        if mutation == "replace-after-validation":
            replacement = f".{filename}.replacement"
            replacement_fd = os.open(
                replacement,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                0o600,
                dir_fd=directory_fd,
            )
            try:
                os.write(replacement_fd, b'{"changed":true}\n')
                os.fsync(replacement_fd)
                os.fchmod(replacement_fd, 0o400)
            finally:
                os.close(replacement_fd)
            os.replace(
                replacement,
                filename,
                src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd,
            )
            os.fsync(directory_fd)
        elif mutation is not None:
            raise RuntimeError("unknown quiesce manifest mutation")

        current = os.stat(filename, dir_fd=directory_fd, follow_symlinks=False)
        if identity(current) != identity(before):
            raise RuntimeError("existing quiesce manifest identity changed after validation")
        return digest.hexdigest()
    finally:
        if file_fd is not None:
            os.close(file_fd)
        os.close(directory_fd)


JOINED_SPEC_KEYS = {
    "runRoot",
    "joinedProfile",
    "completedPrefixLength",
    "frontier",
    "quiesceManifestPath",
    "chains",
    "partialCaptureTargets",
}


def run_joined_fixture(spec: dict) -> int:
    unknown = set(spec) - JOINED_SPEC_KEYS
    if unknown:
        raise RuntimeError(f"unknown joined fixture key: {sorted(unknown)}")
    if "quiesceManifestPath" not in spec:
        raise RuntimeError("joined fixture requires the W quiesce manifest path")
    root = fixture_root(spec["runRoot"])
    quiesce_manifest_sha256 = existing_quiesce_manifest_sha256(
        root, spec["quiesceManifestPath"], None
    )
    acquire_fixture_coordination_lock()
    canonical_lock_path = root.parent / "cutover.lock"
    if canonical_lock_path.exists():
        canonical_lock_path.chmod(0o600)
    lease_fd = os.open(canonical_lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lease_fd != 9:
        os.dup2(lease_fd, 9)
        os.close(lease_fd)
        lease_fd = 9
    fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock_stat = os.fstat(lease_fd)
    executor = NoIoExecutor()
    executor.root = root
    expected_catalog = root / "expected-post-migration-catalog.json"
    if not expected_catalog.exists():
        expected_catalog.write_text('{"schema_version":"fixture/v1"}\n', encoding="utf-8")
        expected_catalog.chmod(0o400)
    request = {
        "run_root": str(root),
        "run_id": derive_run_id(root),
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": quiesce_manifest_sha256,
        "expected_catalog_sha256": CORE.sha256(expected_catalog.read_bytes()),
        "rotation_required": False,
        "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
        "joined_profile": spec["joinedProfile"],
        "quiesce_manifest_path": spec["quiesceManifestPath"],
        "chains": spec.get("chains"),
        "completed_prefix_length": spec.get("completedPrefixLength"),
        "frontier": spec.get("frontier"),
        "partial_capture_target_count": spec.get("partialCaptureTargets"),
    }
    try:
        output = CORE.run_joined_composer(request, executor)
    except Exception as error:
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


LIVE_SPEC_KEYS = {
    "runRoot",
    "liveController",
    "runId",
    "production",
    "quiesceManifestPath",
    "executeActualWrapper",
    "stopAfter",
    "cleanupCrashAfter",
}

RECOVER_SPEC_KEYS = {
    "runRoot",
    "recoverController",
    "runId",
    "production",
    "quiesceManifestPath",
    "executeActualWrapper",
}


def quiesce_manifest_sha256_readonly(raw_path: Any) -> str:
    """Safely digest an absolute owner-only 0400 quiesce manifest.

    The parity proof shares ONE quiesce manifest between the composer and the
    controller, so (unlike the joined fixture's own root-relative preimage) the
    path can live outside the controller's run root. The controller itself reads
    the same bytes read-only via validate_regular_file(mode=0o400); this only
    computes the digest the controller's request must carry.
    """
    if not isinstance(raw_path, str) or not raw_path.startswith("/"):
        raise RuntimeError("quiesce manifest path must be absolute")
    if os.path.normpath(raw_path) != raw_path:
        raise RuntimeError("quiesce manifest path must be normalized")
    file_fd = os.open(raw_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        before = os.fstat(file_fd)
        if (
            not stat.S_ISREG(before.st_mode)
            or stat.S_IMODE(before.st_mode) != 0o400
            or before.st_uid != os.geteuid()
            or before.st_gid != os.getegid()
            or before.st_nlink != 1
            or before.st_size <= 0
            or before.st_size > 4 * 1024 * 1024
        ):
            raise RuntimeError("quiesce manifest identity/mode/link is unsafe")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        return digest.hexdigest()
    finally:
        os.close(file_fd)


def run_live_fixture(spec: dict) -> int:
    """Drive the Task-9 live cutover controller (run_live) on a fixture root.

    Mirrors run_joined_fixture's request base fields (so a live journal can be
    compared byte-for-byte against the closed composer's), but takes NO joined
    profile and NO W quiesce manifest preimage: the incremental controller
    journals only the amendment §5 group-1 genesis (operator.self-check), which
    is substitution- and quiesce-independent. An explicit runId lets a parity
    test pin the same run id the composer derived from its own root.
    """
    unknown = set(spec) - LIVE_SPEC_KEYS
    if unknown:
        raise RuntimeError(f"unknown live fixture key: {sorted(unknown)}")
    root = fixture_root(spec["runRoot"])
    acquire_fixture_coordination_lock()
    canonical_lock_path = root.parent / "cutover.lock"
    if canonical_lock_path.exists():
        canonical_lock_path.chmod(0o600)
    lease_fd = os.open(canonical_lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lease_fd != 9:
        os.dup2(lease_fd, 9)
        os.close(lease_fd)
        lease_fd = 9
    fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock_stat = os.fstat(lease_fd)
    # R4 Sub-round A: run_live gets the ordinary-execution seam; run_joined_fixture (the
    # composer) keeps the plain NoIoExecutor above, so the seam never reaches the oracle.
    # R4 Sub-round B: when executeActualWrapper is set, the barrier claims ALSO cross the
    # real deployed q12-capability-run.sh wrapper (SandboxedDeployedWrapperExecutor), composed
    # with the same ordinary-execution seam via LiveSandboxedDeployedWrapperExecutor.
    executor = (
        LiveSandboxedDeployedWrapperExecutor(root)
        if spec.get("executeActualWrapper")
        else LiveOrdinaryExecutor()
    )
    executor.root = root
    executor.cleanup_crash_after = spec.get("cleanupCrashAfter")
    expected_catalog = root / "expected-post-migration-catalog.json"
    if not expected_catalog.exists():
        expected_catalog.write_text('{"schema_version":"fixture/v1"}\n', encoding="utf-8")
        expected_catalog.chmod(0o400)
    quiesce_manifest_path = spec.get("quiesceManifestPath")
    quiesce_manifest_sha256 = (
        quiesce_manifest_sha256_readonly(quiesce_manifest_path)
        if quiesce_manifest_path is not None
        else "0" * 64
    )
    request = {
        "run_root": str(root),
        "run_id": spec.get("runId") or derive_run_id(root),
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": quiesce_manifest_sha256,
        "expected_catalog_sha256": CORE.sha256(expected_catalog.read_bytes()),
        "rotation_required": False,
        "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
    }
    if quiesce_manifest_path is not None:
        request["quiesce_manifest_path"] = quiesce_manifest_path
    if spec.get("production") is True:
        request["production"] = True
    # R5-D / R8-I-B: an optional named checkpoint at which run_live stops cleanly and returns its
    # partial output (a stopped run does NOT run post-activate). Absent => the full 81-row window.
    if spec.get("stopAfter") is not None:
        request["stop_after"] = spec["stopAfter"]
    try:
        output = CORE.run_live(request, executor)
    except Exception as error:  # noqa: BLE001 - fixture surfaces the message
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    output["childExecutions"] = executor.child_executions
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_recover_fixture(spec: dict) -> int:
    """Drive the R5 Sub-round D RECOVER controller (run_recover) on an EXISTING run root.

    Mirrors run_live_fixture's request base + executor + canonical-lease handling, but targets a
    run root a prior run_live(stop_after=...) already left a partial durable journal on (a
    separate process; the lease was released when it exited, so recover re-acquires it here). The
    runId MUST be pinned to the same id that partial run used so the rehydrated journal binds.
    """
    unknown = set(spec) - RECOVER_SPEC_KEYS
    if unknown:
        raise RuntimeError(f"unknown recover fixture key: {sorted(unknown)}")
    root = fixture_root(spec["runRoot"])
    acquire_fixture_coordination_lock()
    canonical_lock_path = root.parent / "cutover.lock"
    if canonical_lock_path.exists():
        canonical_lock_path.chmod(0o600)
    lease_fd = os.open(canonical_lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lease_fd != 9:
        os.dup2(lease_fd, 9)
        os.close(lease_fd)
        lease_fd = 9
    fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock_stat = os.fstat(lease_fd)
    executor = (
        LiveSandboxedDeployedWrapperExecutor(root)
        if spec.get("executeActualWrapper")
        else LiveOrdinaryExecutor()
    )
    executor.root = root
    expected_catalog = root / "expected-post-migration-catalog.json"
    if not expected_catalog.exists():
        expected_catalog.write_text('{"schema_version":"fixture/v1"}\n', encoding="utf-8")
        expected_catalog.chmod(0o400)
    quiesce_manifest_path = spec.get("quiesceManifestPath")
    quiesce_manifest_sha256 = (
        quiesce_manifest_sha256_readonly(quiesce_manifest_path)
        if quiesce_manifest_path is not None
        else "0" * 64
    )
    request = {
        "run_root": str(root),
        "run_id": spec.get("runId") or derive_run_id(root),
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": quiesce_manifest_sha256,
        "expected_catalog_sha256": CORE.sha256(expected_catalog.read_bytes()),
        "rotation_required": False,
        "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
    }
    if quiesce_manifest_path is not None:
        request["quiesce_manifest_path"] = quiesce_manifest_path
    if spec.get("production") is True:
        request["production"] = True
    try:
        output = CORE.run_recover(request, executor)
    except Exception as error:  # noqa: BLE001 - fixture surfaces the message
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    output["childExecutions"] = executor.child_executions
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def run_fwm_negative_fixture(spec: dict) -> int:
    """R5 Sub-round A negatives: publish_final_writer_manifest fail-closed proofs.

    A focused, real (non-mocked) call into the production
    ``Engine.publish_final_writer_manifest``/``derive_root_writer_inventory`` on a fresh
    fixture run root, exercising the exact same code path run_live and run_joined_composer
    both use. Two cases: "bad-mode" (mode outside forward/rollback) and "no-targets" (a
    forward-mode publish against an inventory with no target identities).
    """
    case = spec["case"]
    root = fixture_root(spec["runRoot"])
    request = {
        "run_root": str(root),
        "run_id": spec["runId"],
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": "0" * 64,
        "rotation_required": False,
    }
    executor = NoIoExecutor()
    executor.root = root
    engine = CORE.Engine(request, executor)
    try:
        if case == "bad-mode":
            engine.publish_final_writer_manifest("sideways", None, {"command_sha256": "a" * 64})
        elif case == "no-targets":
            quiesce_bytes = pathlib.Path(spec["quiesceManifestPath"]).read_bytes()
            inventory = engine.derive_root_writer_inventory(quiesce_bytes, include_targets=False)
            engine.publish_final_writer_manifest(
                "forward", inventory, {"command_sha256": "a" * 64}
            )
        else:
            raise RuntimeError(f"unknown fwm negative case: {case}")
    except CORE.LifecycleError as error:
        print(str(error), file=sys.stderr)
        return 2
    print("unexpectedly succeeded", file=sys.stderr)
    return 3


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--fwm-negative":
        if len(sys.argv) != 2:
            raise RuntimeError("invalid fwm-negative arguments")
        return run_fwm_negative_fixture(json.load(sys.stdin))
    if len(sys.argv) > 1 and sys.argv[1] == "--derive-run-id":
        if len(sys.argv) != 2:
            raise RuntimeError("invalid run-id derivation arguments")
        request = json.load(sys.stdin)
        if set(request) != {"runRoot"}:
            raise RuntimeError("run-id derivation accepts only runRoot")
        root = fixture_root(request["runRoot"])
        sys.stdout.write(json.dumps({"runId": derive_run_id(root)}) + "\n")
        return 0
    if len(sys.argv) > 1 and sys.argv[1] == "--validate-walk":
        if len(sys.argv) != 2:
            raise RuntimeError("invalid validate-walk arguments")
        payload = json.load(sys.stdin)
        if set(payload) != {"journal", "request"}:
            raise RuntimeError("validate-walk accepts only journal and request")
        try:
            CORE.validate_stable_binding_walk(payload["journal"], payload["request"])
        except CORE.LifecycleError as error:
            print(str(error), file=sys.stderr)
            return 2
        sys.stdout.write("ok\n")
        return 0
    if len(sys.argv) > 1 and sys.argv[1] == "--claim-noio":
        claim_arguments = sys.argv[2:]
        if claim_arguments[:1] != ["--fault"] or len(claim_arguments) < 3:
            raise RuntimeError("missing fixture-only claim fault selector")
        executor = NoIoExecutor()
        executor.claim_fault = claim_arguments[1]
        arguments = CORE.parser().parse_args(["claim", *claim_arguments[2:]])
        try:
            output = run_claim(arguments, executor)
        except CORE.LifecycleError as error:
            if not str(error).startswith("injected stop"):
                raise
            boundary = executor.injected_boundary_observed
            output = {
                "claimProcessBoundary": True,
                "launcherOwnedClaimMutation": True,
                "claimProcessPid": os.getpid(),
                "childExecuted": boundary == "result-publication",
                "stoppedAt": str(error),
                "boundary": boundary,
                "restartRequired": boundary in ("claim-row", "result-publication"),
            }
        sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
        return 0
    spec = json.load(sys.stdin)
    if "quiesceManifestSha256" in spec or "quiesce_manifest_sha256" in spec:
        raise RuntimeError("caller quiesce digest override is forbidden")
    if spec.get("liveController"):
        return run_live_fixture(spec)
    if spec.get("recoverController"):
        return run_recover_fixture(spec)
    if "joinedProfile" in spec:
        return run_joined_fixture(spec)
    root = fixture_root(spec["runRoot"])
    frontier = spec.get("abandonedFrontier")
    has_later_four = any(
        operation != "install" for operation in spec.get("chains", {})
    ) or (frontier is not None and frontier.get("operation") != "install")
    existing_manifest_path = spec.get("existingQuiesceManifestPath")
    if has_later_four and existing_manifest_path is None:
        raise RuntimeError(
            "existing quiesce manifest byte preimage is required for later-four fixtures"
        )
    if not has_later_four and existing_manifest_path is not None:
        raise RuntimeError("install-only fixture cannot accept a quiesce manifest preimage")
    quiesce_manifest_sha256 = (
        existing_quiesce_manifest_sha256(
            root, existing_manifest_path, spec.get("quiesceManifestMutation")
        )
        if existing_manifest_path is not None
        else "0" * 64
    )
    coordination_fd = acquire_fixture_coordination_lock()
    canonical_lock_path = root.parent / "cutover.lock"
    if canonical_lock_path.exists():
        canonical_lock_path.chmod(0o600)
    lock_path = (
        root / "cutover.lock"
        if spec.get("leaseMutation") == "wrong-path"
        else canonical_lock_path
    )
    lease_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lease_fd != 9:
        os.dup2(lease_fd, 9)
        os.close(lease_fd)
        lease_fd = 9
    if spec.get("leaseMutation") != "unlocked":
        fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if spec.get("leaseMutation") == "wrong-inode":
        replacement = root.parent / ".cutover.lock.replacement"
        replacement.write_bytes(b"")
        replacement.chmod(0o600)
        os.replace(replacement, canonical_lock_path)
    elif spec.get("leaseMutation") == "wrong-mode":
        canonical_lock_path.chmod(0o640)
    lock_stat = os.fstat(lease_fd)
    executor = (
        SandboxedDeployedWrapperExecutor(root)
        if spec.get("executeActualWrapper")
        else NoIoExecutor()
    )
    executor.root = root
    executor.claim_path_mutation = spec.get("claimPathMutation")
    executor.clear_journal_append_flag = bool(spec.get("clearJournalAppendFlag"))
    executor.checkpoint_repair_case = spec.get("checkpointRepairCase")
    if spec.get("leaseMutation") == "ancestor-symlink":
        target_ancestor = root / ".lease-probe-target"
        target_parent = target_ancestor / "parent"
        target_parent.mkdir(parents=True)
        linked_ancestor = root / ".lease-probe-link"
        linked_ancestor.symlink_to(target_ancestor, target_is_directory=True)
        probe_lock = target_parent / "cutover.lock"
        probe_fd = os.open(probe_lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        fcntl.flock(probe_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            CORE.validate_canonical_lease_lock(
                linked_ancestor / "parent" / "probe-run", probe_fd
            )
        except (CORE.LifecycleError, OSError):
            executor.ancestor_symlink_rejected = True
        finally:
            os.close(probe_fd)
            probe_lock.unlink()
            linked_ancestor.unlink()
            target_parent.rmdir()
            target_ancestor.rmdir()
        if not executor.ancestor_symlink_rejected:
            raise CORE.LifecycleError("canonical lease ancestor symlink was accepted")
    install_chain = spec.get("chains", {}).get("install")
    if install_chain:
        if install_chain.get("stopAfter") == "claim-moved":
            executor.claim_fault = "after-move"
        elif install_chain.get("stopAfter") == "claimed" or install_chain.get(
            "installTransaction"
        ) in ("committed-no-baseline-receipt", "ambiguous"):
            executor.claim_fault = "after-claim-checkpoint"
    if spec.get("checkpointPublicationRace") == "claim-current-swap":
        executor.claim_fault = "checkpoint-cas-swap"
    if (
        frontier
        and not frontier.get("exactSuccessBeforeDisposition")
        and frontier.get("form") == "claim-moved"
    ):
        executor.frontier_claim_command = f"barrier.{frontier['operation']}"
        executor.frontier_claim_fault = "after-move"
    elif (
        frontier
        and not frontier.get("exactSuccessBeforeDisposition")
        and frontier.get("form") == "claimed-no-success"
    ):
        executor.frontier_claim_command = f"barrier.{frontier['operation']}"
        executor.frontier_claim_fault = "after-claim-checkpoint"
    restart_boundary = spec.get("restartBoundary")
    if restart_boundary in ("claim-row", "result-publication"):
        executor.claim_fault = restart_boundary
    elif restart_boundary:
        executor.root_fault = restart_boundary
    expected_catalog = root / "expected-post-migration-catalog.json"
    if not expected_catalog.exists():
        expected_catalog.write_text('{"schema_version":"fixture/v1"}\n', encoding="utf-8")
        expected_catalog.chmod(0o400)
    production_spec = {
        key: value
        for key, value in spec.items()
        if key not in {"existingQuiesceManifestPath", "quiesceManifestMutation"}
    }
    request = {
        **production_spec,
        "run_root": str(root),
        "run_id": derive_run_id(root),
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64,
        "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": quiesce_manifest_sha256,
        "expected_catalog_sha256": CORE.sha256(expected_catalog.read_bytes()),
        "rotation_required": bool(spec.get("rotationRequired", False)),
        "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
    }
    try:
        if spec.get("leaseMutation") == "wrong-fd-then-correct":
            correct_lease_anchor = os.dup(9)
            wrong_path = root / ".wrong-lease-session.lock"
            wrong_fd = os.open(
                wrong_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600
            )
            fcntl.flock(wrong_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            os.dup2(wrong_fd, 9, inheritable=True)
            try:
                run_supervisor(request, executor)
            except CORE.LifecycleError as error:
                if "canonical" not in str(error) and "FD 9" not in str(error):
                    raise
            else:
                raise RuntimeError("wrong FD9 unexpectedly passed canonical validation")
            executor.lease_session_retained_after_failed_validation = (
                executor in CORE._LEASE_SESSIONS
            )
            os.dup2(correct_lease_anchor, 9, inheritable=True)
            os.close(correct_lease_anchor)
            os.close(wrong_fd)
            wrong_path.unlink()
        if spec.get("journalMutation"):
            output = run_supervisor(request, executor)
            journal_path = root / "phase.jsonl"
            rows = [json.loads(line) for line in journal_path.read_text().splitlines()]
            entry = rows[-1]
            mutation = spec["journalMutation"]
            if mutation == "unknown-phase":
                entry["phase"] = "unknown_phase"
            elif mutation == "unknown-outcome":
                entry["outcome"] = "unknown_outcome"
            elif mutation == "wrong-command":
                entry["command_id"] = "barrier.activate"
            elif mutation == "invalid-epoch":
                entry["lease_epoch"] = "cutover-recovery-01"
            elif mutation == "accepted-pairing":
                entry["accepted_object_sha256"] = "e" * 64
            elif mutation == "hash-field-type":
                entry["capability_manifest_sha256"] = 7
            else:
                raise RuntimeError("unknown journal mutation")
            preimage = dict(entry)
            preimage.pop("entry_hash")
            entry["entry_hash"] = CORE.sha256(CORE.canonical(preimage))
            journal_path.write_bytes(b"".join(CORE.complete_object(row) for row in rows))
            journal_path.chmod(0o600)
            checkpoint_path = root / "phase-checkpoint.json"
            checkpoint = json.loads(checkpoint_path.read_bytes())
            checkpoint.update(
                {
                    "phase": entry["phase"],
                    "journal_entry_hash": entry["entry_hash"],
                    "previous_journal_entry_hash": entry["previous_hash"],
                    "accepted_object_kind": entry["accepted_object_kind"],
                    "accepted_object_sha256": entry["accepted_object_sha256"],
                    "lease_epoch": entry["lease_epoch"],
                }
            )
            checkpoint_path.write_bytes(CORE.complete_object(checkpoint))
            checkpoint_path.chmod(0o600)
            CORE.fsync_directory(root)
            output = run_supervisor(request, executor)
        elif spec.get("checkpointRepairCase"):
            executor.root_fault = "completed-row"
            try:
                run_supervisor(request, executor)
            except CORE.LifecycleError as error:
                if "injected stop at completed-row" not in str(error):
                    raise
            executor.root_fault = "none"
            checkpoint = root / "phase-checkpoint.json"
            next_checkpoint = root / "phase-checkpoint.json.next"
            repair_case = spec["checkpointRepairCase"]
            if repair_case == "foreign-next":
                next_checkpoint.write_bytes(b'{"foreign":"checkpoint-next"}\n')
                next_checkpoint.chmod(0o600)
            elif repair_case == "stale-predecessor":
                stale = root / "retained-barrier-capability-checkpoint-install-cutover.json"
                checkpoint.write_bytes(stale.read_bytes())
                checkpoint.chmod(0o600)
            elif repair_case == "identity-swap":
                pass
            elif repair_case == "missing-current":
                checkpoint.unlink()
                CORE.fsync_directory(root)
            else:
                raise RuntimeError("unknown checkpoint repair case")
            output = run_supervisor(request, executor)
            executor.durable_reloads += 1
        elif restart_boundary:
            try:
                run_supervisor(request, executor)
            except CORE.LifecycleError as error:
                if "injected" not in str(error):
                    raise
            result_mutation = spec.get("resultMutation")
            if result_mutation:
                result_path = root / "retained-barrier-result-install-cutover.json"
                result = json.loads(result_path.read_bytes())
                if result_mutation == "wrong-command":
                    result["command_id"] = "barrier.activate"
                elif result_mutation == "wrong-capability":
                    result["capability_sha256"] = "f" * 64
                elif result_mutation == "wrong-status":
                    result["status"] = "rejected"
                elif result_mutation == "extra-key":
                    result["extra"] = True
                elif result_mutation == "invalid-result-hash":
                    result["result_sha256"] = "not-a-sha256"
                elif result_mutation == "wrong-epoch":
                    wrong_path = root / "retained-barrier-result-install-cutover-recovery-1.json"
                    os.replace(result_path, wrong_path)
                    result_path = wrong_path
                else:
                    raise RuntimeError("unknown result mutation")
                result_path.write_bytes(CORE.complete_object(result))
                result_path.chmod(0o600)
                CORE.fsync_directory(root)
            executor.claim_fault = "none"
            executor.root_fault = "none"
            output = run_supervisor(request, executor)
            executor.durable_reloads += 1
        elif spec.get("resumeAfterStop"):
            run_supervisor(request, executor)
            executor.claim_fault = "none"
            if spec.get("reopenLeaseFdBeforeResume"):
                os.close(9)
                reopened = os.open(canonical_lock_path, os.O_RDWR | os.O_NOFOLLOW)
                if reopened != 9:
                    os.dup2(reopened, 9)
                    os.close(reopened)
            resumed = json.loads(json.dumps(request))
            for chain in resumed["chains"].values():
                chain["stopAfter"] = "completed"
                if chain["operation"] == "install":
                    chain["installTransaction"] = "normal"
            output = run_supervisor(resumed, executor)
            executor.durable_reloads += 1
        elif spec.get("resumeAfterFault"):
            try:
                run_supervisor(request, executor)
            except CORE.LifecycleError as error:
                if "injected crash" not in str(error):
                    raise
            resumed = json.loads(json.dumps(request))
            for chain in resumed["chains"].values():
                chain["faultAfter"] = "none"
                chain["rootEpoch"] = "cutover"
                chain["recoveryReissues"] = 0
                chain["publicationWindowOrphans"] = 0
                chain["completionMode"] = "normal"
            executor.resumed_with_production_shape = True
            executor.continuous_lease = not bool(spec.get("simulateLeaseLoss"))
            output = run_supervisor(resumed, executor)
            executor.durable_reloads += 1
        else:
            output = run_supervisor(request, executor)
    except Exception as error:
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
