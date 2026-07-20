#!/usr/bin/python3
import argparse
import os
import pathlib
import re
import secrets
import shutil
import signal
import stat
import sys


created: pathlib.Path | None = None
adopted = False


def cleanup() -> None:
    global created
    if created is not None and not adopted:
        if created.is_dir():
            shutil.rmtree(created)
        else:
            created.unlink(missing_ok=True)
        created = None


def on_signal(number: int, _frame: object) -> None:
    cleanup()
    raise SystemExit(128 + number)


def fail(message: str) -> None:
    print(f"private temp directory helper failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    global adopted, created
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--parent", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--kind", choices=("directory", "file"), default="directory")
    arguments = parser.parse_args()
    parent = pathlib.Path(arguments.parent)
    if not parent.is_absolute() or parent.resolve() != parent:
        fail("parent must be canonical")
    parent_metadata = parent.lstat()
    private_parent = (
        parent_metadata.st_uid == os.getuid()
        and parent_metadata.st_gid == os.getgid()
        and stat.S_IMODE(parent_metadata.st_mode) == 0o700
    )
    system_tmp = parent == pathlib.Path("/tmp") and parent_metadata.st_uid == 0 and stat.S_IMODE(parent_metadata.st_mode) == 0o1777
    if (
        not stat.S_ISDIR(parent_metadata.st_mode)
        or not (private_parent or system_tmp)
    ):
        fail("parent metadata mismatch")
    if not (
        re.fullmatch(r"mc2-supabase-restore-[A-Za-z0-9-]*", arguments.prefix)
        or re.fullmatch(r"\.generation\.[0-9a-f-]{36}\.", arguments.prefix)
        or re.fullmatch(r"latest\.json\.[0-9a-f-]{36}\.tmp\.", arguments.prefix)
    ):
        fail("prefix is invalid")
    for watched in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(watched, on_signal)
    watched_signals = {signal.SIGHUP, signal.SIGINT, signal.SIGTERM}
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for _attempt in range(128):
        candidate = parent / (arguments.prefix + "".join(secrets.choice(alphabet) for _ in range(6)))
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, watched_signals)
        try:
            if arguments.kind == "directory":
                candidate.mkdir(mode=0o700)
            else:
                descriptor = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
                os.close(descriptor)
            signal_injection = os.environ.get("MC2_PRIVATE_TEMP_TEST_SIGNAL_AFTER_CREATE")
            if signal_injection in ("1", arguments.kind):
                os.kill(os.getpid(), signal.SIGTERM)
            created = candidate
        except FileExistsError:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
            continue
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        break
    if created is None:
        fail("could not allocate a unique temporary name")
    metadata = created.lstat()
    expected_type = stat.S_ISDIR if arguments.kind == "directory" else stat.S_ISREG
    expected_mode = 0o700 if arguments.kind == "directory" else 0o600
    if (
        not expected_type(metadata.st_mode)
        or metadata.st_uid != os.getuid()
        or metadata.st_gid != os.getgid()
        or stat.S_IMODE(metadata.st_mode) != expected_mode
    ):
        fail("created temporary metadata mismatch")
    print(created, flush=True)
    if sys.stdin.readline() != "adopt\n":
        cleanup()
        raise SystemExit(75)
    adopted = True


try:
    main()
finally:
    cleanup()
