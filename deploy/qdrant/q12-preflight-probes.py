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
    # Per-run memo so the seven group-A probes share one round trip. Cleared per Context; a probe
    # must never depend on another probe having populated it.
    cache: dict = field(default_factory=dict)


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


# --- Group A: privilege reachability on the guarded set ----------------------------------------
#
# The C1 wall. `cron.job` (attempts #6/#7, mc2-34eua) and the auth/storage ownership split
# (mc2-ipwyc) both live here. `barrier.install` needs, on EVERY guarded relation,
# `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` (one of UPDATE/DELETE/TRUNCATE/MAINTAIN) and
# `CREATE TRIGGER` (TRIGGER). In a managed database the role holds neither by default and owns
# almost nothing, so both are measured per relation rather than assumed from "we are postgres".

GUARDED_SCHEMAS = ("public", "auth", "storage", "net", "cron")

# One projection, seven probes. Privileges are measured with has_table_privilege against
# `current_user` — the role the barrier will actually run as — never against a hardcoded name.
LIVE_GUARDED_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'schema', n.nspname,
  'name', c.relname,
  'oid', c.oid::bigint,
  'relkind', c.relkind::text,
  'owner', pg_catalog.pg_get_userbyid(c.relowner),
  'parent', (SELECT parent_ns.nspname || '.' || parent.relname
             FROM pg_catalog.pg_inherits i
             JOIN pg_catalog.pg_class parent ON parent.oid = i.inhparent
             JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
             WHERE i.inhrelid = c.oid),
  'parent_oid', (SELECT i.inhparent::bigint FROM pg_catalog.pg_inherits i WHERE i.inhrelid = c.oid),
  'lockable', (pg_catalog.has_table_privilege(current_user, c.oid, 'UPDATE')
            OR pg_catalog.has_table_privilege(current_user, c.oid, 'DELETE')
            OR pg_catalog.has_table_privilege(current_user, c.oid, 'TRUNCATE')
            OR pg_catalog.has_table_privilege(current_user, c.oid, 'MAINTAIN')),
  'triggerable', pg_catalog.has_table_privilege(current_user, c.oid, 'TRIGGER')
) ORDER BY n.nspname, c.relname), '[]'::jsonb)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'auth', 'storage', 'net', 'cron')
""".strip()

TEARDOWN_REACH_SQL = """
SELECT jsonb_build_object(
  'database_create', pg_catalog.has_database_privilege(
    current_user, pg_catalog.current_database(), 'CREATE'),
  'guard_schema_owner', COALESCE((
    SELECT pg_catalog.pg_get_userbyid(n.nspowner)
    FROM pg_catalog.pg_namespace n WHERE n.nspname = 'q12_guard'), ''),
  'current_user', current_user
)
""".strip()


def _identity(entry: dict) -> str:
    return f"{entry['schema']}.{entry['name']}"


def _live_guarded(context: Context) -> "dict[str, dict]":
    if "live_guarded" not in context.cache:
        rows = query_json(context, LIVE_GUARDED_SQL)
        if not isinstance(rows, list):
            raise ProbeError("live guarded projection is malformed")
        context.cache["live_guarded"] = {_identity(row): row for row in rows}
    return context.cache["live_guarded"]


def _catalog_guarded(context: Context) -> "list[dict]":
    if context.catalog is None:
        raise ProbeError("no expected-post-migration-catalog is bound; --run-root is required")
    relations = context.catalog.get("guarded_relations")
    if not isinstance(relations, list) or not relations:
        raise ProbeError("the run root's catalog carries no guarded_relations")
    return relations


def probe_a1(context: Context) -> "dict[str, object]":
    """Every guarded relation still exists with the identity the plan captured."""
    live = _live_guarded(context)
    drift: list[str] = []
    for expected in _catalog_guarded(context):
        identity = _identity(expected)
        observed = live.get(identity)
        if observed is None:
            drift.append(f"{identity} (missing)")
            continue
        for key in ("relkind", "owner"):
            if str(observed.get(key)) != str(expected.get(key)):
                drift.append(f"{identity} ({key} {expected.get(key)!r} -> {observed.get(key)!r})")
        if observed.get("parent_oid") != expected.get("parent_oid"):
            drift.append(
                f"{identity} (parent {expected.get('parent_oid')!r} -> {observed.get('parent_oid')!r})"
            )
    if drift:
        return verdict("A1", FAIL, f"guarded-set identity drift: {name_list(drift)}")
    return verdict(
        "A1",
        PASS,
        f"all {len(_catalog_guarded(context))} guarded relations match the plan's captured identity",
    )


def probe_a2(context: Context) -> "dict[str, object]":
    """LOCK TABLE ... IN ACCESS EXCLUSIVE MODE reachability, per relation."""
    live = _live_guarded(context)
    unreachable = [
        _identity(expected)
        for expected in _catalog_guarded(context)
        if not (live.get(_identity(expected)) or {}).get("lockable")
    ]
    if unreachable:
        return verdict(
            "A2",
            FAIL,
            "no UPDATE/DELETE/TRUNCATE/MAINTAIN, so ACCESS EXCLUSIVE LOCK is unreachable on: "
            + name_list(unreachable),
        )
    return verdict("A2", PASS, "every guarded relation is lockable in ACCESS EXCLUSIVE MODE")


def probe_a3(context: Context) -> "dict[str, object]":
    """CREATE TRIGGER reachability, per relation."""
    live = _live_guarded(context)
    unreachable = [
        _identity(expected)
        for expected in _catalog_guarded(context)
        if not (live.get(_identity(expected)) or {}).get("triggerable")
    ]
    if unreachable:
        return verdict(
            "A3", FAIL, "no TRIGGER privilege, so CREATE TRIGGER fails on: " + name_list(unreachable)
        )
    return verdict("A3", PASS, "every guarded relation carries TRIGGER for the barrier role")


def probe_a4(context: Context) -> "dict[str, object]":
    """mc2-34eua: no relation in the guarded set may live in schema `cron`.

    `cron.job` is owned by supabase_admin with only SELECT to postgres, so guarding it raises 42501
    at C1 — and it was the only one of 76 candidates out of reach. The retained cron path is
    privilege-free (the cron.alter_job pause, the zero-active-jobs read, the read-only default, and
    the guard trigger on net.http_request_queue) and needs no guarded cron relation at all.
    """
    offenders = [
        _identity(expected)
        for expected in _catalog_guarded(context)
        if str(expected.get("schema")) == "cron"
    ]
    if offenders:
        return verdict(
            "A4",
            FAIL,
            "cron relations are in the guarded set and will raise 42501 at C1: "
            + name_list(offenders),
        )
    return verdict("A4", PASS, "no cron relation is in the guarded set (the mc2-34eua contract)")


def probe_a5(context: Context) -> "dict[str, object]":
    """Teardown reachability: we must be able to CREATE the guard schema we later drop.

    Disarm is `DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE` on a function we own
    (mc2-ipwyc) — which only works if `q12_guard` is ours. A pre-existing schema owned by another
    role would leave the barrier able to arm and unable to disarm, past the point of no return.
    """
    reach = query_json(context, TEARDOWN_REACH_SQL)
    if not isinstance(reach, dict):
        raise ProbeError("teardown reachability projection is malformed")
    if not reach.get("database_create"):
        return verdict(
            "A5",
            FAIL,
            f"role {reach.get('current_user')!r} lacks CREATE on the database, so q12_guard "
            "cannot be created",
        )
    owner = str(reach.get("guard_schema_owner") or "")
    if owner and owner != str(reach.get("current_user")):
        return verdict(
            "A5",
            FAIL,
            f"a pre-existing q12_guard schema is owned by {owner!r}, not by "
            f"{reach.get('current_user')!r}: the barrier could arm and not disarm",
        )
    residue = " (a q12_guard schema is present and already ours)" if owner else ""
    return verdict("A5", PASS, f"CREATE on the database is held and q12_guard is reachable{residue}")


def probe_a6(context: Context) -> "dict[str, object]":
    """The retained cron guard arms a trigger on net.http_request_queue; TRIGGER is its only gate."""
    live = _live_guarded(context)
    entry = live.get("net.http_request_queue")
    if entry is None:
        return verdict("A6", FAIL, "net.http_request_queue does not exist")
    if not entry.get("triggerable"):
        return verdict(
            "A6",
            FAIL,
            "net.http_request_queue does not carry TRIGGER for the barrier role, so the retained "
            "cron guard cannot be armed",
        )
    return verdict("A6", PASS, "net.http_request_queue carries TRIGGER for the barrier role")


def _plan_rule_guarded(live: "dict[str, dict]") -> "list[str]":
    """The plan capture's own selection rule, re-applied to the live projection."""
    selected: list[str] = []
    for identity, row in live.items():
        schema = str(row.get("schema"))
        if schema == "public":
            selected.append(identity)
        elif schema in ("auth", "storage") and row.get("triggerable"):
            selected.append(identity)
        elif schema == "net" and str(row.get("name")) == "http_request_queue":
            selected.append(identity)
    return selected


