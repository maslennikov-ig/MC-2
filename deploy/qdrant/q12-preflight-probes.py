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

AMENDED 2026-07-29 (mc2-bh3ef).  Group G was added after five more defects, none of them logic and
three of them the same cause in three different consumers: the frozen command manifest's
``HOME=/root`` meeting children that run as uid 1000.  Groups A-E measure the database and group H
the deployed bytes; group G measures the environment the twenty frozen commands are HANDED, for all
twenty, including the ten that have never executed in a window.

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
import stat as stat_module
import subprocess
import tempfile
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
    # (argv, env, stdin_text) -> ScriptResult, with NOTHING inherited from this process's
    # environment. Group G needs it: the whole point there is to run a consumer under a command's
    # EXACT frozen env, and `run` above deliberately inherits, which is the substitution G exists to
    # catch.
    run_env: Optional[Callable[..., ScriptResult]] = None


@dataclass
class Context:
    scope: str
    # (sql, options=None, application_name=None) -> ScriptResult, on ONE fresh connection.
    script: Optional[Callable[..., ScriptResult]] = None
    # The psql binary G3 drives directly, so it can open the pooled connection under a COMMAND's
    # frozen env rather than this process's own. `script` cannot: its env is fixed by construction.
    psql: Optional[str] = None
    catalog: Optional[dict] = None
    manifest: Optional[dict] = None
    # The FROZEN command manifest (`q12-command-manifest.json`), read from the deployed tree. Not
    # the same artefact as `manifest` above, which is the deployed-ASSET manifest probe H2 compares
    # bytes against; group G measures the twenty frozen commands themselves.
    command_manifest: Optional[dict] = None
    # Where the deployed tree lives, bound in EVERY scope: group G's libpq leg is database-scope but
    # still has to read the entry points the frozen commands execute.
    deploy_root: Optional[pathlib.Path] = None
    # The pooled libpq environment (PGSERVICEFILE/PGSERVICE and nothing secret), so G3 can open the
    # same pooled connection under a command's frozen env instead of this process's own.
    libpq_env: "dict[str, str]" = field(default_factory=dict)
    barrier_text: Optional[str] = None
    structural_catalog_sql: Optional[str] = None
    host: Optional[HostAdapter] = None
    # Files whose bytes probe B1 scans for a surviving dependence on startup `options` delivery.
    pooler_dependence_sources: "dict[str, str]" = field(default_factory=dict)
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

