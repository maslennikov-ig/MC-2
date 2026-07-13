#!/usr/bin/python3
import mmap
import re
import sys
import tempfile


EXPECTED = {
    b"basejump-supabase_test_helpers": b"0.0.6",
    b"supabase-dbdev": b"0.0.5",
}
CREATE_FUNCTION = re.compile(
    rb'(?m)^CREATE FUNCTION pgtle\."((?:[^"]|"")+)"\s*\('
)
BODY_START = re.compile(rb"\bAS\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)", re.IGNORECASE)


def fail(message: str) -> None:
    print(f"pgTLE archive validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


with tempfile.TemporaryFile() as archive_sql:
    while chunk := sys.stdin.buffer.read(1024 * 1024):
        archive_sql.write(chunk)
    if archive_sql.tell() == 0:
        fail("restored SQL is empty")
    archive_sql.flush()
    with mmap.mmap(archive_sql.fileno(), 0, access=mmap.ACCESS_READ) as restored:
        matches = list(CREATE_FUNCTION.finditer(restored))
        identities = [match.group(1).replace(b'""', b'"') for match in matches]
        for package, version in EXPECTED.items():
            control = package + b".control"
            sql = package + b"--" + version + b".sql"
            if identities.count(control) != 1:
                fail(f"expected exactly one {control.decode()} function")
            if identities.count(sql) != 1:
                fail(f"expected exactly one {sql.decode()} function")
            conflicting = [
                identity.decode(errors="replace")
                for identity in identities
                if identity.startswith(package + b"--")
                and identity.endswith(b".sql")
                and identity != sql
            ]
            if conflicting:
                fail(f"conflicting SQL package versions for {package.decode()}")

            control_index = identities.index(control)
            start = matches[control_index].start()
            next_function = matches[control_index + 1].start() if control_index + 1 < len(matches) else len(restored)
            body_start = BODY_START.search(restored, matches[control_index].end(), next_function)
            if body_start is None:
                fail(f"control function body missing for {package.decode()}")
            delimiter = body_start.group(1)
            body_end = restored.find(delimiter, body_start.end(), next_function)
            if body_end < 0:
                fail(f"unterminated control function body for {package.decode()}")
            body = restored[body_start.end():body_end]
            versions = re.findall(rb"(?m)^\s*default_version\s*=\s*'([^']+)'\s*$", body)
            if versions != [version]:
                fail(f"control default_version mismatch for {package.decode()}")
