#!/usr/bin/python3
"""Q12 plan §3 allowlisted role bootstrap generator (never executes raw pg_dumpall).

Given the read-only SOURCE role projection (roles / membership edges / cluster
role settings) and the ISOLATE's already-present role names, emit the exact SQL
that recreates ONLY the roles present in the source, absent from the isolate, and
on the frozen §3 missing-role allowlist — with the source attributes, membership
edges (replayed under the exact grantor), and cluster role settings, and with no
password for login-capable bootstrap roles. Anything outside the frozen allowlists
(an elevated attribute, a missing role, a role setting) is a hard stop before any
restore, so a real Supabase source that references app roles absent from the pinned
image no longer aborts the isolated pg_restore. Semantics mirror the reviewed
deploy/postgres/generate-role-bootstrap.ts; the allowlists are frozen in code.
"""

from __future__ import annotations

import json
import re
import sys

MISSING_ROLE_ALLOWLIST = frozenset(
    {
        "admin",
        "instructor",
        "pgtle_admin",
        "student",
        "supabase_functions_admin",
        "supabase_privileged_role",
        "supabase_realtime_admin",
        "superadmin",
    }
)

ROLE_PRIVILEGE_ALLOWLIST: dict[str, frozenset[str]] = {
    "rolbypassrls": frozenset(
        {"postgres", "service_role", "supabase_admin", "supabase_etl_admin", "supabase_read_only_user"}
    ),
    "rolcanlogin": frozenset(
        {
            "admin",
            "authenticator",
            "dashboard_user",
            "instructor",
            "pgbouncer",
            "pgtle_admin",
            "postgres",
            "student",
            "supabase_admin",
            "supabase_auth_admin",
            "supabase_etl_admin",
            "supabase_functions_admin",
            "supabase_privileged_role",
            "supabase_read_only_user",
            "supabase_realtime_admin",
            "supabase_replication_admin",
            "supabase_storage_admin",
            "superadmin",
        }
    ),
    "rolcreatedb": frozenset({"dashboard_user", "postgres", "supabase_admin"}),
    "rolcreaterole": frozenset(
        {
            "dashboard_user",
            "postgres",
            "supabase_admin",
            "supabase_auth_admin",
            "supabase_functions_admin",
            "supabase_storage_admin",
        }
    ),
    "rolreplication": frozenset(
        {"dashboard_user", "postgres", "supabase_admin", "supabase_etl_admin", "supabase_replication_admin"}
    ),
    "rolsuper": frozenset({"postgres", "supabase_admin"}),
}

ROLE_SETTING_ALLOWLIST: dict[str, frozenset[str]] = {
    "anon": frozenset({"statement_timeout=3s"}),
    "authenticated": frozenset({"statement_timeout=8s"}),
    "authenticator": frozenset(
        {"lock_timeout=8s", "session_preload_libraries=safeupdate", "statement_timeout=8s"}
    ),
    "postgres": frozenset(
        {
            'search_path="$user", public, extensions',
            'search_path="\\$user", public, extensions',
        }
    ),
    "supabase_admin": frozenset(
        {"log_statement=none", 'search_path="$user", public, auth, extensions'}
    ),
    "supabase_auth_admin": frozenset(
        {"idle_in_transaction_session_timeout=60000", "log_statement=none", "search_path=auth"}
    ),
    "supabase_read_only_user": frozenset({"default_transaction_read_only=on"}),
    "supabase_storage_admin": frozenset({"log_statement=none", "search_path=storage"}),
}

ROLE_KEYS = frozenset(
    {
        "name",
        "rolsuper",
        "rolinherit",
        "rolcreaterole",
        "rolcreatedb",
        "rolcanlogin",
        "rolreplication",
        "rolconnlimit",
        "rolvaliduntil",
        "rolbypassrls",
    }
)
BOOL_ATTRIBUTES = (
    "rolsuper",
    "rolinherit",
    "rolcreaterole",
    "rolcreatedb",
    "rolcanlogin",
    "rolreplication",
    "rolbypassrls",
)
NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
SECRET_RE = (
    re.compile(r"postgres(?:ql)?://[^\s/:]+:[^\s@]+@", re.IGNORECASE),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.|sbp_[A-Za-z0-9_-]{16,}"),
    re.compile(r"rolpassword|password_hash|encrypted_password", re.IGNORECASE),
)


class BootstrapError(RuntimeError):
    """Fail-closed rejection before any restore."""


def identifier(name: str) -> str:
    if not (isinstance(name, str) and NAME_RE.fullmatch(name)):
        raise BootstrapError(f"unsafe role identifier: {name!r}")
    return '"' + name.replace('"', '""') + '"'


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _scan_secret(text: str) -> None:
    for pattern in SECRET_RE:
        if pattern.search(text):
            raise BootstrapError("generated bootstrap SQL matched a forbidden secret shape")


