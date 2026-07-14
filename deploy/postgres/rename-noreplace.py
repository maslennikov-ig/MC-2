#!/usr/bin/python3
"""Call Linux renameat2(2) with RENAME_NOREPLACE and no unsafe fallback."""

from __future__ import annotations

import ctypes
import errno
import os
import sys

AT_FDCWD = -100
RENAME_NOREPLACE = 1


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: rename-noreplace.py SOURCE DESTINATION", file=sys.stderr)
        return 64

    source, destination = map(os.fsencode, sys.argv[1:])
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = libc.renameat2
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    if renameat2(AT_FDCWD, source, AT_FDCWD, destination, RENAME_NOREPLACE) == 0:
        return 0

    error = ctypes.get_errno()
    if error in (errno.EEXIST, errno.ENOTEMPTY):
        return 73
    print(f"renameat2(RENAME_NOREPLACE) failed: {os.strerror(error)}", file=sys.stderr)
    return 74


if __name__ == "__main__":
    raise SystemExit(main())
