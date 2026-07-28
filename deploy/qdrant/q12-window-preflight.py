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
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import stat as stat_module
import shutil
import subprocess
import sys
import tempfile
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


# --- the tracked deployed-asset manifest ---------------------------------------------------------
#
# Probe H2 compares the DEPLOYED bytes against this manifest. The manifest is tracked in git, so the
# repository is the authority for what should be on the server, and H2 is a byte comparison instead
# of the hand-eyeballing that let the server tree go stale twice.
#
# The asset set is DERIVED, not hand-listed: every /opt/megacampus path named in the frozen command
# manifest's argv, plus the controller chain those commands execute, plus the pre-flight's own two
# files (so a stale probe on the server cannot certify a fresh tree).

CONTROLLER_CHAIN = (
    "deploy/qdrant/q12-live-cutover.sh",
    "deploy/qdrant/q12-lifecycle-core.py",
    "deploy/qdrant/q12-command-manifest.json",
    "deploy/qdrant/q12-structural-catalog.sql",
    "deploy/qdrant/q12-migration-plan-capture.py",
    "deploy/qdrant/q12-migration-plan-roles.py",
    "deploy/qdrant/q12-writer-resume.py",
    "deploy/qdrant/q12-privileged-launch.sh",
    "deploy/qdrant/q12-capability-run.sh",
    "deploy/qdrant/q12-live-smoke.sh",
    "deploy/qdrant/q12-activation-truth-projection.sql",
    "deploy/qdrant/q12-managed-session-inventory.json",
    "deploy/qdrant/q12-managed-session-inventory-schema.json",
    "deploy/qdrant/q12-activation-lock-catalog.test-reference.json",
    "deploy/qdrant/q12-activation-lock-order.test-reference.json",
    "deploy/qdrant/image-lock.json",
    "deploy/postgres/q12-source-manifest.ts",
    "deploy/qdrant/q12-window-preflight.py",
    "deploy/qdrant/q12-preflight-probes.py",
)

# mc2-1by33: only `source.forward` needs root, through the root-owned argv-whitelist launcher, and
# q12-writer-resume.py is what that launcher executes. Both are root-owned on the server; nothing
# else in the tree is.
ROOT_OWNED = ("deploy/qdrant/q12-privileged-launch.sh", "deploy/qdrant/q12-writer-resume.py")
DEPLOY_OWNER = "claude-deploy"
DEPLOY_GROUP = "claude-deploy"

# mc2-lzft4: where a CONSUMER asserts an exact identity of its own, that assertion — not the
# git-executable heuristic below — is what the host must satisfy, so it is what this manifest must
# declare. `source-recovery-run.sh` refuses to run unless `q12-writer-resume.py` is exactly
# root:root 0644 (the mc2-jhqpw hardening: root-owned so the operator account cannot rewrite the
# privileged child, but still readable by the operator that reads it). The heuristic said 0444;
# probe H2 asserted THAT and therefore certified green a host whose mode the wrapper rejects. It
# burned window attempt #10 at C2 — after the barrier had already put production into
# `maintenance_guarded` — and it is the eleventh instance of the environment-substitution class,
# the first carried by a probe. `assertion` is re-checked against the consumer's own bytes at emit
# time so the pair cannot drift apart silently again.
CONSUMER_REQUIRED_IDENTITY: "dict[str, dict[str, str]]" = {
    "deploy/qdrant/q12-writer-resume.py": {
        "owner": "root",
        "group": "root",
        "mode": "0644",
        "asserted_by": "deploy/qdrant/source-recovery-run.sh",
        "assertion": "\"$RESUME_CONTROLLER\") == '0:0:644'",
    },
}


def assert_consumer_identity_assertions(repo_root: pathlib.Path) -> None:
    """Fail closed if a consumer no longer carries the assertion this manifest is pinned to."""
    for relative, required in CONSUMER_REQUIRED_IDENTITY.items():
        consumer = repo_root / required["asserted_by"]
        if not consumer.is_file():
            raise PreflightError(f"identity consumer is missing from the tree: {consumer}")
        if required["assertion"] not in consumer.read_text(encoding="utf-8"):
            raise PreflightError(
                f"{required['asserted_by']} no longer carries the identity assertion "
                f"{required['assertion']!r} that pins {relative} to "
                f"{required['owner']}:{required['group']} {required['mode']}; re-derive "
                "CONSUMER_REQUIRED_IDENTITY from the consumer before emitting a manifest"
            )


