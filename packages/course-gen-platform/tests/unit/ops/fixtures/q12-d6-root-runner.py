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

import importlib.util
import json
import os
import pathlib
import socket
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
    import fcntl

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


DISPATCH = {**TASK16}


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