def barrier_expected_count(context: Context) -> int:
    """The barrier's frozen `guarded_relations | length == N`, read from its bytes.

    Read rather than duplicated: if the barrier's expectation ever moves, A7 follows it instead of
    silently disagreeing with the file that actually enforces it at C1.
    """
    if not context.barrier_text:
        raise ProbeError("the barrier bytes are not available to read its frozen expectation")
    match = BARRIER_GUARDED_COUNT_RE.search(context.barrier_text)
    if match is None:
        raise ProbeError("the barrier carries no frozen guarded_relations count")
    return int(match.group(1))


def probe_a7(context: Context) -> "dict[str, object]":
    live = _live_guarded(context)
    live_count = len(_plan_rule_guarded(live))
    plan_count = len(_catalog_guarded(context))
    frozen = barrier_expected_count(context)
    if live_count != plan_count:
        return verdict(
            "A7",
            FAIL,
            f"the live guarded set has {live_count} relations, the plan captured {plan_count}",
        )
    if plan_count != frozen:
        return verdict(
            "A7",
            FAIL,
            f"the plan captured {plan_count} guarded relations, the barrier freezes {frozen}",
        )
    return verdict(
        "A7", PASS, f"{live_count} guarded relations, live == plan == the barrier's frozen count"
    )


# --- Group B: the pooled session ----------------------------------------------------------------
#
# The mc2-ipwyc wall. These are the only probes that must open more than one connection, and every
# one of them goes through the SAME pooled DSN — reaching around the pooler is exactly what hid the
# `options` defect for nine attempts.

# `new Client({... options:"-c default_transaction_read_only=on|off" ...})` — a startup parameter
# the Supavisor pooler never delivers.
OPTION_DEPENDENCE_RE = re.compile(r'options\s*:\s*"-c default_transaction_read_only=(on|off)"')
# `await client.query("SET default_transaction_read_only=on|off")` — the session-level statement of
# intent that replaced the dependence. Deliberately anchored on the query() form so the barrier's
# own `ALTER DATABASE postgres SET default_transaction_read_only=on` DDL does not count as one.
SESSION_SET_RE = re.compile(r'query\("SET default_transaction_read_only=(on|off)"\)')

B2_SESSION_GUC = "megacampus.q12_preflight_session_probe"
B2_TOKEN = "session-mode-probe"


