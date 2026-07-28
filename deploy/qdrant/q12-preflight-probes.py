#!/usr/bin/python3
"""Q12 window pre-flight — the FROZEN probe list (mc2-ot8se).

Contract: ``docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md``.  Its
§ "Hard invariants" and § "Probe list (frozen)" are the acceptance criteria; do not add, remove or
renumber a probe here without amending that document in the same commit.

WHY THIS EXISTS.  Nine live-window attempts produced nine defects, every one of the same class:
*the environment the code was verified in is more permissive than the one it runs in.*  The window
fails closed at the first violation — correct behaviour — so each expensive attempt yielded exactly
one finding.  This module moves discovery off the attempt path: one read-only probe that asserts
every environmental precondition the window depends on, re-runnable at no risk.

DISCIPLINE.  Every probe here is pure given a ``Context``.  All database access goes through
``Context.script``, which the entry point binds to the pooled production DSN and the test runner
binds to the managed-privilege fixture — so a probe cannot reach a connection the contract forbids,
and cannot be green under privileges production does not grant.  Every statement runs inside
``BEGIN READ ONLY`` and asserts ``transaction_read_only='on'`` before anything else (``read_only``
below).  No probe issues DDL, writes a row, or calls a function that could.

This module targets the interpreter the SERVER has (CPython 3.12), not the one a developer
workstation happens to have.  That asymmetry is the same class this whole probe exists to catch.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Callable, Optional

PASS = "pass"
FAIL = "fail"
UNPROVABLE = "unprovable"
VERDICTS = (PASS, FAIL, UNPROVABLE)

HOST_SCOPE = "host"
DATABASE_SCOPE = "database"

HEX64_RE = re.compile(r"[0-9a-f]{64}")
# The barrier's own frozen expectation, read out of its bytes rather than duplicated here, so probe
# A7 follows the barrier instead of drifting from it.
BARRIER_GUARDED_COUNT_RE = re.compile(
    r"\.guarded_relations \| type == \"array\" and length == (\d+)"
)

# The application_name every Q12 actor sets; the barrier's quiesce allowlist and the terminal
# proof's `barrier_era_session_count` both match on this prefix.
Q12_APPLICATION_PREFIX = "megacampus-q12-"
PREFLIGHT_APPLICATION_NAME = "megacampus-q12-window-preflight"

# C5/C6 cannot be established read-only. Their evidence pointers are part of the contract; a test
# asserts they are non-empty and name a real artifact.
C5_EVIDENCE = (
    "live-window attempt #9 installed q12_guard_ddl_command_start against production on "
    "2026-07-28 (bead mc2-6fnrt); the event trigger was created, then removed by the barrier's own "
    "$restore$ block through DROP SCHEMA q12_guard CASCADE"
)
C6_EVIDENCE = (
    "packages/course-gen-platform/tests/unit/ops/q12-guard-trigger-ownership.test.ts — the gated "
    "MC2_Q12_REAL_PG17 suite that round-trips pg_get_functiondef/pg_get_triggerdef against a real "
    "PostgreSQL 17.10 under the managed privilege split (bead mc2-ipwyc)"
)


class ProbeError(RuntimeError):
    """A probe could not complete. The runner turns this into a `fail` verdict."""


@dataclass
class ScriptResult:
    returncode: int
    stdout: str
    stderr: str


@dataclass
class HostAdapter:
    """Everything a host probe needs, injectable so H1..H5 are testable against a temp tree."""

    deploy_root: pathlib.Path
    run: Callable[[list[str]], ScriptResult]
    processes: Callable[[], "list[tuple[int, list[str]]]"]
    disk_free_bytes: Callable[[pathlib.Path], int]
    backup_root: pathlib.Path
    compose_file: pathlib.Path
    env_file: pathlib.Path
    gh: Optional[str] = None
    # The pre-flight's own pid, so H3 can never match its own command line.
    self_pid: int = field(default_factory=os.getpid)


@dataclass
class Context:
    scope: str
    # (sql, options=None, application_name=None) -> ScriptResult, on ONE fresh connection.
    script: Optional[Callable[..., ScriptResult]] = None
    catalog: Optional[dict] = None
    manifest: Optional[dict] = None
    barrier_text: Optional[str] = None
    structural_catalog_sql: Optional[str] = None
    host: Optional[HostAdapter] = None
    # Files whose bytes probe B1 scans for a surviving dependence on startup `options` delivery.
    option_dependence_sources: "dict[str, str]" = field(default_factory=dict)


def verdict(
    probe_id: str, value: str, detail: str, evidence: Optional[str] = None
) -> "dict[str, object]":
    if value not in VERDICTS:
        raise ProbeError(f"unknown verdict {value!r} for {probe_id}")
    return {"id": probe_id, "verdict": value, "detail": detail, "evidence": evidence}


# --- read-only transaction discipline ---------------------------------------------------------
#
# `BEGIN READ ONLY` alone is not the assertion — a caller could open the transaction and never
# check. The guard statement below divides by `(transaction_read_only='on')::int`, so a session
# that is not read-only aborts the whole script with ON_ERROR_STOP before the probe body is ever
# parsed. A CASE ... THEN 1 ELSE 1/0 END form would NOT work: the planner constant-folds the
# untaken arm and errors even when the transaction IS read-only.
#
# `SET LOCAL search_path=pg_catalog` is pinned for the same reason the plan capture pins it
# (mc2-2rzf6): pg_get_indexdef, pg_get_constraintdef, pg_get_expr, format_type and
# pg_get_function_identity_arguments all suppress the schema qualifier for objects visible in the
# current search_path, so the same database hashes differently under two contexts. Producer and
# consumer must measure in ONE context.
READ_ONLY_ASSERT = (
    "SELECT 1 / (pg_catalog.current_setting('transaction_read_only') = 'on')::int"
)


def read_only(body: str) -> str:
    """Wrap one semicolon-free query in a read-only transaction that asserts its own read-onlyness."""
    if ";" in body:
        raise ProbeError("probe body must be one semicolon-free query")
    return (
        "BEGIN READ ONLY;\n"
        "SET LOCAL search_path = pg_catalog;\n"
        f"{READ_ONLY_ASSERT} \\g /dev/null\n"
        f"COPY ({body}) TO STDOUT;\n"
        "COMMIT;\n"
    )


_COPY_ESCAPES = {"\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}


def decode_copy(text: str) -> str:
    """Reverse COPY TO STDOUT text-format escaping so an embedded jsonb parses back cleanly."""
    if "\\" not in text:
        return text
    out: list[str] = []
    index = 0
    while index < len(text):
        char = text[index]
        if char == "\\" and index + 1 < len(text):
            out.append(_COPY_ESCAPES.get(text[index + 1], text[index + 1]))
            index += 2
            continue
        out.append(char)
        index += 1
    return "".join(out)


def query(context: Context, body: str) -> str:
    """One read-only transaction, one scalar answer."""
    if context.script is None:
        raise ProbeError("no database seam is bound in this scope")
    result = context.script(read_only(body))
    if result.returncode != 0:
        message = " ".join(result.stderr.split())[:400]
        if "division by zero" in message:
            raise ProbeError("transaction was not READ ONLY when the probe asserted it")
        raise ProbeError(f"read-only query failed: {message}")
    return decode_copy(result.stdout.strip())


def query_json(context: Context, body: str) -> object:
    raw = query(context, body)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise ProbeError(f"probe result was not JSON: {error}") from None


def name_list(names: "list[str]", limit: int = 10) -> str:
    """Every fail detail names the exact offenders, sorted, capped with an honest count."""
    ordered = sorted(names)
    if len(ordered) <= limit:
        return ", ".join(ordered)
    return f"{', '.join(ordered[:limit])} (+{len(ordered) - limit} more of {len(ordered)})"


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _not_implemented(context: Context) -> "dict[str, object]":
    raise NotImplementedError("probe not implemented yet")


# --- the frozen probe list --------------------------------------------------------------------

PROBES: "tuple[dict[str, object], ...]" = (
    {"id": "A1", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A2", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A3", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A4", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A5", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A6", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "A7", "group": "A", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "B1", "group": "B", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "B2", "group": "B", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "B3", "group": "B", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "B4", "group": "B", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C1", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C2", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C3", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C4", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C5", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "C6", "group": "C", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "D1", "group": "D", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "E1", "group": "E", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "E2", "group": "E", "scope": DATABASE_SCOPE, "run": _not_implemented},
    {"id": "H1", "group": "H", "scope": HOST_SCOPE, "run": _not_implemented},
    {"id": "H2", "group": "H", "scope": HOST_SCOPE, "run": _not_implemented},
    {"id": "H3", "group": "H", "scope": HOST_SCOPE, "run": _not_implemented},
    {"id": "H4", "group": "H", "scope": HOST_SCOPE, "run": _not_implemented},
    {"id": "H5", "group": "H", "scope": HOST_SCOPE, "run": _not_implemented},
)

FROZEN_IDS: "tuple[str, ...]" = tuple(str(probe["id"]) for probe in PROBES)


def probes_for_scope(scope: str) -> "tuple[dict[str, object], ...]":
    if scope == "all":
        return PROBES
    if scope not in (HOST_SCOPE, DATABASE_SCOPE):
        raise ProbeError(f"unknown scope {scope!r}")
    return tuple(probe for probe in PROBES if probe["scope"] == scope)


def out_of_scope_ids(scope: str) -> "tuple[str, ...]":
    """Named, never dropped: a narrower scope must not read as 'everything passed'."""
    selected = {str(probe["id"]) for probe in probes_for_scope(scope)}
    return tuple(probe_id for probe_id in FROZEN_IDS if probe_id not in selected)


def default_host_adapter(deploy_root: pathlib.Path) -> HostAdapter:
    """The production host seam: real processes, real disk, real docker."""

    def run(argv: "list[str]") -> ScriptResult:
        completed = subprocess.run(argv, capture_output=True, text=True, check=False)
        return ScriptResult(completed.returncode, completed.stdout, completed.stderr)

    def processes() -> "list[tuple[int, list[str]]]":
        found: list[tuple[int, list[str]]] = []
        for entry in pathlib.Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                raw = (entry / "cmdline").read_bytes()
            except OSError:
                continue
            argv = [part for part in raw.decode("utf-8", "replace").split("\0") if part]
            if argv:
                found.append((int(entry.name), argv))
        return found

    def disk_free(path: pathlib.Path) -> int:
        return shutil.disk_usage(str(path)).free

    return HostAdapter(
        deploy_root=deploy_root,
        run=run,
        processes=processes,
        disk_free_bytes=disk_free,
        backup_root=deploy_root / "backups",
        compose_file=deploy_root / "docker-compose.infra.yml",
        env_file=deploy_root / ".env.production",
    )
