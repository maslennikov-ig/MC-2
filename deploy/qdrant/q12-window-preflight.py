#!/usr/bin/python3
"""Q12 read-only window pre-flight (mc2-ot8se).

One probe that asserts EVERY environmental precondition the Q12 live cutover window depends on,
before anything is opened, and that can be re-run as often as wanted at no risk.

Contract: ``docs/superpowers/specs/2026-07-28-q12-window-preflight-contract.md``.

    q12-window-preflight.py --scope {host,database,all}
                            [--run-root <abs path>]         # required for scope database/all
                            [--report-dir <abs path>]       # default: <run-root>, else /tmp
                            [--expected-tree-sha <git sha>] # for host probe H2

It is NOT one of the 20 frozen manifest commands (same standing as the D6 activation-truth probe),
so ``deploy/qdrant/q12-command-manifest.json`` does not move.  It never opens, holds or advances a
window, never touches a capability, consumes no run-id, takes no lock, and writes nothing to the
database.

This file owns the argument surface, the connection seam, report emission and the exit code.  It
holds NO probe SQL — that lives in ``q12-preflight-probes.py``.
"""

from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import os
import pathlib
import re
import stat as stat_module
import subprocess
import sys
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
REPORT_SCHEMA_VERSION = "megacampus.q12.window-preflight/v1"

DEFAULT_DB_URL_FILE = "/opt/megacampus/secrets/supabase_db_url"
DEFAULT_CA_FILE = "/opt/megacampus/secrets/prod-ca-2021.crt"
DEFAULT_DEPLOY_ROOT = "/opt/megacampus"
DEFAULT_PSQL = "/usr/lib/postgresql/17/bin/psql"

HEX40_RE = re.compile(r"[0-9a-f]{40}")


class PreflightError(RuntimeError):
    """Fail-closed pre-flight rejection."""


def _load_probes():
    path = HERE / "q12-preflight-probes.py"
    spec = importlib.util.spec_from_file_location("q12_preflight_probes", path)
    if spec is None or spec.loader is None:
        raise PreflightError(f"cannot load probe module: {path}")
    module = importlib.util.module_from_spec(spec)
    # Registered before exec: dataclasses resolve string annotations through
    # sys.modules[cls.__module__], which is None for an unregistered file-loaded module.
    sys.modules["q12_preflight_probes"] = module
    spec.loader.exec_module(module)
    return module


probes = _load_probes()


# --- report publication ------------------------------------------------------------------------


def canonical(payload: object) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ": ")) + "\n").encode(
        "utf-8"
    )


