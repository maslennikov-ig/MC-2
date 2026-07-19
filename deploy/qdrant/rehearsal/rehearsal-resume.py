#!/usr/bin/env python3
"""Q12 R8 SERVER CUSTODY REHEARSAL — LOCAL_TEST resume + recovery-epoch driver
(driver deliverable iii).

Invokes the REAL W-side custody (``deploy/qdrant/source-recovery-run.sh`` ->
``deploy/qdrant/q12-writer-resume.py``) under ``SOURCE_RECOVERY_LOCAL_TEST=1`` with an
OVERRIDDEN docker/compose/systemctl SIMULATING the writer fleet (the established harness
pattern), against the run root produced by ``rehearsal-ns-launch.sh``'s ``run_live``.

Two legs (blueprint points 3 + 4), same ``resume-writers-only`` invocation:

  * ``--leg resume`` (point 3): validate the REAL v2 receipt from the rehearsal's own
    real cleanup and simulate the forward writer-fleet bounce. HONEST LABELING: this
    proves the REAL gate + machinery end-to-end; the REAL prod fleet bounce is an
    IN-WINDOW step (C2/C8 on real writers), NEVER rehearsed on prod writers.

  * ``--leg recovery-epoch`` (point 4): validate a run root whose ``barrier.cleanup``
    journal was minted UNDER ``cutover-recovery-1`` by an interrupted-cleanup recovery
    re-driving the REAL barrier cleanup child against the disposable container (DB real,
    fleet simulated). The recovery-epoch MINTING STEP is PINNED below (confirmed against
    ``qdrant-source-recovery-runtime.test.ts``).

RECOVERY-EPOCH MINTING (PINNED — qdrant-source-recovery-runtime.test.ts):
  The controller fusion CANNOT mint ``cutover-recovery-1`` (found-defect #19:
  orchestrate_post_activate_cleanup is cutover-only), so the +2 recovery-epoch cleanup is
  DEFERRED to this W-side server custody. When ``databaseRecoveryRequired`` holds
  (test :2272), for ``barrier.cleanup`` the runtime mints (test :2277-2333):
    1. rename the interrupted CLAIMED ``cutover`` capability into
       ``capabilities/superseded/barrier.cleanup--cutover.json``;
    2. set ``databaseExecutionEpoch = 'cutover-recovery-1'``;
    3. write ``database-barrier-capability-checkpoint-cleanup-cutover-recovery-1.json`` (0600)
       anchored to the recovery capability anchor;
    4. write ``capabilities/issued/barrier.cleanup--cutover-recovery-1.json`` with
       ``lease_epoch:'cutover-recovery-1'`` and
       ``supersedes_capability_sha256 = sha256(superseded cutover capability)``;
    5. append ``guard_cleanup_complete / recovery_reacquired / cutover-recovery-1``;
    6. rename issued -> ``capabilities/claimed/barrier.cleanup--cutover-recovery-1.json``;
    7. append ``guard_cleanup_complete / capability_claimed / cutover-recovery-1``;
    8. write ``database-barrier-input-checkpoint-cleanup-cutover-recovery-1.json`` (0600);
    9. the REAL barrier cleanup child runs under cutover-recovery-1 -> terminal proof + v2;
   10. append ``capability_completed`` + ``accepted`` under ``cutover-recovery-1``.
  Resulting ``barrier.cleanup`` graph (test :3372-3378):
    [cutover,intent] [cutover-recovery-1,recovery_reacquired]
    [cutover-recovery-1,capability_claimed] [cutover-recovery-1,capability_completed]
    [cutover-recovery-1,accepted]
  ``q12-writer-resume.py`` (:1529-1641) then VALIDATES this recovery-epoch lifecycle
  (consecutive epochs cutover,cutover-recovery-1,...; recovery group ==
  [recovery_reacquired,capability_claimed,capability_completed,accepted]; reads
  ``database-barrier-input-checkpoint-cleanup-cutover-recovery-1.json``) before resume.

LOCAL DRY-RUN (--dry-run, default): builds the fleet-sim binaries, self-tests the fake
docker, and PRINTS the secret-free ``source-recovery-run.sh`` invocation + env. It does
NOT invoke source-recovery-run.sh and takes NO prod action. The live invocation + the
resume-authority validation are authoritatively covered by qdrant-source-recovery-runtime.test.ts
and run on the orchestrator's server against the REAL run-root authority chain.

Secrets: db-url / capability bytes are handled stdin-only by the barrier / controller and
are NEVER passed on argv or logged here.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[3]
WRAPPER = REPO / "deploy/qdrant/source-recovery-run.sh"

FAKE_DOCKER = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ "$1 $2" == 'context show' ]]; then
  printf '%s\n' "${DOCKER_CURRENT_CONTEXT:-default}"
elif [[ "$1 $2" == 'context inspect' ]]; then
  if [[ "$3" == default ]]; then printf '%s\n' "${DOCKER_DEFAULT_ENDPOINT}"
  elif [[ "$3" == "${DOCKER_CURRENT_CONTEXT:-default}" ]]; then printf '%s\n' "${DOCKER_CURRENT_ENDPOINT}"
  else exit 65; fi
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1" == ps ]]; then
  project=''; service=''
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == --filter ]]; then
      case "$2" in
        label=com.docker.compose.project=*) project="${2##*=}" ;;
        label=com.docker.compose.service=*) service="${2##*=}" ;;
      esac
      shift 2
    else shift; fi
  done
  jq -r --arg project "$project" --arg service "$service" '.[] | select((($project == "") or .Config.Labels["com.docker.compose.project"] == $project) and (($service == "") or .Config.Labels["com.docker.compose.service"] == $service)) | .Id' "$DOCKER_RECORDS_FILE"
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1" == inspect ]]; then
  id="${@: -1}"; jq -c --arg id "$id" '[.[] | select(.Id == $id)]' "$DOCKER_RECORDS_FILE"
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1 $2" == 'update --restart=no' ]]; then
  id="$3"; jq --arg id "$id" 'map(if .Id == $id then .HostConfig.RestartPolicy = {Name:"no",MaximumRetryCount:0} else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"; mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1" == update && "$2" == --restart=* ]]; then
  policy="${2#--restart=}"; id="$3"; name="${policy%%:*}"; retries=0
  if [[ "$policy" == *:* ]]; then retries="${policy##*:}"; fi
  jq --arg id "$id" --arg name "$name" --argjson retries "$retries" 'map(if .Id == $id then .HostConfig.RestartPolicy = {Name:$name,MaximumRetryCount:$retries} else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"; mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1" == stop ]]; then
  id="${@: -1}"; jq --arg id "$id" 'map(if .Id == $id then .State.Running=false | .State.Status="exited" else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"; mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
elif [[ -n "${DOCKER_RECORDS_FILE:-}" && "$1" == start ]]; then
  id="$2"; jq --arg id "$id" 'map(if .Id == $id then .State.Running=true | .State.Status="running" else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"; mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
else exit 64; fi
"""