def command_manifest_assets(repo_root: pathlib.Path) -> "list[str]":
    manifest = json.loads(
        (repo_root / "deploy/qdrant/q12-command-manifest.json").read_text(encoding="utf-8")
    )
    found: set[str] = set()
    for command in manifest["commands"].values():
        for argument in command["argv"]:
            for token in argument.split(":"):
                if not token.startswith("/opt/megacampus/"):
                    continue
                relative = token[len("/opt/megacampus/") :]
                if (repo_root / relative).is_file():
                    found.add(relative)
    return sorted(found)


def build_asset_manifest(repo_root: pathlib.Path) -> dict:
    tree_sha = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    if not HEX40_RE.fullmatch(tree_sha):
        raise PreflightError("cannot resolve the repository HEAD")
    executable = {
        line.split("\t", 1)[1]
        for line in subprocess.run(
            ["git", "-C", str(repo_root), "ls-files", "-s"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
        if line.startswith("100755 ")
    }
    assert_consumer_identity_assertions(repo_root)
    paths = sorted(set(command_manifest_assets(repo_root)) | set(CONTROLLER_CHAIN))
    unpinned = sorted(set(CONSUMER_REQUIRED_IDENTITY) - set(paths))
    if unpinned:
        raise PreflightError(
            "a consumer-pinned asset is not in the manifest asset set and would therefore go "
            f"unasserted on the host: {', '.join(unpinned)}"
        )
    assets = []
    for relative in paths:
        source = repo_root / relative
        if not source.is_file():
            raise PreflightError(f"asset is missing from the tree: {relative}")
        # Mode and owner are asserted only for the Q12-owned `deploy/` tree, which this task
        # installs and nothing else rewrites. `scripts/**` and the compose file are delivered by
        # CI over scp on every dev/staging deploy, and pinning them read-only would make the next
        # scp fail with EACCES — a hardening that breaks the thing it guards. For those, byte
        # equality is asserted and the file identity is left to CI, stated rather than skipped.
        q12_owned = relative.startswith("deploy/")
        required = CONSUMER_REQUIRED_IDENTITY.get(relative)
        if not q12_owned:
            mode = owner = group = None
        elif required is not None:
            # mc2-lzft4: a consumer's own refusal outranks the heuristic.
            mode, owner, group = required["mode"], required["owner"], required["group"]
        else:
            # Deployed read-only in every case the window owns and nothing else asserts: it never
            # rewrites its own assets. 0555 for anything git marks executable (the barrier is
            # invoked as argv[0] and must stay 0555, not 0444), 0444 otherwise.
            mode = "0555" if relative in executable else "0444"
            owner = "root" if relative in ROOT_OWNED else DEPLOY_OWNER
            group = "root" if relative in ROOT_OWNED else DEPLOY_GROUP
        assets.append(
            {
                "path": relative,
                "mode": mode,
                "owner": owner,
                "group": group,
                "identity_owner": "q12" if q12_owned else "ci-delivered",
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }
        )
    return {
        "schema_version": probes.ASSET_MANIFEST_SCHEMA,
        "generated_from_tree_sha": tree_sha,
        "deploy_root": DEFAULT_DEPLOY_ROOT,
        "derivation": (
            "every /opt/megacampus path named in deploy/qdrant/q12-command-manifest.json argv that "
            "exists in the tree, plus the controller chain those commands execute, plus the "
            "pre-flight's own two files; identity from the consuming script's own refusal where "
            "one exists (mc2-lzft4), else mode 0555 where git marks the file executable, else 0444"
        ),
        "assets": assets,
    }


def asset_manifest_path(repo_root: pathlib.Path) -> pathlib.Path:
    return repo_root / "deploy/qdrant/q12-deployed-asset-manifest.json"


def load_asset_manifest(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def asset_manifest_sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- the gate q12-live-cutover.sh calls -----------------------------------------------------------

DEFAULT_MAX_AGE_MINUTES = 30


def assert_fresh_report(
    report_dir: pathlib.Path, deploy_root: pathlib.Path, max_age_minutes: int
) -> pathlib.Path:
    """Refuse the window unless a GREEN, FRESH report describes the DEPLOYED tree.

    This is what makes the pre-flight load-bearing instead of advisory. Three independent
    conditions, each of which has actually gone wrong:

    * green — every probe `pass`, or `unprovable` with a named evidence pointer;
    * fresh — `captured_at` within the last `max_age_minutes`, because E1 is a snapshot and a
      backend can arrive between the probe and C2 (hard invariant 6);
    * matching — the report's `asset_manifest_sha256` equals the digest of the manifest on this
      host, so a report taken against a different deployed tree cannot certify this one.
    """
    reports = sorted(report_dir.glob("q12-window-preflight-*.json"))
    if not reports:
        raise PreflightError(
            f"no window pre-flight report in {report_dir}; run "
            f"q12-window-preflight.py --scope all --run-root {report_dir} first"
        )
    path = reports[-1]
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("schema_version") != REPORT_SCHEMA_VERSION:
        raise PreflightError(f"pre-flight report has the wrong schema: {path}")
    if report.get("scope") != "all":
        raise PreflightError(
            f"pre-flight report {path} covers scope {report.get('scope')!r}; the window needs "
            "--scope all"
        )
    offender = first_offender(list(report.get("probes") or []))
    if offender is not None:
        raise PreflightError(f"pre-flight report {path} is not green; first offender: {offender}")

    captured = str(report.get("captured_at") or "")
    try:
        stamp = datetime.datetime.strptime(captured, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=datetime.timezone.utc
        )
    except ValueError:
        raise PreflightError(f"pre-flight report {path} carries no usable captured_at") from None
    age = (datetime.datetime.now(datetime.timezone.utc) - stamp).total_seconds() / 60.0
    if age > max_age_minutes or age < -1:
        raise PreflightError(
            f"pre-flight report {path} is {age:.0f} minutes old (limit {max_age_minutes}); re-run "
            "it immediately before the window"
        )

    manifest_file = deploy_root / "deploy/qdrant/q12-deployed-asset-manifest.json"
    if not manifest_file.is_file():
        raise PreflightError(f"no deployed-asset manifest at {manifest_file}")
    expected = asset_manifest_sha256(manifest_file)
    if str(report.get("asset_manifest_sha256")) != expected:
        raise PreflightError(
            f"pre-flight report {path} was taken against a different deployed tree "
            f"(manifest {str(report.get('asset_manifest_sha256'))[:12]}… vs {expected[:12]}…)"
        )
    return path


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
    parser.add_argument(
        "--emit-asset-manifest",
        action="store_true",
        help="regenerate deploy/qdrant/q12-deployed-asset-manifest.json from the repository tree",
    )
    parser.add_argument("--repo-root", default=None)
    parser.add_argument(
        "--assert-fresh-report",
        action="store_true",
        help="the gate q12-live-cutover.sh calls: refuse unless a green, fresh report describes "
        "the deployed tree",
    )
    parser.add_argument("--max-age-minutes", type=int, default=DEFAULT_MAX_AGE_MINUTES)
    return parser


def build_context(arguments, workdir: pathlib.Path, manifest: "dict | None"):
    """Assemble the one Context every probe sees.

    The database seam is bound to the pooled DSN and nothing else; there is no direct-connection
    code path to fall back to, because the contract forbids one.
    """
    deploy_root = pathlib.Path(arguments.deploy_root)
    context = probes.Context(scope=arguments.scope, manifest=manifest)

    if arguments.scope in ("host", "all"):
        host = probes.default_host_adapter(deploy_root)
        host.gh = shutil.which("gh")
        context.host = host

    if arguments.scope in ("database", "all"):
        if not arguments.run_root:
            raise PreflightError("--run-root is required for scope database/all")
        run_root = pathlib.Path(arguments.run_root)
        if not run_root.is_absolute():
            raise PreflightError("--run-root must be absolute")
        catalog_path = run_root / "expected-post-migration-catalog.json"
        if not catalog_path.is_file():
            raise PreflightError(f"the run root carries no expected catalog: {catalog_path}")
        context.catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        script, host_name, port = build_pooled_session(
            pathlib.Path(arguments.db_url_file),
            pathlib.Path(arguments.ca_file),
            workdir,
            arguments.psql,
        )
        context.script = script
        # The barrier and the structural catalog are read from the DEPLOYED tree, not the repo:
        # A7's frozen expectation and D1's projection must come from the bytes that will actually
        # run in the window.
        barrier = deploy_root / "deploy/qdrant/q12-database-barrier.sh"
        structural = deploy_root / "deploy/qdrant/q12-structural-catalog.sql"
        if barrier.is_file():
            context.barrier_text = barrier.read_text(encoding="utf-8", errors="replace")
            context.pooler_dependence_sources["q12-database-barrier.sh"] = context.barrier_text
        if structural.is_file():
            context.structural_catalog_sql = structural.read_text(encoding="utf-8").strip()
        return context, f"{host_name}:{port}"
    return context, None


def main(argv: "list[str]") -> int:
    arguments = build_parser().parse_args(argv)
    scope = arguments.scope
    captured_at = utc_now()

    if arguments.emit_asset_manifest:
        repo_root = pathlib.Path(arguments.repo_root) if arguments.repo_root else HERE.parents[1]
        manifest = build_asset_manifest(repo_root)
        target = asset_manifest_path(repo_root)
        target.write_bytes(canonical(manifest))
        sys.stdout.write(f"{target}\n")
        return 0

    if arguments.assert_fresh_report:
        path = assert_fresh_report(
            pathlib.Path(arguments.report_dir or "/tmp"),
            pathlib.Path(arguments.deploy_root),
            arguments.max_age_minutes,
        )
        sys.stderr.write(f"q12 window pre-flight gate: green report {path}\n")
        return 0

    if arguments.self_test is not None:
        verdicts = synthetic_verdicts(arguments.self_test, scope)
        report_dir = pathlib.Path(arguments.report_dir or "/tmp")
        tree_sha, tree_sha_source = resolve_tree_sha(arguments.expected_tree_sha, None)
        path = emit_report(
            verdicts, scope, None, report_dir, tree_sha, tree_sha_source, captured_at
        )
        for item in verdicts:
            sys.stdout.write(f"{item['id']}  {item['verdict']}  {item['detail']}\n")
        sys.stderr.write(f"q12 window pre-flight report: {path}\n")
        offender = first_offender(verdicts)
        if offender is not None:
            sys.stderr.write(f"q12 window pre-flight NOT GREEN; first offender: {offender}\n")
        return exit_code(verdicts)

    # The deployed manifest is the authority when one is installed; a repository checkout falls
    # back to the tracked file next to this script. Both are named in the report, so the operator
    # can see WHICH manifest H2 compared against.
    manifest_file = (
        pathlib.Path(arguments.deploy_root) / "deploy/qdrant/q12-deployed-asset-manifest.json"
    )
    if not manifest_file.is_file():
        manifest_file = HERE / "q12-deployed-asset-manifest.json"
    manifest = load_asset_manifest(manifest_file) if manifest_file.is_file() else None

    workdir = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-preflight-", dir="/tmp"))
    os.chmod(workdir, 0o700)
    try:
        context, endpoint = build_context(arguments, workdir, manifest)
        verdicts = run_probes(context)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    tree_sha, tree_sha_source = resolve_tree_sha(arguments.expected_tree_sha, manifest)
    run_root = pathlib.Path(arguments.run_root) if arguments.run_root else None
    report_dir = pathlib.Path(arguments.report_dir) if arguments.report_dir else (
        run_root if run_root is not None else pathlib.Path("/tmp")
    )
    extra = {
        # What the cutover binds to: H2 proved the deployed bytes match THIS manifest, and the
        # cutover recomputes the same digest from the manifest it is about to run against.
        "asset_manifest_sha256": asset_manifest_sha256(manifest_file)
        if manifest_file.is_file()
        else None,
        "asset_manifest_path": str(manifest_file) if manifest_file.is_file() else None,
        # Named so the report shows WHICH endpoint was measured; it is the pooled host, never the
        # database host, and it carries no credential.
        "database_endpoint": endpoint,
    }
    path = emit_report(
        verdicts, scope, run_root, report_dir, tree_sha, tree_sha_source, captured_at, extra
    )

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
