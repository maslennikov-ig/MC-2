#!/usr/bin/python3
"""Synthetic driver for the D6 activation-truth Root coordinator (Tasks 16-19).

This runner imports the production ``deploy/qdrant/q12-lifecycle-core.py`` module
and exercises its D6 Root-coordinator entry points in a disposable local sandbox
with synthetic secrets, synthetic descriptors, and synthetic on-disk epochs. It
never connects to Supabase, the pinned server, or any live host; the pinned-server
capability observations (atomic ``POSIX_SPAWN_CLOSEFROM`` on the server, real
pidfd/ptrace/Yama policy) stay behind the separately authorized remote gate and are
reported as ``remote-gate`` here, never faked green.

Protocol: read one JSON object ``{"scenario": <name>, ...}`` from stdin, dispatch,
and print exactly one JSON object ``{"ok": true, ...}`` or ``{"ok": false,
"error": <message>}`` to stdout.
"""

from __future__ import annotations

import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import stat as stat_module
import sys
import tempfile


def _load_core():
    core_path = (
        pathlib.Path(__file__).resolve().parents[6]
        / "deploy"
        / "qdrant"
        / "q12-lifecycle-core.py"
    )
    spec = importlib.util.spec_from_file_location("q12core_d6", core_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CORE = _load_core()


def _describe_file_action(action: tuple) -> list:
    kind = action[0]
    names = {
        getattr(os, "POSIX_SPAWN_OPEN", -1): "open",
        getattr(os, "POSIX_SPAWN_CLOSE", -2): "close",
        getattr(os, "POSIX_SPAWN_DUP2", -3): "dup2",
        getattr(os, "POSIX_SPAWN_CLOSEFROM", -4): "closefrom",
    }
    label = names.get(kind, f"kind:{kind}")
    if label == "open":
        return ["open", action[1], os.fsdecode(action[2]), action[3], action[4]]
    if label == "dup2":
        return ["dup2", action[1], action[2]]
    return [label, action[1]]


def _make_secret(directory: pathlib.Path, name: str, data: bytes, mode: int) -> pathlib.Path:
    path = directory / name
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(descriptor, data)
    finally:
        os.close(descriptor)
    os.chmod(path, mode)
    return path


# --------------------------------------------------------------------------- #
# Task 16 — posix_spawn boundary + FD map/close-from + secret revalidation
# --------------------------------------------------------------------------- #


def scenario_spawn_file_actions(payload: dict) -> dict:
    sources = {int(target): int(src) for target, src in payload["sources"].items()}
    actions = CORE.d6_build_spawn_file_actions(sources)
    return {
        "ok": True,
        "closefrom_capability": CORE.d6_closefrom_capability(),
        "actions": [_describe_file_action(action) for action in actions],
    }


def _hoist(descriptor: int) -> int:
    """Return an inheritable duplicate of ``descriptor`` above the close-from line."""
    hoisted = fcntl.fcntl(descriptor, fcntl.F_DUPFD, 12)
    os.set_inheritable(hoisted, True)
    return hoisted


def scenario_spawn_under_pressure(payload: dict) -> dict:
    """Really spawn a child under descriptor pressure and report its inherited FDs."""
    pressure = int(payload.get("pressure", 64))
    ballast: list[int] = []
    audit_r, audit_w = os.pipe()
    marker = os.open("/dev/null", os.O_RDONLY)
    lock_fd = os.open("/dev/null", os.O_RDONLY)
    hoisted: list[int] = []
    try:
        for _ in range(pressure):
            read_end, write_end = os.pipe()
            ballast.append(read_end)
            ballast.append(write_end)
        # FD9 (canonical lease) is inherited directly at its own number.
        os.dup2(lock_fd, 9, inheritable=True)
        # Every other mapped source is held above the close-from line, as Root does.
        sources = {1: _hoist(audit_w), 2: _hoist(audit_w), 9: 9}
        hoisted.extend([sources[1], sources[2]])
        for target in (3, 4, 5, 6, 7, 10, 11):
            source = _hoist(marker)
            hoisted.append(source)
            sources[target] = source
        # A live descriptor parked at FD8 must be explicitly closed before exec.
        os.dup2(marker, 8, inheritable=True)
        # Probe fd numbers by fstat so the inspector opens no extra descriptor of
        # its own (os.listdir on a dirfd would dup it and pollute the report).
        inspector = (
            "import os\n"
            "def live(n):\n"
            " try: os.fstat(n); return True\n"
            " except OSError: return False\n"
            "fds=[n for n in range(0,64) if live(n)]\n"
            "os.write(1,(','.join(map(str,fds))).encode())\n"
        )
        pid = CORE.d6_posix_spawn(
            ["/usr/bin/python3", "-c", inspector],
            {"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "HOME": "/var/empty"},
            sources,
        )
        # Close every parent-side copy of the audit pipe write end (audit_w plus the
        # hoisted FD1/FD2 sources) so the read below sees EOF once the child exits.
        os.close(audit_w)
        for descriptor in hoisted:
            try:
                os.close(descriptor)
            except OSError:
                pass
        hoisted.clear()
        chunks = []
        while True:
            data = os.read(audit_r, 4096)
            if not data:
                break
            chunks.append(data)
        _, status = os.waitpid(pid, 0)
        reported = b"".join(chunks).decode().strip()
        child_fds = sorted(int(value) for value in reported.split(",")) if reported else []
        return {
            "ok": True,
            "child_fds": child_fds,
            "exit_status": os.waitstatus_to_exitcode(status),
            "closefrom_capability": CORE.d6_closefrom_capability(),
        }
    finally:
        for descriptor in ballast + hoisted + [audit_r, marker, 8, 9]:
            try:
                os.close(descriptor)
            except OSError:
                pass


def scenario_validate_secret(payload: dict) -> dict:
    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="q12-d6-secret-"))
    mode = int(payload["mode"], 8)
    path = _make_secret(sandbox, "supabase_db_url", b"postgresql://u:p@h/postgres\n", mode)
    if payload.get("symlink"):
        target = path
        path = sandbox / "link"
        os.symlink(target, path)
    owner_uid = os.getuid() if payload.get("owner") == "self" else 999999
    owner_gid = os.getgid() if payload.get("owner") == "self" else 999999
    fd, dev, ino = CORE.d6_validate_secret_source(
        path,
        mode_set=frozenset(int(value, 8) for value in payload["accept_modes"]),
        owner_uid=owner_uid,
        owner_gid=owner_gid,
    )
    os.close(fd)
    return {"ok": True, "dev": dev, "ino": ino}