FAKE_COMPOSE = r"""#!/usr/bin/env bash
set -euo pipefail
printf 'context=%s %s\n' "${DOCKER_CONTEXT:-unset}" "$*" >> "$COMPOSE_LOG"
"""

FAKE_SYSTEMCTL = r"""#!/usr/bin/env bash
set -euo pipefail
command="$1"; service="${2:-}"
printf '%s %s\n' "$command" "$service" >> "$SYSTEMCTL_LOG"
case "$command" in
  is-active) cat "$SERVICE_STATE/$service" 2>/dev/null || printf 'inactive\n' ;;
  stop) printf 'inactive\n' > "$SERVICE_STATE/$service" ;;
  start) printf 'active\n' > "$SERVICE_STATE/$service" ;;
  *) exit 64 ;;
esac
"""


def build_fleet_sim(bindir: pathlib.Path) -> dict:
    """Write the fleet-simulating docker/compose/systemctl overrides + logs/records.
    This is the 'overridden docker command simulating the writer fleet' — a real prod
    fleet bounce is FORBIDDEN out-of-window, so the fleet is simulated end-to-end."""
    bindir.mkdir(parents=True, exist_ok=True)
    docker = bindir / "docker"
    compose = bindir / "operator-compose"
    systemctl = bindir / "systemctl"
    docker.write_text(FAKE_DOCKER)
    compose.write_text(FAKE_COMPOSE)
    systemctl.write_text(FAKE_SYSTEMCTL)
    for path in (docker, compose, systemctl):
        path.chmod(0o700)
    service_state = bindir / "service-state"
    service_state.mkdir(exist_ok=True)
    records = bindir / "docker-records.json"
    records.write_text("[]\n")
    return {"docker": docker, "compose": compose, "systemctl": systemctl,
            "service_state": service_state, "records": records,
            "docker_log": bindir / "docker.log", "compose_log": bindir / "compose.log",
            "systemctl_log": bindir / "systemctl.log"}


