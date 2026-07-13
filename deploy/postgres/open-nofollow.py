#!/usr/bin/python3
import argparse
import os
import stat
import sys


def fail(message: str) -> None:
    print(f"no-follow open helper failed: {message}", file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--path", required=True)
arguments = parser.parse_args()

try:
    descriptor = os.open(arguments.path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
except OSError:
    fail("input could not be opened without following links")

try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        fail("input is not a regular file")
    identity = ":".join(str(value) for value in (metadata.st_dev, metadata.st_ino, metadata.st_uid, metadata.st_gid))
    identity += f":{stat.S_IMODE(metadata.st_mode):o}"
    print(f"/proc/{os.getpid()}/fd/{descriptor}", flush=True)
    print(identity, flush=True)
    if sys.stdin.readline() != "adopt\n":
        raise SystemExit(75)
finally:
    os.close(descriptor)