TASK16 = {
    "spawn_file_actions": scenario_spawn_file_actions,
    "spawn_under_pressure": scenario_spawn_under_pressure,
    "validate_secret": scenario_validate_secret,
}


# --------------------------------------------------------------------------- #
# Task 17 — pidfd / ptrace / proc / OFD capability gates
# --------------------------------------------------------------------------- #


def scenario_pidfd_gates(payload: dict) -> dict:
    """Spawn a real child inheriting the held FD9 lock and prove the pidfd gates.

    The pinned server's PTRACE_MODE_ATTACH_REALCREDS / Yama acceptance is a separate
    remote gate; locally the parent may pidfd_getfd its own child, so this proves the
    mechanism read-only, never the server policy."""
    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="q12-d6-pidfd-"))
    lock_path = sandbox / "cutover.lock"
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    hoisted = _hoist(lock_fd)
    pid = os.posix_spawn(
        "/usr/bin/sleep",
        ["/usr/bin/sleep", "120"],
        {"PATH": "/usr/bin:/bin"},
        file_actions=[(os.POSIX_SPAWN_DUP2, hoisted, 9), (os.POSIX_SPAWN_CLOSE, hoisted)],
    )
    os.close(hoisted)
    pidfd = -1
    try:
        pidfd = CORE.d6_pidfd_open(pid)
        baseline = CORE.d6_proc_identity(pid)
        CORE.d6_assert_proc_continuity(pid, baseline)
        got9 = CORE.d6_pidfd_getfd(pidfd, 9)
        contention = CORE.d6_verify_fd9_ofd_contention(got9, lock_path)
        os.close(got9)
        # A descriptor the child never held (above 11) cannot be retrieved.
        try:
            leaked = CORE.d6_pidfd_getfd(pidfd, 40)
            os.close(leaked)
            no_leak = False
        except OSError:
            no_leak = True
        # A mismatched proc identity (e.g. pid reuse) is rejected.
        forged = (str(int(baseline[0]) + 1), baseline[1], baseline[2])
        try:
            CORE.d6_assert_proc_continuity(pid, forged)
            continuity_rejects = False
        except CORE.LifecycleError:
            continuity_rejects = True
        return {
            "ok": True,
            "pidfd_capability": True,
            "fd9_ofd_contention": contention,
            "exe_is_sleep": baseline[1].endswith("sleep"),
            "boot_id_len": len(baseline[2]),
            "no_leak_above_11": no_leak,
            "continuity_rejects_mismatch": continuity_rejects,
        }
    finally:
        if pidfd >= 0:
            os.close(pidfd)
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
        os.close(lock_fd)