def probe_b1(context: Context) -> "dict[str, object]":
    """Measure startup-`options` delivery, and fail only on a runner that still depends on it.

    Production truth, measured on 2026-07-28: with `-c default_transaction_read_only=on` the
    setting still read `off` — Supavisor drops the startup parameter entirely. PostgreSQL's own
    precedence is intact; the option simply never arrives. Benign before install, FATAL after it:
    the barrier's own reconnect would inherit the read-only default it just set, and its
    `transaction_read_only='off'` proof could not pass.
    """
    if context.script is None:
        raise ProbeError("no database seam is bound in this scope")
    baseline = query(context, "SELECT pg_catalog.current_setting('default_transaction_read_only')")
    # Ask for the OPPOSITE of the observed database default, so "arrived" is unambiguous.
    requested = "off" if baseline == "on" else "on"
    result = context.script(
        read_only("SELECT pg_catalog.current_setting('default_transaction_read_only')"),
        options=f"-c default_transaction_read_only={requested}",
    )
    if result.returncode != 0:
        raise ProbeError(f"options-delivery probe failed: {' '.join(result.stderr.split())[:200]}")
    observed = result.stdout.strip()
    delivered = observed == requested

    unmatched: list[str] = []
    for name, text in sorted(context.option_dependence_sources.items()):
        wants: dict[str, int] = {}
        for value in OPTION_DEPENDENCE_RE.findall(text):
            wants[value] = wants.get(value, 0) + 1
        has: dict[str, int] = {}
        for value in SESSION_SET_RE.findall(text):
            has[value] = has.get(value, 0) + 1
        for value, count in sorted(wants.items()):
            if has.get(value, 0) < count:
                unmatched.append(f"{name} (options=…={value} x{count}, session SET x{has.get(value, 0)})")

    state = "delivered" if delivered else "not delivered"
    if unmatched and not delivered:
        return verdict(
            "B1",
            FAIL,
            f"startup options {state} (asked {requested!r}, session reads {observed!r}) and a "
            f"runner still depends on delivery: {name_list(unmatched)}",
        )
    if unmatched:
        return verdict(
            "B1",
            FAIL,
            f"startup options {state}, but a runner states no session-level intent and would break "
            f"the moment delivery stops: {name_list(unmatched)}",
        )
    return verdict(
        "B1",
        PASS,
        f"startup options {state} (asked {requested!r}, session reads {observed!r}); "
        f"{len(context.option_dependence_sources)} scanned source(s) state their intent with a "
        "session-level SET and depend on nothing the pooler can drop",
    )


def probe_b2(context: Context) -> "dict[str, object]":
    """A session-level SET must survive to the next statement: the DSN is session-mode pooling.

    If this ever flips to transaction-mode, every explicit `SET` in the barrier — including the one
    that replaced the dropped startup option — stops working, silently.
    """
    if context.script is None:
        raise ProbeError("no database seam is bound in this scope")
    sql = (
        "BEGIN READ ONLY;\n"
        f"{READ_ONLY_ASSERT} \\g /dev/null\n"
        f"SET {B2_SESSION_GUC} = '{B2_TOKEN}';\n"
        "COMMIT;\n"
        "BEGIN READ ONLY;\n"
        f"{READ_ONLY_ASSERT} \\g /dev/null\n"
        f"COPY (SELECT COALESCE(pg_catalog.current_setting('{B2_SESSION_GUC}', true), '')) "
        "TO STDOUT;\n"
        "COMMIT;\n"
    )
    result = context.script(sql)
    if result.returncode != 0:
        raise ProbeError(f"session-mode probe failed: {' '.join(result.stderr.split())[:200]}")
    observed = result.stdout.strip()
    if observed != B2_TOKEN:
        return verdict(
            "B2",
            FAIL,
            f"a session-level SET did not survive to the next transaction (read back {observed!r}): "
            "the DSN is transaction-mode pooling, and every explicit SET in the barrier is a no-op",
        )
    return verdict("B2", PASS, "a session-level SET survives across transactions (session-mode DSN)")


def probe_b3(context: Context) -> "dict[str, object]":
    """application_name must reach pg_stat_activity unmodified.

    The barrier's quiesce allowlist and the terminal proof's `barrier_era_session_count` both match
    on `megacampus-q12-%`. A pooler that rewrote the name would empty both silently — the proof
    would read "no Q12 sessions are alive" because it could not see its own.
    """
    if context.script is None:
        raise ProbeError("no database seam is bound in this scope")
    name = f"{PREFLIGHT_APPLICATION_NAME}-b3"
    result = context.script(
        read_only(
            "SELECT pg_catalog.current_setting('application_name') || '|' || COALESCE("
            "(SELECT activity.application_name FROM pg_catalog.pg_stat_activity activity"
            " WHERE activity.pid = pg_catalog.pg_backend_pid()), '')"
        ),
        application_name=name,
    )
    if result.returncode != 0:
        raise ProbeError(f"application_name probe failed: {' '.join(result.stderr.split())[:200]}")
    parts = result.stdout.strip().split("|")
    setting = parts[0] if parts else ""
    activity = parts[1] if len(parts) > 1 else ""
    if setting != name or activity != name:
        return verdict(
            "B3",
            FAIL,
            f"application_name was rewritten in flight: asked {name!r}, the session reports "
            f"{setting!r} and pg_stat_activity reports {activity!r}",
        )
    if not name.startswith(Q12_APPLICATION_PREFIX):
        return verdict(
            "B3", FAIL, f"application_name {name!r} does not carry the {Q12_APPLICATION_PREFIX!r} prefix"
        )
    return verdict(
        "B3", PASS, f"application_name reaches pg_stat_activity unmodified as {name!r}"
    )


def probe_b4(context: Context) -> "dict[str, object]":
    """`pg_database.datdba == current_user` — the read-only proxy for "ALTER DATABASE … SET/RESET
    default_transaction_read_only will be permitted", which C1 install and the restore both need."""
    row = query_json(
        context,
        "SELECT jsonb_build_object("
        " 'owner', pg_catalog.pg_get_userbyid(d.datdba),"
        " 'current_user', current_user,"
        " 'database', d.datname)"
        " FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database()",
    )
    if not isinstance(row, dict):
        raise ProbeError("database ownership projection is malformed")
    if str(row.get("owner")) != str(row.get("current_user")):
        return verdict(
            "B4",
            FAIL,
            f"database {row.get('database')!r} is owned by {row.get('owner')!r}, not by "
            f"{row.get('current_user')!r}: ALTER DATABASE … SET default_transaction_read_only "
            "will be refused",
        )
    return verdict(
        "B4",
        PASS,
        f"database {row.get('database')!r} is owned by {row.get('current_user')!r}; the read-only "
        "default can be set and reset",
    )


# --- Group C: the path that has never run --------------------------------------------------------
#
# Everything past C9 has never executed against anything production-like. This group is
# deliberately explicit about what it can and cannot prove.

CRON_ALTER_JOB_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'signature', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
  'executable', pg_catalog.has_function_privilege(current_user, p.oid, 'EXECUTE')
) ORDER BY p.oid), '[]'::jsonb)
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'cron' AND p.proname = 'alter_job'
""".strip()

CRON_JOBS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'jobid', job.jobid::bigint,
  'username', job.username,
  'active', job.active,
  'command', job.command
) ORDER BY job.jobid), '[]'::jsonb)
FROM cron.job job
""".strip()

