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
import stat as stat_module
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
RESULT_KEYS = {
    "schema_version",
    "command_id",
    "capability_sha256",
    "result_sha256",
    "status",
}


class LifecycleError(RuntimeError):
    """Fail-closed lifecycle rejection."""


class Executor(Protocol):
    def execute(self, command: dict[str, Any], capability: dict[str, Any]) -> dict[str, Any]: ...

    def launch_claim(self, argv: list[str], journal_fd: int) -> dict[str, Any]: ...


def canonical(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def complete_object(value: Any) -> bytes:
    return canonical(value) + b"\n"


def validate_journal_entry_grammar(entry: dict[str, Any]) -> None:
    hash_fields = (
        "operator_digest",
        "command_sha256",
        "previous_hash",
        "entry_hash",
        "resource_manifest_sha256",
        "quiesce_manifest_sha256",
        "capability_manifest_sha256",
    )
    if (
        not isinstance(entry.get("seq"), int)
        or isinstance(entry.get("seq"), bool)
        or entry["seq"] < 1
        or not isinstance(entry.get("rotation_required"), bool)
        or not isinstance(entry.get("timestamp"), str)
        or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z", entry["timestamp"])
        or not isinstance(entry.get("release_sha"), str)
        or not re.fullmatch(r"[0-9a-f]{40}", entry["release_sha"])
        or any(
            not isinstance(entry.get(name), str)
            or not re.fullmatch(r"[0-9a-f]{64}", entry[name])
            for name in hash_fields
        )
        or not isinstance(entry.get("lease_epoch"), str)
        or not EPOCH_RE.fullmatch(entry["lease_epoch"])
    ):
        raise LifecycleError("journal field type/hash/epoch grammar mismatch")
    try:
        uuid.UUID(entry["run_id"])
    except (TypeError, ValueError, AttributeError) as error:
        raise LifecycleError("journal run id grammar mismatch") from error
    accepted_kind = entry.get("accepted_object_kind")
    accepted_hash = entry.get("accepted_object_sha256")
    if not (
        (accepted_kind == "none" and accepted_hash is None)
        or (
            accepted_kind == "final_writer_manifest"
            and isinstance(accepted_hash, str)
            and re.fullmatch(r"[0-9a-f]{64}", accepted_hash)
        )
    ):
        raise LifecycleError("journal accepted-object pairing mismatch")

    command_id = entry.get("command_id")
    outcome = entry.get("outcome")
    phase = entry.get("phase")
    if command_id == "root.advance":
        valid = (
            outcome == "accepted"
            and phase in set(PREDECESSOR_PHASES.values())
            and entry["command_sha256"] == ZERO
            and accepted_kind == "none"
        )
    elif command_id == "writers.resume.rollback":
        valid = (
            phase == "rollback_preparing"
            and entry["command_sha256"] == ZERO
            and (
                (outcome == "intent" and accepted_kind == "none")
                or (outcome == "accepted" and accepted_kind == "final_writer_manifest")
            )
        )
    else:
        operation = next(
            (name for name in OPERATIONS if COMMANDS[name] == command_id), None
        )
        valid = operation is not None and accepted_kind == "none"
        if valid and outcome == "intent":
            valid = phase == SELECTOR_PHASES[operation]
        elif valid and outcome in (
            "capability_issued",
            "recovery_reacquired",
            "capability_claimed",
            "completed",
        ):
            valid = phase == TARGET_PHASES[operation]
        elif valid and outcome == "retained_attempt_abandoning":
            valid = phase == "rollback_preparing" and operation != "install"
        else:
            valid = False
    if not valid:
        raise LifecycleError("journal outcome/phase/command grammar mismatch")


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
    require_lexical_absolute(path)
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for index, component in enumerate(path.parts[1:]):
            final = index == len(path.parts[1:]) - 1
            try:
                next_descriptor = os.open(
                    component,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=descriptor,
                )
            except FileNotFoundError:
                os.mkdir(component, mode if final else 0o700, dir_fd=descriptor)
                os.fsync(descriptor)
                next_descriptor = os.open(
                    component,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=descriptor,
                )
            os.close(descriptor)
            descriptor = next_descriptor
        stat = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    if (
        not stat_module.S_ISDIR(stat.st_mode)
        or stat.st_uid != 1000
        or stat.st_gid != 1000
        or stat.st_mode & 0o777 != mode
        or stat.st_nlink < 2
    ):
        raise LifecycleError(f"unsafe directory identity: {path}")


def require_lexical_absolute(path: pathlib.Path) -> None:
    raw = os.fspath(path)
    if (
        not path.is_absolute()
        or raw != os.path.normpath(raw)
        or any(part in ("", ".", "..") for part in path.parts[1:])
    ):
        raise LifecycleError(f"path is not lexical absolute canonical: {raw}")


def open_parent_directory(path: pathlib.Path) -> int:
    """Open every ancestor without following a symlink and return the parent dirfd."""
    require_lexical_absolute(path)
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in path.parts[1:-1]:
            next_descriptor = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=descriptor,
            )
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def validate_regular_file(
    path: pathlib.Path,
    *,
    mode: int,
    expected: bytes | None = None,
    descriptor: int | None = None,
) -> bytes:
    """Validate one producer-owned immutable regular file without following links."""
    opened_here = descriptor is None
    parent_descriptor = open_parent_directory(path)
    try:
        if descriptor is None:
            descriptor = os.open(
                path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_descriptor
            )
        stat = os.fstat(descriptor)
        if (
            not stat_module.S_ISREG(stat.st_mode)
            or stat.st_uid != 1000
            or stat.st_gid != 1000
            or stat.st_mode & 0o777 != mode
            or stat.st_nlink != 1
        ):
            raise LifecycleError(f"unsafe file identity: {path}")
        os.lseek(descriptor, 0, os.SEEK_SET)
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        data = b"".join(chunks)
        if expected is not None and data != expected:
            raise LifecycleError(f"immutable bytes changed: {path}")
        path_stat = os.stat(
            path.name, dir_fd=parent_descriptor, follow_symlinks=False
        )
        if (
            path_stat.st_dev != stat.st_dev
            or path_stat.st_ino != stat.st_ino
            or not stat_module.S_ISREG(path_stat.st_mode)
        ):
            raise LifecycleError(f"file path identity changed: {path}")
        return data
    finally:
        if opened_here and descriptor is not None:
            os.close(descriptor)
        os.close(parent_descriptor)