def scenario_ofd_contention_unlocked(payload: dict) -> dict:
    """FD9 that is NOT holding the exclusive lock fails the OFD contention gate."""
    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="q12-d6-ofd-"))
    lock_path = sandbox / "cutover.lock"
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    # Deliberately do NOT flock: the contention proof must fail closed.
    try:
        result = CORE.d6_verify_fd9_ofd_contention(lock_fd, lock_path)
        return {"ok": True, "contention": result}
    finally:
        os.close(lock_fd)


TASK17 = {
    "pidfd_gates": scenario_pidfd_gates,
    "ofd_contention_unlocked": scenario_ofd_contention_unlocked,
}


# --------------------------------------------------------------------------- #
# Task 18 — Root predecision, optional R and terminal seal authority
# --------------------------------------------------------------------------- #

RUN_ID = "3b241101-e2bb-4255-8caf-4136c566a962"


def _sha(tag: str) -> str:
    return hashlib.sha256(tag.encode("utf-8")).hexdigest()


def _predecision_fields(classification: str, overrides: dict | None = None) -> dict:
    precommit = classification == "precommit_rollback"
    fields = {
        "schema_version": "megacampus.q12.activation-truth-predecision/v1",
        "run_id": RUN_ID,
        "lease_epoch": "cutover",
        "request_sha256": _sha("request"),
        "classification": classification,
        "action": CORE.D6_CLASSIFICATION_ACTION.get(classification, "?"),
        "initial_database_projection_sha256": _sha("idb"),
        "bound_database_projection_sha256": _sha("bdb"),
        "host_projection_sha256": _sha("host"),
        "transcript_head_before_predecision_sha256": _sha("thead"),
        "predecessor_journal_entry_hash": _sha("pje"),
        "predecessor_checkpoint_sha256": _sha("pcp"),
        "planned_r_journal_entry_hash": _sha("rje") if precommit else None,
        "planned_r_checkpoint_sha256": _sha("rcp") if precommit else None,
        "previous_terminal_seal_sha256": None,
        "abandoned_predecision_sha256": None,
    }
    fields.update(overrides or {})
    return fields


def _seal_fields(classification: str, predecision: dict, overrides: dict | None = None) -> dict:
    precommit = classification == "precommit_rollback"
    evidence = {
        "precommit_rollback": "prepared_guarded",
        "committed_finish_forward": "complete_receipt",
        "drift_incident": "incident_observed",
    }[classification]
    fields = {
        "schema_version": "megacampus.q12.activation-truth-terminal-seal/v1",
        "run_id": predecision["run_id"],
        "lease_epoch": predecision["lease_epoch"],
        "outcome": CORE.D6_OUTCOME.get(classification, "?"),
        "request_sha256": predecision["request_sha256"],
        "predecision_sha256": _sha("predecision"),
        "final_transcript_head_sha256": _sha("ftranscript"),
        "initial_database_projection_sha256": predecision["initial_database_projection_sha256"],
        "final_database_projection_sha256": _sha("fdb"),
        "host_projection_sha256": predecision["host_projection_sha256"],
        "activation_evidence_state": evidence,
        "actual_r_journal_entry_hash": predecision["planned_r_journal_entry_hash"] if precommit else None,
        "actual_r_checkpoint_sha256": predecision["planned_r_checkpoint_sha256"] if precommit else None,
        "probe_pidfd_identity_sha256": _sha("pidfd"),
        "fd9_identity_sha256": _sha("fd9"),
        "spawn_capability_sha256": _sha("spawn"),
        "prepared_quiesced_predecessor_sha256": _sha("pqp"),
        "writer_quiesce_manifest_sha256": _sha("wqm"),
        "barrier_receipt_sha256": _sha("barrier"),
        "probe_receipt_sha256": _sha("probe"),
        "activation_result_sha256": _sha("result") if classification == "committed_finish_forward" else None,
        "activation_process_projection_sha256": _sha("app"),
        "process_manifest_sha256": None,
        "probe_exit_status": 0,
        "transaction_end": "read_only_commit",
        "connection_closed": True,
    }
    fields.update(overrides or {})
    return fields


