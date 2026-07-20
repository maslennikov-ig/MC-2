#!/usr/bin/env python3
"""R8-B-2-iv-1: the FULL-WINDOW real ``run_live`` probe with the ratified DUAL-BIND fusion.

``run_live`` drives the COMPLETE forward cutover window against ONE disposable
``postgres:17.10-bookworm`` loopback container, in ONE process, through the SAME Engine /
serializer / capability / checkpoint primitives as the closed composer:

  * ordinary lifecycles run through the real-child ``execute_ordinary`` seam;
  * the five in-process barrier legs (install -> verify-after-base -> verify-after-observability
    -> prepare-recovery -> activate) run the FROZEN ``q12-database-barrier.sh`` FOR REAL against
    the container, through an executor-owned ``--real-claim`` subprocess that runs
    ``CORE.run_claim(args, RealClaimExecutor)`` inside a bwrap sandbox;
  * ``migration.base.apply`` / ``migration.observability.apply`` REALLY apply their migrations to
    the container (a real ``CREATE TABLE`` + a real ``q12_guard.extend_guard`` under the stored
    capability, the production packet's guard-publication step) between the barrier legs;
  * post-activate, the journaled 5-row ``guard_cleanup_complete``/``barrier.cleanup`` segment runs
    the REAL frozen barrier ``cleanup`` child + the REAL R8-B-1 ``ProductionExecutor`` seam
    (v1 archive -> exact 10-key v2 -> controller-owned db-capability deletion);
  * a receipt-validating forward-resume stub (the real writers.resume stays server-side fail-closed).

DUAL-BIND (ratified found-defect #15 supersession): inside the claim bwrap the SINGLE physical
controller run-root dir is bound to BOTH ``/opt/megacampus/backups/q12/<run-id>`` (the ``run_claim``
custody root; the ``/opt`` manifest argv is kept VERBATIM) AND
``<trust-root>/backups/q12/<run-id>`` (the barrier's protected test-mode trust root). The barrier's
test mode is CA-ONLY (a self-signed proxy cert; the barrier ``:1921`` CA pin is relaxed only because
we do not hold the prod CA key) -- NEVER a DB-command relaxation. ``RealClaimExecutor`` rewrites ONLY
the barrier child's OWN argv to the ``/tmp`` trust view; the journal rows / ``command_sha256`` still
bind the ``/opt`` manifest argv.

Network: each barrier claim runs through bwrap WITH ``--unshare-net`` -- bwrap auto-brings the
private loopback UP while keeping uid 1000 (verified), so ``run_claim``'s uid-1000 checks pass AND
127.0.0.1:5432 is ISOLATED from the host (which may already bind 5432). The
``q12-pooler-identity-proxy`` runs INSIDE that private netns and bridges to the disposable container
purely through the docker-exec unix socket (no host route), via a namespace-local ``/etc/hosts``
override for the frozen pooler hostname. This preserves the ratified design's intent (real barrier
legs vs the disposable container, uid-1000, no prod, the DUAL-BIND) with an isolated transport; the
blueprint's literal host-side 127.0.0.1:5432 is unexecutable where the host already binds 5432.

Prints ONE JSON result object to stdout. Reuses (imports, does NOT fork) the R4 harness
(``q12-live-real-barrier-cutover-runner.py``) for the container seed / identity / self-signed cert /
canonical helpers and the retained-barrier runner for the production core + the composer executor.
"""
from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import shutil
import stat as stat_module
import subprocess
import sys
import tempfile
import time

FIXTURES = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path(__file__).resolve().parents[6]
R4_RUNNER = FIXTURES / "q12-live-real-barrier-cutover-runner.py"
RB_RUNNER = FIXTURES / "q12-retained-barrier-runner.py"
PROXY = FIXTURES / "q12-pooler-identity-proxy.py"
BARRIER = REPO / "deploy/qdrant/q12-database-barrier.sh"
STRUCTURAL_CATALOG = REPO / "deploy/qdrant/q12-structural-catalog.sql"


def _load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


r4c = _load("q12_r4c_runner", R4_RUNNER)
rb = _load("q12_retained_barrier_runner", RB_RUNNER)
CORE = rb.CORE

canonical = r4c.canonical
sha256_hex = r4c.sha256_hex
SEED_SQL = r4c.SEED_SQL
PUBLIC_COUNT = r4c.PUBLIC_COUNT
AUTH_COUNT = r4c.AUTH_COUNT
STORAGE_NAMES = r4c.STORAGE_NAMES
CRON_COUNT = r4c.CRON_COUNT
PW = r4c.PW
POOLER_HOST = r4c.POOLER_HOST
POOLER_USER = r4c.POOLER_USER
RUN_ID = r4c.RUN_ID
IMAGE = r4c.IMAGE
DOCKER = r4c.DOCKER

# The capability the install barrier stores and the migrations replay.
CAPABILITY = "q12-r8b2iv1-full-window-capability-sentinel"

BASE_MIGRATION = "20260711140000"
OBS_MIGRATION = "20260711151000"
BASE_DDL = "CREATE TABLE public.document_evidence_runs (id bigint PRIMARY KEY);"
OBS_DDL = "CREATE TABLE public.document_evidence_observability_totals (id bigint PRIMARY KEY);"
BASE_RELATIONS = [
    {"schema": "public", "name": "document_evidence_runs", "relkind": "r",
     "parent_schema": None, "parent_name": None, "owner": "postgres"}
]
OBS_RELATIONS = [
    {"schema": "public", "name": "document_evidence_observability_totals", "relkind": "r",
     "parent_schema": None, "parent_name": None, "owner": "postgres"}
]
BASE_FILE_SHA = sha256_hex(BASE_DDL.encode("utf-8"))
OBS_FILE_SHA = sha256_hex(OBS_DDL.encode("utf-8"))
MIGRATIONS = {
    "migration.base.apply": (BASE_MIGRATION, BASE_DDL, BASE_RELATIONS, BASE_FILE_SHA),
    "migration.observability.apply": (OBS_MIGRATION, OBS_DDL, OBS_RELATIONS, OBS_FILE_SHA),
}