def immutable_publish(
    path: pathlib.Path,
    data: bytes,
    mode: int,
    trace: list[str],
    fault: str = "none",
    *,
    allow_temporary_completion: bool = False,
) -> None:
    ensure_directory(path.parent)
    temporary = pathlib.Path(f"{path}.publishing")
    if os.path.lexists(path):
        validate_regular_file(path, mode=mode, expected=data)
        if os.path.lexists(temporary):
            validate_regular_file(temporary, mode=mode, expected=data)
            if not allow_temporary_completion:
                raise LifecycleError(
                    f"publishing residue retained after lease loss: {temporary}"
                )
            temporary.unlink()
            fsync_directory(path.parent)
        return
    if os.path.lexists(temporary):
        validate_regular_file(temporary, mode=mode, expected=data)
        if not allow_temporary_completion:
            raise LifecycleError(f"publishing residue retained after lease loss: {temporary}")
        rename_noreplace(temporary, path)
        fsync_directory(path.parent)
        trace.append("copy:rename")
        validate_regular_file(path, mode=mode, expected=data)
        if fault == "copy-rename":
            raise LifecycleError("injected crash after copy rename")
        return
    descriptor = os.open(
        temporary,
        os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        mode,
    )
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
        validate_regular_file(temporary, mode=mode, expected=data, descriptor=descriptor)
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
    validate_regular_file(path, mode=mode, expected=data)


