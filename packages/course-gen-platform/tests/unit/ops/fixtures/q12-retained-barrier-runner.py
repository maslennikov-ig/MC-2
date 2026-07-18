#!/usr/bin/python3
"""No-I/O adapter for the Root-owned retained barrier production core."""

from __future__ import annotations

import importlib.util
import fcntl
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys
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
    return str(uuid.uuid5(uuid.NAMESPACE_URL, str(run_root)))


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


LIVE_SPEC_KEYS = {"runRoot", "liveController", "runId", "production", "quiesceManifestPath"}


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
    executor = LiveOrdinaryExecutor()
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
        output = CORE.run_live(request, executor)
    except Exception as error:  # noqa: BLE001 - fixture surfaces the message
        write_audit(root, executor)
        print(str(error), file=sys.stderr)
        return 2
    output["childExecutions"] = executor.child_executions
    write_audit(root, executor, output)
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def main() -> int:
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