# ============================================================================================ #
# --real-claim: the inner claim transaction (runs INSIDE the bwrap sandbox launch_claim spawns). #
# ============================================================================================ #
def _rewrite_opt_to_trust(argv: list[str], trust_root: str) -> list[str]:
    """Rewrite ONLY the barrier child's file args from the ``/opt`` custody view to the ``/tmp``
    trust-root view. argv[0] (the barrier script itself) is kept as the ``/opt`` bind of the real
    frozen barrier; the manifest argv stays byte-verbatim in the journal / command_sha256."""
    rewritten = list(argv)
    for index in range(1, len(rewritten)):
        value = rewritten[index]
        if value.startswith("/opt/megacampus/") and index != 0:
            rewritten[index] = trust_root + value[len("/opt/megacampus"):]
    return rewritten


def _rewrite_run_root_to_trust(argv: list[str], run_root: str, trust_view: str) -> list[str]:
    """Rewrite the DIRECT (not-through-``run_claim``) cleanup child's controller-run_root file args
    (``--q12-db-capability-file``, ``--expected-post-migration-catalog``) from the controller's
    physical ``/tmp/mc2-q12-d5-root-*`` view to the barrier's ``/tmp`` trust view
    (``$trust_boundary/backups/q12/<run-id>``). ``ProductionExecutor.prepare_barrier_cleanup`` builds
    that argv from ``context["run_root"]`` -- in ``run_live`` the controller run root; the forward
    legs never needed this because ``run_claim``'s argv is the ``/opt`` custody manifest (handled by
    ``_rewrite_opt_to_trust``). In PRODUCTION ``context["run_root"] == /opt/...`` so the barrier's
    non-test-mode check accepts the argv as-is; this rewrite is test-harness-only and touches ONLY the
    barrier child's own argv, mirroring the forward-leg dual-bind (the journaled cleanup
    ``command_sha256`` keeps the controller-run_root argv verbatim -- and is dropped from cleanup
    parity under ``withConvergenceExclusions``). argv[0] (the real ``/opt`` barrier bind) is untouched.
    The trust view and the controller run root are the SAME physical dir (dual-bound at
    ``_bwrap_prefix`` :294/:301), so the child reads the same bytes the harness wrote."""
    rewritten = list(argv)
    for index in range(1, len(rewritten)):
        value = rewritten[index]
        if value == run_root or value.startswith(run_root + "/"):
            rewritten[index] = trust_view + value[len(run_root):]
    return rewritten


def _barrier_test_env(trust_root: str, project_dir: str, node_bin: str) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/sbin:/usr/bin:/sbin:/bin"),
        "HOME": os.environ.get("HOME", "/root"),
        "LC_ALL": "C", "LANG": "C",
        # /tmp is read-only inside the bwrap sandbox (--ro-bind / /); the barrier's bash here-docs,
        # mktemp, and the node runner all need a writable TMPDIR -- the /opt tmpfs root serves it.
        "TMPDIR": "/opt",
        "MC2_Q12_BARRIER_TEST_MODE": "mc2-synthetic-q12-database-barrier-test-only",
        "MC2_Q12_BARRIER_TEST_ROOT": trust_root,
        "MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY": project_dir,
        "MC2_Q12_BARRIER_TEST_NODE": node_bin,
    }


