#!/usr/bin/python3
"""Root-owned retained barrier serializer and capability lifecycle."""

from __future__ import annotations

import argparse
import ctypes
import fcntl
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

ZERO = "0" * 64
EPOCH_RE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*)$")
OPERATIONS = (
    "install",
    "verify-after-base",
    "verify-after-observability",
    "prepare-recovery",
    "activate",
)
COMMANDS = {operation: f"barrier.{operation}" for operation in OPERATIONS}
TARGET_PHASES = {
    "install": "maintenance_guarded",
    "verify-after-base": "base_migration_guarded",
    "verify-after-observability": "observability_migration_guarded",
    "prepare-recovery": "recovery_ready_guarded",
    "activate": "activated",
}
PREDECESSOR_PHASES = {
    "install": "preflight",
    "verify-after-base": "restore_verified",
    "verify-after-observability": "base_migration_guarded",
    "prepare-recovery": "migrations_applied",
    "activate": "activation_ready",
}
SELECTOR_PHASES = {**TARGET_PHASES, "activate": "activation_committing"}
MANIFEST_PATH = pathlib.Path(__file__).with_name("q12-command-manifest.json")
JOURNAL_KEYS = {
    "schema",
    "run_id",
    "seq",
    "phase",
    "outcome",
    "timestamp",
    "release_sha",
    "operator_digest",
    "command_id",
    "command_sha256",
    "lease_epoch",
    "previous_hash",
    "entry_hash",
    "rotation_required",
    "resource_manifest_sha256",
    "quiesce_manifest_sha256",
    "capability_manifest_sha256",
    "accepted_object_kind",
    "accepted_object_sha256",
}
CHECKPOINT_KEYS = {
    "schema_version",
    "run_id",
    "seq",
    "phase",
    "journal_entry_hash",
    "previous_journal_entry_hash",
    "journal_device",
    "journal_inode",
    "accepted_object_kind",
    "accepted_object_sha256",
    "resume_authority_sha256",
    "lease_epoch",
}
CAPABILITY_KEYS = {
    "schema_version",
    "run_id",
    "command_id",
    "command_sha256",
    "release_sha",
    "operator_digest",
    "resource_manifest_sha256",
    "quiesce_manifest_sha256",
    "resume_authority_sha256",
    "capability_input_checkpoint_sha256",
    "lease_epoch",
    "supersedes_capability_sha256",
}


class LifecycleError(RuntimeError):
    """Fail-closed lifecycle rejection."""


class Executor(Protocol):
    def execute(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]: ...


