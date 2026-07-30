#!/usr/bin/python3
"""mc2-rjy9k — drive the frozen data-movement children against the plan's restored isolate.

WHY.  The pre-flight's group G (`mc2-bh3ef`) catches "this child cannot START in its environment".
It does not catch "this child starts and then fails on its own inputs" — attempt #15's second cause
(`/proc/self/fd` paths that do not survive the generator's spawn chain) is that shape, and so is the
generation's exact-four-files rule.  The only place those surface is a child actually running.

`plan` already restores the production source into a disposable PostgreSQL isolate in docker
(`_drill_flow` -> `_restore_via_drill`), and its persist seam hands back a live handle
(`restore-persist-handle.json`, schema ``megacampus.q12.restore-persist-handle/v1``).  This harness
reuses that isolate as a TARGET and drives the real children against it: no writer is stopped, no
guard is installed, no run-id is burnt, and production is never written.

WHAT IT DRIVES, and what it cannot — stated, never papered over:

* ``pg.restore`` — the reviewed drill.  It is what PRODUCED the bound isolate, so binding a handle is
  itself the evidence that the drill ran to completion under this tree.  Re-running it here would
  restore a second copy for no new information.
* ``migration.base.apply`` / ``migration.observability.apply`` — the REAL frozen argv, byte-identical
  except for the three credential PATHS, under the command's own frozen env.  These two have never
  executed in a window: sixteen attempts have died at or before C4, which is the command right
  before them.  They are the whole point of this harness.
* ``source.forward``, ``reindex.plan``/``reindex.worker.create``/``reindex.execute``/
  ``reindex.verify``, ``deploy.prepare`` — SKIPPED, and the reason is structural rather than
  awkward: each one mounts or verifies ``database-barrier-receipt.json`` and
  ``database-barrier-probe-receipt.json``, which only ``barrier.activate`` mints.  Fabricating a
  receipt to reach them would be the exact substitution this whole stage exists to stop —
  the checked environment standing in for the consuming one.  They stay in-window residuals, with
  the barrier's dual-bind, ``quiesce_client_backends`` and ``probe_closed_inbound``'s real nginx
  502/503 (which needs the api/web writers down).

The isolate is a Supabase PostgreSQL 17.6 restored from the production dump.  A vanilla PostgreSQL
17.10 is NOT a substitute: the document-evidence migration manifest hashes pass on PG15/16 and fail
on vanilla PG17.10, so a locally seeded container would fail for a reason that has nothing to do
with the window.  Without a bound handle every child is reported ``skipped`` with that reason, which
is what the TypeScript suite asserts in CI.

    q12-isolate-dry-run-runner.py [--generation <abs path>] [--persist-handle <abs path>]

``--generation`` is the ordinary path on the host: it drives the reviewed drill in SCHEDULED mode
over an EXISTING backup generation, through the same persist seam the plan uses
(``MC2_Q12_RESTORE_PERSIST_HANDLE``), and tears the isolate down afterwards.  The plan's own
``teardown()`` reclaims its isolate unconditionally, so a completed plan leaves nothing to attach to;
driving the drill directly reuses the machinery without touching the controller, and re-uses a dump
that already exists instead of taking another one from production.  The drill runs under the frozen
``pg.restore`` env — the exact condition attempt #16 died in — so this leg would have caught that
defect for free.

Prints one JSON object to stdout.  Reads no secret into an argument or a log: the isolate password
travels through a mode-0600 libpq URI file, and every child's stderr is scrubbed before it is
reported.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[5]
# The deployed tree is the authority where one exists — on the host that is also the only place the
# `pnpm --filter …` children resolve from, which is why it is the cwd every child is given
# (runbook §2). A repository checkout falls back to itself so the suite runs in CI.
DEPLOY_ROOT = pathlib.Path(os.environ.get("MC2_Q12_DRY_RUN_DEPLOY_ROOT", "/opt/megacampus"))
ROOT = (
    DEPLOY_ROOT
    if (DEPLOY_ROOT / "deploy/qdrant/q12-command-manifest.json").is_file()
    else REPO
)
COMMAND_MANIFEST = ROOT / "deploy/qdrant/q12-command-manifest.json"
CA_FILE = pathlib.Path(
    os.environ.get("MC2_Q12_DRY_RUN_CA_FILE", "/opt/megacampus/secrets/prod-ca-2021.crt")
)

SCHEMA_VERSION = "megacampus.q12.isolate-dry-run/v1"
PERSIST_HANDLE_SCHEMA = "megacampus.q12.restore-persist-handle/v1"

RAN = "ran"
SKIPPED = "skipped"
FAILED = "failed"

# The children this harness drives, and the credential arguments it re-points at the isolate. Every
# other token of the frozen argv — the binary, the filter, the script id, `--allow-remote` and the
# exact `--confirm` sentence — is passed through byte-identical.
DRIVEN = ("migration.base.apply", "migration.observability.apply")
CREDENTIAL_FLAGS = ("--db-url-file", "--ca-file", "--q12-db-capability-file")

# Why each remaining child cannot be reached outside the window. These are structural, not
# scheduling: the receipt they consume is minted by barrier.activate and by nothing else.
RESIDUALS = {
    "pg.backup": (
        "writes a real production dump generation; it ran to completion in window attempt #16 and "
        "re-running it here would dump production for no new information"
    ),
    "source.forward": (
        "requires the external quiesce lease on inherited descriptor 9, the root-owned argv "
        "whitelist through sudo, the uid-1001 operator tree, and database-barrier-receipt.json — "
        "which only barrier.activate mints"
    ),
    "reindex.plan": "mounts the barrier receipt and probe receipt that only barrier.activate mints",
    "reindex.worker.create": (
        "mounts the barrier receipt and probe receipt, and needs the live Qdrant and BullMQ fleet"
    ),
    "reindex.execute": (
        "mounts the barrier receipt and probe receipt, and consumes the accepted coverage "
        "fingerprint a real source.forward run produces"
    ),
    "reindex.verify": (
        "mounts the barrier receipt and probe receipt, and verifies a collection only reindex."
        "execute produces"
    ),
    "deploy.prepare": (
        "drives the real host's blue/green cutover and nginx, and asserts probe_closed_inbound's "
        "502/503 with the api and web writers already stopped"
    ),
}

BARRIER_ONLY = (
    "barrier.install",
    "barrier.verify-after-base",
    "barrier.verify-after-observability",
    "barrier.prepare-recovery",
    "barrier.activate",
    "operator.self-check",
    "writers.quiesce",
    "writers.resume.forward",
    "writers.resume.rollback",
    "deploy.commit",
)

SECRET_RE = re.compile(r"(postgres(?:ql)?://[^\s\"']+|[0-9a-f]{64})")


def scrub(text: str) -> str:
    return SECRET_RE.sub("<redacted>", " ".join(text.split()))[:1200]


def load_handle(path: pathlib.Path) -> dict:
    """The plan's own persist handle, validated the way the controller validates it."""
    handle = json.loads(path.read_text(encoding="utf-8"))
    expected = {
        "schema_version",
        "run_id",
        "container",
        "network",
        "volume",
        "host",
        "port",
        "database",
        "user",
        "password",
    }
    if not isinstance(handle, dict) or set(handle) != expected:
        raise RuntimeError("persist handle shape mismatch")
    if handle["schema_version"] != PERSIST_HANDLE_SCHEMA or handle["host"] != "127.0.0.1":
        raise RuntimeError("persist handle identity mismatch")
    if not isinstance(handle["port"], int) or isinstance(handle["port"], bool):
        raise RuntimeError("persist handle port mismatch")
    return handle