# `new Client({... application_name:"megacampus-q12-…"})` — a startup parameter the pooler does not
# merely drop the way it drops `options`: it SUBSTITUTES its own value (mc2-38ivn).
APPLICATION_NAME_DEPENDENCE_RE = re.compile(r'application_name\s*:\s*"(megacampus-q12-[^"]*)"')
# `await client.query("SET application_name='megacampus-q12-…'")` — the session-level statement of
# intent that replaces the dependence. The barrier spells its single quotes `'` so the embedded
# Node runners survive the shell quoting, so both spellings are accepted here.
APPLICATION_NAME_SESSION_SET_RE = re.compile(
    r'query\("SET application_name=(?:\\u0027|\')(megacampus-q12-[^\'\\"]*)(?:\\u0027|\')"\)'
)
# A client that never names itself AT ALL is the same defect arriving from the other side: it is
# reported as 'Supavisor', invisible to every `megacampus-q12-%` consumer, and a scan that only
# looks at DECLARED names would not see it. Counting constructions against statements of intent is
# what makes that case visible.
CLIENT_CONSTRUCTION_RE = re.compile(r"new Client\(")


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

    if not context.pooler_dependence_sources:
        return verdict(
            "B1",
            FAIL,
            "no source was scanned for a surviving dependence on startup `options` delivery; an "
            "empty source set is not evidence that every runner states its intent in the session",
        )

    unmatched: list[str] = []
    for name, text in sorted(context.pooler_dependence_sources.items()):
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
        f"{len(context.pooler_dependence_sources)} scanned source(s) state their intent with a "
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
    """Every Q12 session must be able to name itself in `pg_stat_activity`, and no runner may
    depend on the CONNECTION to do it.

    Production truth, measured on 2026-07-28 (mc2-38ivn): Supavisor does not merely drop the
    startup `application_name` the way it drops `options` — it substitutes `'Supavisor'`. The
    barrier's terminal proof asserts

        count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid()
          AND datname='postgres' AND application_name LIKE 'megacampus-q12-%'  == 0

    so through the pooler that count could only ever read 0 — not because no barrier-era session
    survived the window, but because none could be recognised. It passed for the wrong reason.

    The verdict therefore follows B1's shape rather than demanding delivery: measure what the
    connection does, measure whether the session-level repair works, and fail only when a runner
    still trusts the connection — or when no repair exists at all.
    """
    if context.script is None:
        raise ProbeError("no database seam is bound in this scope")
    name = f"{PREFLIGHT_APPLICATION_NAME}-b3"
    both = (
        "SELECT pg_catalog.current_setting('application_name') || '|' || COALESCE("
        "(SELECT activity.application_name FROM pg_catalog.pg_stat_activity activity"
        " WHERE activity.pid = pg_catalog.pg_backend_pid()), '')"
    )
    result = context.script(read_only(both), application_name=name)
    if result.returncode != 0:
        raise ProbeError(f"application_name probe failed: {' '.join(result.stderr.split())[:200]}")
    parts = result.stdout.strip().split("|")
    setting = parts[0] if parts else ""
    activity = parts[1] if len(parts) > 1 else ""
    delivered = setting == name and activity == name

    # The repair leg runs unconditionally: the barrier depends on a session-level SET reaching
    # pg_stat_activity whether or not the connection would also have delivered the name.
    repaired = context.script(
        "BEGIN READ ONLY;\n"
        f"{READ_ONLY_ASSERT} \\g /dev/null\n"
        f"SET application_name = '{name}';\n"
        f"COPY ({both}) TO STDOUT;\n"
        "COMMIT;\n",
        application_name=name,
    )
    after = repaired.stdout.strip().split("|") if repaired.returncode == 0 else ["<error>"]
    after_setting = after[0] if after else ""
    after_activity = after[1] if len(after) > 1 else ""
    session_set_works = after_setting == name and after_activity == name

    # Which runners still name themselves on the connection alone. Counted, never de-duplicated:
    # two clients sharing ONE name, only one of which restates it, is an empty set difference and
    # would read green while half the barrier stayed invisible.
    unmatched: list[str] = []
    for source_name, text in sorted(context.pooler_dependence_sources.items()):
        wants: dict[str, int] = {}
        for value in APPLICATION_NAME_DEPENDENCE_RE.findall(text):
            wants[value] = wants.get(value, 0) + 1
        states: dict[str, int] = {}
        session_sets = APPLICATION_NAME_SESSION_SET_RE.findall(text)
        for value in session_sets:
            states[value] = states.get(value, 0) + 1
        for value, count in sorted(wants.items()):
            if states.get(value, 0) < count:
                unmatched.append(
                    f"{source_name} (connect={value} x{count}, session SET x{states.get(value, 0)})"
                )
        clients = len(CLIENT_CONSTRUCTION_RE.findall(text))
        if clients > len(session_sets):
            unmatched.append(
                f"{source_name} ({clients} client(s) constructed, {len(session_sets)} of which "
                "name themselves in the session; the rest are reported under the pooler's own name)"
            )

    state = (
        f"delivered unmodified as {name!r}"
        if delivered
        else f"rewritten in flight (asked {name!r}, the session reports {setting!r} and "
        f"pg_stat_activity reports {activity!r})"
    )
    if not session_set_works:
        return verdict(
            "B3",
            FAIL,
            f"application_name is {state}, and a session-level `SET application_name` does not "
            f"reach pg_stat_activity either (reads {after_activity or after_setting!r}). No Q12 "
            f"session can name itself, so every consumer of {Q12_APPLICATION_PREFIX!r} is blind — "
            "including the terminal proof's barrier_era_session_count, which would read 0 for the "
            "wrong reason and let the window close on an unproven claim",
        )
    if not context.pooler_dependence_sources:
        return verdict(
            "B3",
            FAIL,
            "no source was scanned for a surviving dependence on connect-time application_name; an "
            "empty source set is not evidence that every runner states its name in the session",
        )

    if unmatched:
        return verdict(
            "B3",
            FAIL,
            f"application_name is {state}; a session-level SET DOES reach pg_stat_activity, but a "
            f"runner still names itself on the connection alone and is invisible to every "
            f"{Q12_APPLICATION_PREFIX!r} consumer: {name_list(unmatched)}",
        )
    return verdict(
        "B3",
        PASS,
        f"application_name is {state}; a session-level SET reaches pg_stat_activity as "
        f"{after_activity!r}, and all {len(context.pooler_dependence_sources)} scanned source(s) "
        "restate every Q12 name in the session, so nothing depends on what the pooler delivers",
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


# --- Group G: the frozen environment every manifest command runs in ------------------------------
#
# The mc2-1cxna wall.  On 2026-07-29 the live window produced five defects and NOT ONE of them was
# logic; three were the same cause in three different consumers.  The frozen command manifest pins
# ``HOME=/root`` for every one of its twenty commands, while the controller and its children run as
# uid 1000 (mc2-1by33) and ``/root`` is 0700 root-owned.  A child that resolves something under
# ``$HOME`` therefore gets EACCES — which is NOT the same as "absent", so nothing falls back:
#
#   * libpq stops on its default client certificate ``$HOME/.postgresql/postgresql.crt`` and refuses
#     every connection (C3, attempts #13/#14);
#   * the docker CLI abandons ``$HOME/.docker/config.json`` and then never discovers its CLI
#     plugins, so ``docker buildx`` and ``docker compose`` CEASE TO EXIST and degrade to
#     "unknown command" (C4, attempt #16; the same cause killed the 2026-07-27 pre-flight).
#
# Groups A-E measure the database and group H the deployed bytes.  Nothing measured the environment
# the commands are HANDED.  This group does, for EVERY command in the frozen manifest — including
# the ten that have never executed in a window — and it is deliberately COMPLETE over the manifest:
# a command this group cannot account for is a `fail`, never a silence.
#
# The frozen env cannot be edited (`aaec6fc2…` is immutable by contract and ``load_manifest``
# enforces byte-equal env per command), so every repair lives in a consumer, and every repair is
# pinned to that consumer's OWN bytes — the mc2-lzft4 discipline, where a probe that carried its own
# expected value certified a host the consumer rejects.

COMMAND_MANIFEST_SCHEMA = "megacampus.q12.command-manifest/v1"
COMMAND_MANIFEST_RELATIVE = "deploy/qdrant/q12-command-manifest.json"
DEPLOY_PREFIX = "/opt/megacampus/"

# mc2-1by33: exactly one frozen command reaches root, through the root-owned argv whitelist; every
# other command runs as the controller's own uid.
PRIVILEGED_COMMAND_ID = "source.forward"
ROOT_IDENTITY = "root"
OPERATOR_IDENTITY = "operator"

FROZEN_HOME_BLOCK_BEGIN = "# --- frozen-HOME normalization (mc2-wwc9l) ---"
FROZEN_HOME_BLOCK_END = "# --- end frozen-HOME normalization ---"

# Consumers that resolve something under $HOME. DERIVED from a deployed file's own bytes rather than
# declared per command, so a chain that starts using one is covered the moment it does.
DOCKER_INVOCATION_RE = re.compile(
    r"(?:\$\{?DOCKER(?:_BIN)?\}?|/usr/bin/docker|\bdocker_bin\b|\bdocker\()[\"'\s,]*([a-z][a-z0-9_-]*)"
)
# A docker CLI PLUGIN is a separate executable discovered through the config directory under $HOME.
# The core verbs are built into the binary and survive an unreadable HOME with a warning — the exact
# asymmetry that let the writer fleet stop and start for sixteen attempts while `docker buildx`
# silently ceased to exist at C4.
DOCKER_PLUGIN_VERBS = ("buildx", "compose")
# Bounded so a FILENAME cannot pose as a binary: `$TEMP_GENERATION/.pg_dump.stderr` is a log, not a
# connection, and counting it made the per-invocation rule below flag thirty-eight innocent lines.
LIBPQ_INVOCATION_RE = re.compile(r"(?<![\w.-])(psql|pg_dump|pg_dumpall|pg_restore|pg_isready)(?![\w.-])")
# libpq resolves its default client certificate ONLY while opening a connection: an offline
# `pg_restore --list archive` reads nothing under $HOME. A libpq call site therefore counts as a
# consumer only where the same logical line also establishes a connection.
LIBPQ_CONNECTION_RE = re.compile(
    r"(?<![\w])(PGSERVICE|PGSERVICEFILE|PGHOST|PGDATABASE|PGUSER|PGPASSFILE|--dbname|--host|"
    r"--no-password|service=|postgres(?:ql)?://)"
)
# A re-exec'ing spawn chain: the descriptor table the parent opened does not reach the grandchild,
# so a `/proc/self/fd/N` ARGUMENT stops resolving. Direct coreutil children keep it and are fine.
RESPAWNING_CONSUMER_RE = re.compile(r"(?<![\w.-])(pnpm|npm|npx|tsx|node|docker)(?![\w.-])")
FD_PATH_RE = re.compile(r"/proc/self/fd/(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\d+)")

CHAIN_MEMBER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\.(?:sh|py|ts)")


PROCESS_SCOPE = "process"
INVOCATION_SCOPE = "invocation"


@dataclass(frozen=True)
class HomeRepair:
    """How one consumer survives the frozen `HOME=/root`, pinned to a token in its own bytes.

    `scope` is the difference between the two repair shapes in this tree, and it is not cosmetic. An
    `export HOME=…` covers the process and everything it spawns; a `HOME=… some-command` prefix
    covers exactly that one invocation and NOTHING else, so the next libpq call added beside it
    inherits the frozen `/root` again. G1 holds the second shape to a per-invocation rule for that
    reason.
    """

    kind: str
    scope: str
    token: str
    note: str


# Keyed by deploy-root-relative path. `token` MUST appear in the deployed file: a repair that is
# refactored away becomes a `fail` here instead of a stale belief in this table.
HOME_REPAIRS: "dict[str, HomeRepair]" = {
    "deploy/qdrant/operator-compose.sh": HomeRepair(
        "normalization-block",
        PROCESS_SCOPE,
        FROZEN_HOME_BLOCK_BEGIN,
        "replaces only a HOME the current uid genuinely cannot use, with the account's own passwd "
        "home, before any docker child runs (mc2-wwc9l)",
    ),
    "scripts/deploy_blue_green.sh": HomeRepair(
        "normalization-block",
        PROCESS_SCOPE,
        FROZEN_HOME_BLOCK_BEGIN,
        "the same block, byte-for-byte, asserted by q12-frozen-home-normalization.test.ts",
    ),
    "deploy/postgres/restore-supabase-drill.sh": HomeRepair(
        "private-temp-home",
        PROCESS_SCOPE,
        'export HOME="$TEMP_ROOT"',
        "exports the adopted private 0700 temp root as HOME inside create_temp_root, before any "
        "child runs, so the docker CLI discovers its buildx plugin (mc2-1cxna c)",
    ),
    "deploy/postgres/backup-supabase.sh": HomeRepair(
        "per-invocation-home",
        INVOCATION_SCOPE,
        'HOME="$TEMP_GENERATION"',
        "hands every libpq invocation a HOME it can stat, so libpq stops looking for its default "
        "client certificate under an unreadable /root (mc2-1cxna a)",
    ),
}


@dataclass(frozen=True)
class HomeExemption:
    """A consumer that meets an unusable `$HOME` and is proven to survive it anyway.

    An exemption is never a belief. `allowed` is the exact set of consumer classes it covers, and it
    is checked against the DERIVED consumers of the deployed bytes on every run, so reaching one
    more revokes it automatically. `smoke` is a read-only invocation re-measured under the frozen
    env, so a claim like "this one degrades instead of failing" is a measurement, not a memory.
    """

    consumer: str
    reason: str
    allowed: "tuple[str, ...]" = ()
    smoke: "tuple[str, ...] | None" = None


HOME_EXEMPTIONS: "dict[str, HomeExemption]" = {
    # The writer controller asserts `dict(os.environ) == EXPECTED_ENVIRONMENT` with HOME=/root
    # (q12-writer-resume.py:75-81, :149), so a repair CANNOT live there: normalising HOME would make
    # the child refuse its own environment. It survives because it only ever reaches docker's
    # built-in verbs, which need no plugin discovery. The moment a plugin verb appears in its bytes
    # that stops being true, and this exemption is revoked automatically.
    "deploy/qdrant/q12-writer-resume.py": HomeExemption(
        consumer="docker-cli",
        reason=(
            "reaches only docker's built-in verbs (inspect/ps/update/start/stop), which need no "
            "plugin discovery and survive an unreadable HOME with a warning; the child pins its own "
            "environment to the frozen one, so the repair cannot live here"
        ),
        allowed=("docker-cli",),
    ),
    # The writer wrapper is the same shape: it inspects and starts containers itself, and rebuilds
    # the frozen env with `env -i … HOME='/root'` for the controller it spawns (:449-451, :489-491)
    # precisely because that child demands it. Its own docker use is built-in verbs only.
    "deploy/qdrant/source-recovery-run.sh": HomeExemption(
        consumer="docker-cli",
        reason=(
            "reaches only docker's built-in verbs, and rebuilds the frozen env verbatim for the "
            "writer controller, which asserts that exact environment"
        ),
        allowed=("docker-cli",),
    ),
    # migration.base.apply / migration.observability.apply exec /usr/bin/pnpm directly, so there is
    # no deployed wrapper to repair. pnpm reports an unreadable rc file as a WARNING and continues;
    # that is measured here under the exact frozen env rather than assumed, because it is the one
    # consumer in the manifest whose behaviour under EACCES is degrade-and-continue.
    "/usr/bin/pnpm": HomeExemption(
        consumer="pnpm",
        reason=(
            "pnpm treats an unreadable $HOME/.npmrc and $HOME/.config/pnpm/rc as a warning and "
            "continues; neither migration command installs anything, so no registry credential is "
            "resolved"
        ),
        smoke=("/usr/bin/pnpm", "--version"),
    ),
}


def _deploy_root(context: Context) -> pathlib.Path:
    if context.deploy_root is not None:
        return context.deploy_root
    if context.host is not None:
        return context.host.deploy_root
    raise ProbeError("no deployed tree is bound in this scope")


def _command_manifest(context: Context) -> dict:
    manifest = context.command_manifest
    if not isinstance(manifest, dict) or manifest.get("schema_version") != COMMAND_MANIFEST_SCHEMA:
        raise ProbeError("the frozen command manifest is missing or has the wrong schema")
    commands = manifest.get("commands")
    if not isinstance(commands, dict) or not commands:
        raise ProbeError("the frozen command manifest carries no commands")
    return manifest


def _run_env(
    context: Context, argv: "list[str]", env: "dict[str, str]", stdin_text: "str | None" = None
) -> ScriptResult:
    """Run one child under an EXACT environment, inheriting nothing from this process."""
    if context.host is not None and context.host.run_env is not None:
        return context.host.run_env(argv, env, stdin_text)
    completed = subprocess.run(
        argv,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        **({"input": stdin_text} if stdin_text is not None else {"stdin": subprocess.DEVNULL}),
    )
    return ScriptResult(completed.returncode, completed.stdout, completed.stderr)


def _deployed_path(context: Context, token: str) -> "pathlib.Path | None":
    """Map an argv token onto the deployed tree, or None when it is not part of it."""
    if not token.startswith(DEPLOY_PREFIX):
        return None
    candidate = _deploy_root(context) / token[len(DEPLOY_PREFIX) :]
    return candidate if candidate.is_file() else None


def _chain_for(context: Context, argv: "list[str]") -> "dict[str, str]":
    """The deployed files one frozen command executes, one level deep, DERIVED from bytes.

    argv[0] plus every script named in its own text that exists beside it or under the deployed
    root. One level is a real bound and it is stated in the verdicts: it covers the wrapper that
    receives the frozen env and the child it immediately execs, which is where all three 2026-07-29
    HOME defects and the fd-path defect lived.
    """
    root = _deploy_root(context)
    chain: dict[str, str] = {}
    entry = _deployed_path(context, argv[0]) if argv else None
    if entry is None:
        return chain
    chain[str(entry.relative_to(root))] = entry.read_text(encoding="utf-8", errors="replace")
    for name in sorted(set(CHAIN_MEMBER_RE.findall(chain[str(entry.relative_to(root))]))):
        sibling = entry.parent / name
        if not sibling.is_file() or sibling == entry:
            continue
        relative = str(sibling.relative_to(root))
        chain.setdefault(relative, sibling.read_text(encoding="utf-8", errors="replace"))
    return chain


def _home_state(home: str, identity: str) -> "tuple[bool, str]":
    """Can the executing identity actually USE this HOME?

    For the operator that is `stat` plus `R_OK|X_OK` measured with the probe's own uid — the same
    uid the controller and its children run as. For root it is existence and directory-ness: root
    bypasses the permission bits through CAP_DAC_OVERRIDE, so `/root` being 0700 root-owned is
    exactly what makes it usable there and unusable for everyone else. Stated, not assumed.
    """
    path = pathlib.Path(home)
    if not home or not path.is_absolute():
        return False, f"HOME {home!r} is not an absolute path"
    try:
        info = path.stat()
    except OSError as error:
        return False, f"{home} cannot be stat'ed by this identity ({error.strerror})"
    if not stat_module.S_ISDIR(info.st_mode):
        return False, f"{home} is not a directory"
    if identity == ROOT_IDENTITY:
        return True, f"{home} is a directory and root bypasses its 0{info.st_mode & 0o777:o} mode"
    if not os.access(path, os.R_OK | os.X_OK):
        return False, (
            f"{home} is mode 0{info.st_mode & 0o777:o} owned by uid {info.st_uid}; uid "
            f"{os.getuid()} can neither read nor traverse it"
        )
    return True, f"{home} is readable and traversable by uid {os.getuid()}"


ASSIGNMENT_RE = re.compile(
    r"^\s*(?:readonly\s+|local\s+|export\s+|declare\s+-r\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.+)$"
)
HOME_ASSIGNMENT_RE = re.compile(r"(?<![A-Za-z0-9_])HOME=")


def _logical_lines(text: str) -> "list[str]":
    """Shell logical lines: backslash continuations joined.

    A repair and the invocation it repairs routinely sit on different physical lines —
    ``HOME="$TEMP_GENERATION" \\`` then the binary on the next — so a per-physical-line rule would
    read every repaired call in `backup-supabase.sh` as unrepaired.
    """
    lines: list[str] = []
    buffer = ""
    for raw in text.splitlines():
        buffer = f"{buffer} {raw.strip()}" if buffer else raw
        stripped = buffer.rstrip()
        if stripped.endswith("\\"):
            buffer = stripped[:-1]
            continue
        lines.append(buffer)
        buffer = ""
    if buffer:
        lines.append(buffer)
    return lines


def _variable_consumers(
    lines: "list[str]", members: "dict[str, dict[str, list[str]]] | None" = None
) -> "dict[str, dict[str, list[str]]]":
    """Shell variables whose VALUE names a $HOME-resolving consumer.

    ``readonly PG_DUMPALL='/usr/lib/postgresql/17/bin/pg_dumpall'`` is the only place the string
    `pg_dumpall` ever appears in `backup-supabase.sh`; every invocation says `"$PG_DUMPALL"`. A
    literal-token scan alone therefore sees the consumer in the file and in none of its call sites,
    which is precisely backwards for a per-invocation rule.

    `members` extends the same treatment to a spawned CHILD: ``MANIFEST_GENERATOR=…q12-source-
    manifest.ts`` makes every `"$MANIFEST_GENERATOR"` call site reach whatever that child reaches,
    so a per-invocation repair must cover it too.
    """
    variables: dict[str, dict[str, list[str]]] = {}
    for line in lines:
        match = ASSIGNMENT_RE.match(line)
        if match is None:
            continue
        value = match.group(2)
        found = dict(_consumers_in(value))
        for basename, consumers in (members or {}).items():
            if basename in value:
                _merge_consumers(found, consumers)
        if found:
            variables[match.group(1)] = found
    return variables


def _merge_consumers(into: "dict[str, list[str]]", extra: "dict[str, list[str]]") -> None:
    for name, tokens in extra.items():
        into[name] = sorted(set(into.get(name, [])) | set(tokens))


def _line_consumers(line: str, variables: "dict[str, dict[str, list[str]]]") -> "dict[str, list[str]]":
    """The consumers ONE invocation reaches, literally or through a variable it expands."""
    if line.lstrip().startswith("#"):
        return {}
    found = dict(_consumers_in(line))
    for name, consumers in variables.items():
        if re.search(r"\$\{?" + re.escape(name) + r"\}?(?![A-Za-z0-9_])", line):
            _merge_consumers(found, consumers)
    if "libpq" in found and not LIBPQ_CONNECTION_RE.search(line):
        del found["libpq"]
    return found


def _consumers_in(text: str) -> "dict[str, list[str]]":
    """Which $HOME-resolving consumers a deployed file reaches, with the evidence tokens."""
    found: dict[str, list[str]] = {}
    plugins = sorted(
        {verb for verb in DOCKER_INVOCATION_RE.findall(text) if verb in DOCKER_PLUGIN_VERBS}
    )
    core = sorted(
        {verb for verb in DOCKER_INVOCATION_RE.findall(text) if verb not in DOCKER_PLUGIN_VERBS}
    )
    if plugins:
        found["docker-cli-plugin"] = plugins
    if core:
        found["docker-cli"] = core
    clients = sorted(set(LIBPQ_INVOCATION_RE.findall(text)))
    if clients:
        found["libpq"] = clients
    return found


def frozen_command_surface(context: Context) -> "list[dict]":
    """One record per frozen command: its env, its identity, its chain and its consumers."""
    if "frozen_command_surface" in context.cache:
        return context.cache["frozen_command_surface"]
    manifest = _command_manifest(context)
    records: list[dict] = []
    for command_id, command in manifest["commands"].items():
        env = dict(command.get("env") or {})
        argv = list(command.get("argv") or [])
        identity = ROOT_IDENTITY if command_id == PRIVILEGED_COMMAND_ID else OPERATOR_IDENTITY
        chain = _chain_for(context, argv)
        records.append(
            {
                "id": command_id,
                "argv": argv,
                "env": env,
                "home": env.get("HOME", ""),
                "identity": identity,
                "entry_point": argv[0] if argv else "",
                "chain": chain,
                "consumers": {name: _consumers_in(text) for name, text in chain.items()},
            }
        )
    context.cache["frozen_command_surface"] = records
    return records


def _repair_for(relative: str, text: str) -> "tuple[HomeRepair | None, str | None]":
    """The declared repair for a chain member, and the reason it does not hold."""
    repair = HOME_REPAIRS.get(relative)
    if repair is None:
        return None, None
    if repair.token not in text:
        return None, (
            f"{relative} no longer carries its declared {repair.kind} repair "
            f"({repair.token!r}); the frozen HOME reaches its children unrepaired"
        )
    return repair, None


def _entry_relative(record: dict) -> "str | None":
    """The chain member that argv[0] names — the one handed the frozen env directly."""
    chain = record["chain"]
    entry = str(record["entry_point"])
    for relative in chain:
        if entry.endswith(relative):
            return relative
    return next(iter(chain), None)


def _repair_state(record: dict, member: str) -> "tuple[str, HomeRepair | None, str]":
    """ONE rule, shared by G1, G2 and G3, for what covers a chain member's frozen HOME.

    * ``drift``      — a declared repair is no longer in the deployed bytes;
    * ``process``    — the member, or the entry point that spawns it, exports a usable HOME;
    * ``inherited``  — the entry point repairs per invocation, and this member is a child it spawns,
      so it inherits whatever that call site set. G1 is what holds those call sites to it;
    * ``invocation`` — the member itself repairs per invocation, and only per invocation;
    * ``none``       — nothing repairs it.
    """
    own, drift = _repair_for(member, str(record["chain"][member]))
    if drift:
        return "drift", None, drift
    if own is not None and own.scope == PROCESS_SCOPE:
        return "process", own, member
    entry = _entry_relative(record)
    if entry is not None and entry != member:
        inherited, entry_drift = _repair_for(entry, str(record["chain"][entry]))
        if entry_drift:
            return "drift", None, entry_drift
        if inherited is not None and inherited.scope == PROCESS_SCOPE:
            return "process", inherited, entry
        if inherited is not None:
            return "inherited", inherited, entry
    if own is not None:
        return "invocation", own, member
    return "none", None, member


def probe_g1(context: Context) -> "dict[str, object]":
    """Every frozen command's `$HOME` is usable by the identity that runs it, or a consumer repairs
    it, or nothing in its chain resolves under `$HOME`.

    Complete over the manifest by construction: a command whose chain cannot be read is a `fail`,
    so a new frozen command cannot arrive here unexamined.
    """
    records = frozen_command_surface(context)
    offenders: list[str] = []
    unusable: list[str] = []
    repaired: list[str] = []
    exempted: list[str] = []
    unmeasured: list[str] = []
    inert: list[str] = []

    for record in records:
        command_id = str(record["id"])
        home = str(record["home"])
        if not home:
            offenders.append(f"{command_id} (frozen env declares no HOME)")
            continue
        usable, why = _home_state(home, str(record["identity"]))
        if usable:
            continue
        unusable.append(f"{command_id} -> {why}")

        chain = record["chain"]
        consumers = record["consumers"]
        touching = {name: found for name, found in consumers.items() if found}

        if not chain:
            # argv[0] is not a deployed file: the only such commands are the two that exec
            # /usr/bin/pnpm, and they are covered by an exemption measured below.
            exemption = HOME_EXEMPTIONS.get(str(record["entry_point"]))
            if exemption is None:
                offenders.append(
                    f"{command_id} (entry point {record['entry_point']} is outside the deployed "
                    "tree and carries no measured exemption)"
                )
                continue
            outcome, text = _exemption_verdict(
                context, record, exemption, str(record["entry_point"])
            )
            {"fail": offenders, "unmeasured": unmeasured, "ok": exempted}[outcome].append(text)
            continue

        if not touching:
            inert.append(f"{command_id} (nothing in its chain resolves under $HOME)")
            continue

        for name in sorted(touching):
            text = str(chain[name])
            state, repair, source = _repair_state(record, name)
            if state == "drift":
                offenders.append(f"{command_id}: {source}")
                continue
            if state == "process":
                repaired.append(f"{command_id} -> {name} ({repair.kind} in {source})")
                continue
            if state == "inherited":
                # The parent spawns this child on a line the per-invocation rule below already holds
                # to `HOME=`; judging the child again on its own bytes would demand a second repair
                # for an environment it merely inherits.
                repaired.append(
                    f"{command_id} -> {name} (inherits {repair.kind} from {source}'s call site)"
                )
                continue
            if state == "invocation":
                # An invocation-scope repair covers exactly the call sites that carry it. Every
                # logical line in this member that reaches a $HOME-resolving consumer — directly, or
                # through a variable naming one, or by spawning a chain member that does — must
                # carry its own HOME=. This is the rule that catches the NEXT libpq call added
                # beside a repaired one, which is how this class keeps arriving.
                others = {
                    pathlib.Path(other).name: found
                    for other, found in touching.items()
                    if other != name
                }
                lines = _logical_lines(text)
                variables = _variable_consumers(lines, others)
                naked = [
                    " ".join(line.split())[:120]
                    for line in lines
                    if _line_consumers(line, variables) and not HOME_ASSIGNMENT_RE.search(line)
                ]
                if naked:
                    offenders.append(
                        f"{command_id}: {name} carries a {repair.kind} repair, but "
                        f"{len(naked)} invocation(s) reach a $HOME-resolving consumer without it, "
                        f"so they run under {home}: " + name_list(naked, limit=3)
                    )
                else:
                    repaired.append(f"{command_id} -> {name} ({repair.kind}, every call site)")
                continue
            exemption = HOME_EXEMPTIONS.get(name)
            if exemption is None:
                offenders.append(
                    f"{command_id}: {name} reaches "
                    + "/".join(sorted(touching[name]))
                    + f" under an unusable HOME {home} with no repair and no measured exemption"
                )
                continue
            outcome, text = _exemption_verdict(context, record, exemption, name)
            {"fail": offenders, "unmeasured": unmeasured, "ok": exempted}[outcome].append(text)

    if offenders:
        distinct = sorted(set(offenders))
        return verdict("G1", FAIL, f"{len(distinct)} frozen-env offence(s): " + name_list(distinct))
    bound = (
        "BOUND: the chain is derived one level deep — the wrapper handed the frozen env plus the "
        "child it execs — and consumer detection is by invocation token, so a consumer reached "
        "through a path this cannot read is out of its reach."
    )
    if unmeasured:
        return verdict(
            "G1",
            UNPROVABLE,
            f"{len(unusable)} frozen command(s) declare a HOME their identity cannot use; "
            f"{len(repaired)} are repaired by the consumer's own bytes and {len(exempted)} carry a "
            f"re-measured exemption, but {len(unmeasured)} could not be measured here: "
            + name_list(unmeasured)
            + f". {bound}",
            "the production host carries every binary these exemptions name, and the pre-flight is "
            "re-run there immediately before the window (.codex/handoff.md § 'Before the next "
            "attempt'); the unmeasured entries are named above rather than counted as passes",
        )
    return verdict(
        "G1",
        PASS,
        f"all {len(records)} frozen commands account for their HOME: {len(unusable)} declare a HOME "
        f"their identity cannot use, of which {len(repaired)} are repaired by the consumer's own "
        f"bytes ({name_list(repaired)}), {len(exempted)} carry a re-measured exemption "
        f"({name_list(exempted)}) and {len(inert)} reach no $HOME-resolving consumer. {bound}",
    )


def _exemption_verdict(
    context: Context, record: dict, exemption: HomeExemption, name: str
) -> "tuple[str, str]":
    """Re-measure an exemption on every run: `ok`, `fail`, or `unmeasured` with the reason.

    `unmeasured` is not a pass. An exemption whose smoke test cannot run on THIS host (a workstation
    without the binary) leaves G1 `unprovable` with that named gap, so a green can never be reported
    for something nothing measured.
    """
    reached = sorted(record["consumers"].get(name, {}))
    beyond = [consumer for consumer in reached if consumer not in exemption.allowed]
    if beyond:
        return "fail", (
            f"{record['id']}: {name}'s exemption is REVOKED — it now reaches "
            + ", ".join(beyond)
            + f", which is outside the {'/'.join(exemption.allowed) or 'empty'} set it was granted "
            f"for, under an unusable HOME {record['home']}"
        )
    if exemption.smoke is not None:
        binary = pathlib.Path(exemption.smoke[0])
        if not binary.is_file():
            return "unmeasured", (
                f"{record['id']}: {name}'s exemption could not be re-measured — {binary} is not "
                "installed on this host"
            )
        result = _run_env(context, list(exemption.smoke), dict(record["env"]))
        if result.returncode != 0:
            return "fail", (
                f"{record['id']}: {name}'s exemption does not hold under its own frozen env — "
                f"{' '.join(exemption.smoke)} exited {result.returncode}: "
                + " ".join((result.stderr or result.stdout).split())[:200]
            )
    return "ok", f"{record['id']} -> {name} ({exemption.consumer})"


def _docker_binary(context: Context) -> "str | None":
    for candidate in ("/usr/bin/docker", "/usr/local/bin/docker"):
        if pathlib.Path(candidate).is_file():
            return candidate
    return shutil.which("docker")


def _repaired_env(
    context: Context, record: dict, source: str, repair: "HomeRepair | None"
) -> "tuple[dict[str, str], str]":
    """The environment the consumer ITSELF establishes out of the frozen one.

    Where the consumer carries the shared normalization block, the block is EXTRACTED FROM THE
    DEPLOYED BYTES and executed under the frozen env, so the probe measures the repair that will
    actually run rather than a re-implementation of it — the mc2-lzft4 rule. Where the repair is a
    private temp home, the probe reproduces that property (a 0700 directory this uid owns) and says
    so, because replaying the consumer's own temp-root adoption would have side effects.
    """
    env = dict(record["env"])
    if repair is not None and repair.kind == "normalization-block":
        text = str(record["chain"][source])
        begin = text.index(FROZEN_HOME_BLOCK_BEGIN) + len(FROZEN_HOME_BLOCK_BEGIN)
        block = text[begin : text.index(FROZEN_HOME_BLOCK_END)]
        script = (
            "set -euo pipefail\n"
            "fail() { printf 'wrapper: %s\\n' \"$1\" >&2; exit 1; }\n"
            f"{block}\nprintf '%s' \"${{HOME-}}\"\n"
        )
        result = _run_env(context, ["/bin/bash", "-c", script], env)
        if result.returncode != 0 or not result.stdout.strip():
            raise ProbeError(
                f"{source}'s own frozen-HOME normalization refused to run under its frozen env: "
                + " ".join(result.stderr.split())[:200]
            )
        env["HOME"] = result.stdout.strip()
        return env, f"{source}'s own normalization block, executed from the deployed bytes"
    private = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-frozen-home-"))
    os.chmod(private, 0o700)
    env["HOME"] = str(private)
    return env, "a private 0700 temp home, the property the consumer's own temp root establishes"


def probe_g2(context: Context) -> "dict[str, object]":
    """The docker CLI discovers its plugins for every frozen command that needs one.

    Attempt #16 died here: under `HOME=/root` the CLI logs `Error loading config file: … permission
    denied` and then never scans for cli-plugins, so `docker buildx imagetools inspect --raw`
    degrades to `unknown command`. Both legs are measured — the frozen env as it stands, and the env
    the consumer's own repair establishes — because the first is what the defect looked like and the
    second is what has to be true for the window to open.
    """
    docker = _docker_binary(context)
    records = frozen_command_surface(context)
    needed: list[tuple[dict, str, list[str]]] = []
    for record in records:
        for name, found in record["consumers"].items():
            verbs = found.get("docker-cli-plugin")
            if verbs:
                needed.append((record, name, verbs))
    if not needed:
        return verdict(
            "G2",
            FAIL,
            "no frozen command was found to reach a docker CLI plugin; an empty consumer set is "
            "not evidence that plugin discovery is irrelevant — it means the derivation stopped "
            "working",
        )
    if docker is None:
        return verdict(
            "G2",
            UNPROVABLE,
            "no docker CLI on this host, so plugin discovery under the frozen env was not measured",
            "deploy/qdrant/q12-preflight-probes.py probe G2 requires the docker CLI; the production "
            "host has it at /usr/bin/docker and the measurement is re-run there before the window",
        )

    frozen_failures: list[str] = []
    repaired_failures: list[str] = []
    unrepaired: list[str] = []
    proven: list[str] = []
    temporary: list[pathlib.Path] = []
    try:
        for record, name, verbs in needed:
            state, repair, source = _repair_state(record, name)
            if state == "drift":
                unrepaired.append(f"{record['id']}: {source}")
                continue
            if state == "none" and name not in HOME_EXEMPTIONS:
                unrepaired.append(
                    f"{record['id']}: {name} invokes docker "
                    + "/".join(verbs)
                    + f" under HOME {record['home']} with no repair"
                )
                continue
            repaired_env, how = _repaired_env(context, record, source, repair)
            if repaired_env["HOME"] != record["env"].get("HOME"):
                temporary.append(pathlib.Path(repaired_env["HOME"]))
            for verb in verbs:
                frozen = _run_env(context, [docker, verb, "version"], dict(record["env"]))
                if frozen.returncode != 0:
                    frozen_failures.append(f"{record['id']} docker {verb} ({name})")
                fixed = _run_env(context, [docker, verb, "version"], repaired_env)
                if fixed.returncode != 0:
                    repaired_failures.append(
                        f"{record['id']} docker {verb} under {how}: "
                        + " ".join((fixed.stderr or fixed.stdout).split())[:160]
                    )
                else:
                    proven.append(f"{record['id']} docker {verb} ({name})")
    finally:
        for path in temporary:
            if path.name.startswith("mc2-q12-frozen-home-"):
                shutil.rmtree(path, ignore_errors=True)

    if unrepaired:
        return verdict("G2", FAIL, "; ".join(sorted(set(unrepaired))))
    if repaired_failures:
        return verdict(
            "G2",
            FAIL,
            "the docker CLI does not discover its plugin even under the repair the consumer "
            "establishes: " + name_list(repaired_failures),
        )
    return verdict(
        "G2",
        PASS,
        f"{len(proven)} docker plugin invocation(s) across {len({r['id'] for r, _, _ in needed})} "
        f"frozen command(s) discover their plugin under the repair their own consumer establishes "
        f"({name_list(sorted(set(proven)))}); under the frozen env verbatim "
        f"{len(frozen_failures)} of them do not, which is the mc2-1cxna defect measured rather than "
        "recalled",
    )


def probe_g3(context: Context) -> "dict[str, object]":
    """A libpq client connects through the POOLED DSN under each frozen env that needs one.

    Attempts #13/#14 died here: libpq resolves its default client certificate at
    `$HOME/.postgresql/postgresql.crt`, and an EACCES on that stat refuses the connection outright.
    The connection goes through the pooled DSN and nothing else, and every statement is the standard
    read-only assertion, so this costs one round trip and mutates nothing.
    """
    if context.script is None or context.psql is None or not context.libpq_env:
        raise ProbeError("no database seam is bound in this scope")
    records = frozen_command_surface(context)
    needed: list[tuple[dict, str, list[str]]] = []
    for record in records:
        for name, found in record["consumers"].items():
            clients = found.get("libpq")
            if clients:
                needed.append((record, name, clients))
    if not needed:
        return verdict(
            "G3",
            FAIL,
            "no frozen command was found to reach a libpq client; an empty consumer set is not "
            "evidence, it means the derivation stopped working",
        )

    body = read_only("SELECT 1")
    unrepaired: list[str] = []
    repaired_failures: list[str] = []
    frozen_failures: list[str] = []
    proven: list[str] = []
    temporary: list[pathlib.Path] = []
    try:
        for record, name, clients in needed:
            state, repair, source = _repair_state(record, name)
            if state == "drift":
                unrepaired.append(f"{record['id']}: {source}")
                continue
            if state == "none" and name not in HOME_EXEMPTIONS:
                unrepaired.append(
                    f"{record['id']}: {name} invokes "
                    + "/".join(clients)
                    + f" under HOME {record['home']} with no repair"
                )
                continue
            argv = [context.psql, "-X", "--no-psqlrc", "--no-password", "-tAq", "-v", "ON_ERROR_STOP=1"]
            frozen_env = {**record["env"], **context.libpq_env}
            frozen = _run_env(context, argv, frozen_env, body)
            if frozen.returncode != 0:
                frozen_failures.append(f"{record['id']} ({name})")
            repaired_env, how = _repaired_env(context, record, source, repair)
            if repaired_env["HOME"] != record["env"].get("HOME"):
                temporary.append(pathlib.Path(repaired_env["HOME"]))
            fixed = _run_env(context, argv, {**repaired_env, **context.libpq_env}, body)
            if fixed.returncode != 0 or fixed.stdout.strip() != "1":
                repaired_failures.append(
                    f"{record['id']} under {how}: "
                    + " ".join((fixed.stderr or fixed.stdout).split())[:160]
                )
            else:
                proven.append(f"{record['id']} ({name})")
    finally:
        for path in temporary:
            if path.name.startswith("mc2-q12-frozen-home-"):
                shutil.rmtree(path, ignore_errors=True)

    if unrepaired:
        return verdict("G3", FAIL, "; ".join(sorted(set(unrepaired))))
    if repaired_failures:
        return verdict(
            "G3",
            FAIL,
            "libpq cannot reach the pooled DSN even under the repair the consumer establishes: "
            + name_list(repaired_failures),
        )
    return verdict(
        "G3",
        PASS,
        f"{len(proven)} libpq-using frozen command(s) connect read-only through the pooled DSN "
        f"under the repair their own consumer establishes ({name_list(sorted(set(proven)))}); "
        f"under the frozen env verbatim {len(frozen_failures)} of them cannot",
    )


def probe_g4(context: Context) -> "dict[str, object]":
    """No frozen command hands a `/proc/self/fd/N` path to a re-exec'ing child.

    Attempt #15's second cause: `backup-supabase.sh` passed `/proc/self/fd/$CA_FD` as an ARGUMENT to
    the manifest generator, whose pnpm -> node -> tsx chain does not carry the parent's descriptor
    table, so the path stopped existing — after the writers were stopped and both dumps had already
    succeeded. `/proc/self` is per-process: the same text names a different thing in every process
    that reads it, which is why an EACCES-style failure never appears and the file is simply absent.

    Both halves are measured: the property itself, against a real child, and every deployed chain
    member for a surviving dependence on it.
    """
    records = frozen_command_surface(context)

    # The property, measured rather than asserted: a descriptor this process holds, named as a
    # /proc/self/fd path, does not resolve in a child that does not inherit it.
    handle, temporary_path = tempfile.mkstemp(prefix="mc2-q12-fd-probe-")
    try:
        os.write(handle, b"q12")
        fd_path = f"/proc/self/fd/{handle}"
        if not pathlib.Path(fd_path).exists():
            raise ProbeError("the fd path does not resolve in the probe's own process")
        child = subprocess.run(
            ["/usr/bin/test", "-e", fd_path], capture_output=True, text=True, check=False
        )
        survives = child.returncode == 0
    finally:
        os.close(handle)
        pathlib.Path(temporary_path).unlink(missing_ok=True)
    if survives:
        return verdict(
            "G4",
            FAIL,
            f"a /proc/self/fd path resolved in a child that does not hold the descriptor; the "
            "measurement this probe depends on is not measuring what it claims",
        )

    offenders: list[str] = []
    scanned = 0
    for record in records:
        others = {pathlib.Path(other).name for other in record["chain"]}
        for name, text in record["chain"].items():
            scanned += 1
            lines = _logical_lines(text)
            # `"$TSX_SHIM" "$MANIFEST_GENERATOR" …` names neither `tsx` nor the child in the line
            # that spawns them, which is exactly how the 2026-07-29 call site read as innocent. The
            # variables are resolved from their own assignments first.
            respawning: set[str] = set()
            for line in lines:
                match = ASSIGNMENT_RE.match(line)
                if match is None:
                    continue
                value = match.group(2)
                if RESPAWNING_CONSUMER_RE.search(value) or any(
                    child in value for child in others if child != pathlib.Path(name).name
                ):
                    respawning.add(match.group(1))
            for line in lines:
                found = FD_PATH_RE.search(line)
                if found is None or line.lstrip().startswith("#"):
                    continue
                consumers = sorted(set(RESPAWNING_CONSUMER_RE.findall(line))) + sorted(
                    f"${variable}"
                    for variable in respawning
                    if re.search(r"\$\{?" + re.escape(variable) + r"\}?(?![A-Za-z0-9_])", line)
                )
                if consumers:
                    offenders.append(
                        f"{record['id']}: {name} hands "
                        + found.group(0)
                        + " to "
                        + "/".join(consumers)
                    )
    if offenders:
        return verdict(
            "G4",
            FAIL,
            f"{len(offenders)} argv path(s) that do not survive a re-exec'ing child: "
            + name_list(sorted(set(offenders))),
        )
    return verdict(
        "G4",
        PASS,
        "a /proc/self/fd path is measured NOT to resolve in a child that does not hold the "
        f"descriptor, and none of the {scanned} deployed chain member(s) behind the "
        f"{len(records)} frozen commands hands one to a re-exec'ing child (pnpm/npm/npx/tsx/node/"
        "docker). BOUND: the scan is per line, so a path assembled across two lines is out of reach",
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
    {"id": "G1", "group": "G", "scope": HOST_SCOPE, "run": probe_g1},
    {"id": "G2", "group": "G", "scope": HOST_SCOPE, "run": probe_g2},
    {"id": "G3", "group": "G", "scope": DATABASE_SCOPE, "run": probe_g3},
    {"id": "G4", "group": "G", "scope": HOST_SCOPE, "run": probe_g4},
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

    def run_env(
        argv: "list[str]", env: "dict[str, str]", stdin_text: "str | None" = None
    ) -> ScriptResult:
        """Group G's seam: EXACTLY the given environment, nothing inherited. Inheriting here would
        reintroduce the substitution the whole group exists to catch — the probe's own usable HOME
        standing in for the frozen one."""
        completed = subprocess.run(
            argv,
            env=env,
            capture_output=True,
            text=True,
            check=False,
            **({"input": stdin_text} if stdin_text is not None else {"stdin": subprocess.DEVNULL}),
        )
        return ScriptResult(completed.returncode, completed.stdout, completed.stderr)

    return HostAdapter(
        deploy_root=deploy_root,
        run=run,
        processes=processes,
        disk_free_bytes=disk_free,
        backup_root=deploy_root / "backups",
        compose_file=deploy_root / "docker-compose.infra.yml",
        env_file=deploy_root / ".env.production",
        run_env=run_env,
    )
