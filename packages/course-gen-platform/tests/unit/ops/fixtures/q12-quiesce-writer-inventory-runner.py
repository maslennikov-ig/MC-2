#!/usr/bin/python3
"""mc2-1kcbv: drive the REAL C2 child's writer inventory against PRODUCTION'S REAL compose layout.

Window attempt #12 (2026-07-29) got the child past every journal/checkpoint expectation (mc2-awi6q)
and it failed on the next line it had never met in production:

    ResumeError: writer quiesce inventory is not exact   (q12-writer-resume.py:961)

The child swept `docker ps -aq --filter label=com.docker.compose.project=<p>` over
`megacampus-blue`, `megacampus-green` and `megacampus`, and required the result to be EXACTLY the
ten writers. On production the `megacampus` project also carries redis, qdrant, qdrant-dev,
docling-mcp, docling-mcp-internal, notebooklm-bridge and notebooklm-bridge-dev — seventeen
containers, not ten. The classifier a line later would have called redis a `production-worker`.

The fixture that "covered" this had exactly ten containers in the projects, so the sweep and the
selection were indistinguishable. This harness makes them distinguishable: a fake `docker` seeded
with production's REAL project/service composition (read from the host read-only — names and
labels only, never container env), the REAL controller producing the run root, and the REAL child
driven to its `after-inventory` boundary.

Four cases: production as it really is; the pre-fix sweep restored (the RED, reproducing the
production message); a writer removed (must still fail closed); and a new platform service added
(must still pass, so the fix survives the platform growing).

Prints ONE JSON object to stdout; the TypeScript test asserts on it.
"""

from __future__ import annotations

import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO / "deploy/qdrant/q12-lifecycle-core.py"
CHILD_PATH = REPO / "deploy/qdrant/q12-writer-resume.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE_PATH)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)

# Production's REAL compose composition, captured read-only from the host on 2026-07-29
# (`docker ps -a --filter label=com.docker.compose.project=<p>` plus `docker inspect --format` for
# labels, health and restart policy — labels and state only, never container env). The seven
# entries with `writer=False` are the decoys the project-wide sweep swallowed. The per-writer
# healthcheck presence and compose file are the REAL ones: the six workers carry no healthcheck,
# the four api/web writers are healthy, and every writer is `unless-stopped:0`.
# (project, service, writer, healthy, compose file)
PRODUCTION = [
    ("megacampus-blue", "api", True, True, "docker-compose.app.yml"),
    ("megacampus-blue", "web", True, True, "docker-compose.app.yml"),
    ("megacampus", "worker", True, False, "docker-compose.production.yml"),
    ("megacampus", "worker-stage6", True, False, "docker-compose.production.yml"),
    ("megacampus", "worker-stage7", True, False, "docker-compose.infra.yml"),
    ("megacampus", "api-dev", True, True, "docker-compose.dev.yml"),
    ("megacampus", "web-dev", True, True, "docker-compose.dev.yml"),
    ("megacampus", "worker-dev", True, False, "docker-compose.dev.yml"),
    ("megacampus", "worker-stage6-dev", True, False, "docker-compose.dev.yml"),
    ("megacampus", "worker-stage7-dev", True, False, "docker-compose.dev.yml"),
    ("megacampus", "redis", False, True, "docker-compose.infra.yml"),
    ("megacampus", "qdrant", False, True, "docker-compose.infra.yml"),
    ("megacampus", "qdrant-dev", False, True, "docker-compose.infra.yml"),
    ("megacampus", "docling-mcp", False, False, "docker-compose.infra.yml"),
    ("megacampus", "docling-mcp-internal", False, True, "docker-compose.infra.yml"),
    ("megacampus", "notebooklm-bridge", False, True, "docker-compose.infra.yml"),
    ("megacampus", "notebooklm-bridge-dev", False, True, "docker-compose.dev.yml"),
]

FAKE_DOCKER = '''#!/usr/bin/python3
"""A fake `docker` that answers only what the C2 child asks, from a frozen composition table."""
import json, sys

TABLE = json.load(open(__file__ + ".table"))
argv = sys.argv[1:]
if argv[:1] == ["ps"]:
    project = service = None
    for item in argv:
        if item.startswith("label=com.docker.compose.project="):
            project = item.split("=", 2)[2]
        elif item.startswith("label=com.docker.compose.service="):
            service = item.split("=", 2)[2]
    for row in TABLE:
        if row["project"] == project and (service is None or row["service"] == service):
            sys.stdout.write(row["id"] + "\\n")
    raise SystemExit(0)
if argv[:1] == ["inspect"]:
    rows = [row["inspect"] for row in TABLE if row["id"] in argv[1:]]
    sys.stdout.write(json.dumps(rows))
    raise SystemExit(0)
sys.stderr.write("fake docker: unsupported argv %r\\n" % (argv,))
raise SystemExit(2)
'''