def _parse_role(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != ROLE_KEYS:
        raise BootstrapError("source role has an unexpected field set")
    name = value["name"]
    if not (isinstance(name, str) and NAME_RE.fullmatch(name)):
        raise BootstrapError("source role name is invalid")
    for attribute in BOOL_ATTRIBUTES + ("rolinherit",):
        if not isinstance(value[attribute], bool):
            raise BootstrapError(f"source role {name}.{attribute} must be boolean")
    if not isinstance(value["rolconnlimit"], int) or isinstance(value["rolconnlimit"], bool):
        raise BootstrapError(f"source role {name}.rolconnlimit must be an integer")
    if value["rolvaliduntil"] is not None and not isinstance(value["rolvaliduntil"], str):
        raise BootstrapError(f"source role {name}.rolvaliduntil must be a string or null")
    return value


def _validate_privileges(role: dict[str, object]) -> None:
    for attribute, allowlist in ROLE_PRIVILEGE_ALLOWLIST.items():
        if role[attribute] is True and role["name"] not in allowlist:
            raise BootstrapError(
                f"role privilege allowlist rejects {role['name']}.{attribute}"
            )


def _role_sql(role: dict[str, object]) -> str:
    _validate_privileges(role)
    attributes = [
        "SUPERUSER" if role["rolsuper"] else "NOSUPERUSER",
        "INHERIT" if role["rolinherit"] else "NOINHERIT",
        "CREATEROLE" if role["rolcreaterole"] else "NOCREATEROLE",
        "CREATEDB" if role["rolcreatedb"] else "NOCREATEDB",
        "LOGIN" if role["rolcanlogin"] else "NOLOGIN",
        "REPLICATION" if role["rolreplication"] else "NOREPLICATION",
        "BYPASSRLS" if role["rolbypassrls"] else "NOBYPASSRLS",
        f"CONNECTION LIMIT {int(role['rolconnlimit'])}",
    ]
    if role["rolvaliduntil"] is not None:
        attributes.append(f"VALID UNTIL {literal(str(role['rolvaliduntil']))}")
    # Password-free by construction: login-capable bootstrap roles are reachable
    # only inside the isolated loopback container.
    return f"CREATE ROLE {identifier(str(role['name']))} WITH {' '.join(attributes)};"


def generate(request: dict[str, object]) -> str:
    roles = [_parse_role(item) for item in request.get("source_roles", [])]
    source_names = [str(role["name"]) for role in roles]
    if len(set(source_names)) != len(source_names):
        raise BootstrapError("source roles contain duplicates")
    for role in roles:
        _validate_privileges(role)

    isolate_roles = request.get("isolate_roles", [])
    if not isinstance(isolate_roles, list) or any(not isinstance(name, str) for name in isolate_roles):
        raise BootstrapError("isolate_roles must be a list of strings")
    isolate_set = set(isolate_roles)
    source_set = set(source_names)
    for name in isolate_set:
        if name not in source_set:
            raise BootstrapError(f"unexpected isolate role absent from source: {name}")

    available = source_set | isolate_set
    statements = [
        "-- Generated from the read-only source role projection; raw pg_dumpall SQL is never executed.",
        "\\set ON_ERROR_STOP on",
    ]
    for role in sorted(roles, key=lambda item: str(item["name"])):
        name = str(role["name"])
        if name in isolate_set:
            continue
        if name not in MISSING_ROLE_ALLOWLIST:
            raise BootstrapError(f"unexpected missing source role {name}")
        statements.append(_role_sql(role))

    memberships = request.get("source_memberships", [])
    if not isinstance(memberships, list):
        raise BootstrapError("source_memberships must be a list")
    parsed_memberships = []
    for item in memberships:
        if not isinstance(item, dict) or set(item) != {
            "member",
            "role",
            "grantor",
            "admin_option",
            "inherit_option",
            "set_option",
        }:
            raise BootstrapError("membership has an unexpected field set")
        for edge in ("member", "role", "grantor"):
            if not (isinstance(item[edge], str) and NAME_RE.fullmatch(item[edge])):
                raise BootstrapError("membership role identifier is invalid")
        for option in ("admin_option", "inherit_option", "set_option"):
            if not isinstance(item[option], bool):
                raise BootstrapError("membership option must be boolean")
        parsed_memberships.append(item)

    def grantor_phase(edge: dict[str, object]) -> int:
        return 0 if edge["grantor"] == "supabase_admin" else 1

    for edge in sorted(
        parsed_memberships,
        key=lambda item: (grantor_phase(item), json.dumps(item, sort_keys=True)),
    ):
        for participant in (edge["member"], edge["role"], edge["grantor"]):
            if participant not in available:
                raise BootstrapError(f"membership references unavailable role {participant}")
        statements.append(f"SET ROLE {identifier(str(edge['grantor']))};")
        statements.append(
            "GRANT {role} TO {member} WITH ADMIN {admin}, INHERIT {inherit}, SET {set_};".format(
                role=identifier(str(edge["role"])),
                member=identifier(str(edge["member"])),
                admin="TRUE" if edge["admin_option"] else "FALSE",
                inherit="TRUE" if edge["inherit_option"] else "FALSE",
                set_="TRUE" if edge["set_option"] else "FALSE",
            )
        )
        statements.append("RESET ROLE;")

    settings = request.get("source_role_settings", [])
    if not isinstance(settings, list):
        raise BootstrapError("source_role_settings must be a list")
    parsed_settings = []
    for item in settings:
        if not isinstance(item, dict) or set(item) != {"role", "database", "name", "value"}:
            raise BootstrapError("role setting has an unexpected field set")
        parsed_settings.append(item)
    for setting in sorted(parsed_settings, key=lambda item: json.dumps(item, sort_keys=True)):
        role_name = setting["role"]
        permitted = ROLE_SETTING_ALLOWLIST.get(role_name)
        pair = f"{setting['name']}={setting['value']}"
        if permitted is None or pair not in permitted:
            raise BootstrapError(f"role setting is not allowlisted for {role_name}")
        if role_name not in available:
            raise BootstrapError(f"role setting references unavailable role {role_name}")
        if setting["database"] is not None:
            continue
        rendered = (
            str(setting["value"])
            if setting["name"] == "search_path"
            else literal(str(setting["value"]))
        )
        statements.append(
            f"ALTER ROLE {identifier(str(role_name))} SET {identifier(str(setting['name']))} TO {rendered};"
        )

    contents = "\n".join(statements) + "\n"
    _scan_secret(contents)
    return contents


def main() -> int:
    request = json.load(sys.stdin)
    sys.stdout.write(generate(request))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (BootstrapError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"q12 plan role bootstrap rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