GUARD_RESIDUE_SQL = """
SELECT jsonb_build_object(
  'schemas', (SELECT count(*)::int FROM pg_catalog.pg_namespace WHERE nspname = 'q12_guard'),
  'relations', (SELECT count(*)::int FROM pg_catalog.pg_class relation
                JOIN pg_catalog.pg_namespace ns ON ns.oid = relation.relnamespace
                WHERE ns.nspname = 'q12_guard'),
  'functions', (SELECT count(*)::int FROM pg_catalog.pg_proc function_object
                JOIN pg_catalog.pg_namespace ns ON ns.oid = function_object.pronamespace
                WHERE ns.nspname = 'q12_guard'),
  'triggers', (SELECT count(*)::int FROM pg_catalog.pg_trigger trigger_object
               WHERE trigger_object.tgname LIKE 'q12_guard%' AND NOT trigger_object.tgisinternal),
  'event_triggers', (SELECT count(*)::int FROM pg_catalog.pg_event_trigger event_trigger
                     JOIN pg_catalog.pg_proc function_object ON function_object.oid = event_trigger.evtfoid
                     JOIN pg_catalog.pg_namespace ns ON ns.oid = function_object.pronamespace
                     WHERE ns.nspname = 'q12_guard')
)
""".strip()


def probe_c1(context: Context) -> "dict[str, object]":
    """EXECUTE on cron.alter_job — the retained, privilege-free cron pause.

    After mc2-34eua removed cron.job from the guarded set, the pause is the ONLY thing standing
    between an active cron job and a window that has just set the database read-only.
    """
    rows = query_json(context, CRON_ALTER_JOB_SQL)
    if not isinstance(rows, list) or not rows:
        return verdict("C1", FAIL, "cron.alter_job does not exist; the cron pause cannot run")
    unreachable = [str(row["signature"]) for row in rows if not row.get("executable")]
    if unreachable:
        return verdict(
            "C1", FAIL, "no EXECUTE on: " + name_list(unreachable)
        )
    return verdict(
        "C1",
        PASS,
        f"EXECUTE is held on {len(rows)} cron.alter_job overload(s): "
        + name_list([str(row["signature"]) for row in rows]),
    )


def probe_c2(context: Context) -> "dict[str, object]":
    """The cron job set matches the plan's baseline: count, ids, usernames, command hashes — and
    every job is ACTIVE.

    An inactive job before the window is not a neutral fact: it means a previous attempt's
    `cron.alter_job(..., active := false)` was never undone, so the restore would replay a baseline
    that does not describe ordinary operation.
    """
    expected = (context.catalog or {}).get("cron_jobs")
    if not isinstance(expected, list):
        raise ProbeError("the run root's catalog carries no cron_jobs")
    live = query_json(context, CRON_JOBS_SQL)
    if not isinstance(live, list):
        raise ProbeError("cron projection is malformed")

    observed = {
        int(row["jobid"]): {
            "username": str(row["username"]),
            "active": bool(row["active"]),
            "command_sha256": hashlib.sha256(str(row["command"]).encode("utf-8")).hexdigest(),
        }
        for row in live
    }
    wanted = {int(row["jobid"]): row for row in expected}

    if len(observed) != len(wanted):
        return verdict(
            "C2",
            FAIL,
            f"cron carries {len(observed)} jobs, the plan captured {len(wanted)}",
        )
    drift: list[str] = []
    for jobid, want in sorted(wanted.items()):
        have = observed.get(jobid)
        if have is None:
            drift.append(f"{jobid} (missing)")
            continue
        if have["username"] != str(want.get("username")):
            drift.append(f"{jobid} (username {want.get('username')!r} -> {have['username']!r})")
        if have["command_sha256"] != str(want.get("command_sha256")):
            drift.append(f"{jobid} (command changed)")
    if drift:
        return verdict("C2", FAIL, "cron job drift against the plan: " + name_list(drift))
    inactive = sorted(str(jobid) for jobid, have in observed.items() if not have["active"])
    if inactive:
        return verdict(
            "C2",
            FAIL,
            "cron jobs are inactive before the window opens (a previous attempt's pause was never "
            "undone): " + name_list(inactive),
        )
    return verdict(
        "C2", PASS, f"{len(observed)} cron jobs match the plan and are all active"
    )


def probe_c3(context: Context) -> "dict[str, object]":
    count = query(context, "SELECT count(*)::int FROM net.http_request_queue")
    if count != "0":
        return verdict(
            "C3",
            FAIL,
            f"net.http_request_queue holds {count} row(s); the window requires an empty queue",
        )
    return verdict("C3", PASS, "net.http_request_queue is empty")


def probe_c4(context: Context) -> "dict[str, object]":
    residue = query_json(context, GUARD_RESIDUE_SQL)
    if not isinstance(residue, dict):
        raise ProbeError("guard residue projection is malformed")
    present = sorted(f"{key}={value}" for key, value in residue.items() if int(value) != 0)
    if present:
        return verdict(
            "C4",
            FAIL,
            "q12_guard residue is present from an earlier attempt: " + ", ".join(present),
        )
    return verdict(
        "C4", PASS, "no q12_guard residue: zero schemas, relations, functions, triggers, event triggers"
    )


def probe_c5(context: Context) -> "dict[str, object]":
    """Event-trigger creation cannot be probed read-only: CREATE EVENT TRIGGER is DDL, and there is
    no `has_*_privilege` for it — the right is superuser-only in PostgreSQL, and production's
    `postgres` is not a superuser, so no catalog read answers the question. Proven instead by the
    only thing that could prove it: an attempt that actually did it."""
    return verdict(
        "C5",
        UNPROVABLE,
        "CREATE EVENT TRIGGER is DDL with no read-only privilege proxy; not established here",
        C5_EVIDENCE,
    )


def probe_c6(context: Context) -> "dict[str, object]":
    """pg_get_functiondef / pg_get_triggerdef round-trip fidelity — the barrier's $restore$ replays
    catalog-captured definitions (mc2-ipwyc). Proving the round trip means CREATE-ing and
    re-reading an object, which is DDL. Proven instead by the gated real-PG17 suite."""
    return verdict(
        "C6",
        UNPROVABLE,
        "definition round-trip fidelity needs DDL to establish; not established here",
        C6_EVIDENCE,
    )