def atomic_replace(path: pathlib.Path, data: bytes, mode: int) -> None:
    ensure_directory(path.parent)
    temporary = pathlib.Path(f"{path}.next")
    if os.path.lexists(temporary):
        validate_regular_file(temporary, mode=mode, expected=data)
    else:
        descriptor = os.open(
            temporary,
            os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            mode,
        )
        try:
            offset = 0
            while offset < len(data):
                offset += os.write(descriptor, data[offset:])
            os.fsync(descriptor)
            validate_regular_file(temporary, mode=mode, expected=data, descriptor=descriptor)
        finally:
            os.close(descriptor)
    os.replace(temporary, path)
    fsync_directory(path.parent)
    validate_regular_file(path, mode=mode, expected=data)


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

    def launch_claim(self, argv: list[str], journal_fd: int) -> dict[str, Any]:
        try:
            saved_fd_8 = os.dup(8)
        except OSError:
            saved_fd_8 = None
        try:
            os.dup2(journal_fd, 8, inheritable=True)
            completed = subprocess.run(
                [str(pathlib.Path(__file__).with_name("q12-capability-run.sh")), *argv],
                check=False,
                close_fds=True,
                pass_fds=(8, 9),
                env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C"},
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
        if completed.returncode != 0:
            raise LifecycleError(
                f"delegated launcher failed with status {completed.returncode}: "
                f"{completed.stderr.strip()}"
            )
        return json.loads(completed.stdout)


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
        self.run_root = pathlib.Path(self.request["run_root"])
        require_lexical_absolute(self.run_root)
        production_root = pathlib.Path("/opt/megacampus/backups/q12") / self.request["run_id"]
        if self.request.get("production") is True:
            if self.run_root != production_root:
                raise LifecycleError("production run root mismatch")
        elif not re.fullmatch(r"/tmp/mc2-q12-d5-root-[^/]+", str(self.run_root)):
            raise LifecycleError("fixture run root shape mismatch")
        ensure_directory(self.run_root)
        self.journal_path = self.run_root / "phase.jsonl"
        self.checkpoint_path = self.run_root / "phase-checkpoint.json"
        for state in ("issued", "claimed", "completed", "superseded"):
            ensure_directory(self.run_root / "capabilities" / state)
        inherited = self.request.get("inherited_journal_fd")
        if inherited is not None:
            inherited_stat = os.fstat(inherited)
            path_stat = self.journal_path.lstat()
            if (
                inherited_stat.st_dev != path_stat.st_dev
                or inherited_stat.st_ino != path_stat.st_ino
                or not stat_module.S_ISREG(inherited_stat.st_mode)
            ):
                raise LifecycleError("inherited open journal identity mismatch")
            self.journal_fd = os.dup(inherited)
        elif self.journal_path.exists():
            validate_regular_file(self.journal_path, mode=0o600)
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
        self.reload_durable()

    def checkpoint_bytes(self, entry: dict[str, Any]) -> bytes:
        stat = os.fstat(self.journal_fd)
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
        return complete_object(checkpoint)

    @staticmethod
    def path_identity(path: pathlib.Path) -> tuple[int, int, int]:
        stat = path.lstat()
        return (stat.st_dev, stat.st_ino, stat.st_size)

    def repair_checkpoint(
        self,
        expected: bytes,
        predecessor: bytes | None,
        journal_bytes: bytes,
        *,
        publication_entry: dict[str, Any] | None = None,
    ) -> None:
        """Repair only an unchanged immediate predecessor under journal/path CAS."""
        next_path = pathlib.Path(f"{self.checkpoint_path}.next")
        journal_identity = self.path_identity(self.journal_path)
        current_existed = os.path.lexists(self.checkpoint_path)
        current_identity = (
            self.path_identity(self.checkpoint_path) if current_existed else None
        )
        current_bytes = (
            validate_regular_file(self.checkpoint_path, mode=0o600)
            if current_existed
            else None
        )
        if current_bytes is not None and current_bytes != predecessor:
            raise LifecycleError("fixed checkpoint is not the immediate predecessor")

        if os.path.lexists(next_path):
            next_bytes = validate_regular_file(next_path, mode=0o600)
            next_identity = self.path_identity(next_path)
            if next_bytes != expected:
                raise LifecycleError("foreign checkpoint .next retained")
        else:
            descriptor = os.open(
                next_path,
                os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            try:
                offset = 0
                while offset < len(expected):
                    offset += os.write(descriptor, expected[offset:])
                os.fsync(descriptor)
                validate_regular_file(
                    next_path, mode=0o600, expected=expected, descriptor=descriptor
                )
            finally:
                os.close(descriptor)
            fsync_directory(self.run_root)
            next_identity = self.path_identity(next_path)

        hook_name = (
            "before_checkpoint_publication_cas"
            if publication_entry is not None
            else "before_checkpoint_repair"
        )
        hook = getattr(self.executor, hook_name, None)
        if hook is not None:
            if publication_entry is None:
                hook(self.checkpoint_path, next_path)
            else:
                hook(publication_entry, self.checkpoint_path, next_path)

        if (
            self.path_identity(self.journal_path) != journal_identity
            or validate_regular_file(self.journal_path, mode=0o600) != journal_bytes
        ):
            raise LifecycleError("journal authority changed during checkpoint repair")
        if (
            not os.path.lexists(next_path)
            or self.path_identity(next_path) != next_identity
            or validate_regular_file(next_path, mode=0o600) != expected
        ):
            raise LifecycleError("checkpoint .next identity changed during repair")
        if current_existed:
            if (
                not os.path.lexists(self.checkpoint_path)
                or self.path_identity(self.checkpoint_path) != current_identity
                or validate_regular_file(self.checkpoint_path, mode=0o600)
                != current_bytes
            ):
                raise LifecycleError("checkpoint path identity changed during repair")
        elif os.path.lexists(self.checkpoint_path):
            raise LifecycleError("checkpoint path appeared during repair")

        os.replace(next_path, self.checkpoint_path)
        fsync_directory(self.run_root)
        validate_regular_file(self.checkpoint_path, mode=0o600, expected=expected)
        if publication_entry is None:
            setattr(self.executor, "checkpoint_repair_performed", True)

    def reload_durable(self) -> None:
        """Rebuild in-memory indexes only from validated durable bytes."""
        journal_bytes = validate_regular_file(self.journal_path, mode=0o600)
        for temporary in sorted(self.run_root.glob("*.publishing")):
            final = pathlib.Path(str(temporary).removesuffix(".publishing"))
            if os.path.lexists(final):
                final_bytes = validate_regular_file(final, mode=0o600)
                validate_regular_file(temporary, mode=0o600, expected=final_bytes)
                raise LifecycleError(
                    f"matching final and publishing residue retained after lease loss: {temporary}"
                )
        if journal_bytes and not journal_bytes.endswith(b"\n"):
            raise LifecycleError("torn journal tail")
        entries: list[dict[str, Any]] = []
        previous = ZERO
        for index, line in enumerate(journal_bytes.splitlines(), 1):
            entry = json.loads(line)
            if set(entry) != JOURNAL_KEYS or entry.get("schema") != "megacampus.q12.cutover-journal/v1":
                raise LifecycleError("journal row shape mismatch")
            validate_journal_entry_grammar(entry)
            if entry.get("seq") != index or entry.get("previous_hash") != previous:
                raise LifecycleError("journal ancestry mismatch")
            preimage = dict(entry)
            digest = preimage.pop("entry_hash")
            if digest != sha256(canonical(preimage)):
                raise LifecycleError("journal entry hash mismatch")
            if entry.get("run_id") != self.request["run_id"]:
                raise LifecycleError("journal run binding mismatch")
            for key in (
                "release_sha",
                "operator_digest",
                "resource_manifest_sha256",
                "quiesce_manifest_sha256",
            ):
                if key in self.request and entry.get(key) != self.request[key]:
                    raise LifecycleError(f"journal stable binding mismatch: {key}")
            previous = digest
            entries.append(entry)
        self.journal = entries
        entries_by_hash = {entry["entry_hash"]: entry for entry in entries}

        if entries:
            expected = self.checkpoint_bytes(entries[-1])
            next_path = pathlib.Path(f"{self.checkpoint_path}.next")
            if os.path.lexists(self.checkpoint_path):
                current_checkpoint = validate_regular_file(
                    self.checkpoint_path, mode=0o600
                )
            else:
                current_checkpoint = None
            if current_checkpoint != expected or os.path.lexists(next_path):
                predecessor = (
                    self.checkpoint_bytes(entries[-2]) if len(entries) > 1 else None
                )
                self.repair_checkpoint(expected, predecessor, journal_bytes)
            self.checkpoint_paths = [str(self.checkpoint_path)]
        elif os.path.lexists(self.checkpoint_path) or os.path.lexists(
            pathlib.Path(f"{self.checkpoint_path}.next")
        ):
            raise LifecycleError("checkpoint exists without journal authority")

        self.retained = {}
        retained_digests: dict[str, str] = {}
        for path in sorted(self.run_root.glob("retained-barrier-capability-checkpoint-*.json")):
            retained_bytes = validate_regular_file(path, mode=0o600)
            retained_checkpoint = json.loads(retained_bytes)
            if (
                set(retained_checkpoint) != CHECKPOINT_KEYS
                or retained_checkpoint["run_id"] != self.request["run_id"]
                or retained_checkpoint["journal_device"]
                != str(os.fstat(self.journal_fd).st_dev)
                or retained_checkpoint["journal_inode"]
                != str(os.fstat(self.journal_fd).st_ino)
            ):
                raise LifecycleError("retained checkpoint shape/binding mismatch")
            retained_source = entries_by_hash.get(retained_checkpoint["journal_entry_hash"])
            if retained_source is None or retained_bytes != self.checkpoint_bytes(
                retained_source
            ):
                raise LifecycleError("retained checkpoint is not an exact journal projection")
            if os.path.lexists(self.checkpoint_path):
                fixed_stat = self.checkpoint_path.lstat()
                retained_stat = path.lstat()
                if (
                    fixed_stat.st_dev == retained_stat.st_dev
                    and fixed_stat.st_ino == retained_stat.st_ino
                ):
                    raise LifecycleError("retained checkpoint aliases fixed checkpoint")
            suffix = path.name.removeprefix("retained-barrier-capability-checkpoint-").removesuffix(
                ".json"
            )
            operation = next(
                (item for item in OPERATIONS if suffix.startswith(f"{item}-")), None
            )
            if operation is None:
                raise LifecycleError("unknown retained copy path")
            epoch = suffix[len(operation) + 1 :]
            if not EPOCH_RE.fullmatch(epoch):
                raise LifecycleError("invalid retained copy epoch")
            key = f"{operation}:{epoch}"
            self.retained[key] = str(path)
            retained_digests[key] = sha256(retained_bytes)

        self.capabilities = {}
        seen_capabilities: set[str] = set()
        capability_digests: dict[str, str] = {}
        capability_states: dict[str, str] = {}
        for state in ("issued", "claimed", "completed", "superseded"):
            directory = self.run_root / "capabilities" / state
            for path in sorted(directory.glob("*.json")):
                data = validate_regular_file(path, mode=0o400)
                capability = json.loads(data)
                if set(capability) != CAPABILITY_KEYS or capability["run_id"] != self.request["run_id"]:
                    raise LifecycleError("capability shape/binding mismatch")
                operation = next(
                    (item for item in OPERATIONS if COMMANDS[item] == capability["command_id"]),
                    None,
                )
                if operation is None:
                    raise LifecycleError("unknown capability command")
                epoch = capability["lease_epoch"]
                if not EPOCH_RE.fullmatch(epoch):
                    raise LifecycleError("invalid capability epoch")
                stable = {
                    "run_id": self.request["run_id"],
                    "release_sha": self.request["release_sha"],
                    "operator_digest": self.request["operator_digest"],
                    "resource_manifest_sha256": self.request[
                        "resource_manifest_sha256"
                    ],
                    "quiesce_manifest_sha256": self.request[
                        "quiesce_manifest_sha256"
                    ],
                    "resume_authority_sha256": None,
                }
                if any(capability[name] != value for name, value in stable.items()):
                    raise LifecycleError("capability stable binding mismatch")
                key = f"{operation}:{epoch}"
                if key in seen_capabilities:
                    raise LifecycleError("capability present in multiple states")
                expected_name = f"{capability['command_id']}--{epoch}.json"
                if path.name != expected_name:
                    raise LifecycleError("capability filename mismatch")
                if (
                    key not in retained_digests
                    or capability["capability_input_checkpoint_sha256"]
                    != retained_digests[key]
                ):
                    raise LifecycleError("capability retained-copy hash binding mismatch")
                seen_capabilities.add(key)
                self.capabilities[key] = str(path)
                capability_digest = sha256(data)
                capability_digests[key] = capability_digest
                capability_states[key] = state
                references = [
                    entry
                    for entry in entries
                    if entry["capability_manifest_sha256"] == capability_digest
                ]
                matching_references = [
                    reference
                    for reference in references
                    if reference["run_id"] == capability["run_id"]
                    and reference["command_id"] == capability["command_id"]
                    and reference["command_sha256"] == capability["command_sha256"]
                ]
                if state in ("claimed", "completed") and not matching_references:
                    raise LifecycleError("durable capability lacks journal reference")

        self.results = {}
        for path in sorted(self.run_root.glob("retained-barrier-result-*.json")):
            result_bytes = validate_regular_file(path, mode=0o600)
            result = json.loads(result_bytes)
            suffix = path.name.removeprefix("retained-barrier-result-").removesuffix(".json")
            operation = next(
                (item for item in OPERATIONS if suffix.startswith(f"{item}-")), None
            )
            if operation is None:
                raise LifecycleError("unknown retained result path")
            epoch = suffix[len(operation) + 1 :]
            key = f"{operation}:{epoch}"
            if (
                not EPOCH_RE.fullmatch(epoch)
                or key not in capability_digests
                or capability_states[key] not in ("claimed", "completed")
                or set(result) != RESULT_KEYS
                or result.get("schema_version")
                != "megacampus.q12.retained-command-result/v1"
                or result.get("command_id") != COMMANDS[operation]
                or result.get("capability_sha256") != capability_digests[key]
                or result.get("status") != "accepted"
                or not isinstance(result.get("result_sha256"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", result["result_sha256"])
            ):
                raise LifecycleError("retained result shape/binding mismatch")
            if key in self.results:
                raise LifecycleError("duplicate retained result")
            self.results[key] = str(path)

        self.selectors = {}
        self.completions = {}
        self.frontier_hash = None
        for entry in entries:
            operation = next(
                (item for item in OPERATIONS if COMMANDS[item] == entry["command_id"]), None
            )
            if operation is not None and entry["outcome"] == "intent":
                self.selectors[operation] = entry["entry_hash"]
            if operation is not None and entry["outcome"] == "completed":
                self.completions[operation] = entry["entry_hash"]
            if entry["outcome"] == "retained_attempt_abandoning":
                self.frontier_hash = entry["entry_hash"]

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
        after_journal = getattr(self.executor, "after_journal_fsync", None)
        if after_journal is not None:
            after_journal(entry)
        self.publish_checkpoint(entry)
        after_checkpoint = getattr(self.executor, "after_checkpoint_publication", None)
        if after_checkpoint is not None:
            after_checkpoint(entry)
        self.trace.append(f"journal:{outcome}")
        return entry

    def publish_checkpoint(self, entry: dict[str, Any]) -> bytes:
        data = self.checkpoint_bytes(entry)
        predecessor = (
            self.checkpoint_bytes(self.journal[-2]) if len(self.journal) > 1 else None
        )
        journal_bytes = validate_regular_file(self.journal_path, mode=0o600)
        self.repair_checkpoint(
            data,
            predecessor,
            journal_bytes,
            publication_entry=entry,
        )
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
        immutable_publish(
            path,
            source,
            0o600,
            self.trace,
            fault,
            allow_temporary_completion=bool(
                getattr(self.executor, "continuous_lease", False)
            ),
        )
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

    def delegate_claim(self, operation: str, epoch: str) -> dict[str, Any] | None:
        capability_path = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
        capability = json.loads(validate_regular_file(capability_path, mode=0o400))
        copy_path = pathlib.Path(self.retained[f"{operation}:{epoch}"])
        checkpoint_hash = sha256(validate_regular_file(copy_path, mode=0o600))
        argv = [
            "run",
            "--run-id",
            self.request["run_id"],
            "--command-id",
            COMMANDS[operation],
            "--lease-fd",
            "9",
            "--checkpoint",
            checkpoint_hash,
            "--capability",
            str(capability_path),
        ]
        launch = getattr(self.executor, "launch_claim", None)
        if launch is None:
            raise LifecycleError("executor cannot cross delegated claim boundary")
        response = launch(argv, self.journal_fd)
        self.reload_durable()
        if not response.get("claimProcessBoundary"):
            raise LifecycleError("claim did not cross a process boundary")
        self.lease_fd_9_validated = True
        self.inherited_journal_identity_validated = True
        if response.get("restartRequired"):
            raise LifecycleError(
                f"injected delegated restart at {response.get('boundary')}"
            )
        result_path = self.results.get(f"{operation}:{epoch}")
        if result_path is None:
            return None
        return json.loads(validate_regular_file(pathlib.Path(result_path), mode=0o600))

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
        result = self.delegate_claim(operation, root_epoch)
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

    def resume_retained_chain(
        self, operation: str, chain: dict[str, Any], command: dict[str, Any]
    ) -> None:
        """Infer and continue the unique durable chain; fixture dimensions are creation-only."""
        if operation in self.completions:
            return
        selector_hash = self.selectors.get(operation)
        if selector_hash is None:
            raise LifecycleError("cannot resume without exact selector")
        selector_entry = next(
            entry for entry in self.journal if entry["entry_hash"] == selector_hash
        )
        def epoch_order(epoch: str) -> int:
            return 0 if epoch == "cutover" else int(epoch.rsplit("-", 1)[1])

        members: dict[str, tuple[str, dict[str, Any]]] = {}
        for key, value in self.capabilities.items():
            member_operation, epoch = key.split(":", 1)
            if member_operation != operation:
                continue
            member_bytes = validate_regular_file(pathlib.Path(value), mode=0o400)
            members[sha256(member_bytes)] = (epoch, json.loads(member_bytes))

        if not members:
            copy_epochs = sorted(
                (
                    key.split(":", 1)[1]
                    for key in self.retained
                    if key.startswith(f"{operation}:")
                ),
                key=epoch_order,
            )
            root_epoch = copy_epochs[-1] if copy_epochs else "cutover"
            root_key = f"{operation}:{root_epoch}"
            copy_path = (
                pathlib.Path(self.retained[root_key])
                if root_key in self.retained
                else self.publish_copy(
                    operation,
                    root_epoch,
                    self.checkpoint_bytes(selector_entry),
                    "none",
                )
            )
            _, _, root_digest = self.publish_capability(
                operation, root_epoch, command, copy_path, None
            )
            members[root_digest] = (
                root_epoch,
                json.loads(
                    validate_regular_file(
                        pathlib.Path(self.capabilities[root_key]), mode=0o400
                    )
                ),
            )

        roots = [
            digest
            for digest, (_, capability) in members.items()
            if capability["supersedes_capability_sha256"] is None
        ]
        if len(roots) != 1:
            raise LifecycleError("recovery capability graph lacks one root")
        successors: dict[str, str] = {}
        for digest, (_, capability) in members.items():
            predecessor = capability["supersedes_capability_sha256"]
            if predecessor is None:
                continue
            if predecessor not in members or predecessor in successors:
                raise LifecycleError("recovery capability direct edge mismatch")
            successors[predecessor] = digest
        chain_digests = [roots[0]]
        while chain_digests[-1] in successors:
            chain_digests.append(successors[chain_digests[-1]])
        if len(chain_digests) != len(members):
            raise LifecycleError("recovery capability graph is disconnected")
        epochs = [members[digest][0] for digest in chain_digests]

        tip_epoch = epochs[-1]
        tip_path = pathlib.Path(self.capabilities[f"{operation}:{tip_epoch}"])
        tip_bytes = validate_regular_file(tip_path, mode=0o400)
        tip_digest = sha256(tip_bytes)
        for epoch in epochs[:-1]:
            path = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
            if path.parent.name in ("issued", "claimed"):
                self.move_capability(operation, epoch, path.parent.name, "superseded")
                self.trace.append("retire:predecessor")
                self.reload_durable()
        has_tip_issuance = any(
            entry["capability_manifest_sha256"] == tip_digest
            and entry["outcome"] in ("capability_issued", "recovery_reacquired")
            for entry in self.journal
        )
        if not has_tip_issuance:
            self.append(
                TARGET_PHASES[operation],
                "recovery_reacquired" if tip_epoch != "cutover" else "capability_issued",
                COMMANDS[operation],
                command["command_sha256"],
                tip_epoch,
                tip_digest,
            )
        result_path = self.results.get(f"{operation}:{tip_epoch}")
        if result_path is not None:
            result = json.loads(
                validate_regular_file(pathlib.Path(result_path), mode=0o600)
            )
            current = pathlib.Path(self.capabilities[f"{operation}:{tip_epoch}"])
            if current.parent.name == "claimed":
                self.move_capability(operation, tip_epoch, "claimed", "completed")
                completion_hook = getattr(self.executor, "after_completion_move", None)
                if completion_hook is not None:
                    completion_hook()
            if not any(
                entry["outcome"] == "completed"
                and entry["capability_manifest_sha256"] == tip_digest
                for entry in self.journal
            ):
                self.finish(
                    operation,
                    tip_epoch,
                    command,
                    tip_digest,
                    result,
                    "move-no-row-reacquired"
                    if current.parent.name == "completed"
                    else "normal",
                )
            return
        result = self.delegate_claim(operation, tip_epoch)
        if result is None:
            return
        if operation == "install":
            self.write_install_baseline(tip_digest)
        self.finish(
            operation,
            tip_epoch,
            command,
            tip_digest,
            result,
            "normal",
        )

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
        checkpoint = self.checkpoint_bytes(claim)
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
            completion_hook = getattr(self.executor, "after_completion_move", None)
            if completion_hook is not None:
                completion_hook()
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


def run_claim(arguments: argparse.Namespace, executor: Executor) -> dict[str, Any]:
    """Run the launcher-owned claim transaction using inherited FDs 8 and 9."""
    if arguments.lease_fd != 9:
        raise LifecycleError("claim requires inherited lease FD 9")
    try:
        journal_stat = os.fstat(8)
        lease_stat = os.fstat(9)
    except OSError as error:
        raise LifecycleError("claim requires inherited journal FD 8 and lease FD 9") from error
    journal_flags = fcntl.fcntl(8, fcntl.F_GETFL)
    if not journal_flags & os.O_APPEND or not journal_flags & (os.O_DSYNC | os.O_SYNC):
        raise LifecycleError("inherited journal FD 8 lacks append/synchronous flags")
    if (
        not stat_module.S_ISREG(journal_stat.st_mode)
        or journal_stat.st_uid != 1000
        or journal_stat.st_gid != 1000
        or journal_stat.st_nlink != 1
        or not stat_module.S_ISREG(lease_stat.st_mode)
        or lease_stat.st_uid != 1000
        or lease_stat.st_gid != 1000
        or lease_stat.st_nlink != 1
    ):
        raise LifecycleError("inherited descriptor identity mismatch")
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)

    capability_argument = pathlib.Path(arguments.capability)
    require_lexical_absolute(capability_argument)
    validate_regular_file(capability_argument, mode=0o400)
    if capability_argument.parent.name not in ("issued", "claimed"):
        raise LifecycleError("capability is not in issued/claimed state")
    run_root = capability_argument.parents[2]
    expected_run_root = pathlib.Path("/opt/megacampus/backups/q12") / arguments.run_id
    if run_root != expected_run_root:
        raise LifecycleError("capability run root mismatch")

    journal_path = run_root / "phase.jsonl"
    path_stat = journal_path.lstat()
    if path_stat.st_dev != journal_stat.st_dev or path_stat.st_ino != journal_stat.st_ino:
        raise LifecycleError("inherited open journal identity mismatch")
    raw_entries = validate_regular_file(journal_path, mode=0o600)
    if not raw_entries.endswith(b"\n"):
        raise LifecycleError("torn journal tail")
    last = json.loads(raw_entries.splitlines()[-1])
    request = {
        "run_root": str(run_root),
        "run_id": arguments.run_id,
        "release_sha": last["release_sha"],
        "operator_digest": last["operator_digest"],
        "resource_manifest_sha256": last["resource_manifest_sha256"],
        "quiesce_manifest_sha256": last["quiesce_manifest_sha256"],
        "expected_catalog_sha256": "",
        "inherited_journal_fd": 8,
        "production": True,
    }
    engine = Engine(request, executor)
    checkpoint = json.loads(validate_regular_file(engine.checkpoint_path, mode=0o600))
    if (
        checkpoint["journal_device"] != str(journal_stat.st_dev)
        or checkpoint["journal_inode"] != str(journal_stat.st_ino)
    ):
        raise LifecycleError("fixed checkpoint journal identity mismatch")
    if last["outcome"] not in (
        "capability_issued",
        "recovery_reacquired",
        "capability_claimed",
    ):
        raise LifecycleError("current checkpoint is not issuance/claim authority")
    operation = next(
        (item for item in OPERATIONS if COMMANDS[item] == arguments.command_id), None
    )
    if operation is None or last["command_id"] != arguments.command_id:
        raise LifecycleError("claim command/current issuance mismatch")
    epoch = last["lease_epoch"]
    key = f"{operation}:{epoch}"
    current = pathlib.Path(engine.capabilities.get(key, ""))
    if current != capability_argument:
        raise LifecycleError("capability path is not current authority")
    capability_bytes = validate_regular_file(current, mode=0o400)
    capability = json.loads(capability_bytes)
    capability_hash = sha256(capability_bytes)
    if (
        capability["command_id"] != arguments.command_id
        or capability["command_sha256"] != last["command_sha256"]
        or capability_hash != last["capability_manifest_sha256"]
    ):
        raise LifecycleError("capability/current issuance binding mismatch")
    copy = pathlib.Path(engine.retained.get(key, ""))
    copy_bytes = validate_regular_file(copy, mode=0o600)
    if (
        arguments.checkpoint != sha256(copy_bytes)
        or capability["capability_input_checkpoint_sha256"] != arguments.checkpoint
    ):
        raise LifecycleError("launcher checkpoint binding mismatch")

    if current.parent.name == "issued" and last["outcome"] not in (
        "capability_issued",
        "recovery_reacquired",
    ):
        raise LifecycleError("issued capability lacks current issuance checkpoint")
    if current.parent.name == "claimed" and last["outcome"] == "capability_claimed":
        if last["capability_manifest_sha256"] != capability_hash:
            raise LifecycleError("claimed capability/current claim mismatch")

    if current.parent.name == "issued":
        current = engine.move_capability(operation, epoch, "issued", "claimed")
        hook = getattr(executor, "after_claim_move", None)
        if hook is not None:
            hook()
        engine.append(
            TARGET_PHASES[operation],
            "capability_claimed",
            COMMANDS[operation],
            capability["command_sha256"],
            epoch,
            capability_hash,
        )
    else:
        matching_claims = [
            entry
            for entry in engine.journal
            if entry["outcome"] == "capability_claimed"
            and entry["capability_manifest_sha256"] == capability_hash
        ]
        if not matching_claims:
            engine.append(
                TARGET_PHASES[operation],
                "capability_claimed",
                COMMANDS[operation],
                capability["command_sha256"],
                epoch,
                capability_hash,
            )
        elif len(matching_claims) != 1:
            raise LifecycleError("duplicate claim authority")

    after_checkpoint = getattr(executor, "after_claim_checkpoint", None)
    if after_checkpoint is not None:
        after_checkpoint()

    result_path = engine.run_root / f"retained-barrier-result-{operation}-{epoch}.json"
    if os.path.lexists(result_path):
        result = json.loads(validate_regular_file(result_path, mode=0o600))
        return {
            "claimProcessBoundary": True,
            "launcherOwnedClaimMutation": True,
            "claimProcessPid": os.getpid(),
            "childExecuted": False,
            "result": result,
        }

    manifest = load_manifest()
    expected_catalog_path = engine.run_root / "expected-post-migration-catalog.json"
    expected_catalog_sha256 = sha256(validate_regular_file(expected_catalog_path, mode=0o400))
    request["expected_catalog_sha256"] = expected_catalog_sha256
    command = resolved_command(manifest, arguments.command_id, request)
    if command["command_sha256"] != capability["command_sha256"]:
        raise LifecycleError("manifested child command binding mismatch")
    result = executor.execute(command, capability)
    if (
        set(result)
        != {"schema_version", "command_id", "capability_sha256", "result_sha256", "status"}
        or result["command_id"] != arguments.command_id
        or result["capability_sha256"] != capability_hash
        or result["status"] != "accepted"
    ):
        raise LifecycleError("manifested child result binding mismatch")
    immutable_publish(result_path, complete_object(result), 0o600, engine.trace)
    result_hook = getattr(executor, "after_result_publication", None)
    if result_hook is not None:
        result_hook()
    return {
        "claimProcessBoundary": True,
        "launcherOwnedClaimMutation": True,
        "claimProcessPid": os.getpid(),
        "childExecuted": True,
        "result": result,
    }


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
        if operation in engine.selectors:
            engine.resume_retained_chain(operation, chain, command)
        else:
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
    claim.add_argument("--checkpoint", required=True, type=lambda value: value if re.fullmatch(r"[0-9a-f]{64}", value) else (_ for _ in ()).throw(argparse.ArgumentTypeError("checkpoint must be lowercase SHA-256")))
    claim.add_argument("--capability", required=True)
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
    output = run_claim(arguments, ProductionExecutor())
    sys.stdout.buffer.write(complete_object(output))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (LifecycleError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"q12 lifecycle rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