# The pre-fix sweep, restored verbatim in a scratch copy so the RED stays visible.
FIXED_SELECTION = """        writer_ids = []
        for project in QUIESCE_PROJECTS:
            for service in QUIESCE_SERVICES:
                writer_ids.extend(
                    value
                    for value in docker(
                        "ps", "-aq", "--no-trunc",
                        "--filter", f"label=com.docker.compose.project={project}",
                        "--filter", f"label=com.docker.compose.service={service}",
                    ).splitlines()
                    if value
                )
"""
LEGACY_SELECTION = """        writer_ids = []
        for project in QUIESCE_PROJECTS:
            writer_ids.extend(
                value for value in docker("ps", "-aq", "--no-trunc", "--filter", f"label=com.docker.compose.project={project}").splitlines()
                if value
            )
"""


def legacy_child(directory: pathlib.Path) -> pathlib.Path:
    source = CHILD_PATH.read_text(encoding="utf-8")
    if source.count(FIXED_SELECTION) != 1:
        raise RuntimeError(
            "the mc2-1kcbv writer selection is no longer present verbatim in q12-writer-resume.py; "
            "re-derive FIXED_SELECTION before trusting this guard"
        )
    path = directory / "q12-writer-resume-legacy.py"
    path.write_text(source.replace(FIXED_SELECTION, LEGACY_SELECTION), encoding="utf-8")
    return path