def build_env(run_root: pathlib.Path, sim: dict, lock: pathlib.Path) -> dict:
    uid = str(os.getuid())
    gid = str(os.getgid())
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "SOURCE_RECOVERY_LOCAL_TEST": "1",
        "SOURCE_RECOVERY_WRITER_BACKEND": "compose",
        "SOURCE_RECOVERY_DOCKER_BIN": str(sim["docker"]),
        "SOURCE_RECOVERY_COMPOSE_BIN": str(sim["compose"]),
        "SOURCE_RECOVERY_SYSTEMCTL_BIN": str(sim["systemctl"]),
        "SOURCE_RECOVERY_CURL_BIN": "/usr/bin/curl",
        "SOURCE_RECOVERY_LOCK_FILE": str(lock),
        "SOURCE_RECOVERY_Q12_RUN_ROOT": str(run_root),
        "SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE": str(lock) + ".q12-cutover",
        "SOURCE_RECOVERY_EXPECTED_UID": uid,
        "SOURCE_RECOVERY_EXPECTED_GID": gid,
        "SOURCE_RECOVERY_CONTROLLER_UID": uid,
        "SOURCE_RECOVERY_CONTROLLER_GID": gid,
        "Q12_EXTERNAL_QUIESCE_LEASE_FD": "9",
        "DOCKER_LOG": str(sim["docker_log"]),
        "COMPOSE_LOG": str(sim["compose_log"]),
        "SYSTEMCTL_LOG": str(sim["systemctl_log"]),
        "SERVICE_STATE": str(sim["service_state"]),
        "DOCKER_RECORDS_FILE": str(sim["records"]),
        "DOCKER_CURRENT_CONTEXT": "default",
        "DOCKER_DEFAULT_ENDPOINT": "unix:///var/run/docker.sock",
        "DOCKER_CURRENT_ENDPOINT": "unix:///var/run/docker.sock",
    }


def resume_invocation(run_id: str, mode: str, lock: pathlib.Path) -> list[str]:
    """The flock-lease-wrapped resume-writers-only invocation of the REAL wrapper
    (mirrors qdrant-source-recovery-runtime.test.ts :2737-2751)."""
    return [
        "bash", "-c", 'exec 9<>"$1"; flock -n 9; shift; exec bash "$@"',
        "q12-resume-lease", str(lock) + ".q12-cutover",
        str(WRAPPER), "--operation", "resume-writers-only",
        "--resume-mode", mode, "--run-id", run_id,
    ]


def self_test_docker(sim: dict, env: dict) -> dict:
    """Prove the fleet-sim docker behaves (context show + a labelled ps) WITHOUT prod."""
    ctx = subprocess.run([str(sim["docker"]), "context", "show"], env=env,
                         capture_output=True, text=True)
    ps = subprocess.run([str(sim["docker"]), "ps", "--filter",
                        "label=com.docker.compose.project=megacampus"], env=env,
                        capture_output=True, text=True)
    return {"context_show": ctx.stdout.strip(), "context_rc": ctx.returncode,
            "ps_rc": ps.returncode}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Q12 rehearsal resume + recovery-epoch driver.")
    parser.add_argument("--run-root", required=True, type=pathlib.Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--resume-mode", choices=["forward", "rollback"], default="forward")
    parser.add_argument("--leg", choices=["resume", "recovery-epoch"], default="resume")
    parser.add_argument("--bindir", type=pathlib.Path, default=None)
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--run", dest="dry_run", action="store_false",
                        help="actually invoke source-recovery-run.sh (server / real run-root only)")
    args = parser.parse_args(argv)

    bindir = args.bindir or pathlib.Path(tempfile.mkdtemp(prefix="mc2-q12-rehearsal-fleet-", dir="/tmp"))
    sim = build_fleet_sim(bindir)
    lock = bindir / "source-recovery.lock"
    env = build_env(args.run_root.resolve(), sim, lock)
    invocation = resume_invocation(args.run_id, args.resume_mode, lock)

    if args.dry_run:
        probe = self_test_docker(sim, env)
        secret_free_env = {k: v for k, v in sorted(env.items())}
        sys.stdout.write(json.dumps({
            "leg": args.leg,
            "mode": args.resume_mode,
            "dry_run": True,
            "fleet_sim_dir": str(bindir),
            "fleet_sim_self_test": probe,
            "wrapper": str(WRAPPER),
            "invocation": invocation,
            "env": secret_free_env,
            "note": ("recovery-epoch leg: the run root's barrier.cleanup journal must be "
                     "minted under cutover-recovery-1 (see module docstring); the wrapper "
                     "validates it identically to the cutover resume leg."),
        }, indent=2, sort_keys=True) + "\n")
        sys.stderr.write("DRY-RUN: fleet-sim built + self-tested; NO source-recovery-run.sh, NO prod.\n")
        return 0

    # --- live invocation: orchestrator/server only, against the REAL run-root authority chain ---
    completed = subprocess.run(invocation, env=env)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