def canonical(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def complete_object(value: Any) -> bytes:
    return canonical(value) + b"\n"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fsync_directory(path: pathlib.Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def rename_noreplace(source: pathlib.Path, destination: pathlib.Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.renameat2(
        ctypes.c_int(-100),
        ctypes.c_char_p(os.fsencode(source)),
        ctypes.c_int(-100),
        ctypes.c_char_p(os.fsencode(destination)),
        ctypes.c_uint(1),
    )
    if result != 0:
        error = ctypes.get_errno()
        raise FileExistsError(error, os.strerror(error), str(destination))


def ensure_directory(path: pathlib.Path, mode: int = 0o700) -> None:
    path.mkdir(mode=mode, parents=True, exist_ok=True)
    path.chmod(mode)
    stat = path.lstat()
    if not path.is_dir() or stat.st_uid != 1000 or stat.st_gid != 1000:
        raise LifecycleError(f"unsafe directory identity: {path}")


def immutable_publish(
    path: pathlib.Path, data: bytes, mode: int, trace: list[str], fault: str = "none"
) -> None:
    ensure_directory(path.parent)
    temporary = pathlib.Path(f"{path}.publishing")
    if path.exists():
        stat = path.lstat()
        if stat.st_mode & 0o777 != mode or stat.st_nlink != 1 or path.read_bytes() != data:
            raise LifecycleError(f"immutable collision: {path}")
        return
    descriptor = os.open(
        temporary,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        mode,
    )
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
        stat = os.fstat(descriptor)
        if stat.st_nlink != 1 or stat.st_mode & 0o777 != mode:
            raise LifecycleError("temporary identity changed")
    finally:
        os.close(descriptor)
    trace.append("copy:temp-fsync")
    if fault == "copy-temp-fsync":
        raise LifecycleError("injected crash after copy temp fsync")
    rename_noreplace(temporary, path)
    fsync_directory(path.parent)
    trace.append("copy:rename")
    if fault == "copy-rename":
        raise LifecycleError("injected crash after copy rename")
    reopened = path.open("rb", buffering=0)
    try:
        stat = os.fstat(reopened.fileno())
        if stat.st_nlink != 1 or stat.st_mode & 0o777 != mode or reopened.read() != data:
            raise LifecycleError("published identity changed")
    finally:
        reopened.close()


def atomic_replace(path: pathlib.Path, data: bytes, mode: int) -> None:
    ensure_directory(path.parent)
    temporary = pathlib.Path(f"{path}.next")
    descriptor = os.open(
        temporary,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        mode,
    )
    try:
        os.write(descriptor, data)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    fsync_directory(path.parent)


def load_manifest() -> dict[str, Any]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if set(manifest) != {"schema_version", "commands"}:
        raise LifecycleError("command manifest shape mismatch")
    if manifest["schema_version"] != "megacampus.q12.command-manifest/v1":
        raise LifecycleError("command manifest schema mismatch")
    if tuple(manifest["commands"]) != tuple(COMMANDS.values()):
        raise LifecycleError("command manifest exact set/order mismatch")
    expected_env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C", "HOME": "/root"}
    for command_id, command in manifest["commands"].items():
        if set(command) != {"argv", "argv_sha256", "env"} or command["env"] != expected_env:
            raise LifecycleError(f"command manifest entry mismatch: {command_id}")
        if command["argv_sha256"] != sha256(canonical(command["argv"])):
            raise LifecycleError(f"command manifest argv hash mismatch: {command_id}")
    return manifest


def resolved_command(manifest: dict[str, Any], command_id: str, request: dict[str, Any]) -> dict[str, Any]:
    source = manifest["commands"][command_id]
    substitutions = {
        "<run-id>": request["run_id"],
        "<expected-post-migration-catalog-sha256>": request["expected_catalog_sha256"],
    }
    argv = []
    for value in source["argv"]:
        rendered = value
        for token, replacement in substitutions.items():
            rendered = rendered.replace(token, replacement)
        if "<" in rendered or ">" in rendered:
            raise LifecycleError("unresolved command placeholder")
        argv.append(rendered)
    return {"argv": argv, "env": source["env"], "command_sha256": sha256(canonical(argv))}


class ProductionExecutor:
    """Executes only a command already resolved from the fixed manifest."""

    def execute(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]:
        completed = subprocess.run(
            command["argv"],
            check=False,
            close_fds=True,
            env=command["env"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if completed.returncode != 0:
            raise LifecycleError(f"manifested child failed with status {completed.returncode}")
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": capability["command_id"],
            "capability_sha256": sha256(complete_object(capability)),
            "result_sha256": sha256(completed.stdout),
            "status": "accepted",
        }


@dataclass
class Engine:
    request: dict[str, Any]
    executor: Executor
    run_root: pathlib.Path = field(init=False)
    journal_path: pathlib.Path = field(init=False)
    checkpoint_path: pathlib.Path = field(init=False)
    journal: list[dict[str, Any]] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)
    retained: dict[str, str] = field(default_factory=dict)
    capabilities: dict[str, str] = field(default_factory=dict)
    results: dict[str, str] = field(default_factory=dict)
    selectors: dict[str, str] = field(default_factory=dict)
    completions: dict[str, str] = field(default_factory=dict)
    checkpoint_paths: list[str] = field(default_factory=list)
    frontier_hash: str | None = None
    lease_fd_9_validated: bool = False
    inherited_journal_identity_validated: bool = False
    journal_fd: int = field(init=False)

    def __post_init__(self) -> None:
        self.run_root = pathlib.Path(self.request["run_root"]).resolve()
        if not str(self.run_root).startswith("/tmp/") and self.request.get("production") is not True:
            raise LifecycleError("non-production run root must be below /tmp")
        ensure_directory(self.run_root)
        self.journal_path = self.run_root / "phase.jsonl"
        self.checkpoint_path = self.run_root / "phase-checkpoint.json"
        for state in ("issued", "claimed", "completed", "superseded"):
            ensure_directory(self.run_root / "capabilities" / state)
        if self.journal_path.exists():
            self.journal_fd = os.open(
                self.journal_path,
                os.O_RDWR | os.O_APPEND | os.O_DSYNC | os.O_NOFOLLOW,
            )
        else:
            self.journal_fd = os.open(
                self.journal_path,
                os.O_RDWR
                | os.O_CREAT
                | os.O_EXCL
                | os.O_APPEND
                | os.O_DSYNC
                | os.O_NOFOLLOW,
                0o600,
            )
            fsync_directory(self.run_root)

    def append(
        self,
        phase: str,
        outcome: str,
        command_id: str,
        command_sha256: str,
        epoch: str,
        capability_hash: str,
        *,
        accepted_kind: str = "none",
        accepted_hash: str | None = None,
    ) -> dict[str, Any]:
        previous = self.journal[-1]["entry_hash"] if self.journal else ZERO
        entry = {
            "schema": "megacampus.q12.cutover-journal/v1",
            "run_id": self.request["run_id"],
            "seq": len(self.journal) + 1,
            "phase": phase,
            "outcome": outcome,
            "timestamp": "2026-07-14T00:00:00.000Z",
            "release_sha": self.request["release_sha"],
            "operator_digest": self.request["operator_digest"],
            "command_id": command_id,
            "command_sha256": command_sha256,
            "lease_epoch": epoch,
            "previous_hash": previous,
            "rotation_required": bool(self.request.get("rotation_required", False)),
            "resource_manifest_sha256": self.request["resource_manifest_sha256"],
            "quiesce_manifest_sha256": self.request["quiesce_manifest_sha256"],
            "capability_manifest_sha256": capability_hash,
            "accepted_object_kind": accepted_kind,
            "accepted_object_sha256": accepted_hash,
        }
        entry["entry_hash"] = sha256(canonical(entry))
        if set(entry) != JOURNAL_KEYS:
            raise AssertionError("internal journal projection mismatch")
        data = complete_object(entry)
        offset = 0
        while offset < len(data):
            offset += os.write(self.journal_fd, data[offset:])
        os.fsync(self.journal_fd)
        fsync_directory(self.run_root)
        self.journal.append(entry)
        self.publish_checkpoint(entry)
        self.trace.append(f"journal:{outcome}")
        return entry

    def publish_checkpoint(self, entry: dict[str, Any]) -> bytes:
        stat = self.journal_path.stat()
        checkpoint = {
            "schema_version": "megacampus.q12.cutover-checkpoint/v1",
            "run_id": self.request["run_id"],
            "seq": entry["seq"],
            "phase": entry["phase"],
            "journal_entry_hash": entry["entry_hash"],
            "previous_journal_entry_hash": entry["previous_hash"],
            "journal_device": str(stat.st_dev),
            "journal_inode": str(stat.st_ino),
            "accepted_object_kind": entry["accepted_object_kind"],
            "accepted_object_sha256": entry["accepted_object_sha256"],
            "resume_authority_sha256": None,
            "lease_epoch": entry["lease_epoch"],
        }
        if set(checkpoint) != CHECKPOINT_KEYS:
            raise AssertionError("internal checkpoint projection mismatch")
        data = complete_object(checkpoint)
        atomic_replace(self.checkpoint_path, data, 0o600)
        if str(self.checkpoint_path) not in self.checkpoint_paths:
            self.checkpoint_paths.append(str(self.checkpoint_path))
        return data

    def bootstrap_selector(self, operation: str, command: dict[str, Any]) -> dict[str, Any]:
        carried = self.journal[-1]["capability_manifest_sha256"] if self.journal else ZERO
        self.append(
            PREDECESSOR_PHASES[operation],
            "accepted",
            "root.advance",
            ZERO,
            "cutover",
            carried,
        )
        if operation == "activate":
            h_bytes = self.checkpoint_path.read_bytes()
            previous = self.journal[-1]["entry_hash"]
            entry = self.append(
                SELECTOR_PHASES[operation],
                "intent",
                COMMANDS[operation],
                command["command_sha256"],
                "cutover",
                carried,
            )
            self.trace.append("activate:H-checkpoint+I-journal-head")
            if entry["previous_hash"] != previous or h_bytes == self.checkpoint_path.read_bytes():
                raise LifecycleError("activation selector CAS failed")
        else:
            entry = self.append(
                SELECTOR_PHASES[operation],
                "intent",
                COMMANDS[operation],
                command["command_sha256"],
                "cutover",
                carried,
            )
        self.selectors[operation] = entry["entry_hash"]
        return entry

    def publish_copy(self, operation: str, epoch: str, source: bytes, fault: str = "none") -> pathlib.Path:
        path = self.run_root / f"retained-barrier-capability-checkpoint-{operation}-{epoch}.json"
        immutable_publish(path, source, 0o600, self.trace, fault)
        if path.stat().st_ino == self.checkpoint_path.stat().st_ino or path.stat().st_nlink != 1:
            raise LifecycleError("retained copy identity mismatch")
        self.retained[f"{operation}:{epoch}"] = str(path)
        return path

    def publish_capability(
        self,
        operation: str,
        epoch: str,
        command: dict[str, Any],
        copy_path: pathlib.Path,
        supersedes: str | None,
    ) -> tuple[pathlib.Path, dict[str, Any], str]:
        capability = {
            "schema_version": "megacampus.q12.host-command-capability/v1",
            "run_id": self.request["run_id"],
            "command_id": COMMANDS[operation],
            "command_sha256": command["command_sha256"],
            "release_sha": self.request["release_sha"],
            "operator_digest": self.request["operator_digest"],
            "resource_manifest_sha256": self.request["resource_manifest_sha256"],
            "quiesce_manifest_sha256": self.request["quiesce_manifest_sha256"],
            "resume_authority_sha256": None,
            "capability_input_checkpoint_sha256": sha256(copy_path.read_bytes()),
            "lease_epoch": epoch,
            "supersedes_capability_sha256": supersedes,
        }
        if set(capability) != CAPABILITY_KEYS:
            raise AssertionError("internal capability projection mismatch")
        data = complete_object(capability)
        path = self.run_root / "capabilities" / "issued" / f"{COMMANDS[operation]}--{epoch}.json"
        immutable_publish(path, data, 0o400, self.trace)
        digest = sha256(data)
        self.capabilities[f"{operation}:{epoch}"] = str(path)
        return path, capability, digest

    def move_capability(self, operation: str, epoch: str, source_state: str, target_state: str) -> pathlib.Path:
        source = self.run_root / "capabilities" / source_state / f"{COMMANDS[operation]}--{epoch}.json"
        target = self.run_root / "capabilities" / target_state / source.name
        rename_noreplace(source, target)
        fsync_directory(source.parent)
        fsync_directory(target.parent)
        self.capabilities[f"{operation}:{epoch}"] = str(target)
        return target

    def retained_chain(self, operation: str, chain: dict[str, Any], command: dict[str, Any]) -> None:
        self.bootstrap_selector(operation, command)
        selector_bytes = self.checkpoint_path.read_bytes()
        stop = chain["stopAfter"]
        if operation == "install" and stop == "selector":
            return
        root_epoch = chain["rootEpoch"]
        if root_epoch == "cutover-recovery-1" and chain["cutoverCopyBeforeRecoveryRoot"] == "present":
            self.publish_copy(operation, "cutover", selector_bytes)
        copy_path = self.publish_copy(
            operation,
            root_epoch,
            selector_bytes,
            chain["faultAfter"] if chain["faultAfter"] in ("copy-temp-fsync", "copy-rename") else "none",
        )
        if operation == "install" and stop == "copy":
            return
        path, capability, digest = self.publish_capability(operation, root_epoch, command, copy_path, None)
        if operation == "install" and stop == "published":
            return
        total_predecessors = int(chain["recoveryReissues"]) + int(chain["publicationWindowOrphans"])
        epochs = [root_epoch]
        digests = [digest]
        capability_objects = [capability]
        if total_predecessors == 0:
            outcome = "capability_issued" if root_epoch == "cutover" else "recovery_reacquired"
            self.append(TARGET_PHASES[operation], outcome, COMMANDS[operation], command["command_sha256"], root_epoch, digest)
        else:
            if root_epoch == "cutover":
                self.append(TARGET_PHASES[operation], "capability_issued", COMMANDS[operation], command["command_sha256"], root_epoch, digest)
            for index in range(1, total_predecessors + 1):
                epoch = f"cutover-recovery-{index}"
                recovery_copy = self.publish_copy(operation, epoch, self.checkpoint_path.read_bytes())
                path, next_capability, next_digest = self.publish_capability(
                    operation, epoch, command, recovery_copy, digests[-1]
                )
                epochs.append(epoch)
                digests.append(next_digest)
                capability_objects.append(next_capability)
                if chain["faultAfter"] == "successor-publication":
                    raise LifecycleError("injected crash after successor publication")
            for index, epoch in enumerate(epochs[:-1], 1):
                current = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
                state = current.parent.name
                if state in ("issued", "claimed"):
                    self.move_capability(operation, epoch, state, "superseded")
                self.trace.append("retire:predecessor")
                if chain["faultAfter"] == f"predecessor-retirement-{index}":
                    raise LifecycleError(f"injected crash after predecessor retirement {index}")
            root_epoch = epochs[-1]
            capability = capability_objects[-1]
            digest = digests[-1]
            self.append(TARGET_PHASES[operation], "recovery_reacquired", COMMANDS[operation], command["command_sha256"], root_epoch, digest)
        if operation == "install" and stop == "issued":
            return
        claim_request = {
            "engine": self,
            "operation": operation,
            "epoch": root_epoch,
            "command": command,
            "capability": capability,
            "capability_hash": digest,
            "execute": not (
                operation == "install"
                and chain["installTransaction"] in ("committed-no-baseline-receipt", "ambiguous")
            ),
            "move_only": operation == "install" and stop == "claim-moved",
        }
        result = run_claim(claim_request, self.executor)
        if operation == "install" and stop in ("claim-moved", "claimed"):
            if chain["installTransaction"] == "ambiguous":
                raise LifecycleError("ambiguous install commit incident")
            if chain["installTransaction"] == "committed-no-baseline-receipt":
                result = self.synthetic_result(operation, digest)
                self.write_install_baseline(digest)
                self.finish(operation, root_epoch, command, digest, result, chain["completionMode"])
            return
        if result is None:
            return
        if operation == "install":
            self.write_install_baseline(digest)
        self.finish(operation, root_epoch, command, digest, result, chain["completionMode"])

    def synthetic_result(self, operation: str, capability_hash: str) -> dict[str, Any]:
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": COMMANDS[operation],
            "capability_sha256": capability_hash,
            "result_sha256": sha256(f"accepted:{operation}".encode()),
            "status": "accepted",
        }

    def write_install_baseline(self, capability_hash: str) -> None:
        claim = next(
            entry
            for entry in reversed(self.journal)
            if entry["outcome"] == "capability_claimed"
            and entry["capability_manifest_sha256"] == capability_hash
        )
        checkpoint = self.publish_checkpoint(claim)
        baseline = {
            "schema_version": "megacampus.q12.database-barrier-baseline/v1",
            "run_id": self.request["run_id"],
            "predecessor_journal_entry_hash": claim["entry_hash"],
            "predecessor_checkpoint_sha256": sha256(checkpoint),
            "capability_manifest_sha256": capability_hash,
        }
        immutable_publish(
            self.run_root / "database-barrier-baseline.json",
            complete_object(baseline),
            0o600,
            self.trace,
        )

    def finish(
        self,
        operation: str,
        epoch: str,
        command: dict[str, Any],
        capability_hash: str,
        result: dict[str, Any],
        completion_mode: str,
    ) -> None:
        result_path = self.run_root / f"retained-barrier-result-{operation}-{epoch}.json"
        immutable_publish(result_path, complete_object(result), 0o600, self.trace)
        self.results[f"{operation}:{epoch}"] = str(result_path)
        current = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
        if current.parent.name == "claimed":
            self.move_capability(operation, epoch, "claimed", "completed")
        completion_epoch = epoch
        if completion_mode == "move-no-row-reacquired":
            if epoch == "cutover":
                completion_epoch = "cutover-recovery-1"
            else:
                completion_epoch = f"cutover-recovery-{int(epoch.rsplit('-', 1)[1]) + 1}"
        completed = self.append(
            TARGET_PHASES[operation],
            "completed",
            COMMANDS[operation],
            command["command_sha256"],
            completion_epoch,
            capability_hash,
        )
        self.completions[operation] = completed["entry_hash"]

    def frontier(self, frontier: dict[str, Any], manifest: dict[str, Any]) -> None:
        operation = frontier["operation"]
        command = resolved_command(manifest, COMMANDS[operation], self.request)
        self.bootstrap_selector(operation, command)
        selector_bytes = self.checkpoint_path.read_bytes()
        carried = self.journal[-1]["capability_manifest_sha256"]
        form = frontier["form"]
        copies = {
            "empty": (),
            "cutover": ("cutover",),
            "recovery-1": ("cutover-recovery-1",),
            "cutover+recovery-1": ("cutover", "cutover-recovery-1"),
        }[frontier["copySet"]]
        for epoch in copies:
            self.publish_copy(operation, epoch, selector_bytes)
        if form != "copy-prefix" and form != "selector-only" and not copies:
            self.publish_copy(operation, "cutover", selector_bytes)
        tip_digest = None
        tip_epoch = "cutover"
        if form in ("journal-less-published", "issued", "claim-moved", "claimed-no-success"):
            supersedes = None
            if frontier["history"] == "multi-epoch":
                if f"{operation}:cutover" not in self.retained:
                    self.publish_copy(operation, "cutover", selector_bytes)
                _, _, root_digest = self.publish_capability(
                    operation,
                    "cutover",
                    command,
                    pathlib.Path(self.retained[f"{operation}:cutover"]),
                    None,
                )
                self.append(
                    TARGET_PHASES[operation],
                    "capability_issued",
                    COMMANDS[operation],
                    command["command_sha256"],
                    "cutover",
                    root_digest,
                )
                carried = root_digest
                tip_epoch = "cutover-recovery-1"
                recovery_copy = self.publish_copy(operation, tip_epoch, self.checkpoint_path.read_bytes())
                supersedes = root_digest
                _, capability, tip_digest = self.publish_capability(
                    operation, tip_epoch, command, recovery_copy, supersedes
                )
                self.move_capability(operation, "cutover", "issued", "superseded")
                self.trace.append("retire:predecessor")
            else:
                _, capability, tip_digest = self.publish_capability(
                    operation,
                    tip_epoch,
                    command,
                    pathlib.Path(self.retained[f"{operation}:{tip_epoch}"]),
                    supersedes,
                )
            if form != "journal-less-published":
                issuance = "recovery_reacquired" if tip_epoch != "cutover" else "capability_issued"
                self.append(
                    TARGET_PHASES[operation],
                    issuance,
                    COMMANDS[operation],
                    command["command_sha256"],
                    tip_epoch,
                    tip_digest,
                )
                carried = self.journal[-1]["capability_manifest_sha256"]
            if form in ("claim-moved", "claimed-no-success"):
                self.move_capability(operation, tip_epoch, "issued", "claimed")
            if form == "claimed-no-success":
                self.append(TARGET_PHASES[operation], "capability_claimed", COMMANDS[operation], command["command_sha256"], tip_epoch, tip_digest)
                carried = self.journal[-1]["capability_manifest_sha256"]
        if frontier["activationCommitRace"] == "committed-before-r":
            raise LifecycleError("activation classification incident")
        if frontier["exactSuccessBeforeDisposition"]:
            if tip_digest is None:
                copy = self.publish_copy(operation, "cutover", selector_bytes)
                _, capability, tip_digest = self.publish_capability(operation, "cutover", command, copy, None)
                self.append(TARGET_PHASES[operation], "capability_issued", COMMANDS[operation], command["command_sha256"], "cutover", tip_digest)
                self.move_capability(operation, "cutover", "issued", "claimed")
                self.append(TARGET_PHASES[operation], "capability_claimed", COMMANDS[operation], command["command_sha256"], "cutover", tip_digest)
            result = self.synthetic_result(operation, tip_digest)
            self.finish(operation, tip_epoch, command, tip_digest, result, "move-no-row-reacquired")
            return
        f_capability = carried
        decision_epoch = "cutover" if frontier["lease"] == "continuous" else "cutover-recovery-1"
        r_capability = tip_digest if tip_digest is not None else f_capability
        disposition = self.append(
            "rollback_preparing",
            "retained_attempt_abandoning",
            COMMANDS[operation],
            command["command_sha256"],
            decision_epoch,
            r_capability,
        )
        self.frontier_hash = disposition["entry_hash"]
        if frontier["activationCommitRace"] == "committed-after-r":
            raise LifecycleError("activation-after-R incident")
        if tip_digest is not None:
            current = pathlib.Path(self.capabilities[f"{operation}:{tip_epoch}"])
            if current.parent.name in ("issued", "claimed"):
                self.move_capability(operation, tip_epoch, current.parent.name, "superseded")
                self.trace.append("retire:predecessor")
        intent = self.append(
            "rollback_preparing",
            "intent",
            "writers.resume.rollback",
            ZERO,
            decision_epoch,
            f_capability,
        )
        final_manifest = {
            "schema_version": "megacampus.q12.final-writer-manifest/v1",
            "run_id": self.request["run_id"],
            "publication_intent_journal_entry_hash": intent["entry_hash"],
            "input_checkpoint_sha256": sha256(self.checkpoint_path.read_bytes()),
            "mode": "rollback",
        }
        manifest_path = self.run_root / f"final-writer-manifest-{self.request['run_id']}.json"
        immutable_publish(manifest_path, complete_object(final_manifest), 0o600, self.trace)
        manifest_hash = sha256(manifest_path.read_bytes())
        self.append(
            "rollback_preparing",
            "accepted",
            "writers.resume.rollback",
            ZERO,
            decision_epoch,
            f_capability,
            accepted_kind="final_writer_manifest",
            accepted_hash=manifest_hash,
        )

    def output(self) -> dict[str, Any]:
        return {
            "journalEntries": self.journal,
            "fixedCheckpointPath": str(self.checkpoint_path),
            "retainedCopyPaths": list(self.retained.items()),
            "capabilityPaths": list(self.capabilities.items()),
            "resultPaths": list(self.results.items()),
            "selectorEntryHashes": list(self.selectors.items()),
            "completionEntryHashes": list(self.completions.items()),
            "frontierDispositionEntryHash": self.frontier_hash,
            "checkpointPaths": self.checkpoint_paths,
            "leaseFd9Validated": self.lease_fd_9_validated,
            "inheritedJournalIdentityValidated": self.inherited_journal_identity_validated,
        }


def run_claim(request: dict[str, Any], executor: Executor) -> dict[str, Any] | None:
    engine = request.get("engine")
    if not isinstance(engine, Engine):
        raise LifecycleError("claim requires Root-owned open lifecycle context")
    if engine.request.get("lease_fd") != 9:
        raise LifecycleError("claim requires inherited lease FD 9")
    lease_stat = os.fstat(9)
    expected_lock = engine.request.get("lock_identity")
    if expected_lock != [lease_stat.st_dev, lease_stat.st_ino] or lease_stat.st_nlink != 1:
        raise LifecycleError("inherited lease FD 9 identity mismatch")
    engine.lease_fd_9_validated = True
    journal_stat = os.fstat(engine.journal_fd)
    checkpoint = json.loads(engine.checkpoint_path.read_text(encoding="utf-8"))
    if (
        checkpoint["journal_device"] != str(journal_stat.st_dev)
        or checkpoint["journal_inode"] != str(journal_stat.st_ino)
    ):
        raise LifecycleError("inherited open journal identity mismatch")
    engine.inherited_journal_identity_validated = True
    operation = request["operation"]
    epoch = request["epoch"]
    current = pathlib.Path(engine.capabilities[f"{operation}:{epoch}"])
    if current.parent.name != "issued":
        raise LifecycleError("capability is not issued")
    capability = json.loads(current.read_text(encoding="utf-8"))
    if capability != request["capability"] or sha256(current.read_bytes()) != request["capability_hash"]:
        raise LifecycleError("capability bytes changed")
    copy = pathlib.Path(engine.retained[f"{operation}:{epoch}"])
    if sha256(copy.read_bytes()) != capability["capability_input_checkpoint_sha256"]:
        raise LifecycleError("launcher checkpoint binding mismatch")
    engine.move_capability(operation, epoch, "issued", "claimed")
    if request["move_only"]:
        return None
    engine.append(
        TARGET_PHASES[operation],
        "capability_claimed",
        COMMANDS[operation],
        request["command"]["command_sha256"],
        epoch,
        request["capability_hash"],
    )
    if not request["execute"]:
        return None
    return executor.execute(request["command"], capability)


def validate_request(request: dict[str, Any]) -> None:
    required = {
        "run_root",
        "mode",
        "completed",
        "chains",
        "run_id",
        "release_sha",
        "operator_digest",
        "resource_manifest_sha256",
        "quiesce_manifest_sha256",
        "expected_catalog_sha256",
    }
    if not required.issubset(request):
        raise LifecycleError(f"request missing fields: {sorted(required - set(request))}")
    uuid.UUID(request["run_id"])
    for name in ("operator_digest", "resource_manifest_sha256", "quiesce_manifest_sha256", "expected_catalog_sha256"):
        if not re.fullmatch(r"[0-9a-f]{64}", request[name]):
            raise LifecycleError(f"invalid request hash: {name}")
    if not re.fullmatch(r"[0-9a-f]{40}", request["release_sha"]):
        raise LifecycleError("invalid release SHA")


def run_supervisor(request: dict[str, Any], executor: Executor) -> dict[str, Any]:
    validate_request(request)
    manifest = load_manifest()
    engine = Engine(request, executor)
    for operation, chain in request["chains"].items():
        if operation not in OPERATIONS or chain.get("operation") != operation:
            raise LifecycleError("chain operation mismatch")
        command = resolved_command(manifest, COMMANDS[operation], request)
        engine.retained_chain(operation, chain, command)
    frontier = request.get("abandonedFrontier")
    if frontier is not None:
        if frontier["operation"] == "install":
            raise LifecycleError("install cannot be an abandoned frontier")
        engine.frontier(frontier, manifest)
    atomic_replace(engine.run_root / "trace.json", complete_object(engine.trace), 0o600)
    return engine.output()


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Q12 retained barrier lifecycle")
    commands = root.add_subparsers(dest="mode", required=True)
    supervisor = commands.add_parser("supervisor")
    supervisor.add_argument("operation", choices=OPERATIONS)
    supervisor.add_argument("--run-id", required=True)
    supervisor.add_argument("--release-sha", required=True)
    supervisor.add_argument("--operator-digest", required=True)
    supervisor.add_argument("--resource-manifest-sha256", required=True)
    supervisor.add_argument("--quiesce-manifest-sha256", required=True)
    supervisor.add_argument("--expected-catalog-sha256", required=True)
    claim = commands.add_parser("claim")
    claim.add_argument("action", choices=("run",))
    claim.add_argument("--run-id", required=True)
    claim.add_argument("--command-id", required=True, choices=tuple(COMMANDS.values()))
    claim.add_argument("--lease-fd", required=True, type=int, choices=(9,))
    claim.add_argument("--checkpoint", required=True)
    claim.add_argument("--capability", required=True, type=pathlib.Path)
    return root


def main() -> int:
    arguments = parser().parse_args()
    if arguments.mode == "supervisor":
        operation = arguments.operation
        run_root = pathlib.Path(f"/opt/megacampus/backups/q12/{arguments.run_id}")
        ensure_directory(run_root)
        lock_path = run_root.parent / "cutover.lock"
        lease_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        if lease_fd != 9:
            os.dup2(lease_fd, 9)
            os.close(lease_fd)
            lease_fd = 9
        fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_stat = os.fstat(lease_fd)
        request = {
            "run_root": str(run_root),
            "mode": "forward",
            "completed": [],
            "chains": {
                operation: {
                    "operation": operation,
                    "rootEpoch": "cutover",
                    "cutoverCopyBeforeRecoveryRoot": "absent",
                    "recoveryReissues": 0,
                    "publicationWindowOrphans": 0,
                    "completionMode": "normal",
                    "faultAfter": "none",
                    "stopAfter": "completed",
                    "installTransaction": "normal"
                    if operation == "install"
                    else "not-applicable",
                }
            },
            "run_id": arguments.run_id,
            "release_sha": arguments.release_sha,
            "operator_digest": arguments.operator_digest,
            "resource_manifest_sha256": arguments.resource_manifest_sha256,
            "quiesce_manifest_sha256": arguments.quiesce_manifest_sha256,
            "expected_catalog_sha256": arguments.expected_catalog_sha256,
            "lease_fd": 9,
            "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
            "production": True,
        }
        output = run_supervisor(request, ProductionExecutor())
        sys.stdout.buffer.write(complete_object(output))
        return 0
    raise LifecycleError("standalone claim requires the inherited Root journal descriptor")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (LifecycleError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"q12 lifecycle rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