# --- Group D: catalog agreement --------------------------------------------------------------------
#
# The mc2-2rzf6 wall. The plan and the barrier once measured the structural catalog in DIFFERENT
# `search_path` contexts (ambient cfe6b92b… vs pg_catalog a2b25324…) and barrier.install died on
# "pre-guard canonical structural catalog drift". Deterministic, not drift — but indistinguishable
# from drift at 04:00 with a window open.


def probe_d1(context: Context) -> "dict[str, object]":
    """Re-measure the structural catalog in the BARRIER's own session context and compare.

    The frozen `q12-structural-catalog.sql` is reused verbatim; reimplementing the projection here
    would recreate exactly the defect this probe exists to catch. `read_only()` pins
    `SET LOCAL search_path = pg_catalog` for every probe, which is the barrier's context.
    """
    if not context.structural_catalog_sql:
        raise ProbeError("the frozen structural catalog SQL is not available")
    body = context.structural_catalog_sql.strip()
    if ";" in body:
        raise ProbeError("structural catalog SQL must be one semicolon-free query")
    expected = str((context.catalog or {}).get("baseline_structural_sha256") or "")
    if not HEX64_RE.fullmatch(expected):
        raise ProbeError("the run root's catalog carries no baseline_structural_sha256")
    observed = query(context, f"SELECT structural_sha256 FROM (\n{body}\n) AS preflight")
    if not HEX64_RE.fullmatch(observed):
        raise ProbeError("the live structural catalog SHA-256 is malformed")
    if observed != expected:
        return verdict(
            "D1",
            FAIL,
            f"structural catalog disagreement measured under SET LOCAL search_path=pg_catalog: "
            f"the run root expects {expected[:8]}…, the live database hashes to {observed[:8]}…. "
            "If the plan was captured under a different search_path this is deterministic, not "
            "drift (mc2-2rzf6); otherwise the database changed since the plan.",
        )
    return verdict(
        "D1",
        PASS,
        f"structural catalog {observed[:8]}… agrees with the run root, measured in the barrier's "
        "own search_path context",
    )


# --- Group E: quiesce feasibility --------------------------------------------------------------------

# NOTE THE FILTER. `backend_type = 'client backend'` deliberately does NOT appear in the WHERE
# clause. PostgreSQL nulls out usename / state / backend_type / xact_start in pg_stat_activity for
# any backend the reading role neither owns nor can see through pg_read_all_stats — so filtering on
# backend_type in SQL would silently DROP exactly the managed backends this probe exists to find,
# and E1 would report "0 client backends, nothing to refuse" while supabase_admin sat in an open
# transaction. The rows are classified in Python instead, and an invisible row is a refusal, not an
# absence. (This is the same substitution class as the nine window defects; it was caught here by
# driving the probe as a NON-superuser against the managed fixture.)
CLIENT_BACKENDS_SQL = """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'pid', activity.pid,
  'visible', (activity.backend_type IS NOT NULL),
  'usename', COALESCE(activity.usename, ''),
  'application_name', COALESCE(activity.application_name, ''),
  'state', COALESCE(activity.state, ''),
  'backend_type', COALESCE(activity.backend_type, ''),
  'has_xact', (activity.xact_start IS NOT NULL
            OR activity.backend_xid IS NOT NULL
            OR activity.backend_xmin IS NOT NULL),
  'signalable', (
    pg_catalog.pg_has_role(current_user, 'pg_signal_backend', 'MEMBER')
    OR (activity.usesysid IS NOT NULL
        AND pg_catalog.pg_has_role(current_user, activity.usesysid, 'MEMBER'))),
  'target_is_superuser', COALESCE((
    SELECT role.rolsuper FROM pg_catalog.pg_roles role WHERE role.oid = activity.usesysid), false)
) ORDER BY activity.pid), '[]'::jsonb)
FROM pg_catalog.pg_stat_activity activity
WHERE activity.datname = pg_catalog.current_database()
  AND activity.pid <> pg_catalog.pg_backend_pid()
""".strip()

# The barrier's own managed-boundary role: quiesce_client_backends() accepts it only when it is
# EXACTLY idle, and terminates everything else.
MANAGED_BOUNDARY_ROLE = "supabase_admin"


def probe_e1(context: Context) -> "dict[str, object]":
    """Enumerate client backends and flag anything `quiesce_client_backends()` would refuse.

    A snapshot cannot exclude a race — a backend can appear between this probe and C2 — so the
    verdict NAMES the observed set and the probe is re-run immediately before the window. That
    bound is stated here rather than hidden.
    """
    rows = query_json(context, CLIENT_BACKENDS_SQL)
    if not isinstance(rows, list):
        raise ProbeError("client backend projection is malformed")
    refusals: list[str] = []
    clients = 0
    for row in rows:
        pid = row.get("pid")
        if not row.get("visible"):
            # We cannot classify it — and neither can quiesce_client_backends(), which runs
            # SECURITY DEFINER as this same role and reads the same nulled-out columns. It would
            # see usename IS NULL, skip the supabase_admin branch, and try to terminate a managed
            # backend.
            refusals.append(
                f"pid {pid} (invisible: pg_stat_activity nulls its columns for this role, so the "
                "quiesce cannot classify it either — grant pg_read_all_stats or expect a refusal)"
            )
            continue
        if str(row.get("backend_type")) != "client backend":
            continue
        clients += 1
        usename = str(row.get("usename"))
        if usename == MANAGED_BOUNDARY_ROLE:
            if str(row.get("state")) != "idle" or row.get("has_xact"):
                refusals.append(
                    f"pid {pid} {usename} state={row.get('state')!r} "
                    f"in_transaction={bool(row.get('has_xact'))}"
                )
        elif row.get("target_is_superuser") or not row.get("signalable"):
            refusals.append(f"pid {pid} {usename} (not terminable by the barrier role)")
    if refusals:
        return verdict(
            "E1",
            FAIL,
            f"quiesce_client_backends() would refuse or mis-handle {len(refusals)} of {len(rows)} "
            "backend(s): " + name_list(refusals),
        )
    return verdict(
        "E1",
        PASS,
        f"{clients} client backend(s) observed among {len(rows)} visible backend(s), none of which "
        "quiesce_client_backends() would refuse. BOUND: this is a snapshot and cannot exclude a "
        "backend arriving between now and C2; re-run the pre-flight immediately before the window.",
    )