def scenario_predecision(payload: dict) -> dict:
    fields = _predecision_fields(payload["classification"], payload.get("overrides"))
    predecision = CORE.d6_build_predecision(fields)
    return {"ok": True, "keys": sorted(predecision), "predecision": predecision}


def scenario_terminal_seal(payload: dict) -> dict:
    classification = payload["classification"]
    predecision = CORE.d6_build_predecision(_predecision_fields(classification))
    fields = _seal_fields(classification, predecision, payload.get("overrides"))
    seal = CORE.d6_build_terminal_seal(fields, predecision)
    return {
        "ok": True,
        "keys": sorted(seal),
        "outcome": seal["outcome"],
        "authority": CORE.d6_terminal_seal_authority(seal),
    }


def scenario_publish_authority(payload: dict) -> dict:
    classification = payload["classification"]
    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="q12-d6-seal-"))
    run_dir = sandbox / "run"
    os.mkdir(run_dir, 0o700)
    predecision = CORE.d6_build_predecision(_predecision_fields(classification))
    seal = CORE.d6_build_terminal_seal(
        _seal_fields(classification, predecision), predecision
    )
    trace: list[str] = []
    CORE.d6_publish_immutable_object(run_dir, "request", "cutover", {"k": "request"}, trace)
    CORE.d6_append_transcript(run_dir, "cutover", {"frame": 1}, trace)
    CORE.d6_publish_immutable_object(run_dir, "predecision", "cutover", predecision, trace)
    # A durable R with no valid terminal seal is incident-only, never authority.
    without_seal = CORE.d6_authority_without_seal(predecision)
    CORE.d6_append_transcript(run_dir, "cutover", {"frame": 2}, trace)
    CORE.d6_publish_immutable_object(run_dir, "terminal-seal", "cutover", seal, trace)

    def mode_of(name: str) -> str:
        path = run_dir / f"activation-truth-{name}-cutover.json"
        return oct(stat_module.S_IMODE(os.lstat(path).st_mode))

    transcript = run_dir / "activation-truth-transcript-cutover.jsonl"
    return {
        "ok": True,
        "trace": trace,
        "request_mode": mode_of("request"),
        "predecision_mode": mode_of("predecision"),
        "seal_mode": mode_of("terminal-seal"),
        "transcript_mode": oct(stat_module.S_IMODE(os.lstat(transcript).st_mode)),
        "authority_without_seal": without_seal,
        "authority_with_seal": CORE.d6_terminal_seal_authority(seal),
    }


TASK18 = {
    "predecision": scenario_predecision,
    "terminal_seal": scenario_terminal_seal,
    "publish_authority": scenario_publish_authority,
}


# --------------------------------------------------------------------------- #
# Task 19 — post-R D5 narrowing, race closure and restart authority
# --------------------------------------------------------------------------- #


def scenario_post_r_narrowing(payload: dict) -> dict:
    allowed = {}
    for actor, action in payload["checks"]:
        allowed[f"{actor}:{action}"] = CORE.d6_post_r_allowed(actor, action)
    return {"ok": True, "allowed": allowed}


def scenario_race_order(payload: dict) -> dict:
    return {"ok": True, "order": CORE.d6_precommit_race_order()}