def immutable_publish(path: pathlib.Path, data: bytes, mode: int) -> None:
    """O_EXCL temp + fsync + rename-noreplace + directory fsync, the same discipline every other
    run-root artifact is published under. A report is never overwritten: a second run in the same
    second would collide rather than silently replace the evidence for an attempt."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = pathlib.Path(f"{path}.publishing")
    descriptor = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    if path.exists():
        temporary.unlink()
        raise PreflightError(f"report already exists: {path}")
    os.rename(temporary, path)
    directory = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    published = os.stat(path)
    if not stat_module.S_ISREG(published.st_mode) or published.st_mode & 0o777 != mode:
        raise PreflightError(f"published report has the wrong identity: {path}")


def emit_report(
    verdicts: "list[dict]",
    scope: str,
    run_root: "pathlib.Path | None",
    report_dir: pathlib.Path,
    tree_sha: str,
    tree_sha_source: str,
    captured_at: str,
    extra: "dict | None" = None,
) -> pathlib.Path:
    summary = {
        "pass": sum(1 for item in verdicts if item["verdict"] == probes.PASS),
        "fail": sum(1 for item in verdicts if item["verdict"] == probes.FAIL),
        "unprovable": sum(1 for item in verdicts if item["verdict"] == probes.UNPROVABLE),
    }
    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "captured_at": captured_at,
        "tree_sha": tree_sha,
        "tree_sha_source": tree_sha_source,
        "scope": scope,
        "run_root": str(run_root) if run_root is not None else None,
        "probes": verdicts,
        "out_of_scope": list(probes.out_of_scope_ids(scope)),
        "summary": summary,
        **(extra or {}),
    }
    stamp = captured_at.replace(":", "").replace("-", "")
    path = report_dir / f"q12-window-preflight-{stamp}.json"
    immutable_publish(path, canonical(report), 0o400)
    return path


def exit_code(verdicts: "list[dict]") -> int:
    """Fail-closed: 0 only when every probe is `pass`, or `unprovable` WITH a named evidence
    pointer. An `unprovable` with no evidence counts as a `fail` — that is the whole reason the
    verdict exists, so the report can never show a green that was not measured."""
    return 0 if first_offender(verdicts) is None else 1


def first_offender(verdicts: "list[dict]") -> "str | None":
    for item in verdicts:
        if item["verdict"] == probes.FAIL:
            return str(item["id"])
        if item["verdict"] == probes.UNPROVABLE and not (item.get("evidence") or "").strip():
            return str(item["id"])
    return None


# --- the pooled connection seam ------------------------------------------------------------------


def _validate_credential_file(path: pathlib.Path, allowed_modes: "set[int]") -> None:
    if not path.is_absolute():
        raise PreflightError(f"credential path must be absolute: {path}")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if not stat_module.S_ISREG(info.st_mode) or (info.st_mode & 0o777) not in allowed_modes:
            raise PreflightError(f"unsafe credential file: {path}")
    finally:
        os.close(descriptor)


def build_pooled_session(
    db_url_file: pathlib.Path, ca_file: pathlib.Path, workdir: pathlib.Path, psql: str
):
    """Bind the probe to the SAME pooled DSN the barrier uses.

    Connecting straight to the database host is forbidden by the contract: bypassing the pooler is
    exactly what hid the `options` defect (mc2-ipwyc) for nine attempts — every
    `-c default_transaction_read_only=…` proof was silently reading the DATABASE default, because
    Supavisor never delivers the startup parameter. A probe that reached around the pooler would
    reproduce that blindness.

    The password never reaches argv or an environment VALUE: it goes into a mode-0600 libpq service
    file, and only PGSERVICEFILE/PGSERVICE are exported.
    """
    _validate_credential_file(db_url_file, {0o400, 0o600})
    _validate_credential_file(ca_file, {0o644})
    raw = db_url_file.read_text(encoding="utf-8").strip()
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.username:
        raise PreflightError("pooled source URI is malformed")
    service_path = workdir / "libpq-service"
    descriptor = os.open(service_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(
            descriptor,
            "\n".join(
                [
                    "[q12preflight]",
                    f"host={parsed.hostname}",
                    f"port={parsed.port or 5432}",
                    f"dbname={parsed.path.lstrip('/') or 'postgres'}",
                    f"user={urllib.parse.unquote(parsed.username)}",
                    f"password={urllib.parse.unquote(parsed.password or '')}",
                    "sslmode=verify-full",
                    f"sslrootcert={ca_file}",
                    "",
                ]
            ).encode("utf-8"),
        )
    finally:
        os.close(descriptor)

    base_env = {
        "PATH": os.environ.get("PATH", "/usr/sbin:/usr/bin:/sbin:/bin"),
        "LC_ALL": "C",
        "LANG": "C",
        "PGSERVICEFILE": str(service_path),
        "PGSERVICE": "q12preflight",
    }

    def script(sql: str, *, options: "str | None" = None, application_name: "str | None" = None):
        env = dict(base_env)
        if options is not None:
            env["PGOPTIONS"] = options
        env["PGAPPNAME"] = application_name or probes.PREFLIGHT_APPLICATION_NAME
        completed = subprocess.run(
            [psql, "-X", "--no-psqlrc", "--no-password", "-tAq", "-v", "ON_ERROR_STOP=1"],
            input=sql,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        return probes.ScriptResult(completed.returncode, completed.stdout, completed.stderr)

    return script, parsed.hostname, parsed.port or 5432


# --- freshness ------------------------------------------------------------------------------------


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def resolve_tree_sha(explicit: "str | None", manifest: "dict | None") -> "tuple[str, str]":
    """The report carries the sha of the tree it ran from. On the server there is no git checkout,
    so the deployed tree's provenance is the asset manifest's own recorded sha — stated as such
    rather than silently substituted."""
    if explicit is not None:
        if not HEX40_RE.fullmatch(explicit):
            raise PreflightError("--expected-tree-sha must be a lower-case 40-hex commit")
        return explicit, "argument"
    completed = subprocess.run(
        ["git", "-C", str(HERE), "rev-parse", "HEAD"], capture_output=True, text=True, check=False
    )
    candidate = completed.stdout.strip()
    if completed.returncode == 0 and HEX40_RE.fullmatch(candidate):
        return candidate, "git"
    if manifest and HEX40_RE.fullmatch(str(manifest.get("generated_from_tree_sha", ""))):
        return str(manifest["generated_from_tree_sha"]), "asset-manifest"
    raise PreflightError(
        "cannot establish the tree sha: no git work tree and no asset manifest provenance"
    )


# --- self-test ------------------------------------------------------------------------------------

SELF_TEST_CASES = ("all-pass", "one-fail", "unprovable-no-evidence", "unprovable-with-evidence")


def synthetic_verdicts(case: str, scope: str) -> "list[dict]":
    """Synthetic verdicts exercise the AGGREGATION contract with no database and no host, so the
    exit semantics are proven before any probe author can weaken them."""
    selected = [str(probe["id"]) for probe in probes.probes_for_scope(scope)]
    out: list[dict] = []
    for probe_id in selected:
        if probe_id == "C3" and case == "one-fail":
            out.append(probes.verdict(probe_id, probes.FAIL, "synthetic failure"))
        elif probe_id == "C3" and case == "unprovable-no-evidence":
            out.append(probes.verdict(probe_id, probes.UNPROVABLE, "synthetic", None))
        elif probe_id == "C3" and case == "unprovable-with-evidence":
            out.append(probes.verdict(probe_id, probes.UNPROVABLE, "synthetic", "a named artifact"))
        else:
            out.append(probes.verdict(probe_id, probes.PASS, "synthetic pass"))
    return out


# --- entry point ------------------------------------------------------------------------------------


def run_probes(context) -> "list[dict]":
    results: list[dict] = []
    for probe in probes.probes_for_scope(context.scope):
        probe_id = str(probe["id"])
        try:
            result = probe["run"](context)
        except NotImplementedError:
            results.append(probes.verdict(probe_id, probes.FAIL, "probe is not implemented"))
            continue
        except Exception as error:  # noqa: BLE001 — a probe failure is a verdict, never a crash
            detail = " ".join(str(error).split())[:400]
            results.append(probes.verdict(probe_id, probes.FAIL, f"probe raised: {detail}"))
            continue
        if not isinstance(result, dict) or result.get("id") != probe_id:
            results.append(
                probes.verdict(probe_id, probes.FAIL, "probe returned a malformed verdict")
            )
            continue
        results.append(result)
    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Q12 read-only window pre-flight")
    parser.add_argument("--scope", choices=("host", "database", "all"), default="all")
    parser.add_argument("--run-root", default=None)
    parser.add_argument("--report-dir", default=None)
    parser.add_argument("--expected-tree-sha", default=None)
    parser.add_argument("--deploy-root", default=DEFAULT_DEPLOY_ROOT)
    parser.add_argument("--db-url-file", default=DEFAULT_DB_URL_FILE)
    parser.add_argument("--ca-file", default=DEFAULT_CA_FILE)
    parser.add_argument("--psql", default=os.environ.get("MC2_Q12_PLAN_PSQL", DEFAULT_PSQL))
    parser.add_argument("--self-test", choices=SELF_TEST_CASES, default=None)
    return parser


def main(argv: "list[str]") -> int:
    arguments = build_parser().parse_args(argv)
    scope = arguments.scope
    captured_at = utc_now()

    if arguments.self_test is not None:
        verdicts = synthetic_verdicts(arguments.self_test, scope)
        report_dir = pathlib.Path(arguments.report_dir or "/tmp")
        tree_sha, tree_sha_source = resolve_tree_sha(arguments.expected_tree_sha, None)
        path = emit_report(
            verdicts, scope, None, report_dir, tree_sha, tree_sha_source, captured_at
        )
    else:
        raise PreflightError("only --self-test is wired up in this build")

    for item in verdicts:
        sys.stdout.write(f"{item['id']}  {item['verdict']}  {item['detail']}\n")
    sys.stderr.write(f"q12 window pre-flight report: {path}\n")
    offender = first_offender(verdicts)
    if offender is not None:
        sys.stderr.write(f"q12 window pre-flight NOT GREEN; first offender: {offender}\n")
    return exit_code(verdicts)


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (PreflightError, probes.ProbeError, OSError, ValueError) as error:
        print(f"q12 window pre-flight rejected: {error}", file=sys.stderr)
        raise SystemExit(2) from None
