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
import time
import unicodedata
import uuid
import weakref
from dataclasses import dataclass, field
from collections.abc import Callable
from typing import Any, Protocol

ZERO = "0" * 64
EPOCH_RE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*)$")
# W7a: the fresh pg.backup's published generation-dir basename (backup-supabase.sh generation-<ts>-<uuid>;
# restore-supabase-drill.sh's --generation guard). The <immutable-generation> authority must match it.
GENERATION_DIR_NAME_RE = re.compile(r"generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}")
# W7a real leg: the accepted source.forward coverage authority token. Owner-approved amendment
# 2026-07-25 — acceptance is file_catalog truth, so this is `catalog:<recovery-run-id>` (parsed by
# source-recovery-reindex-adapters.ts parseAcceptedCoverageAuthority) and NOT the retired
# organization:course:run document-evidence ledger triple: those ledgers are created empty by the C4
# migration and their zero-evidence cards are minted only by post-window Stage-4 runs (mc2-8m90f).
# The six recovered course scopes live in the sha-bound reviewed recovery manifest, not in argv.
COVERAGE_RUN_RE = re.compile(
    r"^catalog:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
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
# Design §6b (R8 post-activation amendment): the journaled post-activate cleanup segment.
# barrier.cleanup is NOT a manifest command (§6b.4 — never in OPERATIONS/COMMANDS/
# MANIFEST_COMMAND_IDS); its grammar authority is the frozen barrier's own tail validator
# (deploy/qdrant/q12-database-barrier.sh:507-553). All rows carry phase CLEANUP_PHASE.
CLEANUP_COMMAND_ID = "barrier.cleanup"
CLEANUP_PHASE = "guard_cleanup_complete"
DATABASE_BARRIER_RECEIPT_KIND = "database_barrier_receipt"


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
            accepted_kind
            in (
                "final_writer_manifest",
                "writer_quiesce_manifest",
                DATABASE_BARRIER_RECEIPT_KIND,
            )
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
    elif command_id == CLEANUP_COMMAND_ID:
        # Design §6b.1 / §6b.4 extension (a): the journaled post-activate cleanup lifecycle.
        # This branch mirrors the frozen barrier tail grammar (q12-database-barrier.sh:507-553):
        # every row carries phase guard_cleanup_complete; the intent row carries no capability
        # (capability_manifest_sha256 == 0×64) and no accepted object; the capability_issued/
        # recovery_reacquired/capability_claimed/capability_completed rows bind a real host
        # capability and carry no accepted object; the terminal accepted row binds the promoted
        # database_barrier_receipt digest. barrier.cleanup is NOT resolved through the manifest —
        # command_sha256 is the barrier-child-provided cleanup argv digest (non-zero).
        valid = phase == CLEANUP_PHASE and entry["command_sha256"] != ZERO
        if valid and outcome == "intent":
            valid = accepted_kind == "none" and entry["capability_manifest_sha256"] == ZERO
        elif valid and outcome in (
            "capability_issued",
            "recovery_reacquired",
            "capability_claimed",
            "capability_completed",
        ):
            valid = accepted_kind == "none" and entry["capability_manifest_sha256"] != ZERO
        elif valid and outcome == "accepted":
            valid = (
                accepted_kind == DATABASE_BARRIER_RECEIPT_KIND
                and isinstance(accepted_hash, str)
                and bool(re.fullmatch(r"[0-9a-f]{64}", accepted_hash))
                and entry["capability_manifest_sha256"] != ZERO
            )
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
        "<accepted-coverage-run>": f"catalog:{derived_uuid('q12-source-recovery')}",
        "<quiesce-manifest>": quiesce_manifest_path,
    }


class StagedValueResolver:
    """Design §W2 (co-design D2) — the production-path staged value source.

    On a real cutover run the single upfront ``derive_joined_fixture_values`` dict cannot work: the
    real ``<exported-id>`` is only known once the W3 snapshot coordinator opens (at pg.backup), the
    real ``<immutable-generation>`` only after pg.backup runs, and the recovery-manifest sha +
    coverage only after ``source.forward`` is accepted. This resolver holds the UPFRONT authorities
    at construction and gains the staged authorities through lifecycle callbacks as the window
    advances. It is a Mapping over the currently-resolved placeholders so it drops into
    ``resolved_command``'s ``values`` slot unchanged: ``dict(resolver)`` yields exactly what is ready,
    and a placeholder a command needs but that is not yet resolved stays ``<...>`` so
    ``resolved_command`` fails closed with "unresolved command placeholder". Resolve-once: a
    re-resolve with the same value is idempotent (deterministic recover re-drive), a different value
    fails closed as drift. The fixture path keeps ``derive_joined_fixture_values`` verbatim as the
    closed-composer parity oracle (D1); this resolver is only selected when ``request["production"]``
    is True."""

    def __init__(self, quiesce_manifest_path: str, recovery_run_id: str) -> None:
        self._resolved: dict[str, str] = {}
        # UPFRONT authorities (co-design §1.5): operator-supplied quiesce manifest path + the accepted
        # pre-window .13.4.1 source-recovery run id.
        self._set("<quiesce-manifest>", quiesce_manifest_path)
        self._set("<recovery-run-id>", recovery_run_id)

    def _set(self, placeholder: str, value: str) -> None:
        if placeholder not in SUBSTITUTION_PLACEHOLDERS:
            raise LifecycleError(f"staged resolver offered unknown placeholder: {placeholder}")
        if not isinstance(value, str) or not value:
            raise LifecycleError(f"staged value for {placeholder} is empty or non-string")
        existing = self._resolved.get(placeholder)
        if existing is not None and existing != value:
            raise LifecycleError(f"staged value re-resolution drift for {placeholder}")
        self._resolved[placeholder] = value

    def value(self, placeholder: str) -> str:
        try:
            return self._resolved[placeholder]
        except KeyError:
            raise LifecycleError(f"staged value not yet resolved: {placeholder}") from None

    def on_snapshot_open(self, exported_id: str) -> None:
        """W3/OQ5: the live ``pg_export_snapshot()`` id, held across pg.backup."""
        self._set("<exported-id>", exported_id)

    def on_pg_backup_done(self, immutable_generation: str) -> None:
        """The immutable generation dir the fresh pg.backup printed (restore-supabase-drill.sh:302-303)."""
        self._set("<immutable-generation>", immutable_generation)

    def on_source_forward_accepted(
        self, recovery_manifest_sha256: str, coverage_fingerprint: str, coverage_run: str
    ) -> None:
        """After ``source.forward`` is accepted: the recovery manifest sha + accepted coverage
        ``org:course:run`` from the recovery journal."""
        self._set("<accepted-recovery-manifest-sha256>", recovery_manifest_sha256)
        self._set("<accepted-coverage-fingerprint>", coverage_fingerprint)
        self._set("<accepted-coverage-run>", coverage_run)

    # Mapping protocol over the currently-resolved placeholders (dict(resolver) uses keys + getitem).
    def keys(self):
        return self._resolved.keys()

    def __getitem__(self, placeholder: str) -> str:
        return self.value(placeholder)

    def __iter__(self):
        return iter(dict(self._resolved))

    def __len__(self) -> int:
        return len(self._resolved)


def resolve_window_values(
    request: dict[str, Any],
    executor: Any,
    run_root: pathlib.Path,
    quiesce_manifest_path: str,
) -> tuple[Any, str, "subprocess.Popen[str] | None"]:
    """Select the forward-window value source (design §W2 co-design D1/D2).

    Fixture mode (default): the verbatim ``derive_joined_fixture_values`` upfront dict — the
    closed-composer parity oracle — with no snapshot coordinator. Production mode
    (``request["production"] is True``): a ``StagedValueResolver`` seeded with the UPFRONT
    authorities (quiesce manifest path + accepted ``recovery_run_id``) and the W3 window snapshot
    already opened — ``open_window_snapshot`` publishes ``baseline.json`` and yields the live
    ``<exported-id>``, fed into the resolver via ``on_snapshot_open``. Returns
    ``(values, exported_id, snapshot_coordinator)``; in production the caller MUST release the held
    coordinator (``executor.close_window_snapshot``) after pg.backup consumes the snapshot. The
    remaining staged authorities (``<immutable-generation>`` after pg.backup, the recovery-manifest
    sha + coverage after ``source.forward``) are resolved by their lifecycle callbacks as the real
    data-movement steps run (W5)."""
    if request.get("production") is True:
        recovery_run_id = request.get("recovery_run_id")
        if not recovery_run_id:
            raise LifecycleError("production live run requires an accepted request['recovery_run_id']")
        resolver = StagedValueResolver(quiesce_manifest_path, recovery_run_id)
        exported_id, _baseline_path, coordinator = executor.open_window_snapshot(request, run_root)
        resolver.on_snapshot_open(exported_id)
        return resolver, exported_id, coordinator
    values = derive_joined_fixture_values(request["run_id"], quiesce_manifest_path)
    return values, values["<exported-id>"], None


def staged_values_authority_path(run_root: pathlib.Path, run_id: str) -> pathlib.Path:
    """The single run-root authority for a production run's staged real values (co-design D3)."""
    return pathlib.Path(run_root) / f"staged-values-{run_id}.json"


def persist_staged_values(
    run_root: pathlib.Path, run_id: str, resolver: StagedValueResolver
) -> pathlib.Path:
    """Persist the resolver's currently-resolved staged values to the run-root authority file so a
    recover re-drive recomputes byte-identical ordinary ``command_sha256`` (co-design D3; D5J
    single-authority). Monotonic + resolve-once at rest: a rewrite may only ADD placeholders or
    repeat identical values; a changed value fails closed. Owner-only 0400."""
    path = staged_values_authority_path(run_root, run_id)
    current = dict(resolver)
    if path.exists():
        prior = json.loads(path.read_bytes())
        for key, value in prior.items():
            if current.get(key) != value:
                raise LifecycleError(f"staged-values authority drift for {key}")
        path.chmod(0o600)
        path.unlink()
    payload = complete_object(dict(sorted(current.items())))
    temporary = path.with_name(path.name + ".publishing")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        os.write(descriptor, payload)
    finally:
        os.close(descriptor)
    os.rename(temporary, path)
    return path


def load_staged_values(
    run_root: pathlib.Path, run_id: str, quiesce_manifest_path: str, recovery_run_id: str
) -> StagedValueResolver:
    """Reconstruct a ``StagedValueResolver`` from the persisted run-root authority (recover
    determinism). Fail closed when the authority is missing — never silently re-derive fixture values
    for a production recover. The upfront authorities are re-supplied and MUST match the stored ones
    (resolve-once at rest)."""
    path = staged_values_authority_path(run_root, run_id)
    if not path.exists():
        raise LifecycleError("staged-values authority missing for production recover")
    try:
        stored = json.loads(path.read_bytes())
    except (json.JSONDecodeError, ValueError) as error:
        raise LifecycleError("staged-values authority is not valid JSON") from error
    if not isinstance(stored, dict):
        raise LifecycleError("staged-values authority is not an object")
    resolver = StagedValueResolver(quiesce_manifest_path, recovery_run_id)
    for placeholder, value in stored.items():
        resolver._set(placeholder, value)
    return resolver


def resolve_pg_backup_generation(
    executor: Any,
    resolver: "StagedValueResolver",
    request: dict[str, Any],
    run_root: pathlib.Path,
) -> pathlib.Path:
    """W7a: the production drive-loop staged step AFTER pg.backup and BEFORE pg.restore (codesign §D2).

    pg.restore's manifest argv consumes ``<immutable-generation>`` — the absolute generation dir the
    fresh pg.backup published — which is only known once pg.backup has run, so with a live
    ``StagedValueResolver`` a production forward window would otherwise fail closed at ``pg.restore``
    ("unresolved command placeholder"). This reads that on-disk authority through the executor's
    isolable ``read_pg_backup_generation`` seam (a fake subclass overrides it for infra-free unit
    wiring; the real ``latest.json`` read is the MC2_Q12_REAL_PG17 / W7-gated leg), feeds
    ``resolver.on_pg_backup_done`` (resolve-once), and re-persists the run-root staged authority so a
    recover re-drive recomputes byte-identical ordinary ``command_sha256`` (§D3, single authority).
    Production path only — the fixture composer's upfront ``derive_joined_fixture_values`` dict already
    carries every placeholder, so this is never invoked there (parity-neutral)."""
    generation = executor.read_pg_backup_generation(request, run_root)
    resolver.on_pg_backup_done(generation)
    return persist_staged_values(run_root, request["run_id"], resolver)


def resolve_source_forward_acceptance(
    executor: Any,
    resolver: "StagedValueResolver",
    request: dict[str, Any],
    run_root: pathlib.Path,
) -> pathlib.Path:
    """W7a: the production drive-loop staged step AFTER source.forward and BEFORE reindex.plan
    (codesign §D2/§D3). reindex.plan's manifest argv consumes ``<accepted-recovery-manifest-sha256>``,
    ``<accepted-coverage-fingerprint>`` and ``<accepted-coverage-run>`` — the accepted source.forward
    binding, known only once the recovery run is accepted. This reads that authority through the
    executor's isolable ``read_source_forward_acceptance`` seam (a fake subclass overrides it for the
    infra-free unit wiring; the real read is the W5/W7-gated leg), feeds
    ``resolver.on_source_forward_accepted`` (resolve-once), and re-persists the run-root staged
    authority so a recover re-drive recomputes byte-identical ordinary ``command_sha256``. Production
    path only — parity-neutral (never called on the fixture composer path)."""
    recovery_manifest_sha256, coverage_fingerprint, coverage_run = (
        executor.read_source_forward_acceptance(request, run_root)
    )
    resolver.on_source_forward_accepted(
        recovery_manifest_sha256, coverage_fingerprint, coverage_run
    )
    return persist_staged_values(run_root, request["run_id"], resolver)


def accept_real_run(
    children_exit_codes: list[int],
    barrier_receipt: dict[str, Any],
    recovery_journal: dict[str, Any],
) -> None:
    """Design §W2 D4 (LOCKED, owner steer 2026-07-20) — the real-run acceptance oracle.

    A real cutover run is accepted iff ALL of:
      (1) every real child exited 0;
      (2) the barrier receipt v2 reached ``state == "guard_cleanup_complete"`` (state machine
          intact — the same terminal the owner-custody resume gate validates); AND
      (3) coverage evidence is present in the recovery journal as an ``org:course:run`` triple
          (three non-empty ``:``-separated tokens).
    Byte-parity does NOT gate a real run — the fixture parity suite stays the mechanics oracle,
    checked separately. Fail closed with a distinct named reason per condition."""
    nonzero = [code for code in children_exit_codes if code != 0]
    if nonzero:
        raise LifecycleError(f"real run rejected: child(ren) exited non-zero {nonzero}")
    if not isinstance(barrier_receipt, dict) or barrier_receipt.get("state") != "guard_cleanup_complete":
        raise LifecycleError(
            "real run rejected: barrier receipt did not reach guard_cleanup_complete"
        )
    coverage = recovery_journal.get("coverage") if isinstance(recovery_journal, dict) else None
    parts = coverage.split(":") if isinstance(coverage, str) else []
    if len(parts) != 3 or not all(parts):
        raise LifecycleError(
            "real run rejected: coverage evidence (org:course:run) absent or malformed"
        )


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