def run_barrier_with_proxy(barrier_argv: list[str], barrier_env: dict[str, str]) -> subprocess.CompletedProcess:
    """Start the pooler-identity proxy INSIDE the current (private, isolated) bwrap netns, wait for
    it to bind 127.0.0.1:5432, run the real frozen barrier (which connects to the pooler host ->
    127.0.0.1 via the namespace /etc/hosts), then tear the proxy down. The proxy bridges to the
    disposable container purely through the docker-exec unix socket (no host network route)."""
    ready_file = f"/opt/.proxy-ready-{os.getpid()}"
    proxy = subprocess.Popen(
        ["/usr/bin/python3", os.environ["MC2_Q12_FW_PROXY"],
         "--cert", os.environ["MC2_Q12_FW_CERT"], "--key", os.environ["MC2_Q12_FW_KEY"],
         "--container", os.environ["MC2_Q12_FW_CONTAINER"], "--ready-file", ready_file],
    )
    try:
        for _ in range(200):
            if os.path.exists(ready_file):
                break
            time.sleep(0.05)
        return subprocess.run(
            ["bash", *barrier_argv], check=False, close_fds=True, env=barrier_env,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    finally:
        proxy.terminate()
        try:
            proxy.wait(timeout=10)
        except Exception:  # noqa: BLE001
            proxy.kill()


class RealClaimExecutor:
    """The ``run_claim`` executor for a single barrier leg. ``execute()`` publishes the per-leg
    input checkpoint (install) by copying the controller's phase-checkpoint (rebinding device/inode),
    THEN runs the real frozen barrier against the container through the pooler-identity proxy."""

    def __init__(self, trust_root: str, node_bin: str, project_dir: str) -> None:
        self.trust_root = trust_root
        self.node_bin = node_bin
        self.project_dir = project_dir
        self.diagnostics: dict[str, object] = {}
        # R8-B-2-iv-2 (composed-recovery probe): when set, raise AT the capability_claimed row of the
        # delegated claim (after it is durably journalled, before the real barrier runs), mirroring the
        # fixture's frontier_claim_fault="claim-row" seam. Default False => iv-PART-1 behaviour intact.
        self.crash_at_claim = False

    def after_journal_fsync(self, entry: dict) -> None:
        if self.crash_at_claim and entry.get("outcome") == "capability_claimed":
            raise CORE.LifecycleError("injected stop at claim-row")

    def execute(self, command: dict, capability: dict) -> dict:
        argv = command["argv"]
        subcommand = argv[1]
        capability_arg = argv[argv.index("--q12-db-capability-file") + 1]
        run_root_opt = pathlib.Path(capability_arg).parents[1]  # /opt/megacampus/backups/q12/<id>
        run_id = capability["run_id"]
        run_root_trust = pathlib.Path(self.trust_root) / "backups" / "q12" / run_id

        journal_opt = run_root_opt / "phase.jsonl"
        journal_trust = run_root_trust / "phase.jsonl"
        opt_stat = os.stat(journal_opt)
        trust_stat = os.stat(journal_trust)
        # #15 (i): ONE physical dir, TWO views -- the custody and barrier act on the SAME inode.
        self.diagnostics["dual_bind_same_inode"] = (
            (opt_stat.st_dev, opt_stat.st_ino) == (trust_stat.st_dev, trust_stat.st_ino)
        )

        if subcommand == "install":
            # The install child validates a per-leg input checkpoint whose journal_entry_hash is the
            # capability_claimed head run_claim just appended (q12-database-barrier.sh:420-441).
            # Publish it by copying the controller phase-checkpoint (authored by Engine.append),
            # rebinding ONLY journal_device/journal_inode to the trust-view journal the barrier stats.
            checkpoint = json.loads((run_root_opt / "phase-checkpoint.json").read_bytes())
            checkpoint["journal_device"] = str(trust_stat.st_dev)
            checkpoint["journal_inode"] = str(trust_stat.st_ino)
            input_checkpoint = (
                run_root_trust / "database-barrier-input-checkpoint-install-cutover.json"
            )
            input_checkpoint.write_bytes(CORE.complete_object(checkpoint))
            input_checkpoint.chmod(0o600)
            # #15 (iv): the published checkpoint's inode binding is view-independent.
            self.diagnostics["input_checkpoint_view_independent"] = (
                checkpoint["journal_device"] == str(opt_stat.st_dev)
                and checkpoint["journal_inode"] == str(opt_stat.st_ino)
            )

        rewritten = _rewrite_opt_to_trust(argv, self.trust_root)
        env = _barrier_test_env(self.trust_root, self.project_dir, self.node_bin)
        completed = run_barrier_with_proxy(rewritten, env)
        if completed.returncode != 0:
            raise CORE.LifecycleError(
                f"real barrier {subcommand} failed ({completed.returncode}): "
                f"{completed.stderr.decode('utf-8', 'replace').strip()}"
            )
        return {
            "schema_version": "megacampus.q12.retained-command-result/v1",
            "command_id": capability["command_id"],
            "capability_sha256": CORE.sha256(CORE.complete_object(capability)),
            "result_sha256": CORE.sha256(completed.stdout),
            "status": "accepted",
        }


def handle_real_claim(claim_argv: list[str]) -> int:
    executor = RealClaimExecutor(
        os.environ["MC2_Q12_FW_TRUST_ROOT"],
        os.environ["MC2_Q12_FW_NODE"],
        os.environ["MC2_Q12_FW_PROJECT"],
    )
    arguments = CORE.parser().parse_args(["claim", *claim_argv])
    # R8-B-2-iv-2: a scoped mid-barrier crash. MC2_Q12_FW_CRASH_AT_CLAIM (set by the launcher ONLY for
    # the targeted barrier command) makes run_claim durably journal capability_claimed and then raise
    # BEFORE the real barrier runs; we surface the restartRequired boundary the fixture's --claim-noio
    # path surfaces, so delegate_claim raises and run_live rejects with the head left at
    # barrier.<op>/capability_claimed (the two-process crash boundary). Absent env => normal claim.
    if os.environ.get("MC2_Q12_FW_CRASH_AT_CLAIM") == arguments.command_id:
        executor.crash_at_claim = True
        try:
            output = CORE.run_claim(arguments, executor)
        except CORE.LifecycleError as error:
            if "injected stop at claim-row" not in str(error):
                raise
            output = {
                "claimProcessBoundary": True,
                "launcherOwnedClaimMutation": True,
                "claimProcessPid": os.getpid(),
                "childExecuted": False,
                "boundary": "claim-row",
                "restartRequired": True,
            }
    else:
        output = CORE.run_claim(arguments, executor)
    output["fwDiagnostics"] = executor.diagnostics
    sys.stdout.write(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


def handle_real_cleanup(barrier_argv: list[str]) -> int:
    """Run the real frozen barrier ``cleanup`` (argv already rewritten to the /tmp trust view) with
    the in-namespace pooler proxy. Used by the post-activate cleanup seam (not through run_claim)."""
    env = _barrier_test_env(
        os.environ["MC2_Q12_FW_TRUST_ROOT"],
        os.environ["MC2_Q12_FW_PROJECT"],
        os.environ["MC2_Q12_FW_NODE"],
    )
    completed = run_barrier_with_proxy(barrier_argv, env)
    if completed.stdout:
        sys.stdout.buffer.write(completed.stdout)
    if completed.stderr:
        sys.stderr.buffer.write(completed.stderr)
    return completed.returncode


# ============================================================================================ #
# Outer executor: run_live's launch_claim (bwrap dual-bind), execute_ordinary (real migrations), #
# and the real post-activate cleanup + R8-B-1 seam.                                              #
# ============================================================================================ #
def _bwrap_prefix(context: "FullWindowContext", run_id: str) -> list[str]:
    trust = context.trust_root
    run_root = str(context.run_root)
    prod = f"/opt/megacampus/backups/q12/{run_id}"
    return [
        "/usr/bin/bwrap",
        "--unshare-user", "--unshare-ipc", "--unshare-pid", "--unshare-uts", "--unshare-cgroup",
        # --unshare-net: bwrap auto-brings the private loopback UP (verified), keeping uid 1000
        # (so run_claim's uid-1000 checks pass) while ISOLATING 127.0.0.1:5432 from the host. The
        # pooler-identity proxy runs INSIDE this private netns and bridges to the disposable
        # container purely through the docker-exec unix socket (no host route). This preserves the
        # ratified design's intent -- real barrier legs vs the disposable container, uid-1000, no
        # prod -- and the DUAL-BIND below is unchanged; only the transport plumbing is isolated
        # (the blueprint's literal host-side 127.0.0.1:5432 is unexecutable where the host already
        # binds 5432; the uid/CAP conflict it feared does not arise, bwrap ups lo itself).
        "--unshare-net",
        "--die-with-parent",
        "--ro-bind", "/", "/",
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/opt",
        "--dir", "/opt/megacampus",
        "--dir", "/opt/megacampus/backups",
        "--dir", "/opt/megacampus/backups/q12",
        "--dir", prod,
        "--bind", run_root, prod,                                   # /opt custody view (writable)
        "--bind", str(context.cutover_lock), "/opt/megacampus/backups/q12/cutover.lock",
        "--dir", "/opt/megacampus/deploy", "--dir", "/opt/megacampus/deploy/qdrant",
        "--ro-bind", str(BARRIER), "/opt/megacampus/deploy/qdrant/q12-database-barrier.sh",
        "--ro-bind", str(STRUCTURAL_CATALOG),
        "/opt/megacampus/deploy/qdrant/q12-structural-catalog.sql",
        # DUAL-BIND: the SAME physical run root, writable, at the barrier's trust-root view.
        "--bind", run_root, f"{trust}/backups/q12/{run_id}",
        "--ro-bind", str(context.fakehosts), "/etc/hosts",
    ]


class RealBarrierWrapperExecutor(rb.LiveOrdinaryExecutor):
    """run_live's executor. Barrier claims cross a bwrap ``--real-claim`` subprocess that runs the
    real frozen barrier against the container (dual-bind); ordinary migration lifecycles really apply
    their migrations; the post-activate cleanup runs the real frozen barrier cleanup + R8-B-1 seam."""

    def __init__(self, context: "FullWindowContext") -> None:
        super().__init__()
        self.context = context
        self.root = context.run_root
        self.leg_diagnostics: dict[str, object] = {}
        # R8-B-2-iv-2: when set to a forward operation (e.g. "install"), the delegated claim for that
        # barrier command crashes AT capability_claimed (the two-process composed-recovery boundary).
        self.crash_operation: str | None = None

    # ---- barrier legs: the real --real-claim subprocess through the bwrap dual-bind ----
    def launch_claim(self, argv: list[str], journal_fd: int) -> dict:
        context = self.context
        run_id = argv[argv.index("--run-id") + 1]
        # Rewrite ONLY the --capability path from the controller run-root (/tmp/mc2-q12-d5-root-*)
        # to the /opt custody view the bind exposes, so run_claim's fixed-active-run-path check
        # (q12-lifecycle-core.py:2928-2931) passes. The manifest barrier argv stays verbatim.
        prod = f"/opt/megacampus/backups/q12/{run_id}"
        rewritten = list(argv)
        cap_index = rewritten.index("--capability") + 1
        root_prefix = f"{context.run_root}/"
        cap = rewritten[cap_index]
        if cap.startswith(root_prefix):
            rewritten[cap_index] = f"{prod}/{cap[len(root_prefix):]}"
        sandbox = _bwrap_prefix(context, run_id)
        env = {
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "LC_ALL": "C", "LANG": "C",
            "HOME": os.environ.get("HOME", "/root"),
            "MC2_Q12_FW_TRUST_ROOT": context.trust_root,
            "MC2_Q12_FW_NODE": context.node_bin,
            "MC2_Q12_FW_PROJECT": context.project_dir,
            "MC2_Q12_FW_PROXY": str(PROXY),
            "MC2_Q12_FW_CERT": context.cert_path,
            "MC2_Q12_FW_KEY": context.key_path,
            "MC2_Q12_FW_CONTAINER": context.container,
        }
        command_id = argv[argv.index("--command-id") + 1]
        if self.crash_operation is not None and command_id == CORE.COMMANDS[self.crash_operation]:
            env["MC2_Q12_FW_CRASH_AT_CLAIM"] = command_id
        try:
            saved_fd_8 = os.dup(8)
        except OSError:
            saved_fd_8 = None
        try:
            os.dup2(journal_fd, 8, inheritable=True)
            completed = subprocess.run(
                [*sandbox, "--",
                 "/usr/bin/python3", str(pathlib.Path(__file__).resolve()),
                 "--real-claim", *rewritten],
                check=False, close_fds=True, pass_fds=(8, 9), env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True,
            )
        finally:
            if saved_fd_8 is None:
                os.close(8)
            else:
                os.dup2(saved_fd_8, 8)
                os.close(saved_fd_8)
        if completed.returncode != 0:
            raise CORE.LifecycleError(
                f"real-claim launcher failed ({completed.returncode}): {completed.stderr.strip()}"
            )
        response = json.loads(completed.stdout)
        self.actual_deployed_wrapper = True
        self.claim_process_pid = int(response["claimProcessPid"])
        self.claim_process_boundary = bool(response["claimProcessBoundary"])
        self.launcher_owned_claim_mutation = bool(response["launcherOwnedClaimMutation"])
        self.child_executions += int(bool(response["childExecuted"]))
        self.durable_reloads += 1
        for key, value in response.get("fwDiagnostics", {}).items():
            self.leg_diagnostics[key] = value
        return response

    # ---- ordinary lifecycles: really apply the migrations, otherwise a real-shaped result ----
    def execute_ordinary(self, command: dict, capability: dict) -> dict:
        command_id = capability["command_id"]
        if command_id in MIGRATIONS:
            migration, ddl, relations, file_sha = MIGRATIONS[command_id]
            catalog_sha = self.context.migration_catalog_sha[command_id]
            self.context.apply_migration(migration, ddl, relations, file_sha, catalog_sha)
        return super().execute_ordinary(command, capability)

    # ---- post-activate: real frozen barrier cleanup child + the real R8-B-1 seam ----
    def prepare_barrier_cleanup(self, context: dict) -> dict:
        return CORE.ProductionExecutor().prepare_barrier_cleanup(context)

    def execute_barrier_cleanup(self, context: dict, command: dict) -> dict:
        run_root = pathlib.Path(context["run_root"])
        run_id = context["run_id"]
        # The cleanup predecessor gate (q12-database-barrier.sh:640-645) requires a byte-exact
        # v1-before-cleanup archive of the activate receipt BEFORE the child runs. Create it first.
        receipt_path = run_root / "database-barrier-receipt.json"
        archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
        activate_receipt_bytes = CORE.validate_regular_file(receipt_path, mode=0o400)
        archive_path.write_bytes(activate_receipt_bytes)
        archive_path.chmod(0o400)
        # The cleanup child input checkpoint = the controller phase-checkpoint at the cleanup claimed
        # head, journal_device/journal_inode bound to the run-root journal the barrier stats
        # (view-independent inode) -- q12-database-barrier.sh:582-597.
        journal_stat = os.stat(run_root / "phase.jsonl")
        checkpoint = json.loads((run_root / "phase-checkpoint.json").read_bytes())
        checkpoint["journal_device"] = str(journal_stat.st_dev)
        checkpoint["journal_inode"] = str(journal_stat.st_ino)
        input_checkpoint = run_root / "database-barrier-input-checkpoint-cleanup-cutover.json"
        input_checkpoint.write_bytes(CORE.complete_object(checkpoint))
        input_checkpoint.chmod(0o600)
        # Run the real frozen barrier cleanup in the SAME bwrap dual-bind sandbox as the legs,
        # through --real-cleanup (which starts the in-namespace pooler proxy, runs the barrier, and
        # tears the proxy down). The barrier argv is rewritten to the /tmp trust view.
        trust_view = f"{self.context.trust_root}/backups/q12/{run_id}"
        rewritten = _rewrite_opt_to_trust(command["argv"], self.context.trust_root)
        rewritten = _rewrite_run_root_to_trust(rewritten, str(run_root), trust_view)
        sandbox = _bwrap_prefix(self.context, run_id)
        env = {
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LC_ALL": "C", "LANG": "C",
            "HOME": os.environ.get("HOME", "/root"),
            "MC2_Q12_FW_TRUST_ROOT": self.context.trust_root,
            "MC2_Q12_FW_NODE": self.context.node_bin,
            "MC2_Q12_FW_PROJECT": self.context.project_dir,
            "MC2_Q12_FW_PROXY": str(PROXY),
            "MC2_Q12_FW_CERT": self.context.cert_path,
            "MC2_Q12_FW_KEY": self.context.key_path,
            "MC2_Q12_FW_CONTAINER": self.context.container,
        }
        completed = subprocess.run(
            [*sandbox, "--", "/usr/bin/python3", str(pathlib.Path(__file__).resolve()),
             "--real-cleanup", *rewritten],
            check=False, close_fds=True, env=env,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if completed.returncode != 0:
            raise CORE.LifecycleError(
                f"real barrier cleanup failed ({completed.returncode}): {completed.stderr.strip()}"
            )
        # The REAL R8-B-1 ProductionExecutor seam: consume the barrier's terminal proof + probe,
        # archive v1 (idempotent), promote the exact 10-key v2, delete the db-capability.
        return CORE.ProductionExecutor().execute_barrier_cleanup(context, command)


# ============================================================================================ #
# The outer full-window harness.                                                                 #
# ============================================================================================ #
class FullWindowContext:
    def __init__(self, container: str, trust_root: str, run_root: pathlib.Path,
                 cutover_lock: pathlib.Path, fakehosts: pathlib.Path,
                 node_bin: str, project_dir: str, cert_path: str, key_path: str) -> None:
        self.container = container
        self.trust_root = trust_root
        self.run_root = run_root
        self.cutover_lock = cutover_lock
        self.fakehosts = fakehosts
        self.node_bin = node_bin
        self.project_dir = project_dir
        self.cert_path = cert_path
        self.key_path = key_path
        self.migration_catalog_sha: dict[str, str] = {}

    def dexec(self, sql: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [DOCKER, "exec", "-i", self.container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=sql, text=True, capture_output=True,
        )

    def apply_migration(self, migration, ddl, relations, file_sha, catalog_sha) -> None:
        relations_json = canonical(relations)
        sql = (
            "SET default_transaction_read_only = off;\n"
            f"SET megacampus.q12_capability = '{CAPABILITY}';\n"
            "BEGIN;\n"
            f"{ddl}\n"
            f"SELECT q12_guard.extend_guard('{migration}', "
            f"'{relations_json}'::jsonb, '{file_sha}', '{catalog_sha}');\n"
            "COMMIT;\n"
        )
        result = self.dexec(sql)
        if result.returncode != 0:
            raise RuntimeError(f"migration {migration} failed: {result.stderr.strip()}")


def _dexec_scalar(container: str, sql: str) -> str:
    result = subprocess.run(
        [DOCKER, "exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"scalar query failed: {result.stderr.strip()}")
    return result.stdout.strip()


def _dexec_json(container: str, sql: str):
    wrapped = f"SELECT coalesce(json_agg(row_data), '[]'::json) FROM ({sql}) row_data;"
    result = subprocess.run(
        [DOCKER, "exec", "-i", container, "psql", "-X", "-t", "-A",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        input=wrapped, text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"catalog query failed: {result.stderr.strip()}")
    return json.loads(result.stdout.strip())


def _build_expected_catalog(container: str) -> tuple[dict, str, str, str, str]:
    """Build the REAL expected-post-migration catalog from the seeded+migrated container, exactly
    as the R8-B-2-iii verify-chain runner does (real structural hashes baked in)."""
    structural_query = STRUCTURAL_CATALOG.read_text(encoding="utf-8")

    def structural_after(*ddls: str) -> str:
        body = "BEGIN;\n" + "".join(f"{d}\n" for d in ddls)
        body += f"SELECT structural_sha256 FROM (\n{structural_query}\n) canonical;\n"
        body += "ROLLBACK;\n"
        return _dexec_scalar(container, body)

    baseline = structural_after()
    after_base = structural_after(BASE_DDL)
    after_obs = structural_after(BASE_DDL, OBS_DDL)

    def rows(schema: str):
        return _dexec_json(
            container,
            "SELECT c.relname AS name, c.oid::bigint AS oid, r.rolname AS owner "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_roles r ON r.oid=c.relowner "
            f"WHERE n.nspname='{schema}' AND c.relkind IN ('r','p') ORDER BY c.relname",
        )

    public_rows = rows("public")
    auth_rows = rows("auth")
    storage_rows = rows("storage")
    cron_row = _dexec_json(
        container,
        "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
        "WHERE n.nspname='cron' AND c.relname='job'",
    )[0]
    net_row = _dexec_json(
        container,
        "SELECT c.oid::bigint AS oid, r.rolname AS owner FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner "
        "WHERE n.nspname='net' AND c.relname='http_request_queue'",
    )[0]
    cron_jobs_real = _dexec_json(container, "SELECT jobid, command FROM cron.job ORDER BY jobid")

    def guarded(schema, name, oid, owner):
        return {"schema": schema, "name": name, "oid": oid, "relkind": "r",
                "parent_oid": None, "owner": owner}

    guarded_relations = (
        [guarded("public", r["name"], r["oid"], r["owner"]) for r in public_rows]
        + [guarded("auth", r["name"], r["oid"], r["owner"]) for r in auth_rows]
        + [guarded("storage", r["name"], r["oid"], r["owner"]) for r in storage_rows]
        + [guarded("cron", "job", cron_row["oid"], cron_row["owner"]),
           guarded("net", "http_request_queue", net_row["oid"], net_row["owner"])]
    )
    if len(guarded_relations) != 76:
        raise RuntimeError(f"guarded_relations count drifted: {len(guarded_relations)}")
    cron_jobs_catalog = [
        {"jobid": r["jobid"], "username": "postgres",
         "command_sha256": sha256_hex(r["command"].encode("utf-8"))}
        for r in cron_jobs_real
    ]
    catalog = {
        "schema_version": "megacampus.q12.expected-post-migration-catalog/v1",
        "database": "postgres", "database_owner": "postgres",
        "release_sha": "1" * 40, "migration_frontier": "20260704150249",
        "baseline_structural_sha256": baseline,
        "expected_post_migration_catalog_sha256": after_obs,
        "inventory_counts": {"public": PUBLIC_COUNT, "auth": AUTH_COUNT, "storage": 5,
                             "cron_jobs": CRON_COUNT, "pg_net_queue": 0},
        "guarded_relations": guarded_relations,
        "cron_jobs": cron_jobs_catalog,
        "migrations": {
            BASE_MIGRATION: {"catalog_sha256": after_base, "migration_file_sha256": BASE_FILE_SHA,
                             "relations": BASE_RELATIONS},
            OBS_MIGRATION: {"catalog_sha256": after_obs, "migration_file_sha256": OBS_FILE_SHA,
                            "relations": OBS_RELATIONS},
        },
    }
    seed_counts = {"public": len(public_rows), "auth": len(auth_rows),
                   "storage": len(storage_rows), "cron": CRON_COUNT, "net": 0}
    return catalog, baseline, after_base, after_obs, seed_counts


def _probe_object(run_id: str, expected_catalog_sha256: str) -> dict:
    return {
        "schema_version": "megacampus.q12.database-barrier-probes/v1",
        "run_id": run_id,
        "expected_catalog_sha256": expected_catalog_sha256,
        "completed_at": "2026-07-14T08:00:00.000Z",
        "probes": {
            "postgrest_anon": "rejected", "postgrest_authenticated": "rejected",
            "postgrest_service_role_without_capability": "rejected",
            "postgrest_service_role_with_capability": "rolled_back",
            "postgrest_preference_applied": "tx=rollback",
            "auth_profile": "rejected_zero_residue",
            "storage_object": "rejected_zero_metadata_zero_bytes",
            "cron_rpc": "rejected_exact_jobs_unchanged",
            "pg_net_rpc": "rejected_zero_queue_zero_external_request",
            "direct_supervisor": "rolled_back",
        },
        "residue": {
            "guard_probe_rows": 0, "auth_rows": 0, "storage_metadata_rows": 0,
            "storage_object_bytes": 0, "cron_job_set_unchanged": True,
            "pg_net_queue_rows": 0, "external_requests": 0,
        },
    }


def _write_quiesce_manifest(path: pathlib.Path, run_id: str) -> None:
    def writer(klass, service, index):
        digit = str(index % 10)
        return {
            "class": klass, "id": digit * 64, "name": f"megacampus-{service}",
            "project": "megacampus-blue" if klass in ("production-api", "production-web") else "megacampus",
            "service": service, "config_files": "/opt/megacampus/docker-compose.production.yml",
            "working_dir": "/opt/megacampus", "image_id": f"sha256:{digit * 64}",
            "image_ref": f"ghcr.io/megacampus/{service}@sha256:{digit * 64}",
            "prior_running": True, "prior_status": "running",
            "healthcheck_present": service in ("api", "web"),
            "prior_health_status": "healthy" if service in ("api", "web") else None,
            "prior_restart_policy": {"name": "unless-stopped", "maximum_retry_count": 0},
            "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
        }

    services = ["api", "web", "worker", "worker-stage6", "worker-stage7"]
    kind = lambda s: "api" if s == "api" else "web" if s == "web" else "worker"
    writers = [writer(f"production-{kind(s)}", s, i + 1) for i, s in enumerate(services)]
    writers += [writer(f"development-{kind(s)}", f"{s}-dev", i + 6) for i, s in enumerate(services)]
    value = {
        "schema_version": "megacampus.q12.writer-quiesce/v1", "run_id": run_id, "status": "quiesced",
        "barrier": {"state": "recovery_ready_guarded", "zero_guard_residue": False,
                    "expected_catalog_sha256": "a" * 64, "probe_receipt_sha256": "b" * 64},
        "writers": writers,
    }
    path.write_bytes((canonical(value) + "\n").encode("utf-8"))
    path.chmod(0o400)


def _open_lease(cutover_lock: pathlib.Path):
    import fcntl
    if cutover_lock.exists():
        cutover_lock.chmod(0o600)
    fd = os.open(cutover_lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if fd != 9:
        os.dup2(fd, 9)
        os.close(fd)
        fd = 9
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return os.fstat(fd)


def _drive_composer(root: pathlib.Path, catalog_body: bytes, quiesce_path: pathlib.Path,
                    run_id: str) -> list[dict]:
    """Drive the closed composer (run_joined_composer forward) on its own root with the SAME real
    catalog + quiesce manifest + run id, so its 76-row forward journal is the parity oracle."""
    catalog_file = root / "expected-post-migration-catalog.json"
    catalog_file.write_bytes(catalog_body)
    catalog_file.chmod(0o400)
    cutover_lock = root.parent / "cutover.lock"
    lock_stat = _open_lease(cutover_lock)
    executor = rb.NoIoExecutor()
    executor.root = root
    quiesce_sha = CORE.sha256(quiesce_path.read_bytes())
    request = {
        "run_root": str(root), "run_id": run_id,
        "release_sha": "0123456789abcdef0123456789abcdef01234567",
        "operator_digest": "1" * 64, "resource_manifest_sha256": "2" * 64,
        "quiesce_manifest_sha256": quiesce_sha,
        "expected_catalog_sha256": CORE.sha256(catalog_body),
        "rotation_required": False, "lease_fd": 9,
        "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
        "joined_profile": "forward", "quiesce_manifest_path": str(quiesce_path),
        "chains": None, "completed_prefix_length": None, "frontier": None,
        "partial_capture_target_count": None,
    }
    try:
        CORE.run_joined_composer(request, executor)
    finally:
        os.close(9)
    rows = [json.loads(line) for line in (root / "phase.jsonl").read_text().splitlines()]
    return rows


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--real-claim":
        return handle_real_claim(sys.argv[2:])
    if len(sys.argv) > 1 and sys.argv[1] == "--real-cleanup":
        return handle_real_cleanup(sys.argv[2:])

    cid = f"mc2-q12-fw-src-{os.getpid()}-{int(time.time())}"
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-fw-scratch-", dir="/tmp"))
    trust_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-barrier-", dir="/tmp"))
    trust_root.chmod(0o700)
    run_id = RUN_ID
    d5_roots: list[pathlib.Path] = []
    try:
        subprocess.run(
            [DOCKER, "run", "-d", "--name", cid, "-e", f"POSTGRES_PASSWORD={PW}",
             "-p", "127.0.0.1::5432", IMAGE],
            check=True, capture_output=True,
        )
        for _ in range(300):
            ready = subprocess.run([DOCKER, "exec", cid, "pg_isready", "-U", "postgres"],
                                   capture_output=True)
            logs = subprocess.run([DOCKER, "logs", cid], capture_output=True, text=True).stderr
            if ready.returncode == 0 and "init process complete" in logs:
                break
            time.sleep(0.2)
        seed = subprocess.run(
            [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=SEED_SQL, text=True, capture_output=True,
        )
        if seed.returncode != 0:
            raise RuntimeError(f"seed failed: {seed.stderr.strip()}")
        for guc in ("cron.database_name TO 'postgres'", "cron.launch_active_jobs TO 'on'"):
            subprocess.run(
                [DOCKER, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                 "-U", "postgres", "-d", "postgres"],
                input=f"ALTER DATABASE postgres SET {guc};", text=True, capture_output=True, check=True,
            )

        catalog, baseline_sha, after_base_sha, after_obs_sha, seed_counts = _build_expected_catalog(cid)
        catalog_body = (canonical(catalog) + "\n").encode("utf-8")
        catalog_sha256 = CORE.sha256(catalog_body)

        quiesce_path = scratch / "writer-quiesce.json"
        _write_quiesce_manifest(quiesce_path, run_id)

        # ---- composer twin (parity oracle) -- the non-production fixture run root shape ----
        composer_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp"))
        composer_root.chmod(0o700)
        d5_roots.append(composer_root)
        composer_rows = _drive_composer(composer_root, catalog_body, quiesce_path, run_id)

        # ---- the live controller run root: the SINGLE physical dir the dual-bind binds to BOTH
        #      /opt/megacampus/backups/q12/<run-id> AND <trust-root>/backups/q12/<run-id>. It must
        #      match the non-production fixture shape /tmp/mc2-q12-d5-root-* (Engine.__post_init__),
        #      so it lives OUTSIDE the trust root; the trust root only carries an EMPTY bind
        #      mountpoint for it plus the barrier's secrets/project/node scaffolding. ----
        run_root = pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-d5-root-", dir="/tmp"))
        run_root.chmod(0o700)
        d5_roots.append(run_root)
        run_secrets = run_root / "secrets"
        run_secrets.mkdir(mode=0o700)
        secrets_dir = trust_root / "secrets"
        trust_mount = trust_root / "backups" / "q12" / run_id
        for directory in (secrets_dir, trust_mount):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        for ancestor in (trust_root, trust_root / "backups", trust_root / "backups" / "q12",
                         trust_mount, secrets_dir):
            ancestor.chmod(0o700)

        project_root = trust_root / "project" / "packages"
        project_root.mkdir(parents=True, mode=0o700)
        os.symlink(REPO / "packages/course-gen-platform", project_root / "course-gen-platform")
        node_copy = trust_root / "node-bin"
        shutil.copyfile(pathlib.Path(shutil.which("node") or "/usr/bin/node").resolve(), node_copy)
        node_copy.chmod(0o700)

        cert_path = scratch / "proxy-cert.pem"
        key_path = scratch / "proxy-key.pem"
        r4c._generate_self_signed(cert_path, key_path, POOLER_HOST)
        (secrets_dir / "supabase_db_url").write_text(
            f"postgresql://{POOLER_USER}:{PW}@{POOLER_HOST}:5432/postgres\n", encoding="utf-8"
        )
        (secrets_dir / "supabase_db_url").chmod(0o600)
        (secrets_dir / "prod-ca-2021.crt").write_bytes(cert_path.read_bytes())
        (secrets_dir / "prod-ca-2021.crt").chmod(0o644)

        # Pre-stage run-root inputs the barrier legs consume (0400): db-capability, the REAL catalog,
        # and the probe-receipt bootstrap (the owner-checked bootstrap verify/prepare/activate/cleanup
        # re-validate, q12-database-barrier.sh:235).
        (run_secrets / "db-capability").write_text(f"{CAPABILITY}\n", encoding="utf-8")
        (run_secrets / "db-capability").chmod(0o400)
        (run_root / "expected-post-migration-catalog.json").write_bytes(catalog_body)
        (run_root / "expected-post-migration-catalog.json").chmod(0o400)
        probe_body = (canonical(_probe_object(run_id, catalog_sha256)) + "\n").encode("utf-8")
        (run_root / "database-barrier-probe-receipt.json").write_bytes(probe_body)
        (run_root / "database-barrier-probe-receipt.json").chmod(0o400)

        fakehosts = scratch / "fakehosts"
        fakehosts.write_text(
            f"127.0.0.1 localhost {POOLER_HOST}\n::1 localhost ip6-localhost ip6-loopback\n",
            encoding="utf-8",
        )

        # The pooler-identity proxy runs INSIDE each barrier claim's private bwrap netns (started by
        # --real-claim / --real-cleanup), so there is no host-side proxy: the host's 5432 is never
        # touched and cannot conflict.
        context = FullWindowContext(cid, str(trust_root), run_root,
                                    run_root.parent / "cutover.lock", fakehosts,
                                    str(node_copy), str(trust_root / "project"),
                                    str(cert_path), str(key_path))
        context.migration_catalog_sha = {
            "migration.base.apply": after_base_sha,
            "migration.observability.apply": after_obs_sha,
        }

        # ---- drive run_live for the whole forward window + journaled cleanup + seam + resume ----
        lock_stat = _open_lease(context.cutover_lock)
        executor = RealBarrierWrapperExecutor(context)
        request = {
            "run_root": str(run_root), "run_id": run_id,
            "release_sha": "0123456789abcdef0123456789abcdef01234567",
            "operator_digest": "1" * 64, "resource_manifest_sha256": "2" * 64,
            "quiesce_manifest_sha256": CORE.sha256(quiesce_path.read_bytes()),
            "expected_catalog_sha256": catalog_sha256,
            "rotation_required": False, "lease_fd": 9,
            "lock_identity": [lock_stat.st_dev, lock_stat.st_ino],
            "quiesce_manifest_path": str(quiesce_path),
        }
        live_rc = 0
        live_stderr = ""
        output = None
        try:
            output = CORE.run_live(request, executor)
        except Exception as error:  # noqa: BLE001
            import traceback
            live_rc = 2
            live_stderr = f"{type(error).__name__}: {error}\n" + traceback.format_exc()
        finally:
            os.close(9)

        live_rows = [json.loads(line) for line in (run_root / "phase.jsonl").read_text().splitlines()]

        # ---- gather assertions ----
        post = (output or {}).get("postActivate") or {}
        cleanup = post.get("cleanup") or {}
        resume = post.get("resume") or {}
        marker_path = run_root / "quiesce-window-mode.json"
        marker = json.loads(marker_path.read_bytes()) if marker_path.exists() else None
        marker_mode = (
            oct(stat_module.S_IMODE(marker_path.stat().st_mode))[2:] if marker_path.exists() else None
        )
        receipt_path = run_root / "database-barrier-receipt.json"
        v2_receipt_bytes = receipt_path.read_bytes() if receipt_path.exists() else b""
        v2_receipt = json.loads(v2_receipt_bytes) if v2_receipt_bytes else None
        capability_file = run_secrets / "db-capability"
        capability_exists_after = capability_file.exists() or capability_file.is_symlink()

        # The db is read AFTER cleanup dropped q12_guard, so q12_guard.active_run is gone; the
        # activation truth comes from the durable v1 archive (guard-free), cron/read_only from live.
        archive_path = run_root / "database-barrier-receipt-v1-before-cleanup.json"
        activate_archive = json.loads(archive_path.read_bytes()) if archive_path.exists() else {}
        guard_residue_db = _dexec_json(
            cid,
            "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='q12_guard') AS schema_count, "
            "(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname='q12_guard') AS relation_count, "
            "(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='q12_guard') AS function_count, "
            "(SELECT count(*) FROM pg_event_trigger WHERE evtname='q12_guard_ddl_command_start') "
            "AS event_trigger_count",
        )[0]
        cron_after = _dexec_json(
            cid,
            "SELECT (SELECT count(*) FROM cron.job WHERE active) AS cron_active, "
            "(SELECT current_setting('default_transaction_read_only')) AS read_only",
        )[0]

        # #15 (ii): the install journal rows still bind the /opt manifest argv.
        manifest = CORE.load_manifest()
        install_command = CORE.resolved_command(
            manifest, "barrier.install", request,
            CORE.derive_joined_fixture_values(run_id, str(quiesce_path)),
        )
        opt_argv = install_command["argv"]
        install_rows = [r for r in live_rows if r["command_id"] == "barrier.install"]
        install_command_sha256_binds_opt_argv = bool(install_rows) and all(
            r["command_sha256"] == install_command["command_sha256"] for r in install_rows
        )
        install_argv_opt_verbatim = all(
            arg.startswith("/opt/megacampus/")
            for arg in opt_argv
            if arg.startswith("/opt/") or arg.startswith("/tmp/")
        )
        leg = executor.leg_diagnostics

        # #16 proof: the on-disk database-barrier-baseline.json AFTER the whole run is still the
        # BARRIER's authoritative 0400 full-structural artifact -- the controller strict-accepted it
        # and did NOT overwrite it with its minimal 5-key 0600 baseline. If the #16 collision-write
        # had won, this would be mode 0600 with the controller's minimal predecessor shape.
        baseline_path = run_root / "database-barrier-baseline.json"
        baseline_obj = json.loads(baseline_path.read_bytes()) if baseline_path.exists() else None
        baseline_mode = (
            oct(stat_module.S_IMODE(baseline_path.stat().st_mode))[2:]
            if baseline_path.exists() else None
        )

        sys.stdout.write(json.dumps({
            "seed_counts": seed_counts,
            "catalog_sha256": catalog_sha256,
            "run_id": run_id,
            "live_rc": live_rc,
            "live_stderr": live_stderr,
            "live_journal": live_rows,
            "composer_journal": composer_rows,
            "quiesce_window_marker": marker,
            "quiesce_window_marker_mode": marker_mode,
            "v2_receipt": v2_receipt,
            "v2_receipt_keys": sorted(v2_receipt) if v2_receipt else [],
            "v2_receipt_sha256": CORE.sha256(v2_receipt_bytes) if v2_receipt_bytes else None,
            "capability_exists_after": capability_exists_after,
            "post_activate_cleanup_status": cleanup.get("status"),
            "post_activate_resume_status": resume.get("status"),
            "post_activate_resume_validated_sha256": resume.get("validated_receipt_sha256"),
            "activate_receipt_archive_state": activate_archive.get("state"),
            "activate_db_state": {
                "activated": bool(activate_archive.get("state") == "activated"),
                "cron_active": cron_after["cron_active"],
                "read_only": cron_after["read_only"],
            },
            "guard_residue_db": guard_residue_db,
            "child_executions": executor.child_executions,
            "dual_bind_same_inode": bool(leg.get("dual_bind_same_inode")),
            "install_argv_opt_verbatim": install_argv_opt_verbatim,
            "install_command_sha256_binds_opt_argv": install_command_sha256_binds_opt_argv,
            "input_checkpoint_view_independent": bool(leg.get("input_checkpoint_view_independent")),
            "install_baseline_mode": baseline_mode,
            "install_baseline_schema": (baseline_obj or {}).get("schema_version"),
            "install_baseline_state": (baseline_obj or {}).get("state"),
            "install_baseline_keys": sorted(baseline_obj) if isinstance(baseline_obj, dict) else [],
            "install_baseline_has_structural": isinstance(baseline_obj, dict)
            and isinstance(baseline_obj.get("baseline"), dict),
        }) + "\n")
        return 0
    finally:
        subprocess.run([DOCKER, "rm", "-f", cid], capture_output=True)
        if not os.environ.get('MC2_Q12_FW_KEEP'):
            shutil.rmtree(trust_root, ignore_errors=True)
            shutil.rmtree(scratch, ignore_errors=True)
            for d5 in d5_roots:
                shutil.rmtree(d5, ignore_errors=True)
        else:
            sys.stderr.write(f'KEEP run_root={run_root}\n')


if __name__ == "__main__":
    raise SystemExit(main())