def probe_e2(context: Context) -> "dict[str, object]":
    """mc2-6fnrt: nothing of OURS may be alive across barrier.install.

    Attempt #9 opened and HELD the W3 snapshot coordinator before barrier.install, and the
    barrier's own quiesce terminated it — the run died as "terminating connection due to
    administrator command". The probe's own session is excluded by pid.
    """
    rows = query_json(
        context,
        "SELECT COALESCE(jsonb_agg(jsonb_build_object("
        " 'pid', activity.pid,"
        " 'application_name', activity.application_name) ORDER BY activity.pid), '[]'::jsonb)"
        " FROM pg_catalog.pg_stat_activity activity"
        " WHERE activity.datname = pg_catalog.current_database()"
        "   AND activity.pid <> pg_catalog.pg_backend_pid()"
        f"   AND activity.application_name LIKE '{Q12_APPLICATION_PREFIX}%'",
    )
    if not isinstance(rows, list):
        raise ProbeError("Q12 session projection is malformed")
    if rows:
        named = [f"pid {row['pid']} {row['application_name']}" for row in rows]
        return verdict(
            "E2",
            FAIL,
            f"{len(rows)} {Q12_APPLICATION_PREFIX}% session(s) are alive besides this probe's own; "
            "the barrier's quiesce would terminate them mid-window: " + name_list(named),
        )
    return verdict(
        "E2", PASS, f"no {Q12_APPLICATION_PREFIX}% session is alive besides this probe's own"
    )


# --- Group H: host --------------------------------------------------------------------------------
#
# No database access. Runnable at any time, including from CI.

ASSET_MANIFEST_SCHEMA = "megacampus.q12.deployed-asset-manifest/v1"
DIGEST_PIN_RE = re.compile(r"image:\s*(\S+?)@sha256:([0-9a-f]{64}|\$\{([A-Z0-9_]+)[^}]*\})")
HOLD_TAG_NAMESPACE = "q12-window-hold"

# Process argv fragments that mean a Q12 controller is already running. Matched on the RESOLVED
# argv of another process, never with a `pgrep -f` pattern that would also match this probe's own
# command line — that trap cost a false positive on 2026-07-28.
CONTROLLER_MARKERS = (
    "q12-lifecycle-core.py",
    "q12-live-cutover.sh",
    "q12-database-barrier.sh",
    "source-recovery-run.sh",
)
PREFLIGHT_MARKERS = ("q12-window-preflight.py", "q12-preflight-probes.py")
DEPLOY_MARKERS = ("deploy_dev.sh", "deploy_blue_green.sh", "deploy.sh")
# How long the host must have been free of dev-deploy activity for the cadence to read as paused.
DEPLOY_QUIET_MINUTES = 30
# H5 measures at most this many backup generations; the bound is stated in the verdict.
BACKUP_GENERATION_SAMPLE = 5


def _host(context: Context) -> HostAdapter:
    if context.host is None:
        raise ProbeError("no host seam is bound in this scope")
    return context.host


def _image_pins(host: HostAdapter) -> "dict[str, str]":
    """Every digest-pinned image reference in the infra compose file, with ${VAR} pins resolved
    from the environment file. Derived rather than hardcoded, so a newly pinned image is covered
    the moment it is added."""
    if not host.compose_file.is_file():
        raise ProbeError(f"compose file is unavailable: {host.compose_file}")
    variables: dict[str, str] = {}
    if host.env_file.is_file():
        for line in host.env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            # Only the image-digest pins are ever read out of this file, and only their VALUES for
            # the image reference; nothing else here reaches the report.
            if "=" in line and "IMAGE_SHA256" in line.split("=", 1)[0]:
                key, value = line.split("=", 1)
                variables[key.strip()] = value.strip().strip('"').strip("'")
    pins: dict[str, str] = {}
    for match in DIGEST_PIN_RE.finditer(
        host.compose_file.read_text(encoding="utf-8", errors="replace")
    ):
        repository = match.group(1)
        digest = match.group(2)
        if digest.startswith("${"):
            digest = variables.get(match.group(3) or "", "")
        if not HEX64_RE.fullmatch(digest):
            continue
        # `repository:tag@sha256:…` and `repository@sha256:…` both appear; the pull stores the
        # image by digest either way, which is why prune sees them as dangling.
        pins[f"{repository.split(':')[0]}@sha256:{digest}"] = repository.split(":")[0]
    return pins


def hold_tag_for(repository: str) -> str:
    return f"{HOLD_TAG_NAMESPACE}/{repository.rsplit('/', 1)[-1]}:pinned"


def probe_h1(context: Context) -> "dict[str, object]":
    """Every digest-pinned image is present locally AND carries a hold tag.

    mc2-y5tgw: an image pulled by digest carries no tag, so docker calls it dangling, and
    `docker image prune -f` — which every dev deploy runs (scripts/deploy_dev.sh:320,
    deploy_blue_green.sh:851, deploy.sh:183) — deletes it. The window's first command executes the
    operator image, so the window would die on step one. A local tag in the
    `q12-window-hold/` namespace makes the image non-dangling and survives the exact prune command.
    """
    host = _host(context)
    pins = _image_pins(host)
    if not pins:
        return verdict("H1", FAIL, f"no digest-pinned image found in {host.compose_file}")
    missing: list[str] = []
    untagged: list[str] = []
    for reference, repository in sorted(pins.items()):
        image = host.run(["docker", "image", "inspect", "--format", "{{.Id}}", reference])
        if image.returncode != 0:
            missing.append(reference)
            continue
        tag = hold_tag_for(repository)
        held = host.run(["docker", "image", "inspect", "--format", "{{.Id}}", tag])
        if held.returncode != 0 or held.stdout.strip() != image.stdout.strip():
            untagged.append(f"{tag} -> {reference}")
    if missing or untagged:
        parts = []
        if missing:
            parts.append("absent locally: " + name_list(missing))
        if untagged:
            parts.append(
                "present but prune-exposed (no matching hold tag): " + name_list(untagged)
            )
        return verdict("H1", FAIL, "; ".join(parts))
    return verdict(
        "H1",
        PASS,
        f"all {len(pins)} digest-pinned images are present and hold-tagged under "
        f"{HOLD_TAG_NAMESPACE}/, so a dev deploy's `docker image prune -f` cannot remove them",
    )