class SourceConnectionConfig:
    """Shared source-connection helpers (design §W3 / co-design D5).

    The read-only source libpq/docker plumbing that both the plan executor
    (``LivePlanExecutor``) and the deployed window executor
    (``OwnerCustodyExecutor``) need so the OQ5 snapshot coordinator + OQ6
    baseline producer live ONCE (``SourceSnapshotSeam``) and both executors
    reach them. Pure helpers (no executor-specific state); the host class owns
    the ``docker``/``source_container``/``fault``/``repo_root``/``_source_service``
    attributes the seam reads."""

    def _base_env(self) -> dict[str, str]:
        return {
            "PATH": os.environ.get("PATH", "/usr/sbin:/usr/bin:/sbin:/bin"),
            "LC_ALL": "C",
            "LANG": "C",
        }

    def _source_service_env(self, request: dict[str, Any], workdir: pathlib.Path) -> dict[str, str]:
        """Production: a mode-0600 libpq service file so the source password never
        appears in argv/environment values (design §7)."""
        import urllib.parse

        raw = pathlib.Path(request["db_url_file"]).read_text(encoding="utf-8").strip()
        parsed = urllib.parse.urlparse(raw)
        if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.username:
            raise LifecycleError("plan source URI is malformed")
        password = urllib.parse.unquote(parsed.password or "")
        service_path = workdir / "libpq-service"
        descriptor = os.open(service_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            lines = [
                "[q12plan]",
                f"host={parsed.hostname}",
                f"port={parsed.port or 5432}",
                f"dbname={parsed.path.lstrip('/') or 'postgres'}",
                f"user={urllib.parse.unquote(parsed.username)}",
                f"password={password}",
                "sslmode=verify-full",
                f"sslrootcert={request['ca_file']}",
                "",
            ]
            os.write(descriptor, "\n".join(lines).encode("utf-8"))
        finally:
            os.close(descriptor)
        return {"PGSERVICEFILE": str(service_path), "PGSERVICE": "q12plan"}


class SourceSnapshotSeam:
    """OQ5 snapshot coordinator + OQ6 baseline producer, isolable behind one seam.

    Lifted verbatim from ``LivePlanExecutor`` so the deployed window executor
    (``OwnerCustodyExecutor``) can reach the same real primitives on the live
    cutover path. It reads its source connection from a ``config`` provider (the
    composing executor) at call time, so a test that mutates ``executor.docker`` /
    ``executor._source_service`` post-construction still drives the seam. The
    coordinator/baseline shells are the ONLY subprocess surface; the structural
    wiring above them (``OwnerCustodyExecutor.open_window_snapshot``) is unit-
    testable with this seam faked, and only the live legs are MC2_Q12_REAL_PG17-gated."""

    def __init__(self, config: "SourceConnectionConfig") -> None:
        self._cfg = config
        self._coordinator: subprocess.Popen[str] | None = None

    def open_snapshot(
        self, request: dict[str, Any], workdir: pathlib.Path
    ) -> tuple[subprocess.Popen[str], str]:
        """Open one REPEATABLE READ READ ONLY session on the source, export a
        snapshot, and keep the session open so the source capture, dump, and manifest
        all read the same instant (mirrors backup-supabase.sh:853-883). Fail closed
        on a dead coordinator or a malformed snapshot id."""
        if self._cfg.source_container:
            argv = [
                self._cfg.docker,
                "exec",
                "-i",
                self._cfg.source_container,
                "psql",
                "-X",
                "--no-psqlrc",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-tAq",
                "-v",
                "ON_ERROR_STOP=1",
            ]
            env = {**self._cfg._base_env(), "MC2_Q12_PLAN_DOCKER": self._cfg.docker}
        else:
            if self._cfg._source_service is None:
                self._cfg._source_service = self._cfg._source_service_env(request, workdir)
            binary = os.environ.get("MC2_Q12_PLAN_PSQL", "/usr/lib/postgresql/17/bin/psql")
            argv = [binary, "-X", "--no-psqlrc", "--no-password", "-tAq", "-v", "ON_ERROR_STOP=1"]
            env = {**self._cfg._base_env(), **self._cfg._source_service}
        proc = subprocess.Popen(
            argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True
        )
        self._coordinator = proc
        try:
            assert proc.stdin is not None and proc.stdout is not None
            proc.stdin.write(
                "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n"
            )
            proc.stdin.flush()
            import select

            # Bounded wait so a stalled source psql fails closed instead of blocking.
            ready, _, _ = select.select([proc.stdout], [], [], 30)
            if not ready:
                proc.kill()
                raise LifecycleError("snapshot coordinator did not export a snapshot within the timeout")
            snapshot = proc.stdout.readline().strip()
        except (BrokenPipeError, OSError) as error:
            # Never leak the source session on failure: reap the coordinator before failing closed.
            proc.kill()
            proc.wait()
            raise LifecycleError("snapshot coordinator died before exporting a snapshot") from error
        if self._cfg.fault == "snapshot":
            snapshot = "not-a-valid-snapshot"
        if proc.poll() is not None or not PLAN_SNAPSHOT_RE.fullmatch(snapshot):
            # A malformed/dead coordinator must not leave an open exporting session behind.
            proc.kill()
            proc.wait()
            raise LifecycleError("snapshot coordinator exported an invalid snapshot id")
        return proc, snapshot

    def close_snapshot(self, proc: subprocess.Popen[str] | None) -> None:
        if proc is None:
            return
        self._coordinator = None
        try:
            if proc.stdin is not None and not proc.stdin.closed:
                proc.stdin.write("COMMIT;\n\\q\n")
                proc.stdin.flush()
                proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        try:
            returncode = proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            raise LifecycleError("snapshot coordinator did not release the snapshot")
        if returncode != 0:
            raise LifecycleError("snapshot coordinator session failed")

    def produce_baseline(
        self, request: dict[str, Any], workdir: pathlib.Path, run_root: pathlib.Path
    ) -> pathlib.Path:
        """OQ6: publish the run-root pre-maintenance source baseline that pg.backup q12
        mode consumes (backup-supabase.sh:918-926). It is captured by reusing
        q12-source-manifest.ts `capture` verbatim (its own projection, which
        validateTransition later diffs the backup-time cutover against, :1258-1352) —
        with no --baseline it sets baseline == cutover == the capture (:1449) — through a
        held REPEATABLE READ snapshot from the shared coordinator. It MUST run before
        barrier.install, the maintenance edge that deactivates cron (:1513) and sets
        read-only (:1531/:1548), so the capture records cron active + writable.

        The manifest tool connects via libpq (PGSERVICE/PGSERVICEFILE + SET TRANSACTION
        SNAPSHOT, q12-source-manifest.ts:154), so the config _source_service must be the
        source libpq env; production derives it from the source DSN, a container test injects
        a loopback env. The exported snapshot is visible cross-session, so the coordinator may
        use the docker-exec or the libpq path. The file is published immutably 0400."""
        tsx = self._cfg.repo_root / "packages/course-gen-platform/node_modules/.bin/tsx"
        if not os.access(str(tsx), os.X_OK):
            raise LifecycleError(f"tsx runner is unavailable: {tsx}")
        tool = self._cfg.repo_root / "deploy/postgres/q12-source-manifest.ts"
        if self._cfg._source_service is None:
            self._cfg._source_service = self._cfg._source_service_env(request, workdir)
        coordinator, snapshot = self.open_snapshot(request, workdir)
        try:
            # The manifest tool connects to the source through its own hardcoded PostgreSQL 17
            # client over libpq (PGSERVICE/PGSERVICEFILE + SET TRANSACTION SNAPSHOT); production
            # supplies the source DSN, a real-PG17 test a loopback service file to a published
            # container port. The tool byte is left untouched.
            out = run_root / "source-manifest-baseline.json"
            completed = subprocess.run(
                [str(tsx), str(tool), "capture", "--snapshot", snapshot, "--output", str(out)],
                cwd=str(self._cfg.repo_root),
                env={**self._cfg._base_env(), **self._cfg._source_service, "TMPDIR": "/tmp"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if completed.returncode != 0:
                raise LifecycleError(
                    "source baseline capture failed: "
                    + completed.stderr.decode("utf-8", "replace").strip()
                )
            manifest = json.loads(out.read_bytes())
            baseline = manifest.get("baseline") if isinstance(manifest, dict) else None
            if not isinstance(baseline, dict):
                raise LifecycleError("source baseline capture produced no baseline object")
            out.unlink()
            baseline_path = run_root / "baseline.json"
            immutable_publish(baseline_path, complete_object(baseline), 0o400, [])
        finally:
            self.close_snapshot(coordinator)
        return baseline_path


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

    # Design §6b.1 R8-B-1 — the REAL post-activate FILE-ARTIFACT seam (the production twin of the
    # fixture's LiveOrdinaryExecutor.execute_barrier_cleanup file-artifact half). It mirrors the same
    # delegation discipline as execute()/launch_claim(): it never fabricates producer data — it
    # CONSUMES the barrier child's own on-disk artifacts (the 18-key terminal proof + the
    # prepare-recovery probe-receipt bootstrap) and binds their REAL digests, exactly as execute()
    # binds sha256(child stdout). The frozen q12-database-barrier.sh cleanup child that PRODUCES the
    # terminal proof against real PostgreSQL is downstream R8-B-2; this hook owns only the controller
    # file-artifact steps §6b.1/§6b.5 assign to it (v1 archive -> exact 10-key v2 -> db-capability
    # deletion). It does NOT provide execute_forward_resume: writers.resume.forward is the
    # server-side owner-custody child, deliberately absent here, so a production run stays
    # fail-closed at the pre-flight (require_post_activate_executor) with the resume-specific reason.

    def prepare_barrier_cleanup(self, context: dict[str, Any]) -> dict[str, Any]:
        """Resolve the frozen ``q12-database-barrier.sh cleanup`` command (argv + its own
        command_sha256), the same {argv, command_sha256} shape the fixture returns and
        orchestrate_post_activate_cleanup carries into the journaled cleanup rows (§6b.4)."""
        run_root = pathlib.Path(context["run_root"])
        argv = [
            str(pathlib.Path(__file__).with_name("q12-database-barrier.sh")),
            "cleanup",
            "--run-id",
            context["run_id"],
            "--db-url-file",
            "/opt/megacampus/secrets/supabase_db_url",
            "--ca-file",
            "/opt/megacampus/secrets/prod-ca-2021.crt",
            "--q12-db-capability-file",
            str(run_root / "secrets" / "db-capability"),
            "--expected-post-migration-catalog",
            str(run_root / "expected-post-migration-catalog.json"),
            "--expected-post-migration-catalog-sha256",
            context["expected_catalog_sha256"],
        ]
        return {"argv": argv, "command_sha256": sha256(canonical(argv))}

    def execute_barrier_cleanup(
        self, context: dict[str, Any], command: dict[str, Any]
    ) -> dict[str, Any]:
        """Archive the activate v1 receipt, promote it in place to the exact 10-key
        ``megacampus.q12.database-barrier-receipt/v2``, and delete the db-capability — binding the
        REAL on-disk terminal-proof + probe-receipt digests. Byte-for-byte the fixture's v2 for the
        same inputs (the real-DB path must NOT diverge from the fixture contract)."""
        run_root = pathlib.Path(context["run_root"])
        run_id = context["run_id"]
        expected_catalog_sha256 = context["expected_catalog_sha256"]
        # Consume the barrier child's producer artifacts (NEVER fabricate): the 18-key terminal
        # proof it published, and the prepare-recovery probe-receipt bootstrap the barrier
        # re-validates (q12-database-barrier.sh:235) and the forward resume gate re-reads
        # (q12-writer-resume.py:1105). validate_regular_file enforces the producer-owned 0400
        # identity before hashing.
        terminal_proof_path = run_root / "database-barrier-cleanup-terminal-proof.json"
        terminal_proof_sha256 = sha256(validate_regular_file(terminal_proof_path, mode=0o400))
        probe_receipt_path = run_root / "database-barrier-probe-receipt.json"
        probe_receipt_sha256 = sha256(validate_regular_file(probe_receipt_path, mode=0o400))
        # Archive the activate v1 receipt byte-exact at the frozen barrier's archive path
        # (q12-database-barrier.sh:640/644 requires the archive == the predecessor receipt), then
        # promote the receipt IN PLACE to the exact 10-key v2 the forward resume gate demands
        # key-for-key (q12-writer-resume.py:1090-1101).
        receipt_path = run_root / "database-barrier-receipt.json"
        v1_receipt_bytes = validate_regular_file(receipt_path, mode=0o400)
        archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
        immutable_publish(archive_path, v1_receipt_bytes, 0o400, [])
        receipt_object = {
            "schema_version": "megacampus.q12.database-barrier-receipt/v2",
            "run_id": run_id,
            "state": "guard_cleanup_complete",
            "expected_catalog_sha256": expected_catalog_sha256,
            "zero_guard_residue": True,
            "last_command": "cleanup",
            "rollback_probes_verified": True,
            "probe_receipt_sha256": probe_receipt_sha256,
            "terminal_proof_sha256": terminal_proof_sha256,
            "database_capability_deleted": True,
        }
        receipt_body = complete_object(receipt_object)
        atomic_replace(receipt_path, receipt_body, 0o400)
        receipt_sha256 = sha256(receipt_body)
        # Delete the db-capability (the v2 receipt's database_capability_deleted=True authority):
        # validate the producer-owned 0400 identity, then unlink without following a link.
        capability_path = run_root / "secrets" / "db-capability"
        validate_regular_file(capability_path, mode=0o400)
        capability_parent = open_parent_directory(capability_path)
        try:
            os.unlink(capability_path.name, dir_fd=capability_parent)
            os.fsync(capability_parent)
        finally:
            os.close(capability_parent)
        return {
            "status": "guard_cleanup_complete",
            "ok": True,
            "cleanup_receipt_path": str(receipt_path),
            "cleanup_receipt_sha256": receipt_sha256,
            "cleanup_receipt_archive_path": str(archive_path),
            "probe_receipt_path": str(probe_receipt_path),
            "probe_receipt_sha256": probe_receipt_sha256,
            "terminal_proof_sha256": terminal_proof_sha256,
            "command_sha256": command["command_sha256"],
            "receipt": receipt_object,
        }


class OwnerCustodyExecutor(ProductionExecutor, SourceConnectionConfig):
    """Design §W1 — the deployed owner-custody executor for the live cutover window.

    Extends ``ProductionExecutor`` (inheriting the real ``execute``/``launch_claim`` and the real
    post-activate FILE-ARTIFACT seam ``prepare_barrier_cleanup``/``execute_barrier_cleanup``) with
    the missing RESUME half ``execute_forward_resume``: the server-side child that, once the barrier
    cleanup has promoted the exact 10-key ``database-barrier-receipt/v2``, fail-closed VALIDATES that
    v2 receipt and then drives the REAL writer-fleet resume under the inherited FD9 cutover lease.

    This is what ``main()`` wires for ``live``/``recover`` so a production run passes
    ``require_post_activate_executor`` and can actually unpause the writers after activation (a bare
    ``ProductionExecutor`` stays fail-closed there — the resume half is deliberately owner-custody).

    Design §W3: it ALSO composes the ``SourceSnapshotSeam`` so the window path can open the OQ5
    snapshot coordinator and publish the OQ6 ``baseline.json`` (``open_window_snapshot``) — the
    capability that previously lived only on ``LivePlanExecutor``. The source connection is read
    from the same ``MC2_Q12_PLAN_*`` seam-injection env in tests and the source DSN in production.
    """

    def __init__(self) -> None:
        self.repo_root = pathlib.Path(__file__).resolve().parents[2]
        self.docker = os.environ.get("MC2_Q12_PLAN_DOCKER") or "/usr/bin/docker"
        self.source_container = os.environ.get("MC2_Q12_PLAN_SOURCE_CONTAINER") or None
        self.fault = os.environ.get("MC2_Q12_PLAN_FAULT") or None
        self._source_service: dict[str, str] | None = None
        self._snapshot_seam = SourceSnapshotSeam(self)

    def execute_ordinary(
        self, command: dict[str, Any], capability: dict[str, Any]
    ) -> dict[str, Any]:
        """W7a: the deployed ordinary-execution seam (append_ordinary_lifecycle hook, :2494).

        Runs the fully-resolved REAL manifest argv (pg.backup / pg.restore / migration.* /
        source.forward / reindex.* / deploy.*) exactly as the barrier claim path shells a command —
        via the inherited ``ProductionExecutor.execute``: fail-closed on non-zero exit, ``env``/argv
        taken verbatim from the resolved command (real staged values on the production path per
        W2/W3). The returned RESULT_KEYS object binds
        ``capability_sha256 == sha256(complete_object(capability))`` so the caller's ``!= digest``
        gate (:2497) accepts it, and it is parity-neutral: written ONLY to the per-command side file,
        never the journal / checkpoint / capability digest.
        """
        return self.execute(command, capability)

    def read_pg_backup_generation(self, request: dict[str, Any], run_root: pathlib.Path) -> str:
        """W7a real leg (MC2_Q12_REAL_PG17 / W7-gated): the ``<immutable-generation>`` authority — the
        absolute generation dir the fresh pg.backup published, read from the backup-dir ``latest.json``
        pointer (backup-supabase.sh:743-762). ``run_root`` is unused here (the generation lands in the
        backup dir, not the run root) but keeps the seam signature uniform. A fake subclass overrides
        this method for the infra-free unit wiring test; here it reads the real on-disk pointer and
        returns the absolute generation path restore-supabase-drill.sh's ``--generation`` guard demands.
        Fail closed on a missing/malformed pointer."""
        del run_root
        backup_dir = pathlib.Path(
            os.environ.get("MC2_Q12_SUPABASE_BACKUP_DIR") or "/opt/megacampus/backups/supabase"
        )
        pointer = json.loads((backup_dir / "latest.json").read_bytes())
        generation = pointer.get("generation") if isinstance(pointer, dict) else None
        if not isinstance(generation, str) or not GENERATION_DIR_NAME_RE.fullmatch(generation):
            raise LifecycleError("pg.backup generation pointer is malformed")
        return str(backup_dir / generation)

    def read_source_forward_acceptance(
        self, request: dict[str, Any], run_root: pathlib.Path
    ) -> tuple[str, str, str]:
        """W7a real leg (deliberately W5/W7-gated) — the source.forward acceptance authority:
        ``(<accepted-recovery-manifest-sha256>, <accepted-coverage-fingerprint>, <accepted-coverage-run>)``.

        Unlike the pg.backup generation (a simple ``latest.json`` pointer), these three are a COMPUTED
        binding owned by the TS source-recovery acceptance authority
        (``tools/qdrant/source-recovery-reindex-adapters.ts``: canonical manifest sha256 +
        ``calculateAcceptedFailedCoverageFingerprint`` over the recovered file_catalog rows + the
        ``catalog:<recovery-run-id>`` authority token). That authority is owned by the TS
        source-recovery acceptance emit-entrypoint (``source-recovery-reindex-adapters.ts``
        ``computeSourceForwardAcceptance``, driven by ``emit-source-forward-acceptance.ts``): it
        COMPUTES the canonical manifest sha256 + the coverage fingerprint over the recovered
        file_catalog rows of all six reviewed course scopes and writes them, with the authority token,
        to ``<run_root>/source-forward-acceptance.json``
        (``source-recovery-run.sh --operation forward`` wiring). This seam READS that on-disk authority
        — it never recomputes the TS fingerprint in Python (no silent drift) — mirroring the
        ``read_pg_backup_generation`` pattern (parse + validate + fail-closed). The real VALUES are
        window-grade (a real reviewed recovery manifest + the recovered Supabase file_catalog rows), so the
        end-to-end leg is exercised at the W7 owner-gated window; the read + its fail-closed validation
        are unit-tested here with a synthetic authority. Tracked on mc2-1sns3."""
        del request
        authority = pathlib.Path(run_root) / "source-forward-acceptance.json"
        try:
            payload = json.loads(authority.read_bytes())
        except (OSError, ValueError) as exc:
            raise LifecycleError(
                "source.forward acceptance authority is missing or unreadable"
            ) from exc
        if not isinstance(payload, dict):
            raise LifecycleError("source.forward acceptance authority is malformed")
        manifest_sha256 = payload.get("recovery_manifest_sha256")
        coverage_fingerprint = payload.get("coverage_fingerprint")
        coverage_run = payload.get("coverage_run")
        hex64 = lambda value: isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value))
        if not hex64(manifest_sha256) or not hex64(coverage_fingerprint):
            raise LifecycleError("source.forward acceptance sha256 fields are malformed")
        if not isinstance(coverage_run, str) or not COVERAGE_RUN_RE.fullmatch(coverage_run):
            raise LifecycleError("source.forward acceptance coverage_run is malformed")
        return (manifest_sha256, coverage_fingerprint, coverage_run)

    def open_window_snapshot(
        self, request: dict[str, Any], run_root: pathlib.Path
    ) -> tuple[str, pathlib.Path, subprocess.Popen[str]]:
        """OQ5+OQ6 on the live cutover window path.

        Publish the pre-maintenance ``baseline.json`` (OQ6) that pg.backup q12 mode consumes, then
        open+HOLD one snapshot coordinator whose exported ``<exported-id>`` (OQ5) stays live for the
        caller to bind pg.backup against (``pg_export_snapshot()`` is only valid while the exporting
        session is open; backup-supabase.sh expects a LIVE id). Returns
        ``(exported_id, baseline_path, coordinator)``. The caller MUST release the held coordinator
        via ``close_window_snapshot`` once pg.backup has consumed the snapshot. ``open_snapshot``
        itself fails closed on a malformed/dead exported id (reaping the session first), so a refused
        open never leaks a source transaction. The live psql/tsx legs are MC2_Q12_REAL_PG17-gated;
        the structural wiring is unit-testable with the seam faked.

        The source-password libpq service file is written into an EPHEMERAL workdir (not the durable
        run_root): it only needs to exist while produce_baseline's tsx child and the coordinator psql
        connect, so it never persists at rest next to baseline.json / staged-values."""
        import shutil
        import tempfile

        run_root = pathlib.Path(run_root)
        workdir = pathlib.Path(tempfile.mkdtemp(prefix="q12-window-src-"))
        try:
            baseline_path = self._snapshot_seam.produce_baseline(request, workdir, run_root)
            coordinator, exported_id = self._snapshot_seam.open_snapshot(request, workdir)
        finally:
            # Both children have connected (libpq read the service file at connect); drop the
            # cleartext-password file and clear the cache so it never lives at rest in run_root.
            shutil.rmtree(workdir, ignore_errors=True)
            self._source_service = None
        return exported_id, baseline_path, coordinator

    def close_window_snapshot(self, coordinator: subprocess.Popen[str] | None) -> None:
        """Release the held window snapshot coordinator (COMMIT + close) after pg.backup consumes
        the exported snapshot. Idempotent for ``None``; fail-closed if the session will not release."""
        self._snapshot_seam.close_snapshot(coordinator)

    def execute_forward_resume(
        self, context: dict[str, Any], cleanup: dict[str, Any]
    ) -> dict[str, Any]:
        run_root = pathlib.Path(context["run_root"])
        run_id = context["run_id"]
        # Fail-closed validation, a full twin of q12-writer-resume.py's forward branch (:1088-1134):
        # the exact 10-key canonical v2 receipt, the probe-receipt hash binding, AND the nested
        # probe/residue projection (:1110-1134). run_live does NOT reimplement this gate — it lives
        # HERE, in the owner-custody child, so a tampered/non-terminal/semantically-dirty receipt
        # refuses BEFORE any writer-fleet resume is driven (design §4 fail-closed-before-drive). This
        # is a superset of the retained-barrier fixture's execute_forward_resume (:760-830), which
        # omits the projection predicate; the deployed resume path holds the full semantic gate.
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
            raise LifecycleError("database barrier receipt key set is not exact")
        if barrier_bytes != complete_object(barrier):
            raise LifecycleError("database barrier receipt is not canonical bytes")
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
            raise LifecycleError("database barrier receipt v2 is not exact terminal authority")
        if not (
            barrier["last_command"] == "cleanup"
            and barrier["rollback_probes_verified"] is True
            and hex64(barrier["probe_receipt_sha256"])
        ):
            raise LifecycleError("forward cleanup receipt is invalid")
        probe_path = run_root / "database-barrier-probe-receipt.json"
        probe_bytes = probe_path.read_bytes()
        if sha256(probe_bytes) != barrier["probe_receipt_sha256"]:
            raise LifecycleError("database barrier probe receipt hash mismatch")
        probe = json.loads(probe_bytes)
        if set(probe) != {
            "schema_version",
            "run_id",
            "expected_catalog_sha256",
            "completed_at",
            "probes",
            "residue",
        }:
            raise LifecycleError("database barrier probe receipt key set is not exact")
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
            raise LifecycleError("database barrier probe receipt binding is invalid")
        # Nested projection (q12-writer-resume.py:1110-1134): the clean rollback fingerprint every
        # probe reported and zero residue across every plane. A hash-consistent but semantically
        # dirty projection (e.g. residue rows > 0) must refuse here, before any resume is driven.
        if probe["probes"] != {
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
        } or probe["residue"] != {
            "guard_probe_rows": 0,
            "auth_rows": 0,
            "storage_metadata_rows": 0,
            "storage_object_bytes": 0,
            "cron_job_set_unchanged": True,
            "pg_net_queue_rows": 0,
            "external_requests": 0,
        }:
            raise LifecycleError("database barrier probe receipt nested projection is not exact")

        # Drive the REAL writer-fleet resume: the frozen manifest command writers.resume.forward
        # (source-recovery-run.sh --operation resume-writers-only --resume-mode forward --run-id
        # <run-id>) with its frozen env carrying Q12_EXTERNAL_QUIESCE_LEASE_FD=9. Only <run-id> is
        # substituted (the cutover run id); resolved_command still needs the other real request
        # inputs to compute the (unused-here) substitution table, so the resume context carries them.
        resume = resolved_command(
            load_manifest(),
            "writers.resume.forward",
            {
                "run_id": run_id,
                "expected_catalog_sha256": context["expected_catalog_sha256"],
                "release_sha": context["release_sha"],
            },
        )
        self._invoke_resume(resume["argv"], resume["env"])
        return {
            "status": "resumed",
            "ok": True,
            "validated_receipt_sha256": sha256(barrier_bytes),
        }

    def _invoke_resume(self, argv: list[str], env: dict[str, str]) -> None:
        """Shell the writer-fleet resume child under the inherited FD9 cutover lease (mirrors
        execute()/launch_claim() delegation discipline: fixed argv/env, closed fds except the lease,
        no stdin). Fail closed with the resume-specific reason on any nonzero exit."""
        completed = subprocess.run(
            argv,
            check=False,
            close_fds=True,
            pass_fds=(9,),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode != 0:
            raise LifecycleError(
                "writers.resume.forward child failed with status "
                f"{completed.returncode}: {completed.stderr.strip()}"
            )


def owner_custody_executor() -> OwnerCustodyExecutor:
    """The single construction site for the live-window owner-custody executor (used by main() for
    the live/recover controllers)."""
    return OwnerCustodyExecutor()


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
                # Design §6b.4 extension (b): the post-activate cleanup capability class. It is
                # keyed off the non-manifest barrier.cleanup command_id, OUTSIDE the OPERATIONS/
                # ORDINARY_COMMAND_IDS coupling, so reconstructing it never forces a manifest entry.
                cleanup_capability = (
                    operation is None and capability["command_id"] == CLEANUP_COMMAND_ID
                )
                if operation is None and not ordinary and not cleanup_capability:
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
                if ordinary:
                    key = f"ordinary:{capability['command_id']}:{epoch}"
                elif cleanup_capability:
                    key = f"cleanup:{epoch}"
                else:
                    key = f"{operation}:{epoch}"
                if key in seen_capabilities:
                    raise LifecycleError("capability present in multiple states")
                expected_name = f"{capability['command_id']}--{epoch}.json"
                if path.name != expected_name:
                    raise LifecycleError("capability filename mismatch")
                # The retained-barrier-capability-checkpoint copy binding is an OPERATIONS-barrier
                # concern (publish_copy); ordinary and cleanup capabilities carry no retained copy.
                if not ordinary and not cleanup_capability and (
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

    # Design §6b.1 / §6b.4 extension (c): the post-activate cleanup capability + a direct
    # Engine.append caller for the barrier.cleanup rows. append_ordinary_lifecycle /
    # retained_chain / append_controller_milestone all route through resolved_command
    # (manifest["commands"][command_id]) and KeyError on the non-manifest "barrier.cleanup";
    # retained_chain is keyed on OPERATIONS (which excludes cleanup). These callers feed
    # Engine.append the barrier-child-provided command authority directly — Engine.append stays
    # the one journaling primitive (§2 / §10 hold); no second resolver/journaling authority is
    # forked, and no manifest entry is created.
    def publish_cleanup_capability(
        self, command: dict[str, Any], checkpoint_hash: str
    ) -> tuple[pathlib.Path, dict[str, Any], str]:
        capability = {
            "schema_version": "megacampus.q12.host-command-capability/v1",
            "run_id": self.request["run_id"],
            "command_id": CLEANUP_COMMAND_ID,
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
        path = self.run_root / "capabilities" / "issued" / f"{CLEANUP_COMMAND_ID}--cutover.json"
        immutable_publish(path, data, 0o400, self.trace)
        digest = sha256(data)
        self.capabilities["cleanup:cutover"] = str(path)
        return path, capability, digest

    def move_cleanup_capability(self, source_state: str, target_state: str) -> pathlib.Path:
        source = (
            self.run_root
            / "capabilities"
            / source_state
            / f"{CLEANUP_COMMAND_ID}--cutover.json"
        )
        target = self.run_root / "capabilities" / target_state / source.name
        rename_noreplace(source, target)
        fsync_directory(source.parent)
        fsync_directory(target.parent)
        self.capabilities["cleanup:cutover"] = str(target)
        return target

    def append_cleanup_row(
        self,
        outcome: str,
        command_sha256: str,
        capability_hash: str,
        *,
        accepted_kind: str = "none",
        accepted_hash: str | None = None,
    ) -> dict[str, Any]:
        """Journal one guard_cleanup_complete / barrier.cleanup row through Engine.append.

        The frozen barrier tail grammar (q12-database-barrier.sh:507-553) authors these rows;
        Engine.append writes the caller-supplied command_id / command_sha256 with no manifest
        check (JOURNAL_KEYS carries no manifest constraint), so this caller never needs a
        manifest command. The epoch stays "cutover" for the base (no-recovery) lifecycle.
        """
        return self.append(
            CLEANUP_PHASE,
            outcome,
            CLEANUP_COMMAND_ID,
            command_sha256,
            "cutover",
            capability_hash,
            accepted_kind=accepted_kind,
            accepted_hash=accepted_hash,
        )

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
        _, capability, digest = self.publish_ordinary_capability(command_id, command, checkpoint_hash)
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
        # R4 Sub-round A (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
        # §3/§6.4): an injectable, parity-neutral ordinary-execution seam. When the caller's
        # executor exposes execute_ordinary, this delegates to it for a real child result;
        # otherwise (the closed composer's plain executor) it falls back to the original
        # hardcoded fixture projection VERBATIM. Either way the result is written ONLY to the
        # per-command side file below — it never feeds the journal, a capability digest, a
        # checkpoint, or an accepted_object_sha256 — so the journal stays a byte/order twin of
        # the composer oracle regardless of which branch runs.
        hook = getattr(self.executor, "execute_ordinary", None)
        if hook is not None:
            result = hook(command, capability)
            if result.get("capability_sha256") != digest:
                raise LifecycleError("ordinary executor result capability binding mismatch")
        else:
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
        path = self.run_root / "database-barrier-baseline.json"
        if os.path.lexists(path):
            # Found-defect #16: when a REAL database barrier ran the claim it already published
            # its own authoritative baseline (0400, full structural schema) to this path, and it
            # is load-bearing for activate/rollback restore. The controller's minimal predecessor
            # baseline is only ever WRITTEN here (never read by core), so it must NOT overwrite the
            # barrier artifact. Strict-accept the barrier-authoritative file, failing closed on
            # anything that is not THIS run's 0400 barrier baseline (a pre-planted 0600 leftover,
            # unparseable / non-canonical JSON, a foreign schema_version, or a foreign run_id).
            data = validate_regular_file(path, mode=0o400)
            try:
                accepted = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, ValueError) as error:
                raise LifecycleError(
                    f"unsafe install baseline: unparseable barrier baseline {path}"
                ) from error
            if not isinstance(accepted, dict) or complete_object(accepted) != data:
                raise LifecycleError(f"unsafe install baseline: non-canonical barrier baseline {path}")
            if accepted.get("schema_version") != "megacampus.q12.database-barrier-baseline/v1":
                raise LifecycleError(f"unsafe install baseline: foreign baseline schema {path}")
            if accepted.get("run_id") != self.request["run_id"]:
                raise LifecycleError(f"unsafe install baseline: foreign baseline run_id {path}")
            self.trace.append("install:baseline-strict-accept")
            return
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
            path,
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


def write_live_resource_manifest(
    engine: "Engine",
    stage: str,
    *,
    snapshot: str | None = None,
    targets: tuple[str, ...] = (),
) -> str:
    """Design OQ4: fsync a checkpoint-bound resource-manifest artifact and return its digest.

    The genesis stage is the documented empty-accepted manifest (no checkpoint exists before
    the first row); the snapshot/targets stages bind the current durable checkpoint. The
    digest becomes ``current_resource_manifest_sha256`` for its segment, so the value carried
    in the journal is a real fsynced artifact digest sourced from run inputs (never a fresh
    live lookup), exactly as amendment section 3 requires.
    """
    checkpoint_sha256 = (
        sha256(engine.checkpoint_path.read_bytes())
        if engine.checkpoint_path.exists()
        else None
    )
    manifest_object = {
        "schema_version": "megacampus.q12.resource-manifest/v1",
        "run_id": engine.request["run_id"],
        "stage": stage,
        "checkpoint_sha256": checkpoint_sha256,
        "snapshot": snapshot,
        "targets": list(targets),
    }
    body = complete_object(manifest_object)
    path = engine.run_root / f"resource-manifest-{stage}-{engine.request['run_id']}.json"
    immutable_publish(path, body, 0o400, engine.trace)
    return sha256(body)


def write_quiesce_window_marker(engine: "Engine") -> str:
    """Design note (2026-07-17-q12-quiesce-window-mode-note §57): write the caller-declared
    cutover-window marker the W-side ``q12-writer-resume.py`` ``window_is_cutover()`` consumes
    out-of-band, before ``writers.quiesce`` runs. It is NOT a journal row (parity-neutral): it
    is a side artifact carrying EXACTLY the three keys the consumer's exact() check requires
    (``schema_version``/``run_id``/``mode``), published 0400 with the same fsync/atomic
    discipline as every other run-root artifact. The controller is the only actor that knows the
    run is a join-era cutover, so it is the declarer.
    """
    marker_object = {
        "schema_version": "megacampus.q12.quiesce-window-mode/v1",
        "run_id": engine.request["run_id"],
        "mode": "cutover",
    }
    body = complete_object(marker_object)
    path = engine.run_root / "quiesce-window-mode.json"
    immutable_publish(path, body, 0o400, engine.trace)
    return str(path)


def orchestrate_post_activate_cleanup(
    engine: "Engine", request: dict[str, Any], run_id: str
) -> dict[str, Any] | None:
    """Design §6b (R8-A/R8-C, ratified 2026-07-18) — POST-ACTIVATE CLEANUP IS JOURNALED.

    RULING 1's "receipt-only, no journal row after activate" (§6a item 5 / R5-E) is REVERSED for
    the real path (§6a item 6): after ``barrier.activate`` (the 76th journal row) the controller
    JOURNALS the frozen barrier's ``guard_cleanup_complete`` capability lifecycle with
    ``command_id=barrier.cleanup`` (§6b.1), runs the frozen ``q12-database-barrier.sh cleanup``
    child FOR REAL against that journal, promotes the archived v1 receipt to the exact 10-key v2
    ``database-barrier-receipt/v2``, deletes the db capability, and binds the promoted digest in
    the terminal ``accepted`` row. The RESUME half stays receipt-only — ``writers.resume.forward``
    journals NO rows here — now FROZEN-FORCED by the barrier's tail-contiguity rule
    (q12-database-barrier.sh:511-513): any resume row after the cleanup block would break the
    barrier's own grammar.

    Base (no-recovery) 5-row lifecycle, all ``phase=guard_cleanup_complete``,
    ``command_id=barrier.cleanup`` (§6b.1):

      1. intent               (capability_manifest_sha256 = 0×64; no capability yet)
      2. capability_issued    (host-command-capability/v1 issued; digest bound)
      3. capability_claimed   (the CLAIMED BOUNDARY the barrier requires, :546-553)
         — the frozen barrier child runs HERE: validates the journal to the claimed boundary,
           performs the DB guard cleanup, publishes the 18-key terminal proof, and exits 0 —
      4. capability_completed (completed-capability renamed into completed/)
      5. accepted             (accepted_object_kind=database_barrier_receipt, binding sha256(v2))

    barrier.cleanup is NOT a manifest command (§6b.4): the rows are journaled through the direct
    Engine.append cleanup caller (extension c), never through resolved_command. The barrier
    scaffolding + real invocation + the v1 archive / v2 promotion / db-capability deletion file
    artifacts are produced by the executor seam (fixture-owned in tests, the real docker/PG17
    full-PG window is downstream R8-B); the controller owns the JOURNAL authority.

    When the executor lacks the post-activate hooks it degrades safely to ``None`` (the closed
    composer's plain executor, or an un-seeded production wiring) rather than fabricating an
    unbacked lifecycle; a PRODUCTION run fails closed with a named error (the writers would
    otherwise stay quiesced forever after an activated barrier).
    """
    prepare_hook = getattr(engine.executor, "prepare_barrier_cleanup", None)
    cleanup_hook = getattr(engine.executor, "execute_barrier_cleanup", None)
    resume_hook = getattr(engine.executor, "execute_forward_resume", None)
    if prepare_hook is None or cleanup_hook is None or resume_hook is None:
        if request.get("production") is True:
            raise LifecycleError(
                "post-activate cleanup/resume executor not wired (deferred to R8)"
            )
        return None
    # Design §6b.2 (R8-I-B): the post-activate segment is RESUMABLE. The durable head tells us how far
    # a prior (crashed) attempt reached; recover re-drives ONLY the missing rows, converging
    # idempotently. A fully-complete run recovered again (head == barrier.cleanup/accepted) is a no-op.
    head = engine.journal[-1]
    reached = head["outcome"] if head["command_id"] == CLEANUP_COMMAND_ID else None
    if reached == "accepted":
        return None
    _CLEANUP_ORDER = ("intent", "capability_issued", "capability_claimed", "capability_completed")

    def durable(outcome: str) -> bool:
        return reached is not None and _CLEANUP_ORDER.index(reached) >= _CLEANUP_ORDER.index(outcome)

    context = {
        "run_root": str(engine.run_root),
        "run_id": run_id,
        "expected_catalog_sha256": request["expected_catalog_sha256"],
        # release_sha lets the owner-custody resume hook resolve the frozen writers.resume.forward
        # manifest command (its substitution table needs the real request inputs); the FILE-ARTIFACT
        # cleanup hooks and the fixture resume twin ignore the extra key.
        "release_sha": request["release_sha"],
    }
    # The frozen cleanup invocation's own command authority (argv + sha256(canonical(argv))). The
    # rows carry this barrier-child-provided command_sha256, NOT a manifest-resolved one (§6b.4). On
    # a resume the durable cleanup rows already fixed command_sha256, so reuse the durable head's
    # value for the re-driven rows: all cleanup rows carry ONE consistent digest (the frozen barrier
    # does not bind command_sha256 to its argv, §6b.5); the fresh prepare digest still drives the
    # child's sandbox argv. A first (fresh) attempt uses the prepare-hook digest.
    command = prepare_hook(context)
    fresh_sha256 = command.get("command_sha256")
    if not isinstance(fresh_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", fresh_sha256):
        raise LifecycleError("post-activate cleanup command digest is not a sha256")
    command_sha256 = head["command_sha256"] if reached is not None else fresh_sha256
    capability_command = command if reached is None else {**command, "command_sha256": command_sha256}

    # Rows 1-3: intent -> capability_issued -> capability_claimed, bringing the journal head to the
    # guard_cleanup_complete/capability_claimed boundary the barrier demands (:546-553). On a resume,
    # already-durable rows are skipped and the immutable capability digest is reconstructed from the
    # durable capability object (blessed-excluded per-run value, but a stable file digest).
    if not durable("intent"):
        engine.append_cleanup_row("intent", command_sha256, ZERO)
    if durable("capability_issued"):
        digest = sha256(
            validate_regular_file(
                pathlib.Path(engine.capabilities["cleanup:cutover"]), mode=0o400
            )
        )
    else:
        checkpoint_hash = sha256(engine.checkpoint_path.read_bytes())
        _, _capability, digest = engine.publish_cleanup_capability(
            capability_command, checkpoint_hash
        )
        engine.append_cleanup_row("capability_issued", command_sha256, digest)
    if not durable("capability_claimed"):
        engine.move_cleanup_capability("issued", "claimed")
        engine.append_cleanup_row("capability_claimed", command_sha256, digest)

    # The frozen barrier cleanup child runs FOR REAL between claimed and completed: it validates the
    # journal to the claimed boundary, performs the DB guard cleanup, publishes the terminal proof,
    # and exits 0 WITHOUT writing any receipt. The seam then archives v1 ->
    # database-barrier-receipt-v1-before-cleanup.json (0400), promotes the receipt to the exact 10-key
    # v2, and deletes the db capability. If the completed row is ALREADY durable the child ran in the
    # crashed attempt (the child requires a claimed head and would reject a completed one), so the
    # on-disk v2 receipt is reused instead of re-running.
    if durable("capability_completed"):
        receipt_path = engine.run_root / "database-barrier-receipt.json"
        receipt_bytes = validate_regular_file(receipt_path, mode=0o400)
        receipt_sha256 = sha256(receipt_bytes)
        cleanup = {
            "status": "guard_cleanup_complete",
            "ok": True,
            "cleanup_receipt_path": str(receipt_path),
            "cleanup_receipt_sha256": receipt_sha256,
        }
    else:
        cleanup = cleanup_hook(context, command)
        receipt_sha256 = cleanup.get("cleanup_receipt_sha256")
        if not isinstance(receipt_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", receipt_sha256):
            raise LifecycleError("post-activate cleanup receipt digest is not a sha256")
        engine.move_cleanup_capability("claimed", "completed")
        engine.append_cleanup_row("capability_completed", command_sha256, digest)

    # Row 5: accepted (binding the promoted v2 receipt digest).
    engine.append_cleanup_row(
        "accepted",
        command_sha256,
        digest,
        accepted_kind=DATABASE_BARRIER_RECEIPT_KIND,
        accepted_hash=receipt_sha256,
    )

    # RESUME HALF — RECEIPT-ONLY (frozen-forced by the barrier tail-contiguity rule): the resume
    # child fail-closed VALIDATES the v2 receipt and unpauses the writers, journaling NOTHING.
    resume = resume_hook(context, cleanup)
    if resume.get("validated_receipt_sha256") != receipt_sha256:
        raise LifecycleError("post-activate resume validated a different cleanup receipt")

    # Fail closed unless the controller's OWN durable walk accepts the extended journal + the
    # reconstructed barrier.cleanup capability (extensions a + b): the produced journal must be a
    # valid durable chain, not just barrier-acceptable, so a later recover (R8-I-B) rehydrates it.
    engine.reload_durable()
    return {"cleanup": cleanup, "resume": resume}


def finalize_forward_output(
    engine: "Engine",
    request: dict[str, Any],
    resource_manifest_paths: dict[str, str],
    marker_path: str,
    *,
    run_id: str | None,
    post_activate: bool,
) -> dict[str, Any]:
    """Reload the durable journal and project the run_live output augmentation.

    Byte-for-byte the tail run_live has always produced (durable reload, then the three
    operator-visible run-root artifact paths). ``post_activate`` gates the RULING 1 receipt-only
    cleanup+resume orchestration: a full/resumed run to activate records it; a stopped run
    (``stop_after``) returns its partial output WITHOUT running post-activate.
    """
    engine.reload_durable()
    output = engine.output()
    output["resourceManifestPaths"] = resource_manifest_paths
    forward_path = engine.run_root / f"final-writer-manifest-forward-{request['run_id']}.json"
    output["forwardFinalWriterManifestPath"] = (
        str(forward_path) if forward_path.exists() else None
    )
    output["quiesceWindowMarkerPath"] = marker_path
    if post_activate:
        output["postActivate"] = orchestrate_post_activate_cleanup(engine, request, run_id)
    return output


# Design §6b.2 (R8-I-B, Option A): the LINEAR forward step sequence (amendment §5 groups 1-16 +
# the group-14 FWM), shared by run_live AND run_recover through drive_forward_sequence so a resumed
# run re-drives the EXACT rows an uninterrupted run would from any clean completed-group boundary.
# Every step id is either an ordinary command_id, a barrier operation, the migrations_applied
# milestone, or the "final-writer-manifest" FWM publication. Byte-parity is structural: both drivers
# emit these steps through the same ordinary()/d5() callers on the same Engine.
_FORWARD_STEP_ORDER = (
    "operator.self-check",          # group 1  genesis
    "install",                      # group 2  barrier
    "writers.quiesce",              # group 3
    "pg.backup",                    # groups 4-5 (snapshot resource-step folded in)
    "pg.restore",                   # group 6
    "migration.base.apply",         # group 6
    "verify-after-base",            # group 7  barrier
    "migration.observability.apply",# group 7
    "verify-after-observability",   # group 8  barrier
    "migrations_applied",           # group 9  controller milestone
    "prepare-recovery",             # group 10 barrier
    "source.forward",               # group 11
    "reindex.plan",                 # group 12
    "reindex.worker.create",        # group 12
    "reindex.execute",              # group 12
    "reindex.verify",               # group 13
    "deploy.prepare",               # group 13 (targets resource-step folded in)
    "final-writer-manifest",        # group 14 FWM
    "deploy.commit",                # group 15
    "activate",                     # group 16 barrier
)
# resume_from sentinel meaning "every forward step is already durable; drive ONLY the post-activate
# cleanup segment" (the barrier.activate/completed and barrier.cleanup recover heads, §6b.2 rows 5 & 8).
_POST_ACTIVATE_SENTINEL = "__post_activate__"
# stop_after checkpoint -> the step AFTER which run_live returns its PARTIAL output (no post-activate).
# The three original R5 checkpoints are byte-preserved; the two barrier-completed-head stops
# ("barrier.verify-after-base", "barrier.activate") are R8-I-B additions used to construct the
# barrier-completed recover heads whose convergence §6b.6 requires (behavior-preserving: absent =>
# the full 81-row window exactly as before).
_STOP_AFTER_STEP = {
    "writers.quiesce.pre": "install",
    "barrier.verify-after-base": "verify-after-base",
    "deploy.prepare": "deploy.prepare",
    "final-writer-manifest": "final-writer-manifest",
    "barrier.activate": "activate",
}
# Design §6b.2 (R8-I-B Option A): the generalized recover head-dispatch table. Each clean
# completed-group boundary head maps to the forward step drive_forward_sequence RESUMES from (the
# group AFTER that head); barrier.activate/completed maps to the _POST_ACTIVATE_SENTINEL (its "tail"
# is the journaled cleanup segment — rows 5). barrier.cleanup heads (any outcome, row 8) also map to
# the sentinel and converge the cleanup segment idempotently (handled separately since they key on
# command_id, not outcome). Every mapped resume converges byte/order-identical to an uninterrupted
# 81-row run (§6b.2 condition 3): the resumed rows come from the same ordinary()/d5()/cleanup callers.
_RECOVER_RESUME_FROM = {
    ("barrier.install", "completed"): "writers.quiesce",                        # head 1: group 2 -> 3
    ("barrier.verify-after-base", "completed"): "migration.observability.apply",# head 2: group 7 cont.
    ("barrier.verify-after-observability", "completed"): "migrations_applied",  # head 3: group 8 -> 9
    ("barrier.prepare-recovery", "completed"): "source.forward",                # head 4: group 10 -> 11
    ("barrier.activate", "completed"): _POST_ACTIVATE_SENTINEL,                 # head 5: group 16 -> cleanup
    ("deploy.prepare", "completed"): "final-writer-manifest",                   # head 6: C7 -> group 14
    ("writers.resume.forward", "accepted"): "deploy.commit",                    # head 7: group 14 -> 15
}


def drive_forward_sequence(
    engine: "Engine",
    request: dict[str, Any],
    manifest: dict[str, Any],
    values: dict[str, str],
    quiesce_bytes: bytes,
    run_id: str,
    resource_manifest_paths: dict[str, str],
    marker_path: str,
    exported_id: str,
    target_identities: tuple[str, ...],
    ordinary: Callable[..., dict[str, Any]],
    d5: Callable[[str], None],
    *,
    resume_from: str | None = None,
    stop_after: str | None = None,
    on_staged: Callable[[str], None] = lambda _step: None,
) -> dict[str, Any]:
    """Design §6b.2 (R8-I-B): the ONE resumable forward driver both run_live and run_recover share.

    Walks ``_FORWARD_STEP_ORDER`` (amendment §5 groups 1-16 + the group-14 FWM), then reloads the
    durable journal, augments the output, and runs the RULING R8-A journaled post-activate cleanup
    segment (via ``finalize_forward_output(post_activate=True)``).

    ``resume_from=None`` (run_live) drives the whole sequence from group 1; a step id (run_recover)
    RESUMES at that step, skipping every already-durable predecessor so the resumed rows are the
    exact byte/order twin an uninterrupted run would append from that boundary. ``resume_from ==
    _POST_ACTIVATE_SENTINEL`` skips ALL forward steps and drives only the post-activate cleanup
    segment (the barrier.activate/completed and barrier.cleanup recover heads).

    ``stop_after`` names a checkpoint (``_STOP_AFTER_STEP``) after which run_live stops cleanly and
    returns its PARTIAL output WITHOUT the post-activate segment. This is the crash/restart boundary
    machinery; recover never passes it (a recover always drives to convergence).
    """
    def finalize(post_activate: bool) -> dict[str, Any]:
        return finalize_forward_output(
            engine, request, resource_manifest_paths, marker_path,
            run_id=(run_id if post_activate else None), post_activate=post_activate,
        )

    if resume_from == _POST_ACTIVATE_SENTINEL:
        # Groups 1-16 already durable (barrier.activate/completed or a barrier.cleanup head): drive
        # only the post-activate cleanup segment, converging idempotently (§6b.2 rows 5 & 8).
        return finalize(True)

    def step_pg_backup() -> None:
        # OQ4 step 1: record the exported snapshot identity into a checkpoint-bound resource
        # manifest and step the hash BEFORE pg.backup/intent (composer parity: snapshot_step).
        snapshot_digest = write_live_resource_manifest(engine, "snapshot", snapshot=exported_id)
        engine.current_resource_manifest_sha256 = snapshot_digest
        ordinary("pg.backup")
        # W7a: staged threading — on the production path this reads the fresh generation authority and
        # advances the resolver's on_pg_backup_done so the next step (pg.restore) can resolve
        # <immutable-generation>. Fixture mode is a no-op (its upfront dict already carries it).
        on_staged("pg.backup")

    def step_deploy_prepare() -> None:
        # OQ4 step 2: record the five captured target identities and step the hash AT
        # deploy.prepare/completed via resource_step_before_completion (composer parity: targets_step).
        targets_digest = write_live_resource_manifest(
            engine, "targets", snapshot=exported_id, targets=target_identities
        )
        ordinary("deploy.prepare", resource_step_before_completion=targets_digest)

    def step_fwm() -> None:
        # Section 5 group 14: the forward final-writer manifest (FWM), a byte/order twin of
        # run_joined_composer's publish_final_writer_manifest("forward", ...) call.
        inventory = engine.derive_root_writer_inventory(quiesce_bytes, include_targets=True)
        engine.publish_final_writer_manifest(
            "forward",
            inventory,
            resolved_command(manifest, "writers.resume.forward", request),
        )

    actions: dict[str, Callable[[], Any]] = {
        "operator.self-check": lambda: ordinary("operator.self-check"),
        "install": lambda: d5("install"),
        "writers.quiesce": lambda: ordinary(
            "writers.quiesce", quiesce_object_sha256=request["quiesce_manifest_sha256"]
        ),
        "pg.backup": step_pg_backup,
        "pg.restore": lambda: ordinary("pg.restore"),
        "migration.base.apply": lambda: ordinary("migration.base.apply"),
        "verify-after-base": lambda: d5("verify-after-base"),
        "migration.observability.apply": lambda: ordinary("migration.observability.apply"),
        "verify-after-observability": lambda: d5("verify-after-observability"),
        "migrations_applied": lambda: engine.append_controller_milestone(
            manifest, "migrations_applied", "migration.observability.apply", values
        ),
        "prepare-recovery": lambda: d5("prepare-recovery"),
        "source.forward": lambda: (ordinary("source.forward"), on_staged("source.forward")),
        "reindex.plan": lambda: ordinary("reindex.plan"),
        "reindex.worker.create": lambda: ordinary("reindex.worker.create"),
        "reindex.execute": lambda: ordinary("reindex.execute"),
        "reindex.verify": lambda: ordinary("reindex.verify"),
        "deploy.prepare": step_deploy_prepare,
        "final-writer-manifest": step_fwm,
        "deploy.commit": lambda: ordinary("deploy.commit"),
        "activate": lambda: d5("activate"),
    }

    stop_step = _STOP_AFTER_STEP.get(stop_after)
    started = resume_from is None
    for step_id in _FORWARD_STEP_ORDER:
        if not started:
            if step_id == resume_from:
                started = True
            else:
                continue
        actions[step_id]()
        if stop_step == step_id:
            # A stopped run returns its partial output and does NOT run the post-activate segment.
            return finalize(False)
    return finalize(True)


def require_post_activate_executor(request: dict[str, Any], executor: Executor) -> None:
    """R5 Sub-round F PRE-FLIGHT gate (production only): refuse to START a forward cutover whose
    executor cannot run the post-activate cleanup + forward resume.

    The late gate in ``orchestrate_post_activate_cleanup`` fires only AFTER ``activate`` — the
    point of no return — which in production would journal all the way through activate and only
    THEN discover it cannot resume the writers, stranding an activated barrier with the writers
    still quiesced and post-activate unrun, at the worst possible moment. This pre-flight fires at
    the TOP of ``run_live``/``run_recover`` — BEFORE the genesis row, before Engine construction,
    before any run-root mutation — so a production run whose ``ProductionExecutor`` lacks the real
    docker/PG17 post-activate hooks (wired in round R8) never starts. The late gate stays as
    defense-in-depth (e.g. a future path where the hooks vanish mid-run). Non-production fixture
    runs are unaffected.

    Design §6b.1 R8-B-1: the two post-activate halves fail closed with DISTINCT named reasons. The
    FILE-ARTIFACT half (execute_barrier_cleanup) is now real on ProductionExecutor, so its absence
    is the generic "not wired" refusal (an un-seeded/legacy wiring). The RESUME half
    (execute_forward_resume) is the SERVER-SIDE owner-custody child (real docker writers, owner
    custody), deliberately absent from ProductionExecutor here — so once the file-artifact check
    passes, a production run still fails closed with the resume-SPECIFIC named refusal. Keeping this
    split in the pre-flight (the FIRST statement of run_live/run_recover) preserves the pre-flight-
    first rule: the resume gap is refused before any journal row / run-root mutation.
    """
    if request.get("production") is not True:
        return
    if getattr(executor, "execute_barrier_cleanup", None) is None:
        raise LifecycleError("post-activate cleanup/resume executor not wired (deferred to R8)")
    if getattr(executor, "execute_forward_resume", None) is None:
        raise LifecycleError(
            "writers.resume.forward requires the server-side owner-custody executor (not wired here)"
        )


def run_live(request: dict[str, Any], executor: Executor) -> dict[str, Any]:
    """Task-9 live cutover controller — the production twin of run_joined_composer.

    Drives the real forward window through the SAME Engine and serializer/capability/
    object/checkpoint primitives (amendment sections 7.6 and 10 parity duty; design
    docs/superpowers/specs/2026-07-17-q12-live-controller-design.md). Every ordinary
    lifecycle and every in-process barrier chain is emitted through the shared primitives in
    the amendment section 5 forward chronology, so the produced journal is a byte/order twin
    of run_joined_composer's forward journal on every shared binding — the closed composer
    remains the parity oracle and this controller forks no second authority.

    R3 journaled the forward window through amendment section 5 group 13
    (``deploy.prepare``/completed) — the design section 6a ruling-1 C7 planned-exit
    checkpoint (a stopAfter-style stop) — and owns the OQ4 resource-manifest authority: it
    fsyncs a real checkpoint-bound resource-manifest artifact and steps
    ``current_resource_manifest_sha256`` to its digest EXACTLY at the two witnesses
    (``pg.backup``/intent and ``deploy.prepare``/completed), replacing the composer's closed
    fixture step derivations. Substitution values still come from the seeded fixture
    derivations so every ``command_sha256`` matches the oracle.

    R5 Sub-round A (this revision) extends the journal one group further: amendment
    section 5 group 14, the forward final-writer manifest (FWM) — a byte/order twin of the
    composer's ``publish_final_writer_manifest("forward", inventory, ...)`` call. The FWM
    inventory stays the FIXTURE derivation (``derive_root_writer_inventory``, deterministic
    from run_id + quiesce bytes, amendment section 6 item 3) exactly like the composer; only
    the FWM object's root-independent fields (schema_version, run_id, mode, release_sha,
    expected_catalog_sha256, writer_quiesce_manifest_sha256, lease_epoch, final_writers,
    held_writers) are byte-parity fields. The two physical fields
    (publication_intent_journal_entry_hash, input_checkpoint_sha256) carry the journal's
    device+inode and are per-run-root, so the FWM accepted row's accepted_object_sha256
    (which hashes the whole file, physical fields included) joins the value-only exclusion
    set for that one row only. ``deploy.commit`` and ``activate`` remain later rounds.

    The production run-root coupling is enforced by Engine.__post_init__ (production=True ->
    /opt/megacampus/backups/q12/<run-id>; otherwise the /tmp fixture shape), so a production
    request against a non-production root fails closed there.
    """
    # R5-F PRE-FLIGHT: refuse a production run whose executor cannot run post-activate BEFORE any
    # journal row / run-root mutation, so it never journals through activate (the point of no
    # return) only to strand there. Defense-in-depth late gate stays in the post-activate seam.
    require_post_activate_executor(request, executor)
    manifest = load_manifest()
    engine = Engine(request, executor)
    if engine.journal:
        raise LifecycleError("live composition requires a fresh run root")
    quiesce_path = pathlib.Path(request["quiesce_manifest_path"])
    require_lexical_absolute(quiesce_path)
    quiesce_bytes = validate_regular_file(quiesce_path, mode=0o400)
    if sha256(quiesce_bytes) != request["quiesce_manifest_sha256"]:
        raise LifecycleError("live quiesce manifest digest mismatch")
    # W2 fork (co-design D1/D2): fixture mode returns the verbatim parity-oracle dict; production mode
    # returns a StagedValueResolver with the W3 window snapshot already opened (real <exported-id> +
    # baseline.json) and hands back the HELD coordinator to release after pg.backup.
    values, exported_id, snapshot_coordinator = resolve_window_values(
        request, executor, engine.run_root, str(quiesce_path)
    )
    # W2: in production the held W3 snapshot coordinator is released once the window drive returns
    # (pg.backup has consumed the snapshot by then); the finally guards EVERY path from acquisition
    # onward (persist, setup, drive, exceptions, stop_after early-return) so the exporting source
    # session never leaks. Fixture mode has no coordinator to release.
    try:
        if request.get("production") is True:
            # D3: persist the snapshot-stage staged values so a recover re-drive recomputes
            # byte-identical ordinary command_sha256. The later staged authorities
            # (<immutable-generation>, recovery + coverage) are persisted as their lifecycle
            # callbacks fire during the real window drive (W5).
            persist_staged_values(engine.run_root, request["run_id"], values)
        run_id = str(uuid.UUID(request["run_id"]))
        chains = request.get("chains") or {}

        def d5(operation: str) -> None:
            command = resolved_command(manifest, COMMANDS[operation], request)
            chain = chains.get(operation) or default_joined_chain(operation)
            engine.retained_chain(operation, chain, command, from_current_head=True)

        def ordinary(command_id: str, **keywords: Any) -> dict[str, Any]:
            return engine.append_ordinary_lifecycle(manifest, command_id, values, **keywords)

        def on_staged(step_id: str) -> None:
            # W7a (codesign §D2/§D3): production-only staged threading between real data-movement steps.
            # The fixture path keeps its verbatim upfront dict (no callbacks) — parity-neutral no-op here.
            if request.get("production") is not True:
                return
            if step_id == "pg.backup":
                resolve_pg_backup_generation(executor, values, request, engine.run_root)
            elif step_id == "source.forward":
                resolve_source_forward_acceptance(executor, values, request, engine.run_root)

        # R5 Sub-round D stop_after SEAM: an optional named checkpoint at which the forward run stops
        # cleanly and returns its partial output (a stopped run does NOT run post-activate). Absent =>
        # the full 81-row window (76 forward + 5 cleanup) exactly as before. The checkpoints are the
        # crash/restart boundaries run_recover resumes from (§6b.2):
        #   "writers.quiesce.pre"      -> stop after group 2 (barrier.install), BEFORE writers.quiesce
        #   "barrier.verify-after-base"-> stop after group 7's verify-after-base barrier (R8-I-B)
        #   "deploy.prepare"           -> stop at the C7 planned-exit head (deploy.prepare/completed)
        #   "final-writer-manifest"    -> stop after the group-14 FWM accepted row (crash-after-FWM)
        #   "barrier.activate"         -> stop after group 16 (barrier.activate), BEFORE cleanup (R8-I-B)
        stop_after = request.get("stop_after")
        if stop_after is not None and stop_after not in _STOP_AFTER_STEP:
            raise LifecycleError(f"unknown live stop_after checkpoint: {stop_after}")

        # OQ4 genesis: the empty-accepted resource manifest, fsynced before the first row. Its
        # digest is the request-global initial value, so the stable-binding walk's first/last pin
        # holds against a real controller-owned artifact (never the operator-supplied constant of
        # the 5-invocation window).
        engine.current_quiesce_manifest_sha256 = ZERO
        resource_manifest_paths = {
            stage: str(engine.run_root / f"resource-manifest-{stage}-{request['run_id']}.json")
            for stage in ("genesis", "snapshot", "targets")
        }
        genesis_digest = write_live_resource_manifest(engine, "genesis")
        request["resource_manifest_sha256"] = genesis_digest
        engine.current_resource_manifest_sha256 = genesis_digest

        # OQ4 targets identities: the five captured target identities are real deploy.prepare
        # evidence in production; seeded here (excluded VALUE-only from parity) so the artifact is
        # recomputable and the step topology is provable.
        target_identities = tuple(
            sha256(f"q12:resource-target:{index}:{run_id}".encode("utf-8")) for index in range(5)
        )

        # Caller-declared cutover-window marker (design note §57): written BEFORE the group-3
        # writers.quiesce command so the W-side run_quiesce/resume-forward gate opens the cutover
        # window. Out-of-band side artifact, never a journal row (parity-neutral).
        marker_path = write_quiesce_window_marker(engine)

        # Section 5 forward chronology groups 1-16 + the group-14 FWM + durable reload + output
        # augmentation + RULING R8-A journaled post-activate cleanup segment, all through the ONE
        # resumable driver run_recover also uses (§6b.2). resume_from=None => drive from group 1.
        return drive_forward_sequence(
            engine,
            request,
            manifest,
            values,
            quiesce_bytes,
            run_id,
            resource_manifest_paths,
            marker_path,
            exported_id,
            target_identities,
            ordinary,
            d5,
            resume_from=None,
            stop_after=stop_after,
            on_staged=on_staged,
        )
    finally:
        if snapshot_coordinator is not None:
            executor.close_window_snapshot(snapshot_coordinator)


def run_recover(request: dict[str, Any], executor: Executor) -> dict[str, Any]:
    """R5 Sub-round D — the RECOVER controller (orchestrator RULING 2, non-negotiable).

    run_recover resumes an INTERRUPTED forward cutover from an EXISTING run root: unlike run_live
    (which requires a fresh run root) it requires a NON-EMPTY durable journal, rehydrates it
    through the same Engine, and re-drives the remaining forward tail so the completed journal is
    the SAME byte/order twin of the composer's 76 rows an uninterrupted forward run would have
    produced on that root (plus the RULING 1 post-activate cleanup+resume).

    RULING 2 fixes the SUPPORTED resume set to exactly two clean checkpoints and makes every
    other head a NAMED fail-closed refusal — never a heuristic/best-effort continuation:

      * head == deploy.prepare/completed (the C7 planned-exit checkpoint)
            -> continue the forward tail FROM group 14 (FWM) via drive_forward_tail.
      * head == writers.resume.forward/accepted (the crash-after-FWM restart)
            -> continue FROM group 15 (deploy.commit) via drive_forward_tail(include_fwm=False).
      * ANY other durable head (including a mid-barrier partial that has not reached its clean
        completed boundary — those route through the existing run_supervisor/resume_retained_chain
        machinery, not run_recover) -> raise a NAMED LifecycleError naming phase/outcome/command.

    Crash-anywhere idempotence is probed further at R8; an unsupported-but-real head surfacing
    later is a normal finding, not a scope breach.
    """
    # R5-F PRE-FLIGHT (same exposure as run_live): recover from the C7 head drives the tail through
    # activate then post-activate, so a production recover whose executor cannot run post-activate
    # must fail closed BEFORE touching the run root, not after re-activating.
    require_post_activate_executor(request, executor)
    manifest = load_manifest()
    run_root = pathlib.Path(request["run_root"])
    require_lexical_absolute(run_root)

    # Fail closed on an absent/empty durable journal BEFORE constructing the Engine (the opposite
    # of run_live's fresh-root guard): recover has nothing to resume without durable rows.
    journal_path = run_root / "phase.jsonl"
    if not journal_path.exists():
        raise LifecycleError("recover requires a non-empty durable journal")
    journal_bytes = validate_regular_file(journal_path, mode=0o600)
    lines = journal_bytes.splitlines()
    if not lines:
        raise LifecycleError("recover requires a non-empty durable journal")

    # Restore the request-global resource-manifest pin from durable truth (like run_claim), so the
    # Engine's stable-binding walk anchors row-0/row-last to the journal's own stepped domain rather
    # than the fixture placeholder. Design §6b.2: pin to the GENESIS row's value (entries[0]) rather
    # than the durable TAIL. entries[0] is ALWAYS the request-global value an uninterrupted run_live
    # carries throughout (run_live sets request["resource_manifest_sha256"] = genesis_digest and
    # never re-pins it), so it is a legal walk anchor both for the partial durable journal at
    # construction (== entries[0]) AND for the FULL journal after a resume completes (still ==
    # entries[0]), even when the resume head sits in the mid-window snapshot segment (whose value
    # equals neither entries[0] nor entries[-1] of the completed run).
    genesis_row = json.loads(lines[0])
    request["resource_manifest_sha256"] = genesis_row["resource_manifest_sha256"]

    engine = Engine(request, executor)
    if not engine.journal:
        raise LifecycleError("recover requires a non-empty durable journal")

    quiesce_path = pathlib.Path(request["quiesce_manifest_path"])
    require_lexical_absolute(quiesce_path)
    quiesce_bytes = validate_regular_file(quiesce_path, mode=0o400)
    if sha256(quiesce_bytes) != request["quiesce_manifest_sha256"]:
        raise LifecycleError("recover quiesce manifest digest mismatch")
    if request.get("production") is True:
        # W2/D3: recover reloads the persisted staged values — the real <exported-id> and the other
        # staged authorities cannot be re-opened — so the resumed journal recomputes byte-identical
        # ordinary command_sha256. Fail closed (named) if the recovery id or the authority is absent.
        recovery_run_id = request.get("recovery_run_id")
        if not recovery_run_id:
            raise LifecycleError("production recover requires an accepted request['recovery_run_id']")
        values = load_staged_values(
            engine.run_root, request["run_id"], str(quiesce_path), recovery_run_id
        )
    else:
        values = derive_joined_fixture_values(request["run_id"], str(quiesce_path))
    run_id = str(uuid.UUID(request["run_id"]))
    chains = request.get("chains") or {}

    # Restore the in-memory stepped domains to the durable head so every resumed row carries the
    # exact resource/quiesce values an uninterrupted run would have at this point (Engine.append
    # reads current_*). __post_init__ already set resource from the (now durable-derived) request
    # value; pin both explicitly from the head for clarity and future-proofing.
    head = engine.journal[-1]
    engine.current_resource_manifest_sha256 = head["resource_manifest_sha256"]
    engine.current_quiesce_manifest_sha256 = head["quiesce_manifest_sha256"]

    def d5(operation: str) -> None:
        command = resolved_command(manifest, COMMANDS[operation], request)
        chain = chains.get(operation) or default_joined_chain(operation)
        engine.retained_chain(operation, chain, command, from_current_head=True)

    def ordinary(command_id: str, **keywords: Any) -> dict[str, Any]:
        return engine.append_ordinary_lifecycle(manifest, command_id, values, **keywords)

    # The forward run's out-of-band run-root artifacts are already durable on this root; recover
    # reconstructs their paths for the output augmentation exactly as run_live emits them. The
    # exported-snapshot id and the five target identities are DETERMINISTIC (run_id-derived, exactly
    # as run_live seeds them), so a resume that re-drives a mid-window step re-writes byte-identical
    # checkpoint-bound resource-manifest artifacts (immutable_publish is idempotent).
    resource_manifest_paths = {
        stage: str(engine.run_root / f"resource-manifest-{stage}-{request['run_id']}.json")
        for stage in ("genesis", "snapshot", "targets")
    }
    marker_path = str(engine.run_root / "quiesce-window-mode.json")
    exported_id = values["<exported-id>"]
    target_identities = tuple(
        sha256(f"q12:resource-target:{index}:{run_id}".encode("utf-8")) for index in range(5)
    )

    def resume(resume_from: str) -> dict[str, Any]:
        return drive_forward_sequence(
            engine, request, manifest, values, quiesce_bytes, run_id,
            resource_manifest_paths, marker_path, exported_id, target_identities,
            ordinary, d5, resume_from=resume_from,
        )

    # DISPATCH on the durable head — the generalized Option A table (design §6b.2). Every clean
    # completed-group boundary head resumes the shared forward driver from the group AFTER it, and
    # every barrier.cleanup head (row 8) converges the post-activate cleanup segment idempotently.
    head_command = head["command_id"]
    resume_from = _RECOVER_RESUME_FROM.get((head_command, head["outcome"]))
    if resume_from is None and head_command == CLEANUP_COMMAND_ID:
        # Head 8: a barrier.cleanup head (any outcome) — re-drive/converge the cleanup segment. A
        # fully-complete accepted head is an idempotent no-op; a mid-cleanup head continues the
        # segment (orchestrate_post_activate_cleanup resumes from the interrupted outcome, §6b.2).
        resume_from = _POST_ACTIVATE_SENTINEL
    if resume_from is not None:
        return resume(resume_from)

    # FAIL CLOSED (named refusal, never heuristic continuation). Design §6b.2 + the R5-D2 pointer
    # amended IN LOCKSTEP: a barrier head that reaches the table above is a COMPLETED head and never
    # arrives here, so the standalone-supervisor pointer is appended ONLY for a MID-LIFECYCLE barrier
    # head (claimed-but-not-completed). Under Option A that composition is now TRUE by construction:
    # the operator runs the standalone supervisor to advance the barrier to its completed head, which
    # is a SUPPORTED table row, and recover then resumes from the group after it. A completed barrier
    # head is already supported (recover resumes directly), so its message must not — and does not —
    # promise a step recover then rejects.
    next_step = ""
    if head_command.startswith("barrier.") and head["outcome"] != "completed":
        operation = head_command[len("barrier.") :]
        if operation in OPERATIONS:
            next_step = (
                f"; re-run the standalone supervisor 'q12-live-cutover.sh {operation}' to resume "
                "this barrier, then run recover"
            )
    raise LifecycleError(
        "recover does not support resuming from "
        f"phase={head['phase']} outcome={head['outcome']} command={head_command}{next_step}"
    )


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

    Enforced by ``d6_select_restart_authority`` when an epoch carries its loaded
    ``seal`` and ``predecision`` objects: a mismatch makes the epoch unbound and it
    cannot become a restart chain tip.  Returns the verified hash."""
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
        # When the loaded seal and predecision objects are present, the seal must
        # bind the exact predecision it claims or the epoch is unbound (incident) and
        # cannot become a chain tip.
        seal = epoch.get("seal")
        predecision = epoch.get("predecision")
        if epoch.get("terminal_seal") and seal is not None and predecision is not None:
            d6_verify_seal_binding(seal, predecision)
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


# --------------------------------------------------------------------------- #
# Task 9 join — D6 real frame envelope, R-handshake chain, and validation-at-load.
#
# The Root supervisor emits and validates the real chained frame transcript of
# the activation-truth R handshake and binds it to the immutable predecision and
# terminal-seal objects.  Consumes the accepted D6 coordinator objects
# (``d6_build_predecision``/``d6_build_terminal_seal``/``d6_terminal_seal_authority``)
# without rewriting them.  All hashing is over the in-memory canonical form (never
# raw file/JSONL bytes), so validation-at-load parses each stored frame, re-derives
# ``frame_sha256`` from ``canonical()``, and re-verifies the chain.  A validated
# ``precommit_rollback_sealed`` seal hands the post-R frontier to Task 9 retirement.
# --------------------------------------------------------------------------- #

D6_FRAME_KEYS = (
    "schema_version",
    "sequence",
    "kind",
    "run_id",
    "payload",
    "previous_frame_sha256",
    "frame_sha256",
)
D6_HANDSHAKE_KINDS = {
    "precommit_rollback": (
        "db_locked",
        "host_projection",
        "host_bound",
        "predecision_precommit",
        "sealed",
        "release",
        "closed",
    ),
    "committed_finish_forward": (
        "db_locked",
        "host_projection",
        "host_bound",
        "predecision_finish_forward",
        "sealed",
        "release",
        "closed",
    ),
    "drift_incident": (
        "db_locked",
        "host_projection",
        "host_bound",
        "abort_incident",
    ),
}
D6_CLASSIFICATION_FRAME_KIND = {
    "precommit_rollback": "predecision_precommit",
    "committed_finish_forward": "predecision_finish_forward",
    "drift_incident": "abort_incident",
}
D6_FRAME_KINDS = frozenset(
    kind for kinds in D6_HANDSHAKE_KINDS.values() for kind in kinds
)


def _d6_check_sequence(sequence: Any) -> int:
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise LifecycleError("D6 frame sequence must be a positive integer")
    return sequence


def d6_frame_sha256(frame: dict[str, Any]) -> str:
    """Hash the canonical frame object excluding its own ``frame_sha256`` field."""
    body = {key: frame[key] for key in frame if key != "frame_sha256"}
    return sha256(canonical(body))


def d6_build_frame(
    schema_version: str,
    sequence: int,
    kind: str,
    run_id: str,
    payload: dict[str, Any],
    previous_frame_sha256: str | None,
) -> dict[str, Any]:
    """Build one complete chained frame with a self-consistent ``frame_sha256``."""
    if kind not in D6_FRAME_KINDS:
        raise LifecycleError(f"D6 unknown frame kind: {kind}")
    _d6_check_sequence(sequence)
    body = {
        "schema_version": schema_version,
        "sequence": sequence,
        "kind": kind,
        "run_id": run_id,
        "payload": payload,
        "previous_frame_sha256": previous_frame_sha256,
    }
    return {**body, "frame_sha256": sha256(canonical(body))}


def d6_emit_frame_chain(
    schema_version: str, run_id: str, steps: list[tuple[str, dict[str, Any]]]
) -> list[dict[str, Any]]:
    """Emit an ordered, hash-chained frame list from ``(kind, payload)`` steps.

    The genesis frame chains from null; every later frame chains the prior
    ``frame_sha256`` and increments the sequence."""
    frames: list[dict[str, Any]] = []
    previous: str | None = None
    for index, (kind, payload) in enumerate(steps):
        frame = d6_build_frame(schema_version, index + 1, kind, run_id, payload, previous)
        frames.append(frame)
        previous = frame["frame_sha256"]
    return frames


def d6_validate_frame(frame: dict[str, Any]) -> str:
    """Validate one frame's exact key set and self-consistent hash; return it."""
    if set(frame) != set(D6_FRAME_KEYS):
        raise LifecycleError("D6 frame key set mismatch")
    if frame["kind"] not in D6_FRAME_KINDS:
        raise LifecycleError(f"D6 unknown frame kind: {frame['kind']}")
    _d6_check_sequence(frame["sequence"])
    expected = d6_frame_sha256(frame)
    if frame["frame_sha256"] != expected:
        raise LifecycleError("D6 frame_sha256 does not match its canonical body")
    return expected


def d6_validate_frame_chain(
    frames: list[dict[str, Any]], expected_kinds: tuple[str, ...] | None = None
) -> str:
    """Validate a full frame chain and return the transcript head (tip hash).

    The genesis frame chains from null.  Sequence starts at 1 and increments by
    one; every frame's ``previous_frame_sha256`` equals the prior tip and its
    ``frame_sha256`` re-derives from its canonical body.  When ``expected_kinds``
    is given the kinds must match exactly in order."""
    if not frames:
        raise LifecycleError("D6 frame chain is empty")
    if expected_kinds is not None and len(frames) != len(expected_kinds):
        raise LifecycleError("D6 frame chain length does not match expected kinds")
    previous: str | None = None
    run_id = frames[0]["run_id"]
    for index, frame in enumerate(frames):
        d6_validate_frame(frame)
        if frame["sequence"] != index + 1:
            raise LifecycleError("D6 frame chain sequence is not monotonic from 1")
        if frame["run_id"] != run_id:
            raise LifecycleError("D6 frame chain run_id drift")
        if frame["previous_frame_sha256"] != previous:
            raise LifecycleError("D6 frame chain previous_frame_sha256 mismatch")
        if expected_kinds is not None and frame["kind"] != expected_kinds[index]:
            raise LifecycleError("D6 frame chain kind order mismatch")
        previous = frame["frame_sha256"]
    return previous  # type: ignore[return-value]


def d6_load_transcript(path: pathlib.Path) -> tuple[list[dict[str, Any]], str]:
    """Validation-at-load for the append-only frame transcript.

    Parses each JSONL line to an object, then re-derives every ``frame_sha256``
    from ``canonical()`` and re-verifies the chain.  It never hashes the raw file
    bytes, so a semantically identical but differently serialized line still
    validates, while any content drift fails closed.  Returns the frames and the
    validated transcript head."""
    require_lexical_absolute(path)
    raw = path.read_bytes()
    if raw and not raw.endswith(b"\n"):
        raise LifecycleError("D6 transcript is not newline-terminated")
    frames = [json.loads(line) for line in raw.splitlines()]
    head = d6_validate_frame_chain(frames)
    return frames, head


def d6_bind_handshake_authority(
    frames: list[dict[str, Any]],
    predecision: dict[str, Any],
    seal: dict[str, Any] | None,
) -> dict[str, Any]:
    """Bind a completed R-handshake frame chain to its predecision and seal.

    Validates the chain against the contract kind order for the predecision
    classification, requires the predecision to bind the transcript head
    immediately before its frame, and (for the sealed classifications) requires
    the seal to bind both its predecision and the final transcript head.  Returns
    the sole authority: Task 9 post-R frontier retirement for a precommit seal,
    finish-forward for a committed seal, and incident-only for a drift abort."""
    classification = predecision["classification"]
    expected_kinds = D6_HANDSHAKE_KINDS.get(classification)
    if expected_kinds is None:
        raise LifecycleError(f"D6 handshake unknown classification: {classification}")
    head = d6_validate_frame_chain(frames, expected_kinds)
    predecision_index = expected_kinds.index(D6_CLASSIFICATION_FRAME_KIND[classification])
    head_before = frames[predecision_index - 1]["frame_sha256"]
    if predecision["transcript_head_before_predecision_sha256"] != head_before:
        raise LifecycleError("D6 predecision transcript head does not match the frame chain")
    predecision_sha256 = d6_predecision_sha256(predecision)
    if classification == "drift_incident":
        if seal is not None:
            raise LifecycleError("D6 drift incident abort has no terminal seal authority")
        authority = d6_authority_without_seal(predecision)
    else:
        if seal is None:
            raise LifecycleError("D6 sealed handshake requires a terminal seal")
        d6_verify_seal_binding(seal, predecision)
        if seal["final_transcript_head_sha256"] != head:
            raise LifecycleError("D6 terminal seal final transcript head mismatch")
        authority = d6_terminal_seal_authority(seal)
    return {
        "transcript_head": head,
        "predecision_sha256": predecision_sha256,
        "authority": authority,
    }


# --------------------------------------------------------------------------- #
# Task 9 — smoke / activation observation gate evaluator.
#
# The deployed ``q12-live-smoke.sh`` wrapper dispatches here.  The ``observe``
# action evaluates the §13 activation observation gate over a synthetic
# observation projection and takes no live/remote action: it opens no database,
# container, socket, or service.  Every terminal live-window result sets
# ``rotation_required=true``; any threshold breach keeps Q12 open and selects the
# phase-aware rollback/incident path.  Elapsed observation time never converts a
# failed metric into acceptance.
# --------------------------------------------------------------------------- #

SMOKE_SCHEMA_VERSION = "q12-smoke-observation/v1"
SMOKE_MIN_OBSERVATION_MINUTES = 60
SMOKE_REQUIRED_COVERAGE_PERCENT = 100
SMOKE_REQUIRED_BASELINE_PERCENT = 100
SMOKE_MAX_REST_ERROR_RATIO = 0.02
SMOKE_MAX_HYBRID_FALLBACK_RATIO = 0.05
SMOKE_MAX_MEMORY_RATIO = 0.85
SMOKE_MAX_POINT_DROP_RATIO = 0.10
SMOKE_INITIAL_CUTOVER_POINTS = 12114
SMOKE_MAX_DEGRADED_DECISIONS = 3
SMOKE_INT_FIELDS = (
    "observation_minutes",
    "document_outcome_coverage_percent",
    "baseline_preservation_percent",
    "isolation_violations",
    "unresolved_p0_p1_incidents",
    "qdrant_points",
    "degraded_automatic_decisions_30min",
)
SMOKE_RATIO_FIELDS = (
    "qdrant_rest_error_ratio",
    "hybrid_fallback_ratio",
    "qdrant_memory_ratio",
    "point_count_drop_ratio",
)
SMOKE_BOOL_FIELDS = (
    "course_cycle_complete",
    "is_initial_cutover",
    "notification_firing_observed",
    "notification_resolved_observed",
)
SMOKE_ACTIVATION_ROW_KEYS = {"enabled", "status", "rollout_percentage"}
SMOKE_OBSERVATION_KEYS = frozenset(
    SMOKE_INT_FIELDS + SMOKE_RATIO_FIELDS + SMOKE_BOOL_FIELDS + ("activation_rows",)
)


def _smoke_int(observation: dict[str, Any], key: str) -> int:
    value = observation[key]
    if isinstance(value, bool) or not isinstance(value, int):
        raise LifecycleError(f"smoke observation {key} must be an integer")
    return value


def _smoke_ratio(observation: dict[str, Any], key: str) -> float:
    value = observation[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise LifecycleError(f"smoke observation {key} must be a number")
    return value


def _smoke_bool(observation: dict[str, Any], key: str) -> bool:
    value = observation[key]
    if not isinstance(value, bool):
        raise LifecycleError(f"smoke observation {key} must be a boolean")
    return value


def evaluate_smoke_observation(observation: Any, run_id: str) -> dict[str, Any]:
    """Evaluate the §13 activation observation gate over a synthetic projection.

    Returns a fail-closed verdict.  Acceptance requires every threshold met, at
    least 60 observed minutes, and one complete course cycle; any breach keeps
    Q12 open on the phase-aware rollback/incident path.  ``rotation_required`` is
    always true."""
    if not isinstance(observation, dict):
        raise LifecycleError("smoke observation must be a JSON object")
    keys = set(observation)
    missing = SMOKE_OBSERVATION_KEYS - keys
    if missing:
        raise LifecycleError(f"smoke observation missing keys: {sorted(missing)}")
    unknown = keys - SMOKE_OBSERVATION_KEYS
    if unknown:
        raise LifecycleError(f"smoke observation unknown keys: {sorted(unknown)}")

    for key in SMOKE_INT_FIELDS:
        _smoke_int(observation, key)
    for key in SMOKE_RATIO_FIELDS:
        _smoke_ratio(observation, key)
    for key in SMOKE_BOOL_FIELDS:
        _smoke_bool(observation, key)

    rows = observation["activation_rows"]
    if not isinstance(rows, list) or not rows:
        raise LifecycleError("smoke observation activation_rows must be a non-empty list")

    breaches: set[str] = set()
    if observation["observation_minutes"] < SMOKE_MIN_OBSERVATION_MINUTES:
        breaches.add("observation_window_too_short")
    if not observation["course_cycle_complete"]:
        breaches.add("course_cycle_incomplete")
    if observation["document_outcome_coverage_percent"] != SMOKE_REQUIRED_COVERAGE_PERCENT:
        breaches.add("document_outcome_coverage")
    if observation["baseline_preservation_percent"] != SMOKE_REQUIRED_BASELINE_PERCENT:
        breaches.add("baseline_preservation")
    if observation["isolation_violations"] != 0:
        breaches.add("isolation_violation")
    if observation["unresolved_p0_p1_incidents"] != 0:
        breaches.add("unresolved_incident")
    if observation["qdrant_rest_error_ratio"] > SMOKE_MAX_REST_ERROR_RATIO:
        breaches.add("qdrant_rest_error_ratio")
    if observation["hybrid_fallback_ratio"] > SMOKE_MAX_HYBRID_FALLBACK_RATIO:
        breaches.add("hybrid_fallback_ratio")
    if observation["qdrant_memory_ratio"] > SMOKE_MAX_MEMORY_RATIO:
        breaches.add("qdrant_memory")
    if observation["point_count_drop_ratio"] > SMOKE_MAX_POINT_DROP_RATIO:
        breaches.add("point_count_drop")
    if (
        observation["is_initial_cutover"]
        and observation["qdrant_points"] != SMOKE_INITIAL_CUTOVER_POINTS
    ):
        breaches.add("initial_cutover_point_count")
    if observation["degraded_automatic_decisions_30min"] >= SMOKE_MAX_DEGRADED_DECISIONS:
        breaches.add("degraded_decisions")
    if not (
        observation["notification_firing_observed"]
        and observation["notification_resolved_observed"]
    ):
        breaches.add("notification_cycle")
    for row in rows:
        if (
            not isinstance(row, dict)
            or set(row) != SMOKE_ACTIVATION_ROW_KEYS
            or row["enabled"] is not True
            or row["status"] != "active"
            or row["rollout_percentage"] != 100
        ):
            breaches.add("activation_row_drift")
            break

    accepted = not breaches
    return {
        "schema_version": SMOKE_SCHEMA_VERSION,
        "run_id": run_id,
        "accepted": accepted,
        "breaches": sorted(breaches),
        "selected_path": "accept" if accepted else "phase_aware_rollback_incident",
        "q12_open": not accepted,
        "rotation_required": True,
    }


def run_smoke(arguments: argparse.Namespace) -> dict[str, Any]:
    fixture = pathlib.Path(arguments.observation_fixture)
    require_lexical_absolute(fixture)
    observation = json.loads(fixture.read_bytes())
    return evaluate_smoke_observation(observation, arguments.run_id)


# --- Q12 expected-post-migration-catalog plan builder -----------------------
#
# `plan` mode is the non-mutating, pre-live builder described in the corrections
# design (§2, "Before any live mutation, q12-live-cutover.sh --plan also builds
# the migration expectation independently").  It captures the read-only source
# structural catalog, restores that snapshot into the pinned isolated Supabase
# image, applies only the five release-SHA migration files inside the isolated
# target, and emits the owner-only expected-post-migration-catalog.json that the
# database barrier, source manifest, and backup consumers accept byte-exactly.
#
# The catalog-assembly/validation/emission surface below is fully deterministic
# and is the sole authority for the frozen artifact shape; the DB/Docker work is
# delegated to an injectable PlanExecutor so it can be exercised with synthetic
# fixtures (fast unit tests) or a real disposable PostgreSQL 17 (gated proof).

EXPECTED_CATALOG_SCHEMA_VERSION = "megacampus.q12.expected-post-migration-catalog/v1"
PLAN_MIGRATION_KEYS = ("20260711140000", "20260711151000")
PLAN_FINAL_MIGRATION_KEY = PLAN_MIGRATION_KEYS[-1]
PLAN_MIGRATION_FRONTIER = "20260704150249"
PLAN_GUARDED_SCHEMAS = frozenset({"public", "auth", "storage", "cron", "net"})
PLAN_STORAGE_NAMES = (
    "buckets",
    "buckets_analytics",
    "objects",
    "s3_multipart_uploads",
    "s3_multipart_uploads_parts",
)
PLAN_INVENTORY_COUNTS = {"public": 47, "auth": 22, "storage": 5, "cron_jobs": 8, "pg_net_queue": 0}
PLAN_MIGRATION_FILES = {
    "20260711140000": (
        "packages/course-gen-platform/supabase/migrations/"
        "20260711140000_document_conflict_side_identity.sql"
    ),
    "20260711151000": (
        "packages/course-gen-platform/supabase/migrations/"
        "20260711151000_document_evidence_observability_totals.sql"
    ),
}
HEX64_RE = re.compile(r"[0-9a-f]{64}")
HEX40_RE = re.compile(r"[0-9a-f]{40}")
# pg_export_snapshot() id shape (mirrors backup-supabase.sh's validation).
PLAN_SNAPSHOT_RE = re.compile(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+")
PLAN_NAME_RE = re.compile(r"[a-z_][a-z0-9_]*")
UUID4_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)


PLAN_TEST_SEAM_ENV = (
    "MC2_Q12_PLAN_RESTORE_MODE",
    "MC2_Q12_PLAN_RESTORE_IMAGE",
    "MC2_Q12_PLAN_SOURCE_CONTAINER",
    "MC2_Q12_PLAN_MIGRATION_APPLY",
    "MC2_Q12_PLAN_DRILL",
    "MC2_Q12_PLAN_FAULT",
    "MC2_Q12_PLAN_PG_DUMP",
    "MC2_Q12_PLAN_PG_DUMPALL",
    "MC2_Q12_PLAN_PSQL",
    "MC2_Q12_PLAN_DOCKER",
)


def assert_production_seam_lockdown(run_root: pathlib.Path) -> None:
    """In a production plan run (run_root under /opt/megacampus/backups/q12) the
    reviewed drill path and pinned image are mandatory and NO MC2_Q12_PLAN_* test
    seam may be set. Rejecting the seams also pins restore_mode=drill and the pinned
    image (those only diverge from the default when their seam is set). Test seams
    stay usable only with an explicit /tmp/mc2-q12-plan-* run root."""
    if not re.fullmatch(r"/opt/megacampus/backups/q12/[^/]+", str(run_root)):
        return
    for name in PLAN_TEST_SEAM_ENV:
        if os.environ.get(name) is not None:
            raise LifecycleError(f"{name} test seam is not permitted in a production plan run")


class PlanExecutor(Protocol):
    def capture(self, request: dict[str, Any]) -> dict[str, Any]: ...

    def teardown(self) -> None: ...


def _plan_is_bad_hex64(value: Any) -> bool:
    return not (isinstance(value, str) and HEX64_RE.fullmatch(value))


def _plan_relation_sort_key(relation: Any) -> tuple[str, str]:
    if isinstance(relation, dict):
        return (str(relation.get("schema")), str(relation.get("name")))
    return ("", "")


def _validate_guarded_relations(relations: Any) -> list[str]:
    if not isinstance(relations, list) or len(relations) != 76:
        raise LifecycleError("guarded_relations must be a 76-element array")
    oids: set[int] = set()
    identities: list[str] = []
    counts = {"public": 0, "auth": 0, "storage": 0}
    storage_names: list[str] = []
    for relation in relations:
        if not isinstance(relation, dict) or set(relation) != {
            "schema",
            "name",
            "oid",
            "relkind",
            "parent_oid",
            "owner",
        }:
            raise LifecycleError("guarded relation key set mismatch")
        schema = relation["schema"]
        name = relation["name"]
        owner = relation["owner"]
        oid = relation["oid"]
        parent_oid = relation["parent_oid"]
        if (
            schema not in PLAN_GUARDED_SCHEMAS
            or not (isinstance(name, str) and PLAN_NAME_RE.fullmatch(name))
            or not (isinstance(owner, str) and PLAN_NAME_RE.fullmatch(owner))
            or relation["relkind"] not in ("r", "p")
            or not isinstance(oid, int)
            or isinstance(oid, bool)
            or oid <= 0
            or (parent_oid is not None and (not isinstance(parent_oid, int) or isinstance(parent_oid, bool)))
        ):
            raise LifecycleError("guarded relation shape mismatch")
        identity = f"{schema}.{name}"
        if oid in oids or identity in identities:
            raise LifecycleError("guarded relation duplicate identity")
        oids.add(oid)
        identities.append(identity)
        if schema in counts:
            counts[schema] += 1
        if schema == "storage":
            storage_names.append(name)
    if counts != {"public": 47, "auth": 22, "storage": 5}:
        raise LifecycleError("guarded relation per-schema inventory mismatch")
    if sorted(storage_names) != sorted(PLAN_STORAGE_NAMES):
        raise LifecycleError("guarded storage relation set mismatch")
    if any(rel["schema"] == "auth" and rel["name"] == "schema_migrations" for rel in relations):
        raise LifecycleError("auth.schema_migrations must not be guarded")
    if sum(1 for rel in relations if rel["schema"] == "cron" and rel["name"] == "job") != 1:
        raise LifecycleError("cron.job must appear exactly once")
    if (
        sum(1 for rel in relations if rel["schema"] == "net" and rel["name"] == "http_request_queue")
        != 1
    ):
        raise LifecycleError("net.http_request_queue must appear exactly once")
    return identities


def _validate_cron_jobs(cron_jobs: Any) -> None:
    if not isinstance(cron_jobs, list) or len(cron_jobs) != 8:
        raise LifecycleError("cron_jobs must be an 8-element array")
    jobids: set[int] = set()
    for job in cron_jobs:
        if not isinstance(job, dict) or set(job) != {"jobid", "username", "command_sha256"}:
            raise LifecycleError("cron job key set mismatch")
        if (
            not isinstance(job["jobid"], int)
            or isinstance(job["jobid"], bool)
            or job["username"] != "postgres"
            or _plan_is_bad_hex64(job["command_sha256"])
        ):
            raise LifecycleError("cron job shape mismatch")
        jobids.add(job["jobid"])
    if len(jobids) != 8:
        raise LifecycleError("cron jobs contain duplicate jobids")


def _validate_migrations(catalog: dict[str, Any], guarded_identities: list[str]) -> None:
    migrations = catalog["migrations"]
    if not isinstance(migrations, dict) or tuple(sorted(migrations)) != PLAN_MIGRATION_KEYS:
        raise LifecycleError("migrations key set mismatch")
    all_identities = list(guarded_identities)
    for key in PLAN_MIGRATION_KEYS:
        entry = migrations[key]
        if not isinstance(entry, dict) or set(entry) != {
            "catalog_sha256",
            "migration_file_sha256",
            "relations",
        }:
            raise LifecycleError(f"migration {key} key set mismatch")
        if _plan_is_bad_hex64(entry["catalog_sha256"]) or _plan_is_bad_hex64(
            entry["migration_file_sha256"]
        ):
            raise LifecycleError(f"migration {key} hash shape mismatch")
        relations = entry["relations"]
        if not isinstance(relations, list) or not relations:
            raise LifecycleError(f"migration {key} relation set is empty")
        previous = ""
        for relation in relations:
            if not isinstance(relation, dict) or set(relation) != {
                "schema",
                "name",
                "relkind",
                "parent_schema",
                "parent_name",
                "owner",
            }:
                raise LifecycleError(f"migration {key} relation key set mismatch")
            schema = relation["schema"]
            name = relation["name"]
            owner = relation["owner"]
            parent_schema = relation["parent_schema"]
            parent_name = relation["parent_name"]
            if (
                schema not in PLAN_GUARDED_SCHEMAS
                or not (isinstance(name, str) and PLAN_NAME_RE.fullmatch(name))
                or not (isinstance(owner, str) and PLAN_NAME_RE.fullmatch(owner))
                or relation["relkind"] not in ("r", "p")
                or (parent_schema is None) != (parent_name is None)
            ):
                raise LifecycleError(f"migration {key} relation shape mismatch")
            if parent_schema is not None and (
                parent_schema not in PLAN_GUARDED_SCHEMAS
                or not (isinstance(parent_name, str) and PLAN_NAME_RE.fullmatch(parent_name))
            ):
                raise LifecycleError(f"migration {key} relation parent shape mismatch")
            identity = f"{schema}.{name}"
            if identity < previous:
                raise LifecycleError(f"migration {key} relations are not sorted by schema,name")
            previous = identity
            all_identities.append(identity)
    if migrations[PLAN_FINAL_MIGRATION_KEY]["catalog_sha256"] != catalog[
        "expected_post_migration_catalog_sha256"
    ]:
        raise LifecycleError("final migration catalog hash must equal expected_post_migration_catalog_sha256")
    if len(set(all_identities)) != len(all_identities):
        raise LifecycleError("relation identity is not globally unique across guarded and migration sets")


def validate_expected_catalog(catalog: Any) -> None:
    """Fail-closed mirror of the frozen barrier/source-manifest schema contract."""
    if not isinstance(catalog, dict) or set(catalog) != {
        "schema_version",
        "database",
        "database_owner",
        "release_sha",
        "migration_frontier",
        "baseline_structural_sha256",
        "expected_post_migration_catalog_sha256",
        "inventory_counts",
        "guarded_relations",
        "cron_jobs",
        "migrations",
    }:
        raise LifecycleError("expected catalog top-level key set mismatch")
    if catalog["schema_version"] != EXPECTED_CATALOG_SCHEMA_VERSION:
        raise LifecycleError("expected catalog schema_version mismatch")
    if catalog["database"] != "postgres" or catalog["database_owner"] != "postgres":
        raise LifecycleError("expected catalog database/owner must be postgres")
    if not (isinstance(catalog["release_sha"], str) and HEX40_RE.fullmatch(catalog["release_sha"])):
        raise LifecycleError("expected catalog release_sha must be 40-hex")
    if catalog["migration_frontier"] != PLAN_MIGRATION_FRONTIER:
        raise LifecycleError("expected catalog migration_frontier mismatch")
    for field in ("baseline_structural_sha256", "expected_post_migration_catalog_sha256"):
        if _plan_is_bad_hex64(catalog[field]):
            raise LifecycleError(f"expected catalog {field} must be 64-hex")
    if catalog["inventory_counts"] != PLAN_INVENTORY_COUNTS:
        raise LifecycleError("expected catalog inventory_counts mismatch")
    guarded_identities = _validate_guarded_relations(catalog["guarded_relations"])
    _validate_cron_jobs(catalog["cron_jobs"])
    _validate_migrations(catalog, guarded_identities)


def _plan_count_schema(relations: Any, schema: str) -> int:
    if not isinstance(relations, list):
        return -1
    return sum(1 for rel in relations if isinstance(rel, dict) and rel.get("schema") == schema)


def assemble_expected_catalog(release_sha: str, evidence: Any) -> dict[str, Any]:
    """Deterministically build the frozen catalog dict from capture evidence."""
    required = {
        "database",
        "database_owner",
        "migration_frontier",
        "baseline_structural_sha256",
        "guarded_relations",
        "cron_jobs",
        "migrations",
    }
    if not isinstance(evidence, dict) or not required <= set(evidence):
        raise LifecycleError("plan capture evidence is missing required fields")
    migrations_evidence = evidence["migrations"]
    if not isinstance(migrations_evidence, dict) or tuple(sorted(migrations_evidence)) != PLAN_MIGRATION_KEYS:
        raise LifecycleError("plan capture evidence migrations keys mismatch")
    migrations: dict[str, Any] = {}
    for key in PLAN_MIGRATION_KEYS:
        entry = migrations_evidence[key]
        if not isinstance(entry, dict) or set(entry) != {
            "catalog_sha256",
            "migration_file_sha256",
            "relations",
        }:
            raise LifecycleError(f"plan capture evidence migration {key} shape mismatch")
        relations = entry["relations"]
        if not isinstance(relations, list):
            raise LifecycleError(f"plan capture evidence migration {key} relations must be a list")
        migrations[key] = {
            "catalog_sha256": entry["catalog_sha256"],
            "migration_file_sha256": entry["migration_file_sha256"],
            "relations": sorted(relations, key=_plan_relation_sort_key),
        }
    return {
        "schema_version": EXPECTED_CATALOG_SCHEMA_VERSION,
        "database": evidence["database"],
        "database_owner": evidence["database_owner"],
        "release_sha": release_sha,
        "migration_frontier": evidence["migration_frontier"],
        "baseline_structural_sha256": evidence["baseline_structural_sha256"],
        "expected_post_migration_catalog_sha256": migrations[PLAN_FINAL_MIGRATION_KEY]["catalog_sha256"],
        "inventory_counts": {
            "public": _plan_count_schema(evidence["guarded_relations"], "public"),
            "auth": _plan_count_schema(evidence["guarded_relations"], "auth"),
            "storage": _plan_count_schema(evidence["guarded_relations"], "storage"),
            "cron_jobs": len(evidence["cron_jobs"]) if isinstance(evidence["cron_jobs"], list) else -1,
            "pg_net_queue": 0,
        },
        "guarded_relations": evidence["guarded_relations"],
        "cron_jobs": evidence["cron_jobs"],
        "migrations": migrations,
    }


def _validate_plan_credential_file(path: pathlib.Path, allowed_modes: set[int]) -> None:
    require_lexical_absolute(path)
    parent = open_parent_directory(path)
    try:
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    except OSError as error:
        os.close(parent)
        raise LifecycleError(f"plan credential file unavailable: {path}") from error
    try:
        stat = os.fstat(descriptor)
        if (
            not stat_module.S_ISREG(stat.st_mode)
            or stat.st_uid != 1000
            or stat.st_gid != 1000
            or (stat.st_mode & 0o777) not in allowed_modes
            or stat.st_nlink != 1
        ):
            raise LifecycleError(f"unsafe plan credential file: {path}")
    finally:
        os.close(descriptor)
        os.close(parent)


def _plan_run_root(run_id: str, run_root_argument: str | None) -> pathlib.Path:
    production_root = pathlib.Path("/opt/megacampus/backups/q12") / run_id
    if run_root_argument is None:
        return production_root
    run_root = pathlib.Path(run_root_argument)
    require_lexical_absolute(run_root)
    if run_root != production_root and not re.fullmatch(
        r"/tmp/mc2-q12-plan-[^/]+", str(run_root)
    ):
        raise LifecycleError("plan run root shape mismatch")
    return run_root


def run_plan(arguments: argparse.Namespace, plan_executor: PlanExecutor) -> dict[str, Any]:
    run_id = arguments.run_id
    if not UUID4_RE.fullmatch(run_id):
        raise LifecycleError("plan --run-id must be a lower-case UUIDv4")
    release_sha = arguments.release_sha
    if not HEX40_RE.fullmatch(release_sha):
        raise LifecycleError("plan --release-sha must be a lower-case 40-hex commit")
    db_url_file = pathlib.Path(arguments.db_url_file)
    ca_file = pathlib.Path(arguments.ca_file)
    _validate_plan_credential_file(db_url_file, {0o400, 0o600})
    _validate_plan_credential_file(ca_file, {0o644})
    run_root = _plan_run_root(run_id, getattr(arguments, "run_root", None))
    assert_production_seam_lockdown(run_root)
    # A failed pre-emission run must remove only the run dir it created; a
    # pre-existing dir is never touched (design §2 leaves no half-run directory
    # behind, but a caller-provided root is the caller's to keep).
    run_root_existed = run_root.exists()
    ensure_directory(run_root)
    output_path = run_root / "expected-post-migration-catalog.json"
    request = {
        "run_id": run_id,
        "release_sha": release_sha,
        "db_url_file": str(db_url_file),
        "ca_file": str(ca_file),
        "run_root": str(run_root),
        "generation": getattr(arguments, "generation", None),
        "keep_equality_diagnostics": bool(getattr(arguments, "keep_equality_diagnostics", False)),
    }
    # The diagnostic archive/container/network/volume are removed only after the
    # catalog is emitted and its hash is durably bound; a teardown failure
    # overrides success (design §2). capture() registers its resources so the
    # finally teardown reclaims them whether capture, assembly, or emit failed.
    emitted = False
    try:
        evidence = plan_executor.capture(request)
        catalog = assemble_expected_catalog(release_sha, evidence)
        validate_expected_catalog(catalog)
        data = complete_object(catalog)
        immutable_publish(output_path, data, 0o400, [])
        emitted = True
        observed_extras = evidence.get("observed_extra_identities", [])
        if observed_extras:
            # Name every tolerated delta-neutral extra in the run log for the record.
            for extra in observed_extras:
                print(
                    f"q12 plan tolerated delta-neutral extra: "
                    f"[{extra.get('section')}] {extra.get('identity')}",
                    file=sys.stderr,
                )
        result = {
            "schema_version": "megacampus.q12.plan-result/v1",
            "run_id": run_id,
            "release_sha": release_sha,
            "expected_catalog_path": str(output_path),
            "expected_catalog_sha256": sha256(data),
            "expected_post_migration_catalog_sha256": catalog[
                "expected_post_migration_catalog_sha256"
            ],
            "baseline_structural_sha256": catalog["baseline_structural_sha256"],
            "observed_extra_identities": observed_extras,
            "status": "planned",
        }
    finally:
        plan_executor.teardown()
        # Failed pre-emission runs remove the run dir they created — EXCEPT when
        # equality diagnostics were preserved under it (--keep-equality-diagnostics),
        # which are the whole point of that run and must survive teardown.
        if (
            not emitted
            and not run_root_existed
            and not (run_root / "equality-diagnostics").exists()
        ):
            import shutil

            shutil.rmtree(run_root, ignore_errors=True)
    return result


PLAN_PINNED_RESTORE_IMAGE = (
    "public.ecr.aws/supabase/postgres@sha256:"
    "d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f"
)
# The real release-SHA migration CLIs, invoked in legacy loopback mode against
# the isolated restore. On a faithful restore of the real source their pinned
# security manifests match by construction (they were computed there), so the
# in-isolate history rows are byte-identical to the live cutover with zero drift.
PLAN_BASE_MIGRATION_CLI = "packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts"
PLAN_OBSERVABILITY_MIGRATION_CLI = (
    "packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts"
)

# Belt-and-braces scrub for drill diagnostics. The drill does not print secret
# values by contract, but a failure tail is surfaced into the caller's log, so any
# libpq URI credential, service/pgpass password, 64-hex synthetic secret, or JWT/
# service-key shape is redacted before it can be logged.
_PLAN_SECRET_SCRUB = (
    (re.compile(r"(postgres(?:ql)?://[^\s/:@]+:)[^\s@]+(@)", re.IGNORECASE), r"\1***\2"),
    (re.compile(r"(?i)(password\s*=\s*)\S+"), r"\1***"),
    # 64-hex secret shape (no word-boundary anchors: catches runs embedded in an
    # identifier like `secret_<hex>`; 16-hex diff digests are unaffected).
    (re.compile(r"[0-9a-f]{64}"), "***"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|sbp_[A-Za-z0-9_-]{16,}"), "***"),
)


def _scrub_plan_secret_text(text: str) -> str:
    for pattern, replacement in _PLAN_SECRET_SCRUB:
        text = pattern.sub(replacement, text)
    return text


# Structured diff of two canonical structural-catalog payloads (the exact jsonb the
# frozen q12-structural-catalog.sql hashes), used to explain an equality-proof
# mismatch. Emits only identifiers + per-object sha digests — never data values,
# credentials, or migration statements — bounded to a readable summary.
_DIFF_IDENTITY_KEYS = (
    "object_type", "schema", "relation", "table", "name", "identity",
    "provider", "subobject_id", "argument_types", "left_type", "right_type",
)
_DIFF_SECTION_IDENTITY = {"migration_history": ("version",)}
_DIFF_MAX_IDS = 10
_DIFF_MAX_LINES = 400


def _diff_canon(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _diff_value_digest(obj: Any) -> str:
    return hashlib.sha256(_diff_canon(obj).encode("utf-8")).hexdigest()[:16]


def _diff_identity(section: str, obj: Any) -> str:
    if isinstance(obj, dict):
        keys = _DIFF_SECTION_IDENTITY.get(section, _DIFF_IDENTITY_KEYS)
        parts = [
            f"{key}={obj[key]}"
            for key in keys
            if key in obj and isinstance(obj[key], (str, int, float, bool))
        ]
        if parts:
            return _scrub_plan_secret_text("|".join(parts))
    return "digest:" + _diff_value_digest(obj)


def _structural_catalog_diff(
    source: dict[str, Any],
    isolate: dict[str, Any],
    *,
    max_ids: int | None = _DIFF_MAX_IDS,
    max_lines: int | None = _DIFF_MAX_LINES,
) -> str:
    """Bounded per-section diff for the LifecycleError message; pass
    max_ids=max_lines=None for the full unbounded report preserved for a ruling."""

    def cap(items: list[str]) -> list[str]:
        return items if max_ids is None else items[:max_ids]

    lines: list[str] = []
    for section in sorted(set(source) | set(isolate)):
        if section == "schema_version":
            continue
        source_value, isolate_value = source.get(section), isolate.get(section)
        if source_value == isolate_value:
            continue
        if isinstance(source_value, list) or isinstance(isolate_value, list):
            source_by: dict[str, Any] = {}
            isolate_by: dict[str, Any] = {}
            for item in source_value if isinstance(source_value, list) else []:
                source_by.setdefault(_diff_identity(section, item), item)
            for item in isolate_value if isinstance(isolate_value, list) else []:
                isolate_by.setdefault(_diff_identity(section, item), item)
            added = sorted(set(isolate_by) - set(source_by))
            removed = sorted(set(source_by) - set(isolate_by))
            changed = sorted(
                key
                for key in (set(source_by) & set(isolate_by))
                if _diff_canon(source_by[key]) != _diff_canon(isolate_by[key])
            )
            if not (added or removed or changed):
                continue
            lines.append(f"[{section}] +{len(added)} -{len(removed)} ~{len(changed)}")
            for key in cap(removed):
                lines.append(f"  - {key}  source={_diff_value_digest(source_by[key])} isolate=<absent>")
            for key in cap(added):
                lines.append(f"  + {key}  source=<absent> isolate={_diff_value_digest(isolate_by[key])}")
            for key in cap(changed):
                lines.append(
                    f"  ~ {key}  source={_diff_value_digest(source_by[key])} "
                    f"isolate={_diff_value_digest(isolate_by[key])}"
                )
        elif isinstance(source_value, dict) and isinstance(isolate_value, dict):
            fields = sorted(
                field
                for field in (set(source_value) | set(isolate_value))
                if source_value.get(field) != isolate_value.get(field)
            )
            lines.append(f"[{section}] ~{len(fields)} field(s)")
            for field in cap(fields):
                lines.append(
                    f"  ~ {_scrub_plan_secret_text(str(field))}  "
                    f"source={_diff_value_digest(source_value.get(field))} "
                    f"isolate={_diff_value_digest(isolate_value.get(field))}"
                )
        else:
            lines.append(
                f"[{section}] scalar differs source={_diff_value_digest(source_value)} "
                f"isolate={_diff_value_digest(isolate_value)}"
            )
    if not lines:
        return "structural payloads differ but no per-section difference was localized (identity collision?)"
    if max_lines is not None and len(lines) > max_lines:
        omitted = len(lines) - max_lines
        return "\n".join(lines[:max_lines]) + f"\n… ({omitted} more diff lines omitted)"
    return "\n".join(lines)


# Delta-composed live-hash prediction (orchestrator §2 method correction). A dump/restore
# re-parses stored expression trees under the pinned image, so an isolate can never
# byte-predict the LIVE hash of a PRE-EXISTING object. But pre-existing objects are
# untouched by our migrations (their live form is exactly the SOURCE payload), and FRESH
# objects are parsed identically live and in-isolate (same SQL text, same PG 17.6, ASCII
# names). So a checkpoint's live catalog = SOURCE pre-existing entries + isolate FRESH
# entries, and its hash is predictable.
#
# Identity is the section-agnostic set of structural key fields below (a superset of every
# section's ORDER BY key). It DELIBERATELY EXCLUDES dump-UNSTABLE fields (which stay in
# entry CONTENT): production tables carry dropped-column gaps whose attnums the source
# keeps as holes but pg_restore compacts, so `position` (a column's attnum) and
# `subobject_id` (a column comment/label's attnum) differ for the SAME object between
# source and isolate — including them would false-positive object-completeness. A column
# comment's `identity` (pg_identify_object, e.g. `schema.table.column`) carries the column
# NAME, so it stays a stable discriminator. Verified: no OIDs, no timestamps, section
# ordering is identity-determined, and every remaining key is a name/type/version/ordinal-
# free property that is IDENTICAL for a pre-existing object across the dump round-trip.
_COMPOSE_IDENTITY_KEYS = (
    "object_type", "schema", "name", "relation", "relation_schema", "relation_name",
    "table_schema", "table_name", "domain_schema", "domain_name",
    "identity", "identity_arguments", "provider", "version",
    "access_method", "encoding", "role", "parameter", "language",
    "source_type", "target_type", "left_type", "right_type", "kind",
)


# Frozen allowlist of pre-existing catalog identities a release migration window is permitted
# to MODIFY in place (CREATE OR REPLACE). For an allowlisted MODIFIED entry the composed live
# payload takes the ISOLATE POST-migration content, not the live SOURCE content: the migration
# replaces the object, so the live post-migration object equals what the isolate renders.
# Keys are section names; values are the composer's exact `_compose_identity` strings
# (schema|name|identity_arguments|kind for a functions entry).
#
# The single entry — public.auto_answer_questions_atomic(p_course_id uuid): the release window's
# 20260711120000 and 20260711130000 both CREATE OR REPLACE it (it pre-exists in prod as history
# 20260127143610 / repo 20260127200000_auto_answer_questions_atomic_rpc.sql), and 120000 re-GRANTs
# EXECUTE. Soundness of taking the isolate POST render: a plpgsql body is stored verbatim
# (prosrc) and both the live source and the isolate parse the IDENTICAL migration SQL on the
# pinned PostgreSQL 17.6, so pg_get_functiondef renders byte-identically on both sides; the ACL
# baseline is restored from the source and the identical GRANTs (grantor postgres on both) apply
# on both sides; CREATE OR REPLACE preserves the owner. So the isolate POST content is the live
# POST content (proven byte-EQUAL by the round-19 composed==real CI test).
#
# Modification only: a REMOVED pre-existing entry is always fatal (an allowlisted identity that
# disappears is NOT covered here), and any modified identity NOT listed stays a hard stop.
MIGRATION_MODIFIED_IDENTITY_ALLOWLIST: dict[str, frozenset[str]] = {
    "functions": frozenset(
        {
            "schema=public|name=auto_answer_questions_atomic|identity_arguments=p_course_id uuid|kind=f",
        }
    ),
}


def _compose_identity(entry: Any) -> str:
    if not isinstance(entry, dict):
        return "raw:" + _diff_canon(entry)
    parts = [
        f"{key}={entry[key]}"
        for key in _COMPOSE_IDENTITY_KEYS
        if key in entry and not isinstance(entry[key], (list, dict))
    ]
    if not parts:
        # No structural key fields — fall back to the whole entry so distinct entries
        # never collapse (a collapse would be caught by the uniqueness guard anyway).
        return "whole:" + _diff_canon(entry)
    return "|".join(parts)


def _index_by_identity(section: str, entries: list[Any]) -> dict[str, Any]:
    indexed: dict[str, Any] = {}
    for entry in entries:
        identity = _compose_identity(entry)
        if identity in indexed:
            raise LifecycleError(
                f"[{section}] identity is not unique for composition: "
                f"{_scrub_plan_secret_text(identity)}"
            )
        indexed[identity] = entry
    return indexed


def _check_restore_completeness(
    source: dict[str, Any], isolate_pre: dict[str, Any]
) -> list[dict[str, str]]:
    """Restore completeness gate (our construction, not the frozen proof). MISSING source
    objects are absolutely fatal (the restore lost something). EXTRA objects — identities
    the isolate manufactured that the source lacks (e.g. the Supabase image's schema-
    creation machinery synthesizes default ACLs on restore-created schemas that were
    dropped in the cloud source) — are NOT fatal here: they are returned as candidate
    tolerated extras. They are tolerated only if DELTA-NEUTRAL, which the additive-delta
    check in _compose_predicted_payload enforces (an extra that changes or disappears
    across checkpoints hard-stops there), and they are EXCLUDED from the composed live
    payload (they are not in the live source). Content divergence on pre-existing entries
    (deparse renormalization) is expected and not checked here."""
    missing_problems: list[str] = []
    extras: list[dict[str, str]] = []
    for section in sorted(set(source) | set(isolate_pre)):
        if section in ("schema_version", "database"):
            continue
        source_ids = {_compose_identity(entry) for entry in (source.get(section) or [])}
        isolate_ids = {_compose_identity(entry) for entry in (isolate_pre.get(section) or [])}
        missing = sorted(source_ids - isolate_ids)
        if missing:
            detail = f"[{section}] missing {len(missing)}"
            for identity in missing[:10]:
                detail += f"\n  missing {_scrub_plan_secret_text(identity)}"
            missing_problems.append(detail)
        for identity in sorted(isolate_ids - source_ids):
            extras.append({"section": section, "identity": _scrub_plan_secret_text(identity)})
    if missing_problems:
        raise LifecycleError(
            "isolated restore is not object-complete against the read-only source catalog\n"
            + "\n".join(missing_problems)
        )
    return extras


def _compose_predicted_payload(
    source: dict[str, Any], isolate_pre: dict[str, Any], isolate_checkpoint: dict[str, Any]
) -> dict[str, Any]:
    """Compose the predicted live post-migration payload: pre-existing entries from the
    SOURCE (their live deparse), fresh entries from the isolate checkpoint (identical live),
    placed in the isolate checkpoint's SQL order (identity-determined = live order). Hard
    stops if the in-isolate migration delta is not ADDITIVE relative to the pre-migration
    isolate — with one bounded exception: an identity on the frozen
    MIGRATION_MODIFIED_IDENTITY_ALLOWLIST may be MODIFIED in place, and its composed content
    is then taken from the ISOLATE POST render (the migration replaces it, so live == isolate).
    A REMOVED pre-existing entry is always fatal (never allowlisted), and any modified entry
    that is not allowlisted is fatal. All non-additive violations across every section are
    collected and reported together before failing (fail-once, not fail-fast)."""
    predicted: dict[str, Any] = {}
    violations: list[str] = []
    for section in sorted(set(source) | set(isolate_checkpoint)):
        source_value = source.get(section)
        pre_value = isolate_pre.get(section)
        check_value = isolate_checkpoint.get(section)
        if section == "schema_version":
            predicted[section] = source_value
            continue
        if isinstance(check_value, list) or isinstance(source_value, list):
            source_by = _index_by_identity(section, source_value or [])
            pre_by = _index_by_identity(section, pre_value or [])
            check_by = _index_by_identity(section, check_value or [])
            removed = sorted(set(pre_by) - set(check_by))
            if removed:
                violations.append(
                    f"[{section}] non-additive delta: migration removed pre-existing entries: "
                    + ", ".join(_scrub_plan_secret_text(identity) for identity in removed[:10])
                )
            allowlist_ids = MIGRATION_MODIFIED_IDENTITY_ALLOWLIST.get(section, frozenset())
            modified = sorted(
                identity
                for identity in (set(pre_by) & set(check_by))
                if _diff_canon(pre_by[identity]) != _diff_canon(check_by[identity])
            )
            allowed_modified = {identity for identity in modified if identity in allowlist_ids}
            disallowed = [identity for identity in modified if identity not in allowlist_ids]
            if disallowed:
                violations.append(
                    f"[{section}] non-additive delta: migration modified a pre-existing entry: "
                    + ", ".join(_scrub_plan_secret_text(identity) for identity in disallowed[:10])
                )
            # Classify every isolate-checkpoint entry:
            #   allowlisted & modified -> the migration replaced it: ISOLATE POST content;
            #   in source              -> pre-existing (unmodified): live SOURCE content;
            #   not source, in pre     -> tolerated delta-neutral EXTRA (restore artifact
            #                             absent from the live source): EXCLUDE it;
            #   not source, not pre    -> FRESH (migration-added, present live): isolate content.
            composed_section: list[Any] = []
            for entry in check_value or []:
                identity = _compose_identity(entry)
                if identity in allowed_modified:
                    composed_section.append(entry)
                elif identity in source_by:
                    composed_section.append(source_by[identity])
                elif identity in pre_by:
                    continue
                else:
                    composed_section.append(entry)
            predicted[section] = composed_section
        elif isinstance(source_value, dict):
            # Singleton pre-existing object (database): migrations must not modify it.
            if pre_value != check_value:
                violations.append(
                    f"[{section}] non-additive delta: migration modified the pre-existing {section} object"
                )
            predicted[section] = source_value
        else:
            predicted[section] = source_value
    if violations:
        raise LifecycleError("\n".join(violations))
    return predicted


class LivePlanExecutor(SourceConnectionConfig):
    """Production plan capture: read-only source snapshot + isolated restore/migrate.

    Orchestrates the real live-window path per design §2: capture the read-only
    source structural catalog / guarded relations / cron rows, snapshot the
    source, restore that snapshot into the pinned isolated Supabase image, prove
    the isolate's pre-migration structural catalog equals the source's, apply only
    the five release-SHA migration files in-isolate, and hand back the evidence the
    catalog builder freezes. Guarded relations / cron / baseline / frontier come
    from the SOURCE (live OIDs); checkpoint hashes and relation deltas come from
    the ISOLATE. The diagnostic container/network/volume/archive are reclaimed by
    teardown() only after the catalog is emitted; a teardown failure overrides
    success.

    Execution is seam-injectable so CI proves the whole pipeline end-to-end on a
    disposable PostgreSQL 17 (both source and isolate), while production stays
    pinned:
      * MC2_Q12_PLAN_RESTORE_IMAGE   — isolate image (default: pinned Supabase digest).
      * MC2_Q12_PLAN_SOURCE_CONTAINER — CI: capture/dump the source via docker exec;
        production leaves it unset and reads the source over TLS.
      * MC2_Q12_PLAN_MIGRATION_APPLY  — CI: an injected per-packet applier that runs
        the real five SQL files; production leaves it unset and runs the real CLIs.
      * MC2_Q12_PLAN_DOCKER           — docker binary (default /usr/bin/docker).
      * MC2_Q12_PLAN_FAULT            — test-only fault injection (equality|teardown).
    The isolated restore follows the reviewed lifecycle of
    deploy/postgres/restore-supabase-drill.sh (pinned image, labeled isolated
    network/volume, loopback publish, blocking cleanup).
    """

    def __init__(self) -> None:
        self.repo_root = pathlib.Path(__file__).resolve().parents[2]
        self.capture_helper = pathlib.Path(__file__).with_name("q12-migration-plan-capture.py")
        self.roles_helper = pathlib.Path(__file__).with_name("q12-migration-plan-roles.py")
        self.docker = os.environ.get("MC2_Q12_PLAN_DOCKER") or "/usr/bin/docker"
        self.restore_image = os.environ.get("MC2_Q12_PLAN_RESTORE_IMAGE") or PLAN_PINNED_RESTORE_IMAGE
        self.source_container = os.environ.get("MC2_Q12_PLAN_SOURCE_CONTAINER") or None
        self.migration_apply = os.environ.get("MC2_Q12_PLAN_MIGRATION_APPLY") or None
        self.fault = os.environ.get("MC2_Q12_PLAN_FAULT") or None
        # Production restores through the reviewed drill via its persist seam; the
        # direct pg_dump|pg_restore path is a test-only seam.
        self.restore_mode = os.environ.get("MC2_Q12_PLAN_RESTORE_MODE") or "drill"
        self.drill = os.environ.get("MC2_Q12_PLAN_DRILL") or str(
            self.repo_root / "deploy/postgres/restore-supabase-drill.sh"
        )
        self._resources: dict[str, str | None] = {
            "container": None,
            "network": None,
            "volume": None,
            "workdir": None,
            "handle": None,
            "generation": None,
            "capability": None,
            "secrets": None,
            # Diagnostic source structural payload (under workdir; reclaimed with it).
            "source_payload": None,
        }
        self._run_id: str | None = None
        # The drill preflight requires the generation basename carry a UTC stamp;
        # it is bound once per run (not per retry) so every generation in a run
        # shares one instant.
        self._generation_stamp: str | None = None
        self._isolate_port: str | None = None
        self._isolate_password: str | None = None
        self._source_service: dict[str, str] | None = None
        self._coordinator: subprocess.Popen[str] | None = None
        # Design §W3: the OQ5 coordinator + OQ6 baseline producer now live on the shared seam
        # (also composed by OwnerCustodyExecutor for the window path). This executor delegates to it.
        self._snapshot_seam = SourceSnapshotSeam(self)

    def _docker_run(
        self, args: list[str], *, input_bytes: bytes | None = None, check: bool = True
    ) -> subprocess.CompletedProcess[bytes]:
        completed = subprocess.run(
            [self.docker, *args],
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker},
            check=False,
        )
        if check and completed.returncode != 0:
            raise LifecycleError(
                f"docker {args[0]} failed: {completed.stderr.decode('utf-8', 'replace').strip()}"
            )
        return completed

    def _run_capture(
        self,
        *,
        container: str | None,
        service_env: dict[str, str] | None = None,
        roles_only: bool = False,
        dbname: str = "postgres",
        snapshot: str | None = None,
    ) -> dict[str, Any]:
        env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
        if service_env:
            env.update(service_env)
        argv = ["/usr/bin/python3", str(self.capture_helper), "--dbname", dbname]
        if snapshot is not None:
            argv += ["--snapshot", snapshot]
        if container is not None:
            argv += ["--container", container]
        if roles_only:
            argv.append("--roles-only")
        completed = subprocess.run(
            argv,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(f"plan capture helper failed: {completed.stderr.strip()}")
        return json.loads(completed.stdout)

    def _migration_file_sha256(self, key: str) -> str:
        path = self.repo_root / PLAN_MIGRATION_FILES[key]
        return sha256(path.read_bytes())

    @staticmethod
    def _relation_delta(
        after: list[dict[str, Any]], before: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        before_identities = {(rel["schema"], rel["name"]) for rel in before}
        return [rel for rel in after if (rel["schema"], rel["name"]) not in before_identities]

    def _write_structural_payload(
        self,
        dest: pathlib.Path,
        *,
        container: str | None,
        dbname: str,
        snapshot: str | None = None,
        service_env: dict[str, str] | None = None,
    ) -> None:
        """Capture the full canonical structural payload (diagnostic) to an owner-only
        file. Snapshot-bound when a snapshot id is supplied (source), unbound for the
        live isolate."""
        env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
        if service_env:
            env.update(service_env)
        argv = ["/usr/bin/python3", str(self.capture_helper), "--structural-payload", "--dbname", dbname]
        if snapshot is not None:
            argv += ["--snapshot", snapshot]
        if container is not None:
            argv += ["--container", container]
        completed = subprocess.run(
            argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(f"structural payload capture failed: {completed.stderr.strip()}")
        descriptor = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            os.write(descriptor, completed.stdout.encode("utf-8"))
        finally:
            os.close(descriptor)

    def _read_structural_payload(
        self, container: str | None, dbname: str, *, service_env: dict[str, str] | None = None
    ) -> dict[str, Any]:
        """Capture the full canonical structural payload (in memory) for composition."""
        env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
        if service_env:
            env.update(service_env)
        argv = ["/usr/bin/python3", str(self.capture_helper), "--structural-payload", "--dbname", dbname]
        if container is not None:
            argv += ["--container", container]
        completed = subprocess.run(
            argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(f"structural payload capture failed: {completed.stderr.strip()}")
        return json.loads(completed.stdout)

    def _render_payload_hash(
        self, container: str | None, dbname: str, payload: dict[str, Any]
    ) -> str:
        """Render a composed payload to its sha256 THROUGH postgres, so jsonb::text
        canonicalization is byte-identical to the frozen SQL/barrier on the live side."""
        env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
        argv = ["/usr/bin/python3", str(self.capture_helper), "--render-hash", "--dbname", dbname]
        if container is not None:
            argv += ["--container", container]
        completed = subprocess.run(
            argv,
            input=json.dumps(payload, sort_keys=True, ensure_ascii=False),
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(f"composed catalog hash render failed: {completed.stderr.strip()}")
        digest = completed.stdout.strip()
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            raise LifecycleError("composed catalog hash is malformed")
        return digest

    def _structural_failure_detail(
        self,
        request: dict[str, Any],
        base_message: str,
        source_payload: dict[str, Any],
        isolate_payload: dict[str, Any],
    ) -> str:
        if request.get("keep_equality_diagnostics"):
            try:
                self._preserve_equality_diagnostics(request, source_payload, isolate_payload)
            except OSError:
                pass
        diff = _structural_catalog_diff(source_payload, isolate_payload)
        return (
            f"{base_message}\n"
            "--- structural catalog diff (source vs isolate; object values as sha digests) ---\n"
            f"{diff}"
        )

    def _compose_checkpoint_hash(
        self,
        request: dict[str, Any],
        container: str,
        dbname: str,
        source_payload: dict[str, Any],
        isolate_pre: dict[str, Any],
        isolate_checkpoint: dict[str, Any],
    ) -> str:
        try:
            predicted = _compose_predicted_payload(source_payload, isolate_pre, isolate_checkpoint)
        except LifecycleError as error:
            raise LifecycleError(
                self._structural_failure_detail(
                    request, str(error), source_payload, isolate_checkpoint
                )
            ) from None
        return self._render_payload_hash(container, dbname, predicted)

    def _capture_source(
        self, request: dict[str, Any], workdir: pathlib.Path, snapshot: str | None = None
    ) -> dict[str, Any]:
        if self.source_container:
            result = self._run_capture(container=self.source_container, snapshot=snapshot)
            container, service_env = self.source_container, None
        else:
            if self._source_service is None:
                self._source_service = self._source_service_env(request, workdir)
            result = self._run_capture(
                container=None, service_env=self._source_service, snapshot=snapshot
            )
            container, service_env = None, self._source_service
        # Eagerly capture the source's full structural payload while the snapshot is
        # still open, so a later equality-proof mismatch can be diffed after the window
        # closes. Owner-only, under the workdir (reclaimed by teardown).
        payload_path = workdir / "source-structural-payload.json"
        if not os.path.lexists(payload_path):
            self._write_structural_payload(
                payload_path, container=container, dbname="postgres",
                snapshot=snapshot, service_env=service_env,
            )
            self._resources["source_payload"] = str(payload_path)
        return result

    def _preserve_equality_diagnostics(
        self,
        request: dict[str, Any],
        source_payload: dict[str, Any],
        isolate_payload: dict[str, Any],
    ) -> None:
        """Persist the two full canonical payloads and the full unbounded diff under
        <run_root>/equality-diagnostics/ (0700 dir, 0600 files) for a product-truth
        ruling. The payloads are secret-free by construction — the frozen SQL stores
        subscription conninfo as connection_sha256 and carries no cron command text or
        row data; the only free text is our own migration statements — so they are
        written verbatim (scrubbing would corrupt the diagnostic)."""
        diagnostics = pathlib.Path(request["run_root"]) / "equality-diagnostics"
        ensure_directory(diagnostics)

        def emit(name: str, data: bytes) -> None:
            path = diagnostics / name
            if os.path.lexists(path):
                path.unlink()
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                os.write(descriptor, data)
            finally:
                os.close(descriptor)

        emit(
            "source-structural-payload.json",
            (json.dumps(source_payload, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8"),
        )
        emit(
            "isolate-structural-payload.json",
            (json.dumps(isolate_payload, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8"),
        )
        full = _structural_catalog_diff(source_payload, isolate_payload, max_ids=None, max_lines=None)
        emit("equality-diff.txt", (full + "\n").encode("utf-8"))

    def _create_isolate(self, run_id: str) -> str:
        import time

        suffix = os.urandom(6).hex()
        network = f"mc2-q12-plan-net-{run_id}-{suffix}"
        volume = f"mc2-q12-plan-data-{run_id}-{suffix}"
        container = f"mc2-q12-plan-{run_id}-{suffix}"
        self._isolate_password = os.urandom(18).hex()
        label = f"com.megacampus.q12.plan-run={run_id}"
        self._docker_run(["network", "create", "--label", label, network])
        self._resources["network"] = network
        self._docker_run(["volume", "create", "--label", label, volume])
        self._resources["volume"] = volume
        self._docker_run(
            [
                "run",
                "-d",
                "--name",
                container,
                "--label",
                label,
                "--network",
                network,
                "--mount",
                f"type=volume,src={volume},dst=/var/lib/postgresql/data",
                "-e",
                f"POSTGRES_PASSWORD={self._isolate_password}",
                "-p",
                "127.0.0.1::5432",
                self.restore_image,
            ]
        )
        self._resources["container"] = container
        # The postgres/Supabase image runs a temporary init server (which also
        # answers pg_isready) before restarting on the real port; wait for the
        # init-complete marker so a snapshot restore never lands on the throwaway.
        marker = b"PostgreSQL init process complete; ready for start up."
        for _ in range(300):
            logs = self._docker_run(["logs", container], check=False)
            probe = self._docker_run(
                ["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"], check=False
            )
            if probe.returncode == 0 and marker in logs.stdout + logs.stderr:
                break
            time.sleep(0.2)
        else:
            raise LifecycleError("isolated restore target did not become ready")
        published = self._docker_run(["port", container, "5432/tcp"], check=True)
        match = re.search(r":(\d+)\s*$", published.stdout.decode("utf-8", "replace").strip())
        if not match:
            raise LifecycleError("isolated restore target did not publish a loopback port")
        self._isolate_port = match.group(1)
        return container

    def _dump_source(self, archive: pathlib.Path, snapshot: str | None = None) -> pathlib.Path:
        # Stream the custom archive straight to disk (pg_dump stdout -> file fd)
        # so peak memory is not ~2x the database size on the production server.
        descriptor = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            if self.source_container:
                argv = [
                    self.docker,
                    "exec",
                    self.source_container,
                    "pg_dump",
                    "-U",
                    "postgres",
                    "-Fc",
                    "--no-password",
                ]
                if snapshot is not None:
                    argv.append(f"--snapshot={snapshot}")
                argv.append("postgres")
                env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
            else:
                pg_dump = os.environ.get("MC2_Q12_PLAN_PG_DUMP") or "/usr/lib/postgresql/17/bin/pg_dump"
                argv = [pg_dump, "-Fc", "--no-password"]
                if snapshot is not None:
                    argv.append(f"--snapshot={snapshot}")
                argv.append("postgres")
                env = {**self._base_env(), **(self._source_service or {})}
            completed = subprocess.run(
                argv,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=descriptor,
                stderr=subprocess.PIPE,
                check=False,
            )
        finally:
            os.close(descriptor)
        if completed.returncode != 0:
            raise LifecycleError(
                f"source pg_dump failed: {completed.stderr.decode('utf-8', 'replace').strip()}"
            )
        return archive

    def _bootstrap_roles(self, container: str, source: dict[str, Any]) -> None:
        """Apply the §3 allowlisted role bootstrap so the isolated pg_restore does
        not abort on source app roles absent from the pinned image. Never executes
        raw pg_dumpall output; the SQL is generated from the verified projection."""
        isolate = self._run_capture(container=container, roles_only=True)
        request = {
            "source_roles": source.get("source_roles", []),
            "source_memberships": source.get("source_memberships", []),
            "source_role_settings": source.get("source_role_settings", []),
            "isolate_roles": [role["name"] for role in isolate["source_roles"]],
        }
        generated = subprocess.run(
            ["/usr/bin/python3", str(self.roles_helper)],
            input=json.dumps(request),
            env=self._base_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if generated.returncode != 0:
            raise LifecycleError(f"§3 role bootstrap generation failed: {generated.stderr.strip()}")
        applied = self._docker_run(
            [
                "exec",
                "-i",
                container,
                "psql",
                "-X",
                "--no-psqlrc",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "--set",
                "ON_ERROR_STOP=on",
            ],
            input_bytes=generated.stdout.encode("utf-8"),
            check=False,
        )
        if applied.returncode != 0:
            raise LifecycleError(
                f"§3 role bootstrap apply failed: {applied.stderr.decode('utf-8', 'replace').strip()}"
            )

    def _restore_snapshot(self, workdir: pathlib.Path, container: str, source: dict[str, Any]) -> None:
        archive = self._dump_source(workdir / "source.dump")
        self._bootstrap_roles(container, source)
        # Stream the archive into pg_restore via an open file descriptor rather
        # than buffering the whole dump in memory.
        with open(archive, "rb") as handle:
            restore = subprocess.run(
                [
                    self.docker,
                    "exec",
                    "-i",
                    container,
                    "pg_restore",
                    "-U",
                    "postgres",
                    "-d",
                    "postgres",
                    "--no-password",
                    "--exit-on-error",
                    "--single-transaction",
                ],
                stdin=handle,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker},
                check=False,
            )
        if restore.returncode != 0:
            raise LifecycleError(
                f"isolated restore failed: {restore.stderr.decode('utf-8', 'replace').strip()}"
            )

    def _apply_migrations(self, target: dict[str, str], packet: str) -> None:
        if self.migration_apply:
            completed = subprocess.run(
                [self.migration_apply, packet],
                env={
                    **self._base_env(),
                    "MC2_Q12_PLAN_ISOLATE_CONTAINER": target["container"],
                    "MC2_Q12_PLAN_ISOLATE_DBNAME": target["dbname"],
                    "MC2_Q12_PLAN_DOCKER": self.docker,
                    "MC2_Q12_PLAN_REPO_ROOT": str(self.repo_root),
                },
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if completed.returncode != 0:
                raise LifecycleError(
                    f"plan migration apply seam failed: {completed.stderr.decode('utf-8', 'replace').strip()}"
                )
            return
        self._apply_real_cli(target, packet)

    def _apply_real_cli(self, target: dict[str, str], packet: str) -> None:
        """Production: run the real, drift-free migration CLIs in legacy loopback
        mode against the persisted restore target (restore_test for the drill
        path). Their pinned security manifests match on the faithful restore, so
        the in-isolate history rows equal the live cutover."""
        url = (
            f"postgresql://postgres:{target['password']}@127.0.0.1:{target['port']}/{target['dbname']}"
        )
        if packet == "base":
            script, action = PLAN_BASE_MIGRATION_CLI, "apply"
        elif packet == "observability":
            script, action = PLAN_OBSERVABILITY_MIGRATION_CLI, "apply-all"
        else:
            raise LifecycleError(f"unknown migration packet: {packet}")
        completed = subprocess.run(
            ["node", "--import", "tsx", str(self.repo_root / script), action],
            cwd=str(self.repo_root / "packages/course-gen-platform"),
            env={**self._base_env(), "SUPABASE_DB_URL": url},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(
                f"in-isolate migration CLI ({packet}) failed: "
                f"{completed.stderr.decode('utf-8', 'replace').strip()}"
            )

    def _lift_isolate_read_only(self, container: str, dbname: str) -> None:
        """The drill leaves the restored DB with default_transaction_read_only=on (one of
        its three documented overrides). Lift it so the migration phase can write. The
        isolate is disposable and loopback-only, so this plan-owned mutation of its own
        diagnostic target is safe, and it is NOT restored afterward: teardown destroys the
        isolate, and the frozen structural settings hash EXCLUDES this GUC
        (q12-structural-catalog.sql:69), so every checkpoint capture is unaffected. ALTER
        DATABASE ... SET is itself a write, so the connection issuing it runs with read-only
        off (PGOPTIONS), mirroring the drill's own restore actor."""
        self._docker_run(
            [
                "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=off", "-i", container,
                "psql", "-X", "--no-psqlrc", "-U", "postgres", "-d", dbname, "-v", "ON_ERROR_STOP=1",
                "-c", f'ALTER DATABASE "{dbname}" SET default_transaction_read_only TO off',
            ],
            check=True,
        )
        # Verify on a FRESH connection (no PGOPTIONS): the new database default must be off.
        result = self._docker_run(
            [
                "exec", "-i", container, "psql", "-X", "--no-psqlrc", "-U", "postgres",
                "-d", dbname, "-tAq", "-v", "ON_ERROR_STOP=1",
                "-c", "SHOW default_transaction_read_only",
            ],
            check=True,
        )
        observed = result.stdout.decode("utf-8", "replace").strip()
        if observed != "off":
            raise LifecycleError(
                f"isolate default_transaction_read_only is still {observed!r} after lift; "
                "refusing to migrate"
            )

    def _prepare_target(
        self, request: dict[str, Any], workdir: pathlib.Path, source: dict[str, Any], run_id: str
    ) -> dict[str, str]:
        if self.restore_mode == "direct":
            # Test-only seam: the direct pg_dump|pg_restore path is never reachable
            # in production (it cannot faithfully restore a real Supabase source
            # beyond its own §3 role bootstrap). Production uses the reviewed drill.
            container = self._create_isolate(run_id)
            self._restore_snapshot(workdir, container, source)
            return {
                "container": container,
                "dbname": "postgres",
                "port": str(self._isolate_port),
                "password": str(self._isolate_password),
            }
        raise LifecycleError(f"unknown plan restore mode: {self.restore_mode}")

    def _dump_roles(self, dest: pathlib.Path) -> None:
        if self.source_container:
            argv = [
                self.docker,
                "exec",
                self.source_container,
                "pg_dumpall",
                "-U",
                "postgres",
                "--roles-only",
                "--no-role-passwords",
                "--no-password",
            ]
            env = {**self._base_env(), "MC2_Q12_PLAN_DOCKER": self.docker}
        else:
            pg_dumpall = (
                os.environ.get("MC2_Q12_PLAN_PG_DUMPALL") or "/usr/lib/postgresql/17/bin/pg_dumpall"
            )
            argv = [pg_dumpall, "--roles-only", "--no-role-passwords", "--no-password"]
            env = {**self._base_env(), **(self._source_service or {})}
        descriptor = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            completed = subprocess.run(
                argv,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=descriptor,
                stderr=subprocess.PIPE,
                check=False,
            )
        finally:
            os.close(descriptor)
        if completed.returncode != 0:
            raise LifecycleError(
                f"source roles export failed: {completed.stderr.decode('utf-8', 'replace').strip()}"
            )

    def _produce_source_manifest(self, dest: pathlib.Path, snapshot: str | None = None) -> None:
        # The reviewed source manifest is produced by q12-source-manifest.ts over
        # host psql in production; that leg is Supabase-only and validated by the
        # server-side pre-C1 plan run. A CI source container uses a schema-shaped
        # placeholder the fake drill accepts.
        if self.source_container:
            placeholder = {
                "schema": "megacampus.supabase-source-manifest/v1",
                "snapshot_id": "00000000-00000000-0",
                "baseline": {},
                "cutover_snapshot": {},
            }
            atomic_replace(dest, complete_object(placeholder), 0o600)
            return
        completed = subprocess.run(
            [
                "node",
                "--import",
                "tsx",
                str(self.repo_root / "deploy/postgres/q12-source-manifest.ts"),
                "capture",
                "--snapshot",
                str(snapshot),
                "--output",
                str(dest),
            ],
            cwd=str(self.repo_root / "packages/course-gen-platform"),
            env={**self._base_env(), **(self._source_service or {})},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if completed.returncode != 0:
            raise LifecycleError(
                f"source manifest capture failed: {completed.stderr.decode('utf-8', 'replace').strip()}"
            )

    def _write_checksums(self, generation: pathlib.Path) -> None:
        entries = {}
        for name in ("database.dump", "roles.sql", "source-manifest.json"):
            data = (generation / name).read_bytes()
            entries[name] = {"sha256": sha256(data), "size": len(data)}
        # The drill's validate_generation binds the manifest to its own generation
        # basename (checksums.json `generation` == dir basename), so record it.
        manifest = {
            "schema": "megacampus.supabase-backup-checksums/v1",
            "generation": generation.name,
            "files": entries,
        }
        atomic_replace(generation / "checksums.json", complete_object(manifest), 0o600)

    @staticmethod
    def _normalize_roles(text: str) -> str:
        """Mirror backup-supabase.sh:589-614 — remove only the PG17 \\restrict /
        \\unrestrict nonce pair (which differs per invocation) and trailing blank
        lines, requiring the pair to be present exactly once."""
        lines = text.splitlines()
        if not lines:
            raise LifecycleError("empty roles export")
        while lines and lines[-1] == "":
            lines.pop()
        openings = [
            (index, match.group(1))
            for index, line in enumerate(lines)
            if (match := re.fullmatch(r"\\restrict ([A-Za-z0-9]+)", line))
        ]
        closings = [
            (index, match.group(1))
            for index, line in enumerate(lines)
            if (match := re.fullmatch(r"\\unrestrict ([A-Za-z0-9]+)", line))
        ]
        if len(openings) != 1 or len(closings) != 1:
            raise LifecycleError(
                "roles export must contain exactly one PostgreSQL 17 restrict/unrestrict pair"
            )
        opening_index, opening_nonce = openings[0]
        closing_index, closing_nonce = closings[0]
        if opening_index >= closing_index or opening_nonce != closing_nonce:
            raise LifecycleError("roles export has a missing or mismatched unrestrict marker")
        normalized = "\n".join(
            line for index, line in enumerate(lines) if index not in (opening_index, closing_index)
        )
        return normalized + "\n" if normalized else ""

    def _assert_roles_stable(self, before: pathlib.Path, after: pathlib.Path) -> None:
        if self._normalize_roles(before.read_text(encoding="utf-8")) != self._normalize_roles(
            after.read_text(encoding="utf-8")
        ):
            raise LifecycleError("source role plane drifted during the snapshot window")

    def _generation_dirname(self, run_id: str) -> str:
        """Basename the drill preflight requires:
        ^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$
        (restore-supabase-drill.sh parse_arguments). The stamp is the per-run
        instant bound in capture() (deterministic per run, not per retry); the
        run id supplies the 36-char UUID tail."""
        stamp = self._generation_stamp or time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        return f"generation-{stamp}-{run_id}"

    def _produce_generation(
        self, workdir: pathlib.Path, run_id: str, snapshot: str | None = None
    ) -> pathlib.Path:
        """Diagnostic backup generation for the drill (NOT the accepted recoverable
        backup); removed by teardown once the catalog is bound. Cluster roles are
        not MVCC-snapshotted, so — like the reviewed backup — they are exported
        before and after the snapshot-bound dump and must be byte-identical."""
        generation = workdir / self._generation_dirname(run_id)
        os.mkdir(generation, 0o700)
        roles = generation / "roles.sql"
        self._dump_roles(roles)
        self._dump_source(generation / "database.dump", snapshot)
        self._produce_source_manifest(generation / "source-manifest.json", snapshot)
        roles_after = generation / ".roles.after.sql"
        self._dump_roles(roles_after)
        self._assert_roles_stable(roles, roles_after)
        roles_after.unlink()
        self._write_checksums(generation)
        return generation

    def _read_handle(self, handle_path: pathlib.Path, run_id: str) -> dict[str, Any]:
        data = validate_regular_file(handle_path, mode=0o400)
        handle = json.loads(data)
        expected = {
            "schema_version",
            "run_id",
            "container",
            "network",
            "volume",
            "host",
            "port",
            "database",
            "user",
            "password",
        }
        if not isinstance(handle, dict) or set(handle) != expected:
            raise LifecycleError("persist handle shape mismatch")
        if (
            handle["schema_version"] != "megacampus.q12.restore-persist-handle/v1"
            or handle["run_id"] != run_id
            or handle["host"] != "127.0.0.1"
            or handle["database"] != "restore_test"
            or not isinstance(handle["port"], int)
            or isinstance(handle["port"], bool)
        ):
            raise LifecycleError("persist handle identity/connection mismatch")
        for key in ("container", "network", "volume", "user", "password"):
            if not (isinstance(handle[key], str) and handle[key]):
                raise LifecycleError(f"persist handle field mismatch: {key}")
        return handle

    def _open_snapshot_coordinator(
        self, request: dict[str, Any], workdir: pathlib.Path
    ) -> tuple[subprocess.Popen[str], str]:
        """Delegate to the shared ``SourceSnapshotSeam`` (design §W3). Kept as a thin wrapper so the
        drill flow and existing callers/tests that reach the coordinator directly are unchanged."""
        return self._snapshot_seam.open_snapshot(request, workdir)

    def _close_snapshot_coordinator(self, proc: subprocess.Popen[str] | None) -> None:
        return self._snapshot_seam.close_snapshot(proc)

    def produce_run_root_baseline(
        self, request: dict[str, Any], workdir: pathlib.Path, run_root: pathlib.Path
    ) -> pathlib.Path:
        """Delegate to the shared ``SourceSnapshotSeam`` (design §W3); OQ6 baseline producer."""
        return self._snapshot_seam.produce_baseline(request, workdir, run_root)

    def _drill_flow(
        self, request: dict[str, Any], workdir: pathlib.Path, run_id: str
    ) -> tuple[dict[str, Any], dict[str, str]]:
        coordinator, snapshot = self._open_snapshot_coordinator(request, workdir)
        try:
            source = self._capture_source(request, workdir, snapshot=snapshot)
            generation = self._produce_generation(workdir, run_id, snapshot=snapshot)
            self._resources["generation"] = str(generation)
        finally:
            self._close_snapshot_coordinator(coordinator)
        target = self._restore_via_drill(request, workdir, generation, run_id)
        return source, target

    def _drill_failure_detail(
        self, returncode: int, stdout_log: pathlib.Path, stderr_log: pathlib.Path, lines: int = 60
    ) -> str:
        """Compose a diagnosable failure message from the drill's captured output.

        Many drill steps run without a `|| fail` wrapper, so a mid-script failure
        exits via `set -e` with its reason on stdout OR stderr and no drill-level
        message — an empty stderr blinded the pre-C1 rehearsal. Surface the tail of
        BOTH streams (labeled, secrets scrubbed) so the reason lands in the caller's
        log even though teardown reclaims the underlying files."""

        def tail(path: pathlib.Path) -> str:
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                return "<unavailable>"
            chunk = "\n".join(content.splitlines()[-lines:])
            return _scrub_plan_secret_text(chunk) if chunk else "<empty>"

        return (
            f"isolated drill restore failed (exit {returncode}); drill output tail "
            f"below (secrets scrubbed).\n"
            f"--- drill stderr (last {lines} lines) ---\n{tail(stderr_log)}\n"
            f"--- drill stdout (last {lines} lines) ---\n{tail(stdout_log)}"
        )

    def _restore_via_drill(
        self, request: dict[str, Any], workdir: pathlib.Path, generation: pathlib.Path, run_id: str
    ) -> dict[str, str]:
        handle_path = pathlib.Path(request["run_root"]) / "restore-persist-handle.json"
        if os.path.lexists(handle_path):
            handle_path.unlink()
        self._resources["handle"] = str(handle_path)
        # The plan restores a read-only PRE-cutover source, which has no q12_guard
        # schema; the drill's Q12 activation cleanup requires q12_guard
        # (run-restore-cleanup.ts calls q12_guard.verify_capability() and
        # generate_cleanup_sql emits DROP SCHEMA q12_guard CASCADE), so it can never
        # succeed here. The drill's SCHEDULED mode does the same restore / role
        # bootstrap / extension + catalog compare without the activation cleanup or a
        # capability — exactly what the plan needs — and the opt-in persist seam
        # (now allowed in scheduled mode) hands back the live isolate. Drill stdout and
        # stderr stream to owner-only files under the plan workdir so a failure tail is
        # diagnosable even though teardown reclaims them.
        stdout_log = workdir / "drill-stdout.log"
        stderr_log = workdir / "drill-stderr.log"
        out_fd = os.open(stdout_log, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        err_fd = os.open(stderr_log, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            completed = subprocess.run(
                [
                    self.drill,
                    "--scheduled-run-id",
                    run_id,
                    "--generation",
                    str(generation),
                ],
                env={
                    **self._base_env(),
                    "MC2_Q12_RESTORE_PERSIST_HANDLE": str(handle_path),
                    "MC2_Q12_PLAN_DOCKER": self.docker,
                    "MC2_Q12_PLAN_REPO_ROOT": str(self.repo_root),
                },
                stdin=subprocess.DEVNULL,
                stdout=out_fd,
                stderr=err_fd,
                check=False,
            )
        finally:
            os.close(out_fd)
            os.close(err_fd)
        if completed.returncode != 0:
            raise LifecycleError(
                self._drill_failure_detail(completed.returncode, stdout_log, stderr_log)
            )
        handle = self._read_handle(handle_path, run_id)
        self._resources["container"] = handle["container"]
        self._resources["network"] = handle["network"]
        self._resources["volume"] = handle["volume"]
        return {
            "container": handle["container"],
            "dbname": handle["database"],
            "port": str(handle["port"]),
            "password": handle["password"],
        }

    def capture(self, request: dict[str, Any]) -> dict[str, Any]:
        run_id = request["run_id"]
        self._run_id = run_id
        self._generation_stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        workdir = pathlib.Path(
            f"/tmp/mc2-q12-plan-work-{run_id}-{os.urandom(6).hex()}"
        )
        os.mkdir(workdir, 0o700)
        self._resources["workdir"] = str(workdir)

        if self.restore_mode == "drill":
            # Production: source capture + generation are bound to one exported
            # source snapshot (coordinator), then the reviewed drill restores it.
            source, target = self._drill_flow(request, workdir, run_id)
        elif self.restore_mode == "direct":
            source = self._capture_source(request, workdir)
            target = self._prepare_target(request, workdir, source, run_id)
        else:
            raise LifecycleError(f"unknown plan restore mode: {self.restore_mode}")
        dbname = target["dbname"]
        container = target["container"]

        isolate_baseline = self._run_capture(container=container, dbname=dbname)
        before_public = isolate_baseline["public_relations"]

        # Delta-composed live-hash prediction (orchestrator §2 method correction). The
        # isolate can NEVER byte-predict the live hash of a pre-existing object (dump/restore
        # renormalizes stored expression trees), so instead of an equality proof we (1)
        # prove the restore is object-complete (identity-set), then (2) predict each
        # checkpoint hash by composing SOURCE pre-existing content + isolate FRESH content
        # and rendering through postgres. Content divergence on pre-existing entries is
        # expected and non-fatal; the drill's own catalog compare guards restore fidelity.
        source_payload = json.loads(
            pathlib.Path(self._resources["source_payload"]).read_text(encoding="utf-8")
        )
        isolate_pre = self._read_structural_payload(container, dbname)
        if self.fault == "equality":
            # Synthetic object-INCOMPLETENESS: drop a source object from the isolate view
            # so a real source object is missing (missing is absolutely fatal).
            if isolate_pre.get("schemas"):
                isolate_pre["schemas"] = isolate_pre["schemas"][1:]
        try:
            observed_extras = _check_restore_completeness(source_payload, isolate_pre)
        except LifecycleError as error:
            raise LifecycleError(
                self._structural_failure_detail(request, str(error), source_payload, isolate_pre)
            ) from None

        if self.restore_mode == "drill":
            # The drill left restore_test read-only; lift it before the migration phase.
            self._lift_isolate_read_only(container, dbname)

        self._apply_migrations(target, "base")
        after_base = self._run_capture(container=container, dbname=dbname)
        isolate_base = self._read_structural_payload(container, dbname)
        base_hash = self._compose_checkpoint_hash(
            request, container, dbname, source_payload, isolate_pre, isolate_base
        )

        self._apply_migrations(target, "observability")
        after_observability = self._run_capture(container=container, dbname=dbname)
        isolate_observability = self._read_structural_payload(container, dbname)
        observability_hash = self._compose_checkpoint_hash(
            request, container, dbname, source_payload, isolate_pre, isolate_observability
        )

        return {
            "database": source["database"],
            "database_owner": source["database_owner"],
            "migration_frontier": source["migration_frontier"],
            "baseline_structural_sha256": source["structural_sha256"],
            "guarded_relations": source["guarded_relations"],
            "cron_jobs": source["cron_jobs"],
            "migrations": {
                "20260711140000": {
                    "catalog_sha256": base_hash,
                    "migration_file_sha256": self._migration_file_sha256("20260711140000"),
                    "relations": self._relation_delta(
                        after_base["public_relations"], before_public
                    ),
                },
                "20260711151000": {
                    "catalog_sha256": observability_hash,
                    "migration_file_sha256": self._migration_file_sha256("20260711151000"),
                    "relations": self._relation_delta(
                        after_observability["public_relations"], after_base["public_relations"]
                    ),
                },
            },
            # Delta-neutral extras tolerated by the completeness gate (restore artifacts
            # absent from the source). Reported for the record; excluded from the catalog.
            # assemble_expected_catalog ignores this key, so the catalog bytes are unchanged.
            "observed_extra_identities": observed_extras,
        }

    def teardown(self) -> None:
        import shutil

        errors: list[str] = []
        if self._coordinator is not None:
            try:
                self._close_snapshot_coordinator(self._coordinator)
            except LifecycleError as error:
                errors.append(f"coordinator: {error}")
            self._coordinator = None
        container = self._resources.get("container")
        if container:
            result = self._docker_run(["rm", "-f", container], check=False)
            if result.returncode != 0:
                errors.append(f"container: {result.stderr.decode('utf-8', 'replace').strip()}")
            self._resources["container"] = None
        volume = self._resources.get("volume")
        if volume:
            result = self._docker_run(["volume", "rm", "--force", volume], check=False)
            if result.returncode != 0:
                errors.append(f"volume: {result.stderr.decode('utf-8', 'replace').strip()}")
            self._resources["volume"] = None
        network = self._resources.get("network")
        if network:
            result = self._docker_run(["network", "rm", network], check=False)
            if result.returncode != 0:
                errors.append(f"network: {result.stderr.decode('utf-8', 'replace').strip()}")
            self._resources["network"] = None
        handle = self._resources.get("handle")
        if handle:
            try:
                if os.path.lexists(handle):
                    os.unlink(handle)
            except OSError as error:
                errors.append(f"handle: {error}")
            self._resources["handle"] = None
        generation = self._resources.get("generation")
        if generation:
            try:
                shutil.rmtree(generation, ignore_errors=False)
            except OSError as error:
                errors.append(f"generation: {error}")
            self._resources["generation"] = None
        capability = self._resources.get("capability")
        if capability:
            try:
                if os.path.lexists(capability):
                    os.unlink(capability)
            except OSError as error:
                errors.append(f"capability: {error}")
            self._resources["capability"] = None
        secrets = self._resources.get("secrets")
        if secrets:
            try:
                shutil.rmtree(secrets, ignore_errors=False)
            except OSError as error:
                errors.append(f"secrets: {error}")
            self._resources["secrets"] = None
        workdir = self._resources.get("workdir")
        if workdir:
            try:
                shutil.rmtree(workdir, ignore_errors=False)
            except OSError as error:
                errors.append(f"workdir: {error}")
            self._resources["workdir"] = None
        # Second pass: force-remove any run-labeled docker leftover, so a
        # malformed-handle-after-persist path (where the resource names never
        # reached us) can never leak. Both the plan's own isolate label and the
        # drill's restore label are swept.
        errors.extend(self._label_sweep())
        if self.fault == "teardown":
            errors.append("injected teardown fault")
        if errors:
            raise LifecycleError(
                "plan diagnostic teardown failed (cleanup overrides success): " + "; ".join(errors)
            )

    def _label_sweep(self) -> list[str]:
        run_id = self._run_id
        if not run_id:
            return []
        errors: list[str] = []
        for label in (
            f"com.megacampus.q12.plan-run={run_id}",
            f"com.megacampus.q12.restore-run={run_id}",
        ):
            for kind, list_args, remove in (
                ("container", ["ps", "-aq"], ["rm", "-f"]),
                ("network", ["network", "ls", "-q"], ["network", "rm"]),
                ("volume", ["volume", "ls", "-q"], ["volume", "rm", "--force"]),
            ):
                listed = self._docker_run([*list_args, "--filter", f"label={label}"], check=False)
                if listed.returncode != 0:
                    continue
                for identity in listed.stdout.decode("utf-8", "replace").split():
                    result = self._docker_run([*remove, identity], check=False)
                    if result.returncode != 0:
                        errors.append(
                            f"{kind} sweep {identity}: "
                            f"{result.stderr.decode('utf-8', 'replace').strip()}"
                        )
        return errors


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Q12 retained barrier lifecycle")
    commands = root.add_subparsers(dest="mode", required=True)
    plan = commands.add_parser("plan")
    plan.add_argument("--run-id", required=True)
    plan.add_argument("--release-sha", required=True)
    plan.add_argument("--db-url-file", required=True)
    plan.add_argument("--ca-file", required=True)
    plan.add_argument("--generation", required=False)
    plan.add_argument("--run-root", required=False)
    # Argv-only (NOT an env seam, so production seam lockdown still rejects env seams):
    # on an equality-proof failure, preserve the full source/isolate payloads + diff.
    plan.add_argument("--keep-equality-diagnostics", action="store_true")
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
    smoke = commands.add_parser("smoke")
    smoke.add_argument("action", choices=("observe",))
    smoke.add_argument("--run-id", required=True)
    smoke.add_argument("--observation-fixture", required=True)
    # R5 Sub-round F — operator-reachable forward-cutover controllers. `live` drives a fresh
    # forward cutover (run_live); `recover` resumes an interrupted one from an existing run root
    # (run_recover). Both build the SAME production request as supervisor (run-root shape, canonical
    # cutover.lock FD9 lease, production=True) plus the fields run_live/run_recover consume, so both
    # subparsers carry the identical operator-supplied argv surface.
    for name in ("live", "recover"):
        controller = commands.add_parser(name)
        controller.add_argument("--run-id", required=True)
        controller.add_argument("--release-sha", required=True)
        controller.add_argument("--operator-digest", required=True)
        controller.add_argument("--resource-manifest-sha256", required=True)
        controller.add_argument("--quiesce-manifest-sha256", required=True)
        controller.add_argument("--expected-catalog-sha256", required=True)
        controller.add_argument("--quiesce-manifest-path", required=True)
        # Design §W2: the accepted .13.4.1 source-recovery run id — the StagedValueResolver's
        # <recovery-run-id> UPFRONT authority (and load_staged_values' upfront re-supply on recover).
        # Required on both controllers: the CLI always runs production=True, so the staged path always
        # needs it. run_live/run_recover fail closed (named) if it is absent.
        controller.add_argument("--recovery-run-id", required=True)
        # Design §W4: the reversible operator STOP-point, exposed on `live` ONLY. recover always
        # drives to convergence and never reads stop_after (:3817), so it carries no such flag. The
        # choices are the EXACT internal seam domain (_STOP_AFTER_STEP) so the CLI and run_live's
        # own `stop_after not in _STOP_AFTER_STEP` guard validate one identical checkpoint set.
        if name == "live":
            controller.add_argument(
                "--stop-after",
                required=False,
                default=None,
                choices=tuple(_STOP_AFTER_STEP),
                help=(
                    "stop the forward cutover cleanly AFTER this checkpoint and return the partial "
                    "output WITHOUT running the post-activate cleanup+resume segment. Checkpoints "
                    "at or before 'final-writer-manifest' are BEFORE the point of no return "
                    "(#18 rollback-abort still available); 'barrier.activate' stops AFTER activate "
                    "+ the nginx switch (PAST the point of no return). Resume with 'recover'."
                ),
            )
    return root


def main() -> int:
    arguments = parser().parse_args()
    if arguments.mode == "smoke":
        output = run_smoke(arguments)
        sys.stdout.buffer.write(complete_object(output))
        return 0
    if arguments.mode == "plan":
        output = run_plan(arguments, LivePlanExecutor())
        sys.stdout.buffer.write(complete_object(output))
        return 0
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
    if arguments.mode in ("live", "recover"):
        # R5 Sub-round F: mirror the supervisor branch's production seam discipline (run-root shape
        # /opt/megacampus/backups/q12/<run-id>, canonical parent cutover.lock inherited on FD9 under
        # an exclusive flock, production=True) and add exactly the fields run_live/run_recover
        # consume (quiesce manifest path/digest, expected catalog, release/operator identity).
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
            "run_id": arguments.run_id,
            "release_sha": arguments.release_sha,
            "operator_digest": arguments.operator_digest,
            "resource_manifest_sha256": arguments.resource_manifest_sha256,
            "quiesce_manifest_sha256": arguments.quiesce_manifest_sha256,
            "expected_catalog_sha256": arguments.expected_catalog_sha256,
            "quiesce_manifest_path": arguments.quiesce_manifest_path,
            # W2: the accepted source-recovery run id (StagedValueResolver <recovery-run-id>), and the
            # FIXED production source-connection secret PATHS the controller's window snapshot uses
            # over libpq (_source_service_env). Path-only, same paths prepare_barrier_cleanup shells —
            # one source of truth, never the secret values.
            "recovery_run_id": arguments.recovery_run_id,
            "db_url_file": "/opt/megacampus/secrets/supabase_db_url",
            "ca_file": "/opt/megacampus/secrets/prod-ca-2021.crt",
            # W4: the operator STOP-point (live only; recover's namespace has no --stop-after and
            # run_recover ignores this key — recover always converges). run_live validates it against
            # _STOP_AFTER_STEP and stops before the post-activate segment when set.
            "stop_after": getattr(arguments, "stop_after", None),
            "rotation_required": False,
            "lease_fd": 9,
            "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
            "production": True,
        }
        controller = run_live if arguments.mode == "live" else run_recover
        output = controller(request, owner_custody_executor())
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
