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
import unicodedata
import uuid
import weakref
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
ORDINARY_COMMAND_IDS = (
    "operator.self-check",
    "writers.quiesce",
    "pg.backup",
    "pg.restore",
    "migration.base.apply",
    "migration.observability.apply",
    "source.forward",
    "reindex.plan",
    "reindex.worker.create",
    "reindex.execute",
    "reindex.verify",
    "deploy.prepare",
    "deploy.commit",
    "writers.resume.forward",
    "writers.resume.rollback",
)
MANIFEST_COMMAND_IDS = tuple(COMMANDS.values()) + ORDINARY_COMMAND_IDS
LEASE_FD_ENV_COMMAND_IDS = frozenset(
    ("writers.quiesce", "writers.resume.forward", "writers.resume.rollback")
)
# Amendment section 5: ordinary command -> (selector phase, target phase).
ORDINARY_ROW_GRAMMAR = {
    "operator.self-check": ("preflight", "preflight"),
    "pg.backup": ("snapshot_exported", "backup_committed"),
    "pg.restore": ("restore_verified", "restore_verified"),
    "migration.base.apply": ("restore_verified", "restore_verified"),
    "migration.observability.apply": ("base_migration_guarded", "base_migration_guarded"),
    "source.forward": ("source_recovered", "source_recovered"),
    "reindex.plan": ("reindex_started", "reindex_started"),
    "reindex.worker.create": ("reindex_started", "reindex_started"),
    "reindex.execute": ("reindex_started", "reindex_started"),
    "reindex.verify": ("qdrant_verified", "qdrant_verified"),
    "deploy.prepare": ("qdrant_verified", "qdrant_verified"),
    "deploy.commit": ("activation_ready", "activation_ready"),
}
# Amendment section 4 item 6: controller milestone phase -> sole witness command.
MILESTONE_WITNESSES = {"migrations_applied": "migration.observability.apply"}
# Amendment section 6 item 2: mode-bound FWM intent/accepted row phases.
FWM_ROW_PHASES = {
    "writers.resume.forward": "prepared_quiesced",
    "writers.resume.rollback": "rollback_preparing",
}


@dataclass
class LeaseSession:
    """Opaque process-local proof that retries still use the same open lease."""

    device: int
    inode: int
    anchor_fd: int
    finalizer: weakref.finalize


_LEASE_SESSIONS: weakref.WeakKeyDictionary[object, LeaseSession] = (
    weakref.WeakKeyDictionary()
)
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