def scenario_crash_authority(payload: dict) -> dict:
    return {"ok": True, "authority": CORE.d6_crash_authority(payload["state"])}


def scenario_restart_authority(payload: dict) -> dict:
    result = CORE.d6_select_restart_authority(payload["epochs"], payload["canonical_head"])
    return {"ok": True, **result}


TASK19 = {
    "post_r_narrowing": scenario_post_r_narrowing,
    "race_order": scenario_race_order,
    "crash_authority": scenario_crash_authority,
    "restart_authority": scenario_restart_authority,
}


# --------------------------------------------------------------------------- #
# Post-review corrections: NFC canonicalization, after-read secret revalidation,
# and terminal-seal <-> predecision binding.
# --------------------------------------------------------------------------- #


def scenario_canonical_nfc(payload: dict) -> dict:
    """A decomposed-Unicode payload must hash identically to its NFC-composed form."""
    composed = payload["composed"]
    decomposed = payload["decomposed"]
    value_c = hashlib.sha256(CORE.canonical({"name": composed})).hexdigest()
    value_d = hashlib.sha256(CORE.canonical({"name": decomposed})).hexdigest()
    key_c = hashlib.sha256(CORE.canonical({composed: 1})).hexdigest()
    key_d = hashlib.sha256(CORE.canonical({decomposed: 1})).hexdigest()
    return {
        "ok": True,
        "value_equal": value_c == value_d,
        "key_equal": key_c == key_d,
        "no_trailing_lf": not CORE.canonical({"name": composed}).endswith(b"\n"),
    }


def scenario_secret_after_read(payload: dict) -> dict:
    """Prove owner/mode/type/dev/inode are re-checked after the secret bytes are read."""
    sandbox = pathlib.Path(tempfile.mkdtemp(prefix="q12-d6-afterread-"))
    path = _make_secret(sandbox, "supabase_db_url", b"postgresql://u:p@h/postgres\n", 0o600)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    before = os.fstat(descriptor)
    before_tuple = [before.st_uid, before.st_gid, before.st_mode, before.st_dev, before.st_ino]
    mutation = payload.get("mutation")
    if mutation == "chmod":
        os.chmod(path, 0o644)
    elif mutation == "swap":
        _make_secret(sandbox, "replacement", b"other\n", 0o600)
        os.replace(sandbox / "replacement", path)
    try:
        CORE.d6_assert_secret_identity_stable(
            descriptor,
            before_tuple,
            path,
            mode_set=frozenset((0o400, 0o600)),
            owner_uid=os.getuid(),
            owner_gid=os.getgid(),
        )
        return {"ok": True, "stable": True}
    finally:
        os.close(descriptor)


def scenario_seal_binding(payload: dict) -> dict:
    classification = payload.get("classification", "precommit_rollback")
    predecision = CORE.d6_build_predecision(_predecision_fields(classification))
    overrides = {"predecision_sha256": CORE.d6_predecision_sha256(predecision)}
    if payload.get("tamper"):
        overrides["predecision_sha256"] = _sha("tampered-predecision")
    seal = CORE.d6_build_terminal_seal(
        _seal_fields(classification, predecision, overrides), predecision
    )
    CORE.d6_verify_seal_binding(seal, predecision)
    return {"ok": True, "bound": True}


CORRECTIONS = {
    "canonical_nfc": scenario_canonical_nfc,
    "secret_after_read": scenario_secret_after_read,
    "seal_binding": scenario_seal_binding,
}


DISPATCH = {**TASK16, **TASK17, **TASK18, **TASK19, **CORRECTIONS}


def main() -> int:
    payload = json.loads(sys.stdin.read())
    scenario = payload.get("scenario")
    handler = DISPATCH.get(scenario)
    if handler is None:
        print(json.dumps({"ok": False, "error": f"unknown scenario: {scenario}"}))
        return 0
    try:
        result = handler(payload)
    except Exception as error:  # noqa: BLE001 — the driver reports failures as data
        print(json.dumps({"ok": False, "error": f"{type(error).__name__}: {error}"}))
        return 0
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