def _owner_names(info: os.stat_result) -> "tuple[str, str]":
    try:
        import grp
        import pwd

        return pwd.getpwuid(info.st_uid).pw_name, grp.getgrgid(info.st_gid).gr_name
    except (ImportError, KeyError):
        return str(info.st_uid), str(info.st_gid)


def probe_h2(context: Context) -> "dict[str, object]":
    """The deployed Q12 tree is byte-equal to the tracked asset manifest, file by file.

    Until now this comparison was done by hand — which is itself a defect surface, and the reason
    the server tree was stale on 2026-07-28 while the operator believed it current. The manifest is
    a tracked artifact, so `git` is the authority for what SHOULD be deployed and this probe is a
    byte comparison rather than an eyeball.
    """
    host = _host(context)
    manifest = context.manifest
    if not isinstance(manifest, dict) or manifest.get("schema_version") != ASSET_MANIFEST_SCHEMA:
        raise ProbeError("the deployed-asset manifest is missing or has the wrong schema")
    assets = manifest.get("assets")
    if not isinstance(assets, list) or not assets:
        raise ProbeError("the deployed-asset manifest carries no assets")

    problems: list[str] = []
    for asset in assets:
        relative = str(asset["path"])
        target = host.deploy_root / str(asset.get("deployed_path") or relative)
        if not target.is_file():
            problems.append(f"{relative} (missing)")
            continue
        info = target.stat()
        # `mode`/`owner` are null for CI-delivered assets: scp rewrites them on every deploy, so
        # pinning their identity would break the deploy it guards. Byte equality still applies —
        # the exemption is narrow, declared per asset, and reported below.
        if asset.get("mode") is not None:
            actual_mode = f"{info.st_mode & 0o777:04o}"
            if actual_mode != str(asset["mode"]):
                problems.append(f"{relative} (mode {asset['mode']} -> {actual_mode})")
            owner, group = _owner_names(info)
            if owner != str(asset["owner"]) or group != str(asset["group"]):
                problems.append(
                    f"{relative} (owner {asset['owner']}:{asset['group']} -> {owner}:{group})"
                )
        digest = sha256_file(target)
        if digest != str(asset["sha256"]):
            problems.append(f"{relative} (sha256 {str(asset['sha256'])[:8]}… -> {digest[:8]}…)")

    if problems:
        return verdict(
            "H2",
            FAIL,
            f"the deployed tree differs from the manifest at {len(problems)} point(s): "
            + name_list(problems),
        )
    ci_delivered = [
        str(asset["path"]) for asset in assets if asset.get("mode") is None
    ]
    return verdict(
        "H2",
        PASS,
        f"all {len(assets)} deployed assets are byte-equal to the manifest generated from tree "
        f"{str(manifest.get('generated_from_tree_sha'))[:12]}…. BOUND: mode and owner are asserted "
        f"for the {len(assets) - len(ci_delivered)} Q12-owned assets; the {len(ci_delivered)} "
        "CI-delivered ones are byte-checked only, because scp rewrites their identity on every "
        "deploy (" + name_list(ci_delivered) + ")",
    )


def probe_h3(context: Context) -> "dict[str, object]":
    """No controller process is already running.

    Matched on the RESOLVED argv of other processes, with this probe's own pid and any
    pre-flight argv excluded. A `pgrep -f q12` pattern would match the pre-flight's own command
    line and report a controller that is only itself — the trap hit on 2026-07-28.
    """
    host = _host(context)
    running: list[str] = []
    for pid, argv in host.processes():
        if pid == host.self_pid:
            continue
        joined = " ".join(argv)
        if any(marker in joined for marker in PREFLIGHT_MARKERS):
            continue
        for marker in CONTROLLER_MARKERS:
            if any(part.endswith(marker) for part in argv):
                running.append(f"pid {pid} {marker}")
                break
    if running:
        return verdict(
            "H3", FAIL, "a Q12 controller is already running: " + name_list(running)
        )
    return verdict(
        "H3",
        PASS,
        "no Q12 controller process is running (matched on resolved argv, with the pre-flight's own "
        "command line excluded by pid and by marker)",
    )


def _container_start_times(host: HostAdapter) -> "list[tuple[str, str]]":
    listed = host.run(["docker", "ps", "--quiet", "--no-trunc"])
    if listed.returncode != 0:
        raise ProbeError("cannot enumerate running containers")
    ids = [line.strip() for line in listed.stdout.splitlines() if line.strip()]
    if not ids:
        return []
    inspected = host.run(
        ["docker", "inspect", "--format", "{{.Name}}\t{{.State.StartedAt}}", *ids]
    )
    if inspected.returncode != 0:
        raise ProbeError("cannot inspect running containers")
    rows: list[tuple[str, str]] = []
    for line in inspected.stdout.splitlines():
        if "\t" in line:
            name, started = line.split("\t", 1)
            rows.append((name.strip().lstrip("/"), started.strip()))
    return rows


def _minutes_since(timestamp: str, now: "datetime.datetime") -> "float | None":
    import datetime as datetime_module

    text = timestamp.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    # Docker emits nanosecond precision; datetime.fromisoformat accepts at most microseconds.
    if "." in text:
        head, _, tail = text.partition(".")
        fraction, sign, offset = (
            tail.partition("+") if "+" in tail else tail.partition("-")
        )
        text = f"{head}.{fraction[:6]}{sign}{offset}"
    try:
        parsed = datetime_module.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime_module.timezone.utc)
    return (now - parsed).total_seconds() / 60.0