def _nfc(value: Any) -> Any:
    """Recursively NFC-normalize every string key and value.

    The canonical object convention (shared with the Stream 1 probe) is UTF-8 NFC,
    compact, recursively key-sorted, with no trailing LF.  Normalizing here keeps
    cross-stream frame/object hashes byte-identical on non-ASCII input; it is a
    no-op on ASCII and already-composed data."""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, dict):
        return {_nfc(key): _nfc(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_nfc(item) for item in value]
    return value


def canonical(value: Any) -> bytes:
    return json.dumps(
        _nfc(value), ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
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
            accepted_kind in ("final_writer_manifest", "writer_quiesce_manifest")
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
    elif command_id in FWM_ROW_PHASES:
        valid = (
            phase == FWM_ROW_PHASES[command_id]
            and entry["command_sha256"] != ZERO
            and (
                (outcome == "intent" and accepted_kind == "none")
                or (outcome == "accepted" and accepted_kind == "final_writer_manifest")
            )
        )
    elif command_id == "writers.quiesce":
        valid = phase == "quiesced" and entry["command_sha256"] != ZERO
        if valid and outcome in (
            "intent",
            "capability_issued",
            "capability_claimed",
            "capability_completed",
        ):
            valid = accepted_kind == "none"
        elif valid and outcome == "accepted":
            valid = accepted_kind == "writer_quiesce_manifest"
        else:
            valid = False
    elif command_id in ORDINARY_ROW_GRAMMAR:
        selector_phase, target_phase = ORDINARY_ROW_GRAMMAR[command_id]
        valid = entry["command_sha256"] != ZERO and accepted_kind == "none"
        if valid and outcome == "intent":
            valid = phase == selector_phase
        elif valid and outcome in ("capability_issued", "capability_claimed"):
            valid = phase == target_phase
        elif valid and outcome == "completed":
            valid = phase == target_phase or MILESTONE_WITNESSES.get(phase) == command_id
        else:
            valid = False
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


def validate_stable_binding_walk(
    entries: list[dict[str, Any]], request: dict[str, Any]
) -> None:
    """Amendment section 4 items 7-8: segment-bound quiesce binding with the
    isolated request-global fallback, and the evidence-stepped resource
    manifest binding; every other stable binding stays request-global."""
    switched = False
    previous_resource: str | None = None
    for entry in entries:
        if entry.get("run_id") != request["run_id"]:
            raise LifecycleError("journal run binding mismatch")
        for key in ("release_sha", "operator_digest", "rotation_required"):
            if key in request and entry.get(key) != request[key]:
                raise LifecycleError(f"journal stable binding mismatch: {key}")
        if "quiesce_manifest_sha256" in request:
            expected = request["quiesce_manifest_sha256"]
            if (
                entry.get("command_id") == "writers.quiesce"
                and entry.get("outcome") == "accepted"
            ):
                switched = True
            value = entry.get("quiesce_manifest_sha256")
            if switched:
                if value != expected:
                    raise LifecycleError(
                        "journal stable binding mismatch: quiesce_manifest_sha256"
                    )
            elif value not in (ZERO, expected):
                raise LifecycleError(
                    "journal stable binding mismatch: quiesce_manifest_sha256"
                )
        if "resource_manifest_sha256" in request:
            value = entry.get("resource_manifest_sha256")
            if previous_resource is not None and value != previous_resource:
                stepping = (
                    entry.get("command_id") == "pg.backup"
                    and entry.get("outcome") == "intent"
                ) or (
                    entry.get("command_id") == "deploy.prepare"
                    and entry.get("outcome") == "completed"
                )
                if not stepping:
                    raise LifecycleError(
                        "journal stable binding mismatch: resource_manifest_sha256"
                    )
            previous_resource = value
    if (
        entries
        and "resource_manifest_sha256" in request
        and request["resource_manifest_sha256"]
        not in (
            entries[0].get("resource_manifest_sha256"),
            entries[-1].get("resource_manifest_sha256"),
        )
    ):
        raise LifecycleError(
            "journal stable binding mismatch: resource_manifest_sha256"
        )


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fsync_directory(path: pathlib.Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def validate_canonical_lease_lock(run_root: pathlib.Path, lease_fd: int = 9) -> tuple[int, int]:
    """Bind FD9 to the canonical parent lock and prove another OFD is excluded."""
    lock_path = run_root.parent / "cutover.lock"
    parent_fd = open_parent_directory(lock_path)
    canonical_fd = -1
    try:
        canonical_fd = os.open(
            "cutover.lock", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd
        )
        inherited = os.fstat(lease_fd)
        canonical = os.fstat(canonical_fd)
        path_identity = os.stat(
            "cutover.lock", dir_fd=parent_fd, follow_symlinks=False
        )
        if (
            not stat_module.S_ISREG(inherited.st_mode)
            or inherited.st_uid != 1000
            or inherited.st_gid != 1000
            or stat_module.S_IMODE(inherited.st_mode) != 0o600
            or inherited.st_nlink != 1
            or (inherited.st_dev, inherited.st_ino)
            != (canonical.st_dev, canonical.st_ino)
            or (canonical.st_dev, canonical.st_ino)
            != (path_identity.st_dev, path_identity.st_ino)
        ):
            raise LifecycleError("FD 9 canonical cutover.lock identity mismatch")
        try:
            fcntl.flock(canonical_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            fcntl.flock(canonical_fd, fcntl.LOCK_UN)
            raise LifecycleError("FD 9 canonical lease lock is not held")
        return inherited.st_dev, inherited.st_ino
    finally:
        if canonical_fd >= 0:
            os.close(canonical_fd)
        os.close(parent_fd)


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
    if tuple(manifest["commands"]) != MANIFEST_COMMAND_IDS:
        raise LifecycleError("command manifest exact set/order mismatch")
    base_env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "LANG": "C", "HOME": "/root"}
    lease_env = {**base_env, "Q12_EXTERNAL_QUIESCE_LEASE_FD": "9"}
    for command_id, command in manifest["commands"].items():
        expected_env = lease_env if command_id in LEASE_FD_ENV_COMMAND_IDS else base_env
        if set(command) != {"argv", "argv_sha256", "env"} or command["env"] != expected_env:
            raise LifecycleError(f"command manifest entry mismatch: {command_id}")
        if command["argv_sha256"] != sha256(canonical(command["argv"])):
            raise LifecycleError(f"command manifest argv hash mismatch: {command_id}")
    return manifest


SUBSTITUTION_PLACEHOLDERS = frozenset(
    (
        "<run-id>",
        "<expected-post-migration-catalog-sha256>",
        "<release-sha>",
        "<quiesce-manifest>",
        "<exported-id>",
        "<immutable-generation>",
        "<recovery-run-id>",
        "<accepted-recovery-manifest-sha256>",
        "<accepted-coverage-fingerprint>",
        "<accepted-coverage-run>",
    )
)


def derive_joined_fixture_values(run_id: str, quiesce_manifest_path: str) -> dict[str, str]:
    """Amendment section 3 closed-fixture derivations; Root-only single authorities."""
    rendered = str(uuid.UUID(run_id))

    def digest(salt: str) -> str:
        return sha256(f"q12:{salt}:{rendered}".encode("utf-8"))

    def derived_uuid(name: str) -> str:
        return str(uuid.uuid5(uuid.UUID(rendered), name))

    snapshot = digest("snapshot-export")
    return {
        "<exported-id>": f"{snapshot[0:8]}-{snapshot[8:16]}-1",
        "<immutable-generation>": "q12fixture-generation-" + digest("backup-generation")[0:16],
        "<recovery-run-id>": derived_uuid("q12-source-recovery"),
        "<accepted-recovery-manifest-sha256>": digest("recovery-manifest"),
        "<accepted-coverage-fingerprint>": digest("coverage-fingerprint"),
        "<accepted-coverage-run>": ":".join(
            derived_uuid(name)
            for name in ("q12-coverage-org", "q12-coverage-course", "q12-coverage-run")
        ),
        "<quiesce-manifest>": quiesce_manifest_path,
    }


def resolved_command(
    manifest: dict[str, Any],
    command_id: str,
    request: dict[str, Any],
    values: dict[str, str] | None = None,
) -> dict[str, Any]:
    source = manifest["commands"][command_id]
    extra = dict(values or {})
    if not set(extra) <= SUBSTITUTION_PLACEHOLDERS:
        raise LifecycleError("unknown substitution placeholder offered")
    substitutions = {
        "<run-id>": request["run_id"],
        "<expected-post-migration-catalog-sha256>": request["expected_catalog_sha256"],
        "<release-sha>": request["release_sha"],
        **extra,
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
    canonical_lease_fd_9_validated: bool = False
    inherited_journal_identity_validated: bool = False
    lease_reacquired: bool = False
    journal_fd: int = field(init=False)
    current_resource_manifest_sha256: str = field(init=False)
    current_quiesce_manifest_sha256: str = field(init=False)

    def __post_init__(self) -> None:
        self.current_resource_manifest_sha256 = self.request["resource_manifest_sha256"]
        self.current_quiesce_manifest_sha256 = self.request["quiesce_manifest_sha256"]
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
            if not bool(getattr(self.executor, "continuous_lease", False)):
                raise LifecycleError(
                    f"publishing residue retained after lease loss: {temporary}"
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
            previous = digest
            entries.append(entry)
        validate_stable_binding_walk(entries, self.request)
        self.journal = entries
        entries_by_hash = {entry["entry_hash"]: entry for entry in entries}

        if entries:
            checkpoint_entry = entries[-1]
            if (
                checkpoint_entry["phase"] == "rollback_preparing"
                and checkpoint_entry["outcome"] == "intent"
                and len(entries) >= 2
                and entries[-2]["outcome"] == "retained_attempt_abandoning"
            ):
                checkpoint_entry = entries[-2]
            expected = self.checkpoint_bytes(checkpoint_entry)
            next_path = pathlib.Path(f"{self.checkpoint_path}.next")
            if os.path.lexists(self.checkpoint_path):
                current_checkpoint = validate_regular_file(
                    self.checkpoint_path, mode=0o600
                )
            else:
                current_checkpoint = None
            if current_checkpoint != expected or os.path.lexists(next_path):
                checkpoint_index = entries.index(checkpoint_entry)
                predecessor = (
                    self.checkpoint_bytes(entries[checkpoint_index - 1])
                    if checkpoint_index > 0
                    else None
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
                ordinary = (
                    operation is None
                    and capability["command_id"] in ORDINARY_COMMAND_IDS
                )
                if operation is None and not ordinary:
                    raise LifecycleError("unknown capability command")
                epoch = capability["lease_epoch"]
                if not EPOCH_RE.fullmatch(epoch):
                    raise LifecycleError("invalid capability epoch")
                stable = {
                    "run_id": self.request["run_id"],
                    "release_sha": self.request["release_sha"],
                    "operator_digest": self.request["operator_digest"],
                    "resume_authority_sha256": None,
                }
                if any(capability[name] != value for name, value in stable.items()):
                    raise LifecycleError("capability stable binding mismatch")
                if ordinary:
                    # Segment-bound context: the capability must match its own
                    # issuance row, which the stable-binding walk has already
                    # validated against the amendment segment rules.
                    issuance_rows = [
                        entry
                        for entry in entries
                        if entry["command_id"] == capability["command_id"]
                        and entry["outcome"] == "capability_issued"
                        and entry["capability_manifest_sha256"] == sha256(data)
                    ]
                    if not issuance_rows or any(
                        entry["resource_manifest_sha256"]
                        != capability["resource_manifest_sha256"]
                        or entry["quiesce_manifest_sha256"]
                        != capability["quiesce_manifest_sha256"]
                        for entry in issuance_rows
                    ):
                        raise LifecycleError(
                            "ordinary capability issuance-row binding mismatch"
                        )
                else:
                    # The walk has already validated the journal's segment and
                    # stepped domains; a barrier capability must carry values
                    # from that same validated domain (request-global in every
                    # isolated run).
                    allowed_resource = {self.request["resource_manifest_sha256"]} | {
                        entry["resource_manifest_sha256"] for entry in entries
                    }
                    if capability["resource_manifest_sha256"] not in allowed_resource or (
                        capability["quiesce_manifest_sha256"]
                        not in (ZERO, self.request["quiesce_manifest_sha256"])
                    ):
                        raise LifecycleError("capability stable binding mismatch")
                key = (
                    f"ordinary:{capability['command_id']}:{epoch}"
                    if ordinary
                    else f"{operation}:{epoch}"
                )
                if key in seen_capabilities:
                    raise LifecycleError("capability present in multiple states")
                expected_name = f"{capability['command_id']}--{epoch}.json"
                if path.name != expected_name:
                    raise LifecycleError("capability filename mismatch")
                if not ordinary and (
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

        known_capability_paths = {
            pathlib.Path(path) for path in self.capabilities.values()
        }
        capability_root = self.run_root / "capabilities"
        expected_state_directories = {"issued", "claimed", "completed", "superseded"}
        if {path.name for path in capability_root.iterdir()} != expected_state_directories:
            raise LifecycleError("unknown capability lifecycle directory")
        for state in expected_state_directories:
            for path in (capability_root / state).iterdir():
                if path not in known_capability_paths:
                    raise LifecycleError("unknown capability lifecycle residue")

        self.results = {}
        for path in sorted(self.run_root.glob("ordinary-command-result-*.json")):
            result_bytes = validate_regular_file(path, mode=0o600)
            result = json.loads(result_bytes)
            suffix = path.name.removeprefix("ordinary-command-result-").removesuffix(".json")
            command_id = next(
                (item for item in ORDINARY_COMMAND_IDS if suffix.startswith(f"{item}-")),
                None,
            )
            if command_id is None:
                raise LifecycleError("unknown ordinary result path")
            epoch = suffix[len(command_id) + 1 :]
            key = f"ordinary:{command_id}:{epoch}"
            if (
                not EPOCH_RE.fullmatch(epoch)
                or key not in capability_digests
                or capability_states[key] not in ("claimed", "completed")
                or set(result) != RESULT_KEYS
                or result.get("schema_version")
                != "megacampus.q12.retained-command-result/v1"
                or result.get("command_id") != command_id
                or result.get("capability_sha256") != capability_digests[key]
                or result.get("status") != "accepted"
                or not isinstance(result.get("result_sha256"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", result["result_sha256"])
            ):
                raise LifecycleError("ordinary result shape/binding mismatch")
            if key in self.results:
                raise LifecycleError("duplicate ordinary result")
            self.results[key] = str(path)
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

        known_lifecycle_paths = {
            pathlib.Path(path)
            for path in (*self.retained.values(), *self.results.values())
        }
        for path in self.run_root.iterdir():
            if path.name.startswith(
                ("retained-barrier-capability-checkpoint-", "retained-barrier-result-")
            ) and path not in known_lifecycle_paths and not (
                path.name.endswith(".publishing")
                and bool(getattr(self.executor, "continuous_lease", False))
            ):
                raise LifecycleError("unknown retained lifecycle residue")

        # Validate each complete capability graph before any completion can be
        # indexed or any continuation can move/execute a member.
        for operation in OPERATIONS:
            members: list[tuple[int, str, str, dict[str, Any]]] = []
            for key, digest in capability_digests.items():
                member_operation, epoch = key.split(":", 1)
                if member_operation != operation:
                    continue
                order = 0 if epoch == "cutover" else int(epoch.rsplit("-", 1)[1])
                capability = json.loads(
                    validate_regular_file(
                        pathlib.Path(self.capabilities[key]), mode=0o400
                    )
                )
                members.append((order, epoch, digest, capability))
            members.sort()
            if not members:
                continue
            first = members[0][0]
            if first not in (0, 1) or [item[0] for item in members] != list(
                range(first, members[-1][0] + 1)
            ):
                raise LifecycleError("capability epoch gap/repetition")
            if members[0][3]["supersedes_capability_sha256"] is not None:
                raise LifecycleError("capability graph root is not null-supersedes")
            journal_less_orders: list[int] = []
            for index, (order, _epoch, digest, capability) in enumerate(members):
                if index > 0 and capability["supersedes_capability_sha256"] != members[index - 1][2]:
                    raise LifecycleError("capability graph direct edge mismatch")
                references = [
                    entry
                    for entry in entries
                    if entry["capability_manifest_sha256"] == digest
                ]
                issuances = [
                    entry
                    for entry in references
                    if entry["outcome"] in ("capability_issued", "recovery_reacquired")
                ]
                claims = [entry for entry in references if entry["outcome"] == "capability_claimed"]
                completions = [entry for entry in references if entry["outcome"] == "completed"]
                abandonments = [
                    entry
                    for entry in references
                    if entry["outcome"] == "retained_attempt_abandoning"
                ]
                if len(issuances) > 1 or len(claims) > 1 or len(completions) > 1:
                    raise LifecycleError("duplicate capability lifecycle row")
                if claims and not issuances:
                    raise LifecycleError("journal-less capability was claimed")
                if claims and claims[0]["seq"] <= issuances[0]["seq"]:
                    raise LifecycleError("capability claim precedes issuance")
                if completions and (
                    not claims or completions[0]["seq"] <= claims[0]["seq"]
                ):
                    raise LifecycleError("capability completion precedes claim")
                if not references:
                    journal_less_orders.append(order)
                elif not issuances and references != abandonments:
                    raise LifecycleError("invalid journal-less capability reference")
            if journal_less_orders and journal_less_orders != list(
                range(journal_less_orders[0], journal_less_orders[-1] + 1)
            ):
                raise LifecycleError("journal-less capability suffix is not consecutive")

        self.selectors = {}
        self.completions = {}
        self.frontier_hash = None
        for entry in entries:
            operation = next(
                (item for item in OPERATIONS if COMMANDS[item] == entry["command_id"]), None
            )
            if operation is not None and entry["outcome"] == "intent":
                self.selectors[operation] = entry["entry_hash"]
            if entry["outcome"] == "retained_attempt_abandoning":
                self.frontier_hash = entry["entry_hash"]

        # A completed row is authority only as the terminal member of the exact
        # durable capability/result lifecycle.  Do this after every directory
        # has been scanned so an early completion can never mask missing or
        # displaced evidence.
        for entry in entries:
            operation = next(
                (item for item in OPERATIONS if COMMANDS[item] == entry["command_id"]),
                None,
            )
            if operation is None or entry["outcome"] != "completed":
                continue
            digest = entry["capability_manifest_sha256"]
            matching_keys = [
                key
                for key, candidate_digest in capability_digests.items()
                if candidate_digest == digest
            ]
            if len(matching_keys) != 1:
                raise LifecycleError("terminal capability cardinality mismatch")
            key = matching_keys[0]
            member_operation, execution_epoch = key.split(":", 1)
            completion_epoch = entry["lease_epoch"]
            next_epoch = (
                "cutover-recovery-1"
                if execution_epoch == "cutover"
                else f"cutover-recovery-{int(execution_epoch.rsplit('-', 1)[1]) + 1}"
            )
            operation_members = sorted(
                (
                    0 if candidate_key.endswith(":cutover") else int(candidate_key.rsplit("-", 1)[1]),
                    candidate_key,
                )
                for candidate_key in capability_digests
                if candidate_key.startswith(f"{operation}:")
            )
            claims = [
                row
                for row in entries
                if row["outcome"] == "capability_claimed"
                and row["capability_manifest_sha256"] == digest
            ]
            completions = [
                row
                for row in entries
                if row["outcome"] == "completed"
                and row["capability_manifest_sha256"] == digest
            ]
            if (
                member_operation != operation
                or capability_states[key] != "completed"
                or key not in self.results
                or len(claims) != 1
                or len(completions) != 1
                or completion_epoch not in (execution_epoch, next_epoch)
                or key != operation_members[-1][1]
                or any(
                    capability_states[candidate_key] != "superseded"
                    for _, candidate_key in operation_members[:-1]
                )
            ):
                raise LifecycleError("terminal completed/result/location mismatch")
            if operation in self.completions:
                raise LifecycleError("duplicate terminal completion")
            self.completions[operation] = entry["entry_hash"]

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
        publish_fixed_checkpoint: bool = True,
        checkpoint_predecessor: dict[str, Any] | None = None,
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
            "resource_manifest_sha256": self.current_resource_manifest_sha256,
            "quiesce_manifest_sha256": self.current_quiesce_manifest_sha256,
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
        if publish_fixed_checkpoint:
            self.publish_checkpoint(entry, checkpoint_predecessor)
            after_checkpoint = getattr(self.executor, "after_checkpoint_publication", None)
            if after_checkpoint is not None:
                after_checkpoint(entry)
        self.trace.append(f"journal:{outcome}")
        return entry

    def publish_checkpoint(
        self,
        entry: dict[str, Any],
        checkpoint_predecessor: dict[str, Any] | None = None,
    ) -> bytes:
        data = self.checkpoint_bytes(entry)
        predecessor_entry = checkpoint_predecessor
        if predecessor_entry is None and len(self.journal) > 1:
            predecessor_entry = self.journal[-2]
        predecessor = (
            self.checkpoint_bytes(predecessor_entry)
            if predecessor_entry is not None
            else None
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
        return self.selector_intent_from_head(operation, command)

    def append_retained_selector_from_current_head(
        self, operation: str, command: dict[str, Any]
    ) -> dict[str, Any]:
        """Joined-composition selector: the real current head is H; no synthetic anchor."""
        if not self.journal or self.journal[-1]["phase"] != PREDECESSOR_PHASES[operation]:
            raise LifecycleError("retained selector predecessor phase mismatch")
        return self.selector_intent_from_head(operation, command)

    def selector_intent_from_head(
        self, operation: str, command: dict[str, Any]
    ) -> dict[str, Any]:
        carried = self.journal[-1]["capability_manifest_sha256"] if self.journal else ZERO
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
            "resource_manifest_sha256": self.current_resource_manifest_sha256,
            "quiesce_manifest_sha256": self.current_quiesce_manifest_sha256,
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

    def publish_ordinary_capability(
        self, command_id: str, command: dict[str, Any], checkpoint_hash: str
    ) -> tuple[pathlib.Path, dict[str, Any], str]:
        capability = {
            "schema_version": "megacampus.q12.host-command-capability/v1",
            "run_id": self.request["run_id"],
            "command_id": command_id,
            "command_sha256": command["command_sha256"],
            "release_sha": self.request["release_sha"],
            "operator_digest": self.request["operator_digest"],
            "resource_manifest_sha256": self.current_resource_manifest_sha256,
            "quiesce_manifest_sha256": self.current_quiesce_manifest_sha256,
            "resume_authority_sha256": None,
            "capability_input_checkpoint_sha256": checkpoint_hash,
            "lease_epoch": "cutover",
            "supersedes_capability_sha256": None,
        }
        if set(capability) != CAPABILITY_KEYS:
            raise AssertionError("internal capability projection mismatch")
        data = complete_object(capability)
        path = self.run_root / "capabilities" / "issued" / f"{command_id}--cutover.json"
        immutable_publish(path, data, 0o400, self.trace)
        digest = sha256(data)
        self.capabilities[f"ordinary:{command_id}:cutover"] = str(path)
        return path, capability, digest

    def move_ordinary_capability(
        self, command_id: str, source_state: str, target_state: str
    ) -> pathlib.Path:
        source = self.run_root / "capabilities" / source_state / f"{command_id}--cutover.json"
        target = self.run_root / "capabilities" / target_state / source.name
        rename_noreplace(source, target)
        fsync_directory(source.parent)
        fsync_directory(target.parent)
        self.capabilities[f"ordinary:{command_id}:cutover"] = str(target)
        return target

    def append_ordinary_lifecycle(
        self,
        manifest: dict[str, Any],
        command_id: str,
        values: dict[str, str],
        *,
        quiesce_object_sha256: str | None = None,
        resource_step_before_completion: str | None = None,
    ) -> dict[str, Any]:
        """Amendment section 4 items 4-5: one ordinary command lifecycle.

        Root emits the capability/claim/completion evidence directly through
        the production serializer/object primitives; the delegated claim
        launcher remains a D5-group and Task 9 controller concern.
        """
        command = resolved_command(manifest, command_id, self.request, values)
        if command_id == "writers.quiesce":
            selector_phase = target_phase = "quiesced"
        else:
            selector_phase, target_phase = ORDINARY_ROW_GRAMMAR[command_id]
        carried = self.journal[-1]["capability_manifest_sha256"] if self.journal else ZERO
        self.append(
            selector_phase, "intent", command_id, command["command_sha256"], "cutover", carried
        )
        checkpoint_hash = sha256(self.checkpoint_path.read_bytes())
        _, _, digest = self.publish_ordinary_capability(command_id, command, checkpoint_hash)
        self.append(
            target_phase,
            "capability_issued",
            command_id,
            command["command_sha256"],
            "cutover",
            digest,
        )
        self.move_ordinary_capability(command_id, "issued", "claimed")
        self.append(
            target_phase,
            "capability_claimed",
            command_id,
            command["command_sha256"],
            "cutover",
            digest,
        )
        result = {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": command_id,
            "capability_sha256": digest,
            "result_sha256": sha256(
                canonical(
                    {
                        "command_id": command_id,
                        "run_id": self.request["run_id"],
                        "evidence": "q12-joined-fixture",
                    }
                )
            ),
            "status": "accepted",
        }
        if set(result) != RESULT_KEYS:
            raise AssertionError("internal result projection mismatch")
        result_path = self.run_root / f"ordinary-command-result-{command_id}-cutover.json"
        immutable_publish(result_path, complete_object(result), 0o600, self.trace)
        self.results[f"ordinary:{command_id}:cutover"] = str(result_path)
        self.move_ordinary_capability(command_id, "claimed", "completed")
        if resource_step_before_completion is not None:
            if command_id != "deploy.prepare":
                raise LifecycleError("resource step is frozen to deploy.prepare completion")
            self.current_resource_manifest_sha256 = resource_step_before_completion
        if command_id == "writers.quiesce":
            if quiesce_object_sha256 is None:
                raise LifecycleError("quiesce lifecycle requires the accepted manifest digest")
            self.append(
                target_phase,
                "capability_completed",
                command_id,
                command["command_sha256"],
                "cutover",
                digest,
            )
            self.current_quiesce_manifest_sha256 = self.request["quiesce_manifest_sha256"]
            return self.append(
                target_phase,
                "accepted",
                command_id,
                command["command_sha256"],
                "cutover",
                digest,
                accepted_kind="writer_quiesce_manifest",
                accepted_hash=quiesce_object_sha256,
            )
        return self.append(
            target_phase,
            "completed",
            command_id,
            command["command_sha256"],
            "cutover",
            digest,
        )

    def derive_root_writer_inventory(
        self, quiesce_manifest_bytes: bytes, *, include_targets: bool
    ) -> dict[str, Any]:
        """Amendment section 6 item 3: Root-only writer inventory derivation.

        The ten originals come read-only from the W-owned
        megacampus.q12.writer-quiesce/v1 bytes; the five targets are the
        frozen fixture derivations recorded by deploy.prepare evidence.
        """
        quiesce = json.loads(quiesce_manifest_bytes)
        if (
            set(quiesce) != {"schema_version", "run_id", "status", "barrier", "writers"}
            or quiesce.get("schema_version") != "megacampus.q12.writer-quiesce/v1"
            or quiesce.get("run_id") != self.request["run_id"]
            or quiesce.get("status") != "quiesced"
            or not isinstance(quiesce.get("writers"), list)
            or len(quiesce["writers"]) != 10
        ):
            raise LifecycleError("writer quiesce manifest shape mismatch")
        writer_fields = {
            "class",
            "id",
            "name",
            "project",
            "service",
            "config_files",
            "working_dir",
            "image_id",
            "image_ref",
            "prior_running",
            "prior_status",
            "healthcheck_present",
            "prior_health_status",
            "prior_restart_policy",
            "temporary_restart_policy",
        }
        for writer in quiesce["writers"]:
            if set(writer) != writer_fields:
                raise LifecycleError("quiesced writer projection mismatch")
        production = [
            writer
            for writer in quiesce["writers"]
            if str(writer["class"]).startswith("production-")
        ]
        development = [
            writer
            for writer in quiesce["writers"]
            if str(writer["class"]).startswith("development-")
        ]
        if len(production) != 5 or len(development) != 5:
            raise LifecycleError("original writer class inventory mismatch")
        frontends = [
            writer
            for writer in production
            if writer["class"] in ("production-api", "production-web")
        ]
        active_projects = {writer["project"] for writer in frontends}
        if len(frontends) != 2 or len(active_projects) != 1:
            raise LifecycleError("original writer topology has no exact active color")
        active_project = frontends[0]["project"]
        if active_project not in ("megacampus-blue", "megacampus-green"):
            raise LifecycleError("original writer topology has an invalid active color")
        target_project = (
            "megacampus-green"
            if active_project == "megacampus-blue"
            else "megacampus-blue"
        )
        expected_topology = {
            (active_project, "api", "production-api"),
            (active_project, "web", "production-web"),
            ("megacampus", "worker", "production-worker"),
            ("megacampus", "worker-stage6", "production-worker"),
            ("megacampus", "worker-stage7", "production-worker"),
            ("megacampus", "api-dev", "development-api"),
            ("megacampus", "web-dev", "development-web"),
            ("megacampus", "worker-dev", "development-worker"),
            ("megacampus", "worker-stage6-dev", "development-worker"),
            ("megacampus", "worker-stage7-dev", "development-worker"),
        }
        if {
            (writer["project"], writer["service"], writer["class"])
            for writer in quiesce["writers"]
        } != expected_topology:
            raise LifecycleError("original writer topology projection mismatch")

        def fwm_entry(
            writer: dict[str, Any], intended_running: bool, intended_policy: dict[str, Any]
        ) -> dict[str, Any]:
            return {
                "class": writer["class"],
                "id": writer["id"],
                "name": writer["name"],
                "project": writer["project"],
                "service": writer["service"],
                "config_files": writer["config_files"],
                "working_dir": writer["working_dir"],
                "image_id": writer["image_id"],
                "image_ref": writer["image_ref"],
                "healthcheck_present": writer["healthcheck_present"],
                "intended_running": intended_running,
                "intended_restart_policy": intended_policy,
                "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
            }

        inventory: dict[str, Any] = {
            "production_prior": [
                fwm_entry(writer, bool(writer["prior_running"]), writer["prior_restart_policy"])
                for writer in production
            ],
            "production_held": [
                fwm_entry(writer, False, {"name": "no", "maximum_retry_count": 0})
                for writer in production
            ],
            "development_prior": [
                fwm_entry(writer, bool(writer["prior_running"]), writer["prior_restart_policy"])
                for writer in development
            ],
            "targets": None,
        }
        if include_targets:
            run_id = str(uuid.UUID(self.request["run_id"]))
            targets = []
            for service in ("api", "web", "worker", "worker-stage6", "worker-stage7"):
                source = next(
                    (writer for writer in production if writer["service"] == service), None
                )
                if source is None:
                    raise LifecycleError("target derivation lacks a production writer")
                image_digest = sha256(
                    f"q12:fixture-target-image:{run_id}:{service}".encode("utf-8")
                )
                targets.append(
                    {
                        "class": source["class"],
                        "id": sha256(f"q12:fixture-target:{run_id}:{service}".encode("utf-8")),
                        "name": f"megacampus-{service}-q12fixture",
                        # Blue/green cutover truth: new api/web targets take the
                        # opposite color of the active frontends; workers keep
                        # the uncolored project.
                        "project": target_project
                        if service in ("api", "web")
                        else source["project"],
                        "service": source["service"],
                        "config_files": source["config_files"],
                        "working_dir": source["working_dir"],
                        "image_id": f"sha256:{image_digest}",
                        "image_ref": f"q12fixture.invalid/megacampus-{service}@sha256:{image_digest}",
                        "healthcheck_present": source["healthcheck_present"],
                        "intended_running": True,
                        "intended_restart_policy": {
                            "name": "unless-stopped",
                            "maximum_retry_count": 0,
                        },
                        "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
                    }
                )
            inventory["targets"] = targets
        return inventory

    @staticmethod
    def sorted_writers(writers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(writers, key=lambda w: (w["project"], w["service"], w["id"]))

    def publish_final_writer_manifest(
        self,
        mode: str,
        inventory: dict[str, Any] | None,
        command: dict[str, Any],
        *,
        checkpoint_predecessor: dict[str, Any] | None = None,
        epoch: str = "cutover",
        capability_hash: str | None = None,
    ) -> dict[str, Any]:
        """Amendment section 6: mode-bound immutable final-writer manifests.

        With an inventory this publishes the normative eleven-key object
        (joined path). With inventory=None it retains the pre-existing
        isolated five-key fixture reduction, which knowingly shares the
        schema id; the eleven-key shape is asserted by joined positives only.
        """
        if mode not in ("forward", "rollback"):
            raise LifecycleError("final writer manifest mode mismatch")
        manifest_path = (
            self.run_root / f"final-writer-manifest-{mode}-{self.request['run_id']}.json"
        )
        if os.path.lexists(manifest_path):
            raise LifecycleError("final writer manifest already published for this mode")
        resume_id = f"writers.resume.{mode}"
        if checkpoint_predecessor is None:
            checkpoint_predecessor = self.journal[-1] if self.journal else None
        carried = (
            capability_hash
            if capability_hash is not None
            else (self.journal[-1]["capability_manifest_sha256"] if self.journal else ZERO)
        )
        intent = self.append(
            FWM_ROW_PHASES[resume_id],
            "intent",
            resume_id,
            command["command_sha256"],
            epoch,
            carried,
            publish_fixed_checkpoint=False,
        )
        if inventory is None:
            manifest_value: dict[str, Any] = {
                "schema_version": "megacampus.q12.final-writer-manifest/v1",
                "run_id": self.request["run_id"],
                "publication_intent_journal_entry_hash": intent["entry_hash"],
                "input_checkpoint_sha256": sha256(self.checkpoint_path.read_bytes()),
                "mode": mode,
            }
            manifest_mode = 0o600
        else:
            if mode == "forward":
                if inventory["targets"] is None:
                    raise LifecycleError("forward manifest requires target identities")
                # Targets lead the array in the frozen creation order
                # api, web, worker, worker-stage6, worker-stage7; the captured
                # originals follow in the deterministic project/service/id sort.
                final = inventory["targets"] + self.sorted_writers(
                    inventory["development_prior"]
                )
                held = self.sorted_writers(inventory["production_held"])
            else:
                final = self.sorted_writers(
                    inventory["production_prior"] + inventory["development_prior"]
                )
                # Held writers are never resumable: identity-identical to the
                # forward target entries, projected to stopped/no intent.
                held = [
                    {
                        **target,
                        "intended_running": False,
                        "intended_restart_policy": {
                            "name": "no",
                            "maximum_retry_count": 0,
                        },
                    }
                    for target in (inventory["targets"] or [])
                ]
            manifest_value = {
                "schema_version": "megacampus.q12.final-writer-manifest/v1",
                "run_id": self.request["run_id"],
                "mode": mode,
                "release_sha": self.request["release_sha"],
                "expected_catalog_sha256": self.request["expected_catalog_sha256"],
                "writer_quiesce_manifest_sha256": self.request["quiesce_manifest_sha256"],
                "publication_intent_journal_entry_hash": intent["entry_hash"],
                "input_checkpoint_sha256": sha256(self.checkpoint_path.read_bytes()),
                "lease_epoch": epoch,
                "final_writers": final,
                "held_writers": held,
            }
            manifest_mode = 0o400
        data = complete_object(manifest_value)
        immutable_publish(manifest_path, data, manifest_mode, self.trace)
        manifest_hash = sha256(manifest_path.read_bytes())
        return self.append(
            FWM_ROW_PHASES[resume_id],
            "accepted",
            resume_id,
            command["command_sha256"],
            epoch,
            carried,
            accepted_kind="final_writer_manifest",
            accepted_hash=manifest_hash,
            checkpoint_predecessor=checkpoint_predecessor,
        )

    def append_controller_milestone(
        self,
        manifest: dict[str, Any],
        phase: str,
        witness_command_id: str,
        values: dict[str, str],
    ) -> dict[str, Any]:
        """Amendment section 4 item 6: one Root milestone over a durable witness."""
        if MILESTONE_WITNESSES.get(phase) != witness_command_id:
            raise LifecycleError("controller milestone witness mismatch")
        witness_rows = [
            entry
            for entry in self.journal
            if entry["command_id"] == witness_command_id and entry["outcome"] == "completed"
        ]
        if not witness_rows:
            raise LifecycleError("controller milestone witness lifecycle is absent")
        command = resolved_command(manifest, witness_command_id, self.request, values)
        return self.append(
            phase,
            "completed",
            witness_command_id,
            command["command_sha256"],
            "cutover",
            witness_rows[-1]["capability_manifest_sha256"],
        )

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

    def retained_chain(
        self,
        operation: str,
        chain: dict[str, Any],
        command: dict[str, Any],
        *,
        from_current_head: bool = False,
    ) -> None:
        if from_current_head:
            self.append_retained_selector_from_current_head(operation, command)
        else:
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
        recovery_reissues = int(chain["recoveryReissues"])
        publication_orphans = int(chain["publicationWindowOrphans"])
        epochs = [root_epoch]
        digests = [digest]
        capability_objects = [capability]
        retirement_count = 0

        def publish_successor() -> None:
            nonlocal retirement_count
            next_number = 1 if epochs[-1] == "cutover" else int(epochs[-1].rsplit("-", 1)[1]) + 1
            epoch = f"cutover-recovery-{next_number}"
            recovery_copy = self.publish_copy(
                operation, epoch, self.checkpoint_path.read_bytes()
            )
            _, next_capability, next_digest = self.publish_capability(
                operation, epoch, command, recovery_copy, digests[-1]
            )
            epochs.append(epoch)
            digests.append(next_digest)
            capability_objects.append(next_capability)
            if chain["faultAfter"] == "successor-publication":
                raise LifecycleError("injected crash after successor publication")

        def retire_backlog() -> None:
            nonlocal retirement_count
            for epoch in epochs[:-1]:
                current = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
                if current.parent.name in ("issued", "claimed"):
                    self.move_capability(
                        operation, epoch, current.parent.name, "superseded"
                    )
                    self.trace.append("retire:predecessor")
                    retirement_count += 1
                    if chain["faultAfter"] == f"predecessor-retirement-{retirement_count}":
                        raise LifecycleError(
                            f"injected crash after predecessor retirement {retirement_count}"
                        )

        if recovery_reissues == 0 and publication_orphans == 0:
            outcome = "capability_issued" if root_epoch == "cutover" else "recovery_reacquired"
            self.append(TARGET_PHASES[operation], outcome, COMMANDS[operation], command["command_sha256"], root_epoch, digest)
        else:
            if root_epoch == "cutover":
                self.append(TARGET_PHASES[operation], "capability_issued", COMMANDS[operation], command["command_sha256"], root_epoch, digest)
            else:
                self.append(TARGET_PHASES[operation], "recovery_reacquired", COMMANDS[operation], command["command_sha256"], root_epoch, digest)

            # A reissue was real recovery authority before the following lease
            # loss, so each has its own recovery lifecycle row.
            for _ in range(recovery_reissues):
                publish_successor()
                retire_backlog()
                self.append(
                    TARGET_PHASES[operation],
                    "recovery_reacquired",
                    COMMANDS[operation],
                    command["command_sha256"],
                    epochs[-1],
                    digests[-1],
                )

            # Publication-window orphans are a consecutive unreferenced suffix.
            # The first later authority is one additional direct successor.
            for _ in range(publication_orphans):
                publish_successor()
            if publication_orphans:
                publish_successor()
                retire_backlog()
                self.append(
                    TARGET_PHASES[operation],
                    "recovery_reacquired",
                    COMMANDS[operation],
                    command["command_sha256"],
                    epochs[-1],
                    digests[-1],
                )
            root_epoch = epochs[-1]
            capability = capability_objects[-1]
            digest = digests[-1]
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

        lease_reacquired = self.lease_reacquired

        created_after_loss = False
        if not members:
            copy_epochs = sorted(
                (
                    key.split(":", 1)[1]
                    for key in self.retained
                    if key.startswith(f"{operation}:")
                ),
                key=epoch_order,
            )
            root_epoch = (
                "cutover-recovery-1"
                if lease_reacquired
                else (copy_epochs[-1] if copy_epochs else "cutover")
            )
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
            created_after_loss = lease_reacquired

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

        result_path = self.results.get(f"{operation}:{tip_epoch}")
        if result_path is not None:
            result = json.loads(
                validate_regular_file(pathlib.Path(result_path), mode=0o600)
            )
            current = pathlib.Path(self.capabilities[f"{operation}:{tip_epoch}"])
            self.finish(
                operation,
                tip_epoch,
                command,
                tip_digest,
                result,
                "move-no-row-reacquired" if lease_reacquired else "normal",
            )
            return

        if lease_reacquired and not created_after_loss:
            next_number = epoch_order(tip_epoch) + 1
            next_epoch = f"cutover-recovery-{next_number}"
            predecessor_checkpoint = validate_regular_file(
                self.checkpoint_path,
                mode=0o600,
                expected=self.checkpoint_bytes(self.journal[-1]),
            )
            recovery_copy = self.publish_copy(
                operation,
                next_epoch,
                predecessor_checkpoint,
            )
            _, _, successor_digest = self.publish_capability(
                operation,
                next_epoch,
                command,
                recovery_copy,
                tip_digest,
            )
            if chain.get("faultAfter") == "successor-publication":
                raise LifecycleError("injected crash after successor publication")
            retirement_count = 0
            for epoch in epochs:
                path = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
                if path.parent.name in ("issued", "claimed"):
                    self.move_capability(
                        operation, epoch, path.parent.name, "superseded"
                    )
                    self.trace.append("retire:predecessor")
                    self.reload_durable()
                    retirement_count += 1
                    if chain.get("faultAfter") == f"predecessor-retirement-{retirement_count}":
                        raise LifecycleError(
                            f"injected crash after predecessor retirement {retirement_count}"
                        )
            self.append(
                TARGET_PHASES[operation],
                "recovery_reacquired",
                COMMANDS[operation],
                command["command_sha256"],
                next_epoch,
                successor_digest,
            )
            tip_epoch = next_epoch
            tip_digest = successor_digest

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

    def materialize_frontier_precondition(
        self,
        frontier: dict[str, Any],
        manifest: dict[str, Any],
        *,
        from_current_head: bool = False,
    ) -> None:
        """Fixture scheduler: create a durable boundary, then classify only disk state."""
        operation = frontier["operation"]
        command = resolved_command(manifest, COMMANDS[operation], self.request)
        if from_current_head:
            self.append_retained_selector_from_current_head(operation, command)
        else:
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
                # The fixture schedules a real launcher stop.  Only the
                # delegated claim process may perform the move/claim row; Root
                # reloads and classifies the durable boundary afterward.
                self.delegate_claim(operation, tip_epoch)
                self.reload_durable()
                current = pathlib.Path(self.capabilities[f"{operation}:{tip_epoch}"])
                if current.parent.name != "claimed":
                    raise LifecycleError("frontier launcher boundary not durable")
                if form == "claimed-no-success":
                    claims = [
                        row
                        for row in self.journal
                        if row["outcome"] == "capability_claimed"
                        and row["capability_manifest_sha256"] == tip_digest
                    ]
                    if len(claims) != 1:
                        raise LifecycleError("frontier claim row cardinality mismatch")
                    carried = claims[0]["capability_manifest_sha256"]
        if frontier["activationCommitRace"] == "committed-before-r":
            raise LifecycleError("activation classification incident")
        if frontier["exactSuccessBeforeDisposition"]:
            if tip_digest is None:
                copy = self.publish_copy(operation, "cutover", selector_bytes)
                _, capability, tip_digest = self.publish_capability(operation, "cutover", command, copy, None)
                self.append(TARGET_PHASES[operation], "capability_issued", COMMANDS[operation], command["command_sha256"], "cutover", tip_digest)
            result_path = self.results.get(f"{operation}:{tip_epoch}")
            result = (
                json.loads(validate_regular_file(pathlib.Path(result_path), mode=0o600))
                if result_path is not None
                else self.delegate_claim(operation, tip_epoch)
            )
            if result is None:
                raise LifecycleError("exact success was not durably produced by launcher")
            self.finish(operation, tip_epoch, command, tip_digest, result, "move-no-row-reacquired")
            return
        self.reload_durable()
        self.dispose_durable_frontier(
            operation,
            command,
            activation_after_r=frontier["activationCommitRace"] == "committed-after-r",
        )

    def dispose_durable_frontier(
        self,
        operation: str,
        command: dict[str, Any],
        *,
        activation_after_r: bool,
    ) -> None:
        """Classify and dispose only the unique frontier reconstructed from disk."""
        if operation in self.completions:
            return
        f_capability = self.journal[-1]["capability_manifest_sha256"]
        members: list[tuple[int, str, str]] = []
        for key, raw_path in self.capabilities.items():
            member_operation, epoch = key.split(":", 1)
            if member_operation != operation:
                continue
            data = validate_regular_file(pathlib.Path(raw_path), mode=0o400)
            order = 0 if epoch == "cutover" else int(epoch.rsplit("-", 1)[1])
            members.append((order, epoch, sha256(data)))
        members.sort()
        tip_epoch = members[-1][1] if members else "cutover"
        tip_digest = members[-1][2] if members else None
        highest = 0
        for key in (*self.retained.keys(), *self.capabilities.keys()):
            member_operation, epoch = key.split(":", 1)
            if member_operation != operation:
                continue
            highest = max(
                highest,
                0 if epoch == "cutover" else int(epoch.rsplit("-", 1)[1]),
            )
        # This structural producer does not select product rollback.  Its R
        # epoch follows the durable frontier: multi-epoch evidence consumes the
        # next decision epoch; initial evidence remains cutover.  The scenario
        # lease label is never authority.
        decision_epoch = (
            f"cutover-recovery-{highest + 1}" if highest > 0 else "cutover"
        )
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
        if activation_after_r:
            raise LifecycleError("activation-after-R incident")
        for _, epoch, _ in members:
            current = pathlib.Path(self.capabilities[f"{operation}:{epoch}"])
            if current.parent.name in ("issued", "claimed"):
                self.move_capability(operation, epoch, current.parent.name, "superseded")
                self.trace.append("retire:predecessor")
        resume_command = resolved_command(
            load_manifest(), "writers.resume.rollback", self.request
        )
        self.publish_final_writer_manifest(
            "rollback",
            getattr(self, "joined_rollback_inventory", None),
            resume_command,
            checkpoint_predecessor=disposition,
            epoch=decision_epoch,
            capability_hash=f_capability,
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
            "canonicalLeaseFd9Validated": self.canonical_lease_fd_9_validated,
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
    capability_argument = pathlib.Path(arguments.capability)
    require_lexical_absolute(capability_argument)
    validate_regular_file(capability_argument, mode=0o400)
    if capability_argument.parent.name not in ("issued", "claimed"):
        raise LifecycleError("capability is not in issued/claimed state")
    run_root = capability_argument.parents[2]
    expected_run_root = pathlib.Path("/opt/megacampus/backups/q12") / arguments.run_id
    if run_root != expected_run_root:
        raise LifecycleError("capability run root mismatch")
    lease_identity = validate_canonical_lease_lock(run_root, 9)

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
        "rotation_required": last["rotation_required"],
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
        if validate_canonical_lease_lock(run_root, 9) != lease_identity:
            raise LifecycleError("canonical lease lock changed during claim")
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
    if validate_canonical_lease_lock(run_root, 9) != lease_identity:
        raise LifecycleError("canonical lease lock changed during child transition")
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
    if "rotation_required" in request and not isinstance(
        request["rotation_required"], bool
    ):
        raise LifecycleError("rotation_required must be boolean")


def default_joined_chain(operation: str) -> dict[str, Any]:
    return {
        "operation": operation,
        "rootEpoch": "cutover",
        "cutoverCopyBeforeRecoveryRoot": "absent",
        "recoveryReissues": 0,
        "publicationWindowOrphans": 0,
        "completionMode": "normal",
        "faultAfter": "none",
        "stopAfter": "completed",
        "installTransaction": "normal" if operation == "install" else "not-applicable",
    }


def run_joined_composer(request: dict[str, Any], executor: Executor) -> dict[str, Any]:
    """Amendment sections 5-6: the Root-owned closed joined-fixture composer.

    Every authority byte is produced through the production serializer,
    capability, object, and checkpoint primitives; the caller supplies only
    the closed profile and the W-owned quiesce manifest path.
    """
    profile = request.get("joined_profile")
    if profile not in ("forward", "rollback"):
        raise LifecycleError("joined profile mismatch")
    quiesce_path = pathlib.Path(request["quiesce_manifest_path"])
    require_lexical_absolute(quiesce_path)
    quiesce_bytes = validate_regular_file(quiesce_path, mode=0o400)
    if sha256(quiesce_bytes) != request["quiesce_manifest_sha256"]:
        raise LifecycleError("joined quiesce manifest digest mismatch")
    manifest = load_manifest()
    frontier = request.get("frontier")
    prefix = request.get("completed_prefix_length")
    if profile == "rollback":
        if prefix not in (1, 2, 3, 4):
            raise LifecycleError("rollback prefix must be 1..4")
        expected_next = {
            1: "verify-after-base",
            2: "verify-after-observability",
            3: "prepare-recovery",
            4: "activate",
        }[prefix]
        if frontier is not None:
            if frontier.get("operation") == "install":
                raise LifecycleError("install cannot be an abandoned frontier")
            if frontier.get("operation") != expected_next:
                raise LifecycleError("frontier is not the exact next operation")
    elif frontier is not None or prefix is not None:
        raise LifecycleError("forward profile accepts no prefix or frontier")
    # Amendment section 6 item 4: the sanctioned partial-durable-capture
    # crash-state profile is the only lever that widens rollback held beyond
    # the {0, 5} closed profiles, and only inside this exact validity window.
    partial_capture = request.get("partial_capture_target_count")
    if partial_capture is not None and (
        profile != "rollback"
        or prefix != 4
        or frontier is not None
        or isinstance(partial_capture, bool)
        or not isinstance(partial_capture, int)
        or not 1 <= partial_capture <= 5
    ):
        raise LifecycleError(
            "partial capture requires rollback prefix 4 without a frontier"
            " and a target count in 1..5"
        )
    values = derive_joined_fixture_values(request["run_id"], str(quiesce_path))
    engine = Engine(request, executor)
    if engine.journal:
        raise LifecycleError("joined composition requires a fresh run root")
    engine.current_quiesce_manifest_sha256 = ZERO
    run_id = str(uuid.UUID(request["run_id"]))
    chains = request.get("chains") or {}

    def d5(operation: str) -> None:
        command = resolved_command(manifest, COMMANDS[operation], request)
        chain = chains.get(operation) or default_joined_chain(operation)
        engine.retained_chain(operation, chain, command, from_current_head=True)

    def ordinary(command_id: str, **keywords: Any) -> dict[str, Any]:
        return engine.append_ordinary_lifecycle(manifest, command_id, values, **keywords)

    ordinary_heads: dict[str, str] = {}

    def record(entry: dict[str, Any]) -> None:
        ordinary_heads[entry["phase"]] = entry["entry_hash"]

    activation_frontier = profile == "rollback" and prefix == 4 and frontier is not None
    snapshot_step = sha256(f"q12:resource-step:snapshot:{run_id}".encode("utf-8"))
    targets_step = sha256(f"q12:resource-step:targets:{run_id}".encode("utf-8"))

    record(ordinary("operator.self-check"))
    d5("install")
    record(
        ordinary(
            "writers.quiesce",
            quiesce_object_sha256=request["quiesce_manifest_sha256"],
        )
    )
    include_targets = (
        profile == "forward" or activation_frontier or partial_capture is not None
    )
    inventory = engine.derive_root_writer_inventory(
        quiesce_bytes, include_targets=include_targets
    )

    def snapshot_backup_restore_base() -> None:
        engine.current_resource_manifest_sha256 = snapshot_step
        record(ordinary("pg.backup"))
        record(ordinary("pg.restore"))
        ordinary("migration.base.apply")

    def forward_tail_through_deploy_prepare() -> None:
        record(ordinary("source.forward"))
        ordinary("reindex.plan")
        ordinary("reindex.worker.create")
        record(ordinary("reindex.execute"))
        record(ordinary("reindex.verify"))
        ordinary("deploy.prepare", resource_step_before_completion=targets_step)

    def forward_tail_through_activation_ready() -> None:
        forward_tail_through_deploy_prepare()
        record(
            engine.publish_final_writer_manifest(
                "forward",
                inventory,
                resolved_command(manifest, "writers.resume.forward", request),
            )
        )
        record(ordinary("deploy.commit"))

    if profile == "forward":
        snapshot_backup_restore_base()
        d5("verify-after-base")
        ordinary("migration.observability.apply")
        d5("verify-after-observability")
        record(
            engine.append_controller_milestone(
                manifest, "migrations_applied", "migration.observability.apply", values
            )
        )
        d5("prepare-recovery")
        forward_tail_through_activation_ready()
        d5("activate")
    else:
        if prefix >= 2 or frontier is not None:
            snapshot_backup_restore_base()
        if prefix >= 2:
            d5("verify-after-base")
        if prefix >= 3 or (prefix == 2 and frontier is not None):
            ordinary("migration.observability.apply")
        if prefix >= 3:
            d5("verify-after-observability")
        if prefix == 4 or (prefix == 3 and frontier is not None):
            record(
                engine.append_controller_milestone(
                    manifest,
                    "migrations_applied",
                    "migration.observability.apply",
                    values,
                )
            )
        if prefix >= 4:
            d5("prepare-recovery")
        if activation_frontier:
            forward_tail_through_activation_ready()
        if frontier is not None:
            engine.joined_rollback_inventory = inventory
            engine.materialize_frontier_precondition(
                frontier, manifest, from_current_head=True
            )
        else:
            if partial_capture is not None:
                # Section 6 item 4: the run reached deploy.prepare, whose
                # durable one-at-a-time capture created exactly this
                # creation-order target prefix before the interruption.
                forward_tail_through_deploy_prepare()
                inventory["targets"] = inventory["targets"][:partial_capture]
            record(
                engine.publish_final_writer_manifest(
                    "rollback",
                    inventory,
                    resolved_command(manifest, "writers.resume.rollback", request),
                )
            )

    engine.reload_durable()
    output = engine.output()
    output["ordinaryHeadEntryHashes"] = ordinary_heads
    forward_path = engine.run_root / f"final-writer-manifest-forward-{request['run_id']}.json"
    rollback_path = engine.run_root / f"final-writer-manifest-rollback-{request['run_id']}.json"
    output["forwardFinalWriterManifestPath"] = (
        str(forward_path) if forward_path.exists() else None
    )
    output["rollbackFinalWriterManifestPath"] = (
        str(rollback_path) if rollback_path.exists() else None
    )
    return output


def run_supervisor(request: dict[str, Any], executor: Executor) -> dict[str, Any]:
    validate_request(request)
    manifest = load_manifest()
    lease_fd = int(request.get("lease_fd", 9))
    run_root = pathlib.Path(request["run_root"])
    session = _LEASE_SESSIONS.get(executor)
    new_session = session is None
    if session is not None:
        anchor_stat = os.fstat(session.anchor_fd)
        if (anchor_stat.st_dev, anchor_stat.st_ino) != (session.device, session.inode):
            raise LifecycleError("lease session anchor identity changed")
        os.dup2(session.anchor_fd, lease_fd, inheritable=True)
    canonical_identity = validate_canonical_lease_lock(run_root, lease_fd)
    if session is None:
        anchor_fd = os.dup(lease_fd)
        os.set_inheritable(anchor_fd, False)
        session = LeaseSession(
            canonical_identity[0],
            canonical_identity[1],
            anchor_fd,
            weakref.finalize(executor, os.close, anchor_fd),
        )
        _LEASE_SESSIONS[executor] = session
    elif canonical_identity != (session.device, session.inode):
        raise LifecycleError("lease session canonical identity changed")
    engine = Engine(request, executor, lease_reacquired=False)
    # Engine obtained the journal through its validated descriptor and parsed
    # its complete ancestry.  Only that durable view may classify a fresh
    # process-local session as a reacquisition.
    engine.lease_reacquired = new_session and bool(engine.journal)
    engine.canonical_lease_fd_9_validated = True
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
        engine.materialize_frontier_precondition(frontier, manifest)
    atomic_replace(engine.run_root / "trace.json", complete_object(engine.trace), 0o600)
    if validate_canonical_lease_lock(run_root, lease_fd) != canonical_identity:
        raise LifecycleError("canonical lease lock changed during supervisor transition")
    return engine.output()


# ===================================================================== #
# D6 activation-truth Root coordinator.
#
# D6 is a private child of the Root lifecycle supervisor: it adds no manifest
# command, no scheduled unit, no periodic job, no compose target, no shell
# command, and no operator argv.  Everything below drives the Root spawn
# boundary, pidfd/proc/OFD gates,
# the predecision -> optional durable R -> final transcript -> terminal seal
# authority graph, and the sole post-R D5 narrowing.  No live/remote action is
# taken here; the pinned-server capability observations (atomic
# POSIX_SPAWN_CLOSEFROM, real pidfd/ptrace/Yama policy) stay behind a separate
# authorized remote gate.
# ===================================================================== #

D6_PROBE_ARGV = (
    "/usr/bin/node",
    "/opt/megacampus/packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs",
    "inspect",
)
# Contract "Fixed retained commands and production process": Root supplies only a
# fixed PATH, LC_ALL=C.UTF-8, LANG=C.UTF-8, and a fixed non-writable HOME; no
# NODE_OPTIONS and no inherited environment.  The exact PATH/HOME bytes are a
# Root-side determination (the contract fixes only LC_ALL/LANG and the
# non-writable-HOME property).
D6_PROBE_ENV = {
    "PATH": "/usr/bin:/bin",
    "LC_ALL": "C.UTF-8",
    "LANG": "C.UTF-8",
    "HOME": "/var/empty",
}
# Root dup2's every already-validated source into these child descriptors.
D6_MAPPED_TARGET_FDS = (1, 2, 3, 4, 5, 6, 7, 9, 10, 11)
# Every mapped source except FD 9 is explicitly closed right after its dup2 (the
# contract's "close the source duplicate after each map"); the close-from below is
# the final sweep of any remaining runtime descriptor.  FD 8 is explicitly closed;
# FD 9 is the inherited canonical lease held at its own number and is never
# duplicated or closed.
D6_CLOSE_AFTER_MAP_FDS = (1, 2, 3, 4, 5, 6, 7, 10, 11)
D6_CLOSE_FROM_FLOOR = 12

D6_DB_URL_PATH = pathlib.Path("/opt/megacampus/secrets/supabase_db_url")
D6_CA_PATH = pathlib.Path("/opt/megacampus/secrets/prod-ca-2021.crt")
D6_DB_URL_MODES = frozenset((0o400, 0o600))
D6_CA_MODES = frozenset((0o644,))
D6_CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
D6_SECRET_OWNER = "claude-deploy"


def d6_closefrom_capability() -> bool:
    """Report local presence of the atomic POSIX_SPAWN_CLOSEFROM file action.

    The pinned server's atomic close-from semantics under descriptor pressure are a
    separate remote capability gate; this only reports the local constant exposure
    (Python 3.14 / glibc).  Absence is a hard engineering blocker: Root must never
    silently fall back to preexec_fn, a threaded fork child, a shell, an inherited
    broad pass_fds set, or a broker."""
    return hasattr(os, "POSIX_SPAWN_CLOSEFROM")


def d6_build_spawn_file_actions(sources: dict[int, int]) -> list[tuple]:
    """Ordered posix_spawn file actions for the D6 probe descriptor contract.

    ``sources`` maps every child target descriptor to the already-validated source
    descriptor Root holds.  Every mapped source except FD 9 (the inherited
    canonical lease, held at its own number) must sit at or above the close-from
    floor so the final close-from cannot strand it."""
    if set(sources) != set(D6_MAPPED_TARGET_FDS):
        raise LifecycleError(
            "D6 spawn descriptor map is not the exact FD 1-11 target set"
        )
    if not d6_closefrom_capability():
        raise LifecycleError(
            "D6 requires the atomic POSIX_SPAWN_CLOSEFROM file action; no fallback"
        )
    actions: list[tuple] = [
        (os.POSIX_SPAWN_OPEN, 0, os.fsencode("/dev/null"), os.O_RDONLY, 0)
    ]
    for target in D6_MAPPED_TARGET_FDS:
        source = sources[target]
        if target == 9:
            if source != 9:
                raise LifecycleError(
                    "D6 FD 9 must be the inherited canonical lease at its own number"
                )
            continue
        if source < D6_CLOSE_FROM_FLOOR:
            raise LifecycleError(
                f"D6 spawn source descriptor {source} for FD {target} is below the close-from line"
            )
        actions.append((os.POSIX_SPAWN_DUP2, source, target))
        if target in D6_CLOSE_AFTER_MAP_FDS:
            actions.append((os.POSIX_SPAWN_CLOSE, source))
    actions.append((os.POSIX_SPAWN_CLOSE, 8))
    actions.append((os.POSIX_SPAWN_CLOSEFROM, D6_CLOSE_FROM_FLOOR))
    return actions


def d6_posix_spawn(
    argv: list[str], env: dict[str, str], sources: dict[int, int]
) -> int:
    """Spawn one child under the exact D6 file-action boundary via posix_spawn."""
    file_actions = d6_build_spawn_file_actions(sources)
    return os.posix_spawn(argv[0], list(argv), env, file_actions=file_actions)


def d6_spawn_probe(sources: dict[int, int]) -> int:
    """Spawn the fixed production D6 probe argv/environment (Root supervisor use)."""
    return d6_posix_spawn(list(D6_PROBE_ARGV), dict(D6_PROBE_ENV), sources)


def d6_assert_secret_identity_stable(
    descriptor: int,
    before: list[int],
    path: pathlib.Path,
    *,
    mode_set: frozenset[int],
    owner_uid: int,
    owner_gid: int,
) -> None:
    """Re-prove the descriptor's owner/mode/type/device/inode after the bytes are read.

    ``before`` is the pre-read fstat tuple ``[uid, gid, mode, dev, ino]``.  A chmod,
    chown, type change, or inode swap between open and this check fails closed — the
    contract requires identity proof both before and after open/read."""
    after = os.fstat(descriptor)
    path_stat = os.stat(path, follow_symlinks=False)
    before_uid, before_gid, before_mode, before_dev, before_ino = before
    if (
        not stat_module.S_ISREG(after.st_mode)
        or after.st_uid != owner_uid
        or after.st_gid != owner_gid
        or stat_module.S_IMODE(after.st_mode) not in mode_set
        or after.st_nlink != 1
        or (after.st_uid, after.st_gid, after.st_mode, after.st_dev, after.st_ino)
        != (before_uid, before_gid, before_mode, before_dev, before_ino)
        or (after.st_dev, after.st_ino) != (path_stat.st_dev, path_stat.st_ino)
        or not stat_module.S_ISREG(path_stat.st_mode)
    ):
        raise LifecycleError(f"unsafe file identity changed after read: {path}")


def d6_validate_secret_source(
    path: pathlib.Path,
    *,
    mode_set: frozenset[int],
    owner_uid: int,
    owner_gid: int,
) -> tuple[int, int, int]:
    """Open one Root-held secret source O_RDONLY|O_NOFOLLOW|O_CLOEXEC and prove
    owner/mode/type/canonical-path plus device/inode identity before and after read.

    Returns ``(fd, dev, ino)``.  The caller maps the descriptor to FD 3 or FD 4 and,
    for FD 3, decodes the password without ever hashing or logging its bytes."""
    parent_fd = open_parent_directory(path)
    descriptor = -1
    try:
        descriptor = os.open(
            path.name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
            dir_fd=parent_fd,
        )
        before = os.fstat(descriptor)
        if (
            not stat_module.S_ISREG(before.st_mode)
            or before.st_uid != owner_uid
            or before.st_gid != owner_gid
            or stat_module.S_IMODE(before.st_mode) not in mode_set
            or before.st_nlink != 1
        ):
            raise LifecycleError(f"unsafe file identity: {path}")
        before_identity = [
            before.st_uid,
            before.st_gid,
            before.st_mode,
            before.st_dev,
            before.st_ino,
        ]
        # Read the bytes (FD 3 password decode / FD 4 CA read); FD 3 is never hashed.
        while os.read(descriptor, 1024 * 1024):
            pass
        d6_assert_secret_identity_stable(
            descriptor,
            before_identity,
            path,
            mode_set=mode_set,
            owner_uid=owner_uid,
            owner_gid=owner_gid,
        )
        # Rewind: the descriptor is mapped to the child's FD 3/FD 4, and a child
        # sequential read must see the full bytes, not the EOF left by the after-read
        # revalidation above.
        os.lseek(descriptor, 0, os.SEEK_SET)
        keep = descriptor
        descriptor = -1
        return keep, before.st_dev, before.st_ino
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        os.close(parent_fd)


# --------------------------------------------------------------------------- #
# Task 17 — pidfd / ptrace / proc / OFD capability gates.
#
# Each gate is mandatory: any failed capability blocks classification with no test
# override.  Local checks are read-only.  The pinned server's
# PTRACE_MODE_ATTACH_REALCREDS / Yama acceptance of pidfd_getfd stays behind the
# separately authorized remote observation gate.
# --------------------------------------------------------------------------- #

# pidfd_getfd is syscall 438 on the generic Linux syscall table (x86_64/aarch64).
D6_SYS_PIDFD_GETFD = 438


def d6_pidfd_open(pid: int) -> int:
    """Open a pidfd for the spawned probe immediately (identity anchor)."""
    return os.pidfd_open(pid)


def d6_pidfd_getfd(pidfd: int, target_fd: int) -> int:
    """Retrieve one descriptor from the target via pidfd_getfd (SYS 438).

    Acceptance on the pinned server depends on its PTRACE_MODE_ATTACH_REALCREDS /
    Yama policy — a remote capability gate.  Locally the parent may retrieve from
    its own child."""
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    result = libc.syscall(
        ctypes.c_long(D6_SYS_PIDFD_GETFD),
        ctypes.c_int(pidfd),
        ctypes.c_int(target_fd),
        ctypes.c_uint(0),
    )
    if result < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), f"pidfd_getfd fd {target_fd}")
    return int(result)


def d6_verify_fd9_ofd_contention(fd9: int, lock_path: pathlib.Path) -> bool:
    """Prove the retrieved child FD 9 is the canonical held-lock open-file description.

    The descriptor must be the exact regular 0600 lock file (device/inode identity),
    and the exclusive lock it inherited must still contend: a fresh open of the same
    path from a distinct open-file description cannot take LOCK_EX."""
    stat = os.fstat(fd9)
    path_stat = os.stat(lock_path, follow_symlinks=False)
    if (
        not stat_module.S_ISREG(stat.st_mode)
        or stat_module.S_IMODE(stat.st_mode) != 0o600
        or stat.st_nlink != 1
        or (stat.st_dev, stat.st_ino) != (path_stat.st_dev, path_stat.st_ino)
    ):
        raise LifecycleError("D6 FD 9 is not the canonical cutover.lock identity")
    probe_fd = os.open(lock_path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        fcntl.flock(probe_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    else:
        fcntl.flock(probe_fd, fcntl.LOCK_UN)
        return False
    finally:
        os.close(probe_fd)


def d6_proc_identity(pid: int) -> tuple[str, str, str]:
    """Return (/proc/<pid>/stat start-time, /proc/<pid>/exe target, boot-id)."""
    with open(f"/proc/{pid}/stat", "rb") as handle:
        raw = handle.read().decode("latin-1")
    # comm (field 2) is parenthesised and may contain spaces/parens; parse after
    # the final ')'.  Field 22 (start-time) is index 19 of the remaining fields.
    tail = raw[raw.rindex(")") + 2 :].split()
    start_time = tail[19]
    exe = os.readlink(f"/proc/{pid}/exe")
    with open("/proc/sys/kernel/random/boot_id", "rb") as handle:
        boot_id = handle.read().decode("ascii").strip()
    return start_time, exe, boot_id


def d6_assert_proc_continuity(pid: int, baseline: tuple[str, str, str]) -> None:
    """Fail closed when start-time / exe / boot-id drift from the spawn baseline."""
    current = d6_proc_identity(pid)
    if tuple(current) != tuple(baseline):
        raise LifecycleError("D6 probe process identity is not continuous")


# --------------------------------------------------------------------------- #
# Task 18 — predecision, optional durable R and terminal seal.
#
# Authority graph (acyclic): request -> predecision -> optional durable R/checkpoint
# -> final transcript -> terminal seal.  Only a validated terminal seal authorizes
# finish-forward or post-R Task 9 retirement.  A durable R without a valid terminal
# seal is incident-only.  Schema-version strings are a Root determination (the
# contract fixes the key sets, the outcome/action literals and the H/N rules).
# --------------------------------------------------------------------------- #

D6_PREDECISION_KEYS = (
    "schema_version",
    "run_id",
    "lease_epoch",
    "request_sha256",
    "classification",
    "action",
    "initial_database_projection_sha256",
    "bound_database_projection_sha256",
    "host_projection_sha256",
    "transcript_head_before_predecision_sha256",
    "predecessor_journal_entry_hash",
    "predecessor_checkpoint_sha256",
    "planned_r_journal_entry_hash",
    "planned_r_checkpoint_sha256",
    "previous_terminal_seal_sha256",
    "abandoned_predecision_sha256",
)
D6_TERMINAL_SEAL_KEYS = (
    "schema_version",
    "run_id",
    "lease_epoch",
    "outcome",
    "request_sha256",
    "predecision_sha256",
    "final_transcript_head_sha256",
    "initial_database_projection_sha256",
    "final_database_projection_sha256",
    "host_projection_sha256",
    "activation_evidence_state",
    "actual_r_journal_entry_hash",
    "actual_r_checkpoint_sha256",
    "probe_pidfd_identity_sha256",
    "fd9_identity_sha256",
    "spawn_capability_sha256",
    "prepared_quiesced_predecessor_sha256",
    "writer_quiesce_manifest_sha256",
    "barrier_receipt_sha256",
    "probe_receipt_sha256",
    "activation_result_sha256",
    "activation_process_projection_sha256",
    "process_manifest_sha256",
    "probe_exit_status",
    "transaction_end",
    "connection_closed",
)
D6_CLASSIFICATION_ACTION = {
    "precommit_rollback": "append_r_then_seal",
    "committed_finish_forward": "seal_finish_forward",
    "drift_incident": "abort_incident",
}
D6_OUTCOME = {
    "precommit_rollback": "precommit_rollback_sealed",
    "committed_finish_forward": "committed_finish_forward_sealed",
    "drift_incident": "drift_incident_sealed",
}
D6_EVIDENCE_STATES = {
    "precommit_rollback": ("prepared_guarded",),
    "committed_finish_forward": ("complete_receipt", "committed_receipt_pending"),
    "drift_incident": ("incident_observed",),
}
D6_TERMINAL_SEAL_AUTHORITY = {
    "precommit_rollback_sealed": "task9_retirement_rollback_preparation",
    "committed_finish_forward_sealed": "finish_forward",
    "drift_incident_sealed": "none",
}


def d6_build_predecision(fields: dict[str, Any]) -> dict[str, Any]:
    """Validate and return the exact 16-key predecision object.

    Predecision is atomically published/fsynced before optional R; it is never
    finish-forward, rollback, retirement, recovery, or operator authority by itself."""
    if set(fields) != set(D6_PREDECISION_KEYS):
        raise LifecycleError("D6 predecision key set mismatch")
    classification = fields["classification"]
    if classification not in D6_CLASSIFICATION_ACTION:
        raise LifecycleError(f"D6 unknown classification: {classification}")
    if fields["action"] != D6_CLASSIFICATION_ACTION[classification]:
        raise LifecycleError("D6 predecision classification/action pair mismatch")
    planned = (fields["planned_r_journal_entry_hash"], fields["planned_r_checkpoint_sha256"])
    if classification == "precommit_rollback":
        if any(value is None for value in planned):
            raise LifecycleError("D6 precommit predecision requires both planned R hashes")
    elif any(value is not None for value in planned):
        raise LifecycleError("D6 non-precommit predecision requires null planned R hashes")
    return {key: fields[key] for key in D6_PREDECISION_KEYS}


def d6_build_terminal_seal(
    fields: dict[str, Any], predecision: dict[str, Any]
) -> dict[str, Any]:
    """Validate and return the exact 26-key terminal seal, bound to its predecision.

    Published only after exact `closed`, clean probe exit, final transcript fsync and
    continuity verification; it binds probe_exit_status=0, transaction_end=
    read_only_commit, connection_closed=true, and equals the predecision classification
    and the host projection."""
    if set(fields) != set(D6_TERMINAL_SEAL_KEYS):
        raise LifecycleError("D6 terminal seal key set mismatch")
    classification = predecision["classification"]
    if fields["outcome"] != D6_OUTCOME[classification]:
        raise LifecycleError("D6 terminal seal outcome does not match predecision classification")
    if fields["activation_evidence_state"] not in D6_EVIDENCE_STATES[classification]:
        raise LifecycleError("D6 terminal seal evidence state illegal for classification")
    actual = (fields["actual_r_journal_entry_hash"], fields["actual_r_checkpoint_sha256"])
    planned = (
        predecision["planned_r_journal_entry_hash"],
        predecision["planned_r_checkpoint_sha256"],
    )
    if classification == "precommit_rollback":
        if any(value is None for value in actual):
            raise LifecycleError("D6 precommit seal actual R must be non-null")
        if actual != planned:
            raise LifecycleError("D6 precommit seal actual R must byte-equal predecision planned R")
    elif any(value is not None for value in actual):
        raise LifecycleError("D6 non-precommit seal actual R must be null")
    if fields["probe_exit_status"] != 0:
        raise LifecycleError("D6 terminal seal requires probe_exit_status 0")
    if fields["transaction_end"] != "read_only_commit":
        raise LifecycleError("D6 terminal seal requires transaction_end read_only_commit")
    if fields["connection_closed"] is not True:
        raise LifecycleError("D6 terminal seal requires connection_closed true")
    for key in (
        "run_id",
        "lease_epoch",
        "request_sha256",
        "host_projection_sha256",
        "initial_database_projection_sha256",
    ):
        if fields[key] != predecision[key]:
            raise LifecycleError(f"D6 terminal seal {key} disagrees with predecision")
    return {key: fields[key] for key in D6_TERMINAL_SEAL_KEYS}


def d6_predecision_sha256(predecision: dict[str, Any]) -> str:
    """The lowercase 64-hex SHA-256 over the canonical predecision object bytes."""
    return sha256(canonical(predecision))


def d6_verify_seal_binding(
    seal: dict[str, Any], predecision: dict[str, Any]
) -> str:
    """Reject a terminal seal whose predecision_sha256 does not hash its predecision.

    Invoked wherever a seal is validated against the predecision it claims (restart
    authority and chain selection), so a seal cannot smuggle in a mismatched
    predecision.  Returns the verified hash."""
    expected = d6_predecision_sha256(predecision)
    if seal["predecision_sha256"] != expected:
        raise LifecycleError(
            "D6 terminal seal predecision_sha256 does not bind its predecision"
        )
    return expected


def d6_terminal_seal_authority(seal: dict[str, Any]) -> str:
    """Return the sole authority a validated terminal seal confers."""
    outcome = seal["outcome"]
    if outcome not in D6_TERMINAL_SEAL_AUTHORITY:
        raise LifecycleError(f"D6 unknown terminal seal outcome: {outcome}")
    return D6_TERMINAL_SEAL_AUTHORITY[outcome]


def d6_authority_without_seal(predecision: dict[str, Any]) -> str:
    """A durable R with no valid terminal seal is incident-only; predecision alone
    never authorizes finish-forward, rollback, retirement, recovery, or activation."""
    if "classification" not in predecision:
        raise LifecycleError("D6 authority check requires a predecision object")
    return "incident_only"


def d6_publish_immutable_object(
    run_dir: pathlib.Path, name: str, epoch: str, obj: dict[str, Any], trace: list[str]
) -> pathlib.Path:
    """Atomically publish one immutable 0400 D6 object under the run-owned directory."""
    require_lexical_absolute(run_dir)
    path = run_dir / f"activation-truth-{name}-{epoch}.json"
    temp = run_dir / f"activation-truth-{name}-{epoch}.json.tmp"
    data = complete_object(obj)
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chmod(temp, 0o400)
    rename_noreplace(temp, path)
    fsync_directory(run_dir)
    trace.append(f"{name}:published")
    return path


def d6_append_transcript(
    run_dir: pathlib.Path, epoch: str, frame: dict[str, Any], trace: list[str]
) -> pathlib.Path:
    """Append one frame to the 0600 append-only transcript and fsync it."""
    require_lexical_absolute(run_dir)
    path = run_dir / f"activation-truth-transcript-{epoch}.jsonl"
    line = canonical(frame) + b"\n"
    descriptor = os.open(
        path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600
    )
    try:
        offset = 0
        while offset < len(line):
            offset += os.write(descriptor, line[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chmod(path, 0o600)
    trace.append("transcript:fsynced")
    return path


# --------------------------------------------------------------------------- #
# Task 19 — sole D5 post-R narrowing, precommit race closure, restart authority.
# --------------------------------------------------------------------------- #

# After R the D6 probe (the sole exception to the D5 stop) may only finish its
# already-started read-only protocol; Root may only extend its two D6 audit
# objects.  Everything else — spawn/exec, mutation-capable connections, journal
# rows, rollback/resource mutation, capabilities, receipts, final-writer state,
# new children/sessions — stays forbidden between R and complete retirement.
D6_POST_R_PROBE_ALLOWED = frozenset(
    (
        "emit_sealed",
        "receive_release",
        "read_only_commit",
        "close_connection",
        "emit_closed",
        "exit",
    )
)
D6_POST_R_ROOT_ALLOWED = frozenset(
    (
        "append_transcript",
        "fsync_transcript",
        "publish_terminal_seal",
        "fsync_terminal_seal",
        "prove_probe_exit",
        "close_pipes",
        "permit_task9_retirement",
    )
)
# The precommit race hold: the probe keeps full SHARE + FD9 across this exact Root
# ordering, so no W-bound activation path can pass its common incompatible lock.
D6_PRECOMMIT_RACE_ORDER = (
    "publish_predecision",
    "append_r",
    "fsync_r",
    "obtain_sealed",
    "release",
    "receive_closed",
    "observe_clean_exit",
    "fsync_transcript",
    "publish_terminal_seal",
)


def d6_post_r_allowed(actor: str, action: str) -> bool:
    """Whether ``action`` by ``actor`` is inside the sole post-R narrowing."""
    if actor == "probe":
        return action in D6_POST_R_PROBE_ALLOWED
    if actor == "root":
        return action in D6_POST_R_ROOT_ALLOWED
    raise LifecycleError(f"D6 unknown post-R actor: {actor}")


def d6_precommit_race_order() -> list[str]:
    """The exact ordered Root actions of the precommit race-closure interval."""
    return list(D6_PRECOMMIT_RACE_ORDER)


def d6_crash_authority(state: dict[str, Any]) -> str:
    """Map a recovered durable state to its sole authority, per the crash rules.

    - predecision, no R, continuous original transaction -> may continue;
    - predecision, no R, not continuous -> abandoned (bind only as
      abandoned_predecision_sha256, no reuse of classification/projections);
    - durable R, no valid terminal seal -> incident-only;
    - terminal seal, no R, committed, unique chain tip -> finish-forward only;
    - terminal seal with exact R -> Task 9 post-R retirement/rollback prep only;
    - incident terminal seal -> no mutation."""
    if state.get("has_terminal_seal"):
        outcome = state.get("seal_outcome")
        if outcome == "drift_incident_sealed":
            return "none"
        if outcome == "precommit_rollback_sealed":
            if not state.get("has_durable_r"):
                raise LifecycleError("D6 precommit seal without durable R is incident")
            return "task9_retirement_rollback_preparation"
        if outcome == "committed_finish_forward_sealed":
            if state.get("has_durable_r"):
                raise LifecycleError("D6 committed finish-forward seal must not carry durable R")
            if not state.get("unique_chain_tip"):
                raise LifecycleError("D6 committed finish-forward seal is not the unique chain tip")
            return "finish_forward"
        raise LifecycleError(f"D6 unknown terminal seal outcome: {outcome}")
    if state.get("has_durable_r"):
        return "incident_only"
    if state.get("has_predecision"):
        return "continue" if state.get("continuity") else "abandoned"
    return "none"


def d6_lease_ordinal(epoch: str) -> int:
    """Numeric lease order (`cutover`=0, `cutover-recovery-N`=N)."""
    if not EPOCH_RE.match(epoch):
        raise LifecycleError(f"D6 illegal lease epoch: {epoch}")
    if epoch == "cutover":
        return 0
    return int(epoch.rsplit("-", 1)[1])


def d6_select_restart_authority(
    epochs: list[dict[str, Any]], canonical_head: str
) -> dict[str, Any]:
    """Select the unique terminal-seal chain tip bound to the canonical head.

    Multiple tips, forked lineage, reused epochs, unbound/broken chains, or a stale
    head (no tip matching the current journal/checkpoint head) are all incidents."""
    seen: set[str] = set()
    for epoch in epochs:
        lease_epoch = epoch["lease_epoch"]
        d6_lease_ordinal(lease_epoch)
        if lease_epoch in seen:
            raise LifecycleError("D6 restart: reused lease epoch")
        seen.add(lease_epoch)
        if not epoch.get("chain_ok"):
            raise LifecycleError("D6 restart: unbound or broken hash chain")
    ordered = sorted(epochs, key=lambda item: d6_lease_ordinal(item["lease_epoch"]))
    seals = [item for item in ordered if item.get("terminal_seal")]
    lineage = [
        item["previous_terminal_seal"]
        for item in seals
        if item.get("previous_terminal_seal") is not None
    ]
    if len(lineage) != len(set(lineage)):
        raise LifecycleError("D6 restart: forked terminal seal lineage")
    tips = [
        item
        for item in seals
        if item.get("predecessor_head") == canonical_head
        or item.get("actual_r_head") == canonical_head
    ]
    if not tips:
        raise LifecycleError("D6 restart: stale head, no terminal seal tip matches canonical head")
    if len(tips) > 1:
        raise LifecycleError("D6 restart: multiple terminal seal tips")
    tip = tips[0]
    return {
        "lease_epoch": tip["lease_epoch"],
        "authority": d6_terminal_seal_authority({"outcome": tip["seal_outcome"]}),
    }


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