def composition_table(rows: "list[tuple[str, str, bool, bool, str]]") -> "list[dict]":
    table = []
    for project, service, is_writer, healthy, compose_file in rows:
        identifier = hashlib.sha256(f"{project}/{service}".encode("utf-8")).hexdigest()
        table.append(
            {
                "project": project,
                "service": service,
                "writer": is_writer,
                "id": identifier,
                "inspect": {
                    "Id": identifier,
                    "Name": f"/megacampus-{service}",
                    "Image": f"sha256:{hashlib.sha256(service.encode()).hexdigest()}",
                    "Config": {
                        "Image": f"ghcr.io/megacampus/{service}@sha256:"
                        + hashlib.sha256(service.encode()).hexdigest(),
                        "Labels": {
                            "com.docker.compose.project": project,
                            "com.docker.compose.service": service,
                            "com.docker.compose.project.config_files": f"/opt/megacampus/{compose_file}",
                            "com.docker.compose.project.working_dir": "/opt/megacampus",
                        },
                    },
                    "State": {
                        "Running": True,
                        "Status": "running",
                        **({"Health": {"Status": "healthy"}} if healthy else {}),
                    },
                    "HostConfig": {"RestartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0}},
                },
            }
        )
    return table


def write_fake_docker(directory: pathlib.Path, table: "list[dict]") -> pathlib.Path:
    path = directory / "fake-docker"
    path.write_text(FAKE_DOCKER, encoding="utf-8")
    path.chmod(0o755)
    (directory / "fake-docker.table").write_text(json.dumps(table), encoding="utf-8")
    return path


def publish_child_input(path: pathlib.Path, value: dict, mode: int) -> None:
    data = core.complete_object(value)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(descriptor, data)
        os.fchmod(descriptor, mode)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def drive_case(rows, child=None) -> "dict[str, object]":
    """One full controller->child C2 drive against one compose composition."""
    out: dict[str, object] = {}
    work = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp"))
    os.chmod(work, 0o700)
    aside = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-vqx7t-aside-"))
    lock = work.parent / f"{work.name}.lock"
    try:
        run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"file://{work}"))
        request = {
            "run_id": run_id,
            "run_root": str(work),
            "release_sha": "a" * 40,
            "operator_digest": "b" * 64,
            "resource_manifest_sha256": "0" * 64,
            "quiesce_manifest_sha256": "0" * 64,
            "expected_catalog_sha256": "c" * 64,
        }
        manifest = core.load_manifest()
        docker_bin = write_fake_docker(aside, composition_table(rows))

        opened = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        if opened != 9:
            os.dup2(opened, 9)
            os.close(opened)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)

        class Executor:
            def execute_ordinary(self, command: dict, capability: dict) -> dict:
                environment = dict(manifest["commands"]["writers.quiesce"]["env"])
                completed = subprocess.run(
                    [
                        "/usr/bin/python3",
                        str(child or CHILD_PATH),
                        "quiesce",
                        run_id,
                        str(work),
                        str(docker_bin),
                        str(lock),
                        str(os.getuid()),
                        str(os.getgid()),
                        "0",
                        # The child SIGKILLs itself here, one line after the inventory is
                        # published — so -9 means selection, inspection, classification, the
                        # class counts and the publication all succeeded.
                        "after-inventory",
                        "/usr/bin/curl",
                    ],
                    env=environment,
                    pass_fds=(9,),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                out["child"] = {
                    "returncode": completed.returncode,
                    "reachedInventoryBoundary": completed.returncode == -9,
                    "stderr": completed.stderr.strip()[-400:],
                }
                inventory = work / f"writer-quiesce-inventory-{run_id}.json"
                if inventory.is_file():
                    value = json.loads(inventory.read_bytes())
                    out["inventory"] = {
                        "mode": oct(inventory.stat().st_mode & 0o777),
                        "count": len(value["writers"]),
                        "services": [w["service"] for w in value["writers"]],
                        "classes": sorted(
                            {c: sum(w["class"] == c for w in value["writers"]) for c in
                             {w["class"] for w in value["writers"]}}.items()
                        ),
                    }
                else:
                    out["inventory"] = None
                return {
                    "schema_version": "megacampus.q12.retained-command-result/v1",
                    "command_id": "writers.quiesce",
                    "capability_sha256": core.sha256(core.complete_object(capability)),
                    "result_sha256": core.sha256(b"q12-vqx7t-harness"),
                    "status": "accepted",
                }

        engine = core.Engine(request=request, executor=Executor())
        digests = {
            "operator.self-check": core.sha256(b"capability-operator-self-check"),
            "barrier.install": core.sha256(b"capability-barrier-install"),
        }
        for phase, outcome, command_id in (
            ("preflight", "intent", "operator.self-check"),
            ("preflight", "capability_issued", "operator.self-check"),
            ("preflight", "capability_claimed", "operator.self-check"),
            ("preflight", "completed", "operator.self-check"),
            ("maintenance_guarded", "intent", "barrier.install"),
            ("maintenance_guarded", "capability_issued", "barrier.install"),
            ("maintenance_guarded", "capability_claimed", "barrier.install"),
            ("maintenance_guarded", "completed", "barrier.install"),
        ):
            carried = engine.journal[-1]["capability_manifest_sha256"] if engine.journal else "0" * 64
            engine.append(
                phase, outcome, command_id, core.sha256(command_id.encode()), "cutover",
                carried if outcome == "intent" else digests[command_id],
            )

        publish_child_input(
            work / "quiesce-window-mode.json",
            {
                "schema_version": "megacampus.q12.quiesce-window-mode/v1",
                "run_id": run_id,
                "mode": "cutover",
            },
            0o400,
        )
        publish_child_input(
            work / "database-barrier-receipt.json",
            {
                "schema_version": "megacampus.q12.database-barrier-receipt/v1",
                "run_id": run_id,
                "state": "maintenance_guarded",
                "zero_guard_residue": False,
                "expected_catalog_sha256": request["expected_catalog_sha256"],
                "last_command": "install",
                "rollback_probes_verified": False,
                "probe_receipt_sha256": None,
            },
            0o400,
        )
        secrets = work / "secrets"
        secrets.mkdir(mode=0o700)
        descriptor = os.open(secrets / "db-capability", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
        os.write(descriptor, b"postgresql://harness-not-a-credential/\n")
        os.close(descriptor)

        engine.append_ordinary_lifecycle(
            manifest,
            "writers.quiesce",
            {},
            quiesce_object_sha256=core.sha256(b"writer-quiesce-manifest"),
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(aside, ignore_errors=True)
        try:
            os.unlink(lock)
        except FileNotFoundError:
            pass
    return out


def main() -> int:
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-vqx7t-child-"))
    try:
        out = {
            "production": drive_case(PRODUCTION),
            "legacySweep": drive_case(PRODUCTION, legacy_child(scratch)),
            "missingWriter": drive_case(
                [row for row in PRODUCTION if row[1] != "worker-stage7"]
            ),
            "extraPlatformService": drive_case(
                PRODUCTION + [("megacampus", "clamav-scanner", False, True, "docker-compose.infra.yml")]
            ),
            "decoyCount": sum(1 for row in PRODUCTION if not row[2]),
        }
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    sys.stdout.write(json.dumps(out, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