def probe_h4(context: Context) -> "dict[str, object]":
    """No deploy is in flight, and the dev-deploy cadence is paused for the window.

    A dev deploy touches the SAME host and the SAME database every 15-25 minutes, and its
    `docker image prune -f` removes the digest-pinned images H1 guards. Two legs are measured on
    the host — no running deploy process, and no dev container restarted recently — and the GitHub
    leg is measured only where `gh` exists. The production host has no `gh`, so there the verdict is
    `unprovable` with the host-side measurements as its evidence, rather than a green that was
    never established.
    """
    import datetime as datetime_module

    host = _host(context)
    now = datetime_module.datetime.now(datetime_module.timezone.utc)

    in_flight: list[str] = []
    for pid, argv in host.processes():
        if pid == host.self_pid:
            continue
        for marker in DEPLOY_MARKERS:
            if any(part.endswith(marker) for part in argv):
                in_flight.append(f"pid {pid} {marker}")
                break
    if in_flight:
        return verdict("H4", FAIL, "a deploy is in flight on the host: " + name_list(in_flight))

    recent: list[str] = []
    oldest_quiet = None
    for name, started in _container_start_times(host):
        if not name.endswith("-dev"):
            continue
        minutes = _minutes_since(started, now)
        if minutes is None:
            recent.append(f"{name} (unparseable start time {started!r})")
            continue
        if minutes < DEPLOY_QUIET_MINUTES:
            recent.append(f"{name} (started {minutes:.0f}m ago)")
        oldest_quiet = minutes if oldest_quiet is None else min(oldest_quiet, minutes)
    if recent:
        return verdict(
            "H4",
            FAIL,
            f"dev containers restarted inside the {DEPLOY_QUIET_MINUTES}-minute quiet window, so "
            "the dev-deploy cadence is NOT paused: " + name_list(recent),
        )

    host_evidence = (
        f"no deploy process on the host and no dev container restarted in the last "
        f"{DEPLOY_QUIET_MINUTES} minutes"
        + (f" (quietest dev container: {oldest_quiet:.0f}m)" if oldest_quiet is not None else "")
    )
    if not host.gh:
        return verdict(
            "H4",
            UNPROVABLE,
            "the GitHub workflow queue cannot be read from this host (`gh` is not installed there)",
            host_evidence,
        )
    listed = host.run(
        [host.gh, "run", "list", "--limit", "20", "--json", "status,name,headBranch"]
    )
    if listed.returncode != 0:
        return verdict(
            "H4",
            UNPROVABLE,
            "`gh run list` failed, so the GitHub workflow queue was not read",
            host_evidence,
        )
    try:
        runs = json.loads(listed.stdout or "[]")
    except json.JSONDecodeError:
        return verdict(
            "H4", UNPROVABLE, "`gh run list` returned unparseable JSON", host_evidence
        )
    active = [
        f"{run.get('name')} on {run.get('headBranch')} ({run.get('status')})"
        for run in runs
        if str(run.get("status")) in ("in_progress", "queued", "waiting", "pending", "requested")
    ]
    if active:
        return verdict(
            "H4", FAIL, "a workflow run is in flight: " + name_list(active)
        )
    return verdict("H4", PASS, f"{host_evidence}, and no GitHub workflow run is in flight")


def probe_h5(context: Context) -> "dict[str, object]":
    """Free disk exceeds the backup generation's measured high-water mark."""
    host = _host(context)
    if not host.backup_root.is_dir():
        raise ProbeError(f"backup root is unavailable: {host.backup_root}")
    generations = sorted(
        (path for path in (host.backup_root / "supabase").glob("generation-*") if path.is_dir()),
        key=lambda path: path.name,
        reverse=True,
    )
    sampled = generations[:BACKUP_GENERATION_SAMPLE]
    high_water = 0
    measured: list[str] = []
    for generation in sampled:
        result = host.run(["du", "-sb", str(generation)])
        if result.returncode != 0:
            continue
        try:
            size = int(result.stdout.split()[0])
        except (IndexError, ValueError):
            continue
        measured.append(f"{generation.name}={size}")
        high_water = max(high_water, size)
    free = host.disk_free_bytes(host.backup_root)
    bound = (
        f"BOUND: the high-water mark is the largest of the {len(sampled)} most recent of "
        f"{len(generations)} backup generation(s), and no headroom multiplier is applied"
    )
    if not measured:
        return verdict(
            "H5",
            FAIL,
            f"no backup generation could be measured under {host.backup_root / 'supabase'}, so the "
            "high-water mark is unknown",
        )
    if free <= high_water:
        return verdict(
            "H5",
            FAIL,
            f"free space {free} bytes does not exceed the backup high-water mark {high_water} "
            f"bytes. {bound}",
        )
    return verdict(
        "H5",
        PASS,
        f"free space {free} bytes exceeds the backup high-water mark {high_water} bytes "
        f"({free / max(high_water, 1):.1f}x). {bound}",
    )


# --- the frozen probe list --------------------------------------------------------------------

PROBES: "tuple[dict[str, object], ...]" = (
    {"id": "A1", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a1},
    {"id": "A2", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a2},
    {"id": "A3", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a3},
    {"id": "A4", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a4},
    {"id": "A5", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a5},
    {"id": "A6", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a6},
    {"id": "A7", "group": "A", "scope": DATABASE_SCOPE, "run": probe_a7},
    {"id": "B1", "group": "B", "scope": DATABASE_SCOPE, "run": probe_b1},
    {"id": "B2", "group": "B", "scope": DATABASE_SCOPE, "run": probe_b2},
    {"id": "B3", "group": "B", "scope": DATABASE_SCOPE, "run": probe_b3},
    {"id": "B4", "group": "B", "scope": DATABASE_SCOPE, "run": probe_b4},
    {"id": "C1", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c1},
    {"id": "C2", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c2},
    {"id": "C3", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c3},
    {"id": "C4", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c4},
    {"id": "C5", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c5},
    {"id": "C6", "group": "C", "scope": DATABASE_SCOPE, "run": probe_c6},
    {"id": "D1", "group": "D", "scope": DATABASE_SCOPE, "run": probe_d1},
    {"id": "E1", "group": "E", "scope": DATABASE_SCOPE, "run": probe_e1},
    {"id": "E2", "group": "E", "scope": DATABASE_SCOPE, "run": probe_e2},
    {"id": "H1", "group": "H", "scope": HOST_SCOPE, "run": probe_h1},
    {"id": "H2", "group": "H", "scope": HOST_SCOPE, "run": probe_h2},
    {"id": "H3", "group": "H", "scope": HOST_SCOPE, "run": probe_h3},
    {"id": "H4", "group": "H", "scope": HOST_SCOPE, "run": probe_h4},
    {"id": "H5", "group": "H", "scope": HOST_SCOPE, "run": probe_h5},
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