def isolate_credentials(handle: dict, workdir: pathlib.Path) -> "dict[str, str]":
    """A libpq URI file for the isolate, mode 0600, and a capability file beside it.

    The password never reaches argv, an environment VALUE or the report: it goes into an
    owner-checked file exactly the way the production DSN does, which is also what the migration
    child's own `readOwnerCheckedFile` demands.
    """
    url = (
        f"postgresql://{handle['user']}:{handle['password']}@127.0.0.1:{handle['port']}/"
        f"{handle['database']}"
    )
    url_file = workdir / "isolate-db-url"
    descriptor = os.open(url_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(descriptor, (url + "\n").encode("utf-8"))
    finally:
        os.close(descriptor)
    # The guard is NOT installed on the isolate, so `set_config('megacampus.q12_capability', …)`
    # binds a custom GUC nothing validates. The value is therefore a run-local nonce and not a
    # secret; it is still written 0600 because the child refuses a world-readable capability file.
    capability_file = workdir / "isolate-capability"
    descriptor = os.open(
        capability_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        os.write(descriptor, (os.urandom(32).hex() + "\n").encode("utf-8"))
    finally:
        os.close(descriptor)
    return {
        "--db-url-file": str(url_file),
        "--ca-file": str(CA_FILE),
        "--q12-db-capability-file": str(capability_file),
    }


def repoint(argv: "list[str]", credentials: "dict[str, str]") -> "list[str]":
    """Re-point only the three credential PATHS. Everything else stays byte-identical."""
    out = list(argv)
    for index, token in enumerate(out):
        if token in CREDENTIAL_FLAGS and index + 1 < len(out):
            out[index + 1] = credentials[token]
    return out


def drive(command_id: str, command: dict, credentials: "dict[str, str]") -> dict:
    """Run one frozen child under its OWN frozen env, against the isolate."""
    argv = repoint(list(command["argv"]), credentials)
    completed = subprocess.run(
        argv,
        env=dict(command["env"]),
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=1800,
    )
    detail = scrub(completed.stderr or completed.stdout)
    return {
        "id": command_id,
        "outcome": RAN if completed.returncode == 0 else FAILED,
        "status": completed.returncode,
        "detail": detail if completed.returncode != 0 else scrub(completed.stdout)[-400:],
        "env_home": command["env"].get("HOME", ""),
        "argv_tokens_changed": sum(
            1 for before, after in zip(command["argv"], argv) if before != after
        ),
    }


def drill_isolate(generation: pathlib.Path, workdir: pathlib.Path) -> "tuple[dict, dict]":
    """Restore an EXISTING backup generation into a disposable isolate, and hand back the handle.

    Scheduled mode, exactly as the plan drives it: no capability, no q12_guard, no activation
    cleanup — the pre-cutover source has no guard schema, so the Q12 mode could never succeed here.
    The env is the frozen ``pg.restore`` env plus the three seam variables the drill's persist path
    needs, so the drill runs in the same environment the window hands it.
    """
    drill = ROOT / "deploy/postgres/restore-supabase-drill.sh"
    if not drill.is_file():
        raise RuntimeError(f"restore drill is unavailable: {drill}")
    manifest = json.loads(COMMAND_MANIFEST.read_text(encoding="utf-8"))
    frozen = dict(manifest["commands"]["pg.restore"]["env"])
    handle_path = workdir / "restore-persist-handle.json"
    run_id = str(__import__("uuid").uuid4())
    completed = subprocess.run(
        [str(drill), "--scheduled-run-id", run_id, "--generation", str(generation)],
        env={
            **frozen,
            "MC2_Q12_RESTORE_PERSIST_HANDLE": str(handle_path),
            "MC2_Q12_PLAN_DOCKER": os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker"),
            "MC2_Q12_PLAN_REPO_ROOT": str(ROOT),
        },
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=5400,
    )
    child = {
        "id": "pg.restore",
        "outcome": RAN if completed.returncode == 0 else FAILED,
        "status": completed.returncode,
        "env_home": frozen.get("HOME", ""),
        "detail": (
            f"the reviewed drill restored {generation.name} into a disposable isolate under the "
            f"frozen pg.restore env (HOME={frozen.get('HOME', '')}), scheduled mode, no capability "
            "and no guard"
            if completed.returncode == 0
            else scrub(completed.stderr or completed.stdout)
        ),
    }
    if completed.returncode != 0:
        return child, {}
    return child, load_handle(handle_path)


def reclaim(handle: dict) -> dict:
    """Remove the isolate this harness created. Named in the report, never silent."""
    docker = os.environ.get("MC2_Q12_PLAN_DOCKER", "/usr/bin/docker")
    outcome = {}
    for kind, argv in (
        ("container", [docker, "rm", "-f", handle["container"]]),
        ("volume", [docker, "volume", "rm", "--force", handle["volume"]]),
        ("network", [docker, "network", "rm", handle["network"]]),
    ):
        result = subprocess.run(argv, capture_output=True, text=True, check=False)
        outcome[kind] = "removed" if result.returncode == 0 else scrub(result.stderr)[:160]
    return outcome


def report(handle_path: "pathlib.Path | None", generation: "pathlib.Path | None" = None) -> dict:
    manifest = json.loads(COMMAND_MANIFEST.read_text(encoding="utf-8"))
    commands = manifest["commands"]
    children: list[dict] = []
    isolate: dict = {"bound": False}

    if handle_path is None and generation is None:
        reason = (
            "no isolate was bound (--generation or --persist-handle); the isolate is a Supabase "
            "PostgreSQL 17.6 restored from the production dump and a vanilla container is not a "
            "substitute — the document-evidence migration manifest hashes fail on vanilla PG17.10"
        )
        for command_id in ("pg.restore", *DRIVEN):
            children.append({"id": command_id, "outcome": SKIPPED, "detail": reason})
    else:
        workdir = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-isolate-dry-run-"))
        os.chmod(workdir, 0o700)
        owned = False
        handle: dict = {}
        try:
            if generation is not None:
                restore, handle = drill_isolate(generation, workdir)
                children.append(restore)
                owned = bool(handle)
            else:
                handle = load_handle(handle_path)  # type: ignore[arg-type]
                children.append(
                    {
                        "id": "pg.restore",
                        "outcome": RAN,
                        "detail": (
                            "the reviewed drill produced THIS isolate: container "
                            f"{handle['container']} carries {handle['database']} restored from the "
                            f"production generation of plan run {handle['run_id']}"
                        ),
                    }
                )
            if handle:
                isolate = {
                    "bound": True,
                    "run_id": handle["run_id"],
                    "container": handle["container"],
                    "database": handle["database"],
                    "port": handle["port"],
                }
                credentials = isolate_credentials(handle, workdir)
                for command_id in DRIVEN:
                    children.append(drive(command_id, commands[command_id], credentials))
            else:
                for command_id in DRIVEN:
                    children.append(
                        {
                            "id": command_id,
                            "outcome": SKIPPED,
                            "detail": "the restore drill did not produce an isolate, so there was "
                            "nothing to migrate; see the pg.restore detail",
                        }
                    )
        finally:
            if owned and handle:
                isolate["reclaimed"] = reclaim(handle)
            for leftover in sorted(workdir.glob("*")):
                leftover.unlink(missing_ok=True)
            workdir.rmdir()

    for command_id, reason in RESIDUALS.items():
        if any(child["id"] == command_id for child in children):
            continue
        children.append({"id": command_id, "outcome": SKIPPED, "detail": reason})
    for command_id in BARRIER_ONLY:
        children.append(
            {
                "id": command_id,
                "outcome": SKIPPED,
                "detail": "installs, advances or unwinds the window itself; out of scope for a "
                "dry run that stops no writer and installs no guard",
            }
        )

    covered = {child["id"] for child in children}
    return {
        "schema_version": SCHEMA_VERSION,
        "isolate": isolate,
        "children": sorted(children, key=lambda child: str(child["id"])),
        "uncovered_commands": sorted(set(commands) - covered),
        "in_window_residuals": [
            "the database barrier's dual-bind: the guard is installed by barrier.install and "
            "verified on a second connection, which no dry run may do",
            "quiesce_client_backends(): terminates live production backends",
            "probe_closed_inbound(): needs the real nginx to answer 502/503 with the api and web "
            "writers stopped",
        ],
    }


def main(argv: "list[str]") -> int:
    parser = argparse.ArgumentParser(description="Q12 isolate dry run")
    parser.add_argument(
        "--persist-handle",
        default=os.environ.get("MC2_Q12_ISOLATE_HANDLE") or None,
        help="restore-persist-handle.json from a live isolate",
    )
    parser.add_argument(
        "--generation",
        default=os.environ.get("MC2_Q12_ISOLATE_GENERATION") or None,
        help="an existing backup generation to restore into a disposable isolate",
    )
    arguments = parser.parse_args(argv)
    handle_path = pathlib.Path(arguments.persist_handle) if arguments.persist_handle else None
    if handle_path is not None and not handle_path.is_file():
        raise SystemExit(f"persist handle is not a file: {handle_path}")
    generation = pathlib.Path(arguments.generation) if arguments.generation else None
    if generation is not None and not (generation / "database.dump").is_file():
        raise SystemExit(f"generation carries no database.dump: {generation}")
    sys.stdout.write(json.dumps(report(handle_path, generation), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
