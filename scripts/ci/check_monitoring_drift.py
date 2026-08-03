#!/usr/bin/env python3
"""Detect drift between the repository's monitoring config and what production actually serves.

CI deploys application code. It does NOT deploy `ops/qdrant` (Prometheus, Alertmanager and Grafana
config, root-owned by deliberate hardening, which the deploy user cannot write) and it does not
install `deploy/systemd` units into /etc/systemd/system. Until 2026-07-31 the workflow simply
asserted the deployed tree was byte-identical to the repository, and nothing checked it: the claim
went false the moment 89b4cdd9d changed alerts.yml, and a green master deploy left production
serving a critical alert whose text promised off-host retention that does not exist (mc2-ugl5g).

This script replaces that assertion with a measurement. It cannot install the files -- doing so
would hand CI root on the monitoring tree, and root ownership is the security property -- so it
fails loudly and names the one command that fixes it.

Two modes:

    --emit-manifest        run in the repository; writes {path: sha256} to stdout
    --check --manifest F   run on the host; compares F against the deployed files

Exit status is 0 when everything matches, 1 on drift, 2 on a usage or IO error.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# Everything under ops/qdrant is monitoring configuration that lives on the host as a bind mount.
OPS_SOURCE_DIR = "ops/qdrant"
OPS_DEPLOYED_DIR = "/opt/megacampus/ops/qdrant"

# Only unit files are installed into systemd; the tarball copy under /opt/megacampus/deploy/systemd
# is staged, not active, so comparing against it would prove nothing about what systemd runs.
SYSTEMD_SOURCE_DIR = "deploy/systemd"
SYSTEMD_DEPLOYED_DIR = "/etc/systemd/system"
SYSTEMD_SUFFIXES = (".service", ".timer")

REMEDIATION = (
    "Run the deliberate root install on the host, which validates the rules before touching "
    "anything:\n"
    "    sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh\n"
    "\n"
    "mc2-0tcyw: that installer replaces every staged unit and reloads systemd, which clears the\n"
    "drift, but it proves nothing about the schedule it just changed. When the drift is\n"
    "megacampus-supabase-backup.service or .timer, prefer the installer that carries its own\n"
    "proof -- it runs a real backup, validates it with pg_restore, runs the restore drill, and\n"
    "disables the timer again if any of that fails:\n"
    "    sudo /opt/megacampus/deploy/postgres/install-supabase-backup-schedule.sh \\\n"
    "        --run-id <uuid> --service-sha256 <sha> --timer-sha256 <sha> \\\n"
    "        --confirm 'INSTALL MC2 SUPABASE BACKUP SCHEDULE'"
)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def collect_sources(repo_root: Path) -> dict[str, dict[str, str]]:
    ops_root = repo_root / OPS_SOURCE_DIR
    ops = {
        str(path.relative_to(ops_root)): sha256_of(path)
        for path in sorted(ops_root.rglob("*"))
        if path.is_file()
    }

    systemd_root = repo_root / SYSTEMD_SOURCE_DIR
    systemd = {
        path.name: sha256_of(path)
        for path in sorted(systemd_root.iterdir())
        if path.is_file() and path.name.endswith(SYSTEMD_SUFFIXES)
    }

    if not ops or not systemd:
        raise SystemExit(f"refusing to emit an empty manifest from {repo_root}")

    return {"ops": ops, "systemd": systemd}


def compare(expected: dict[str, str], deployed_dir: Path, label: str) -> list[str]:
    problems: list[str] = []

    for relative_path, expected_digest in sorted(expected.items()):
        deployed = deployed_dir / relative_path
        if not deployed.is_file():
            problems.append(f"{label}: MISSING on host: {deployed}")
            continue
        try:
            actual_digest = sha256_of(deployed)
        except PermissionError:
            problems.append(f"{label}: UNREADABLE on host: {deployed}")
            continue
        if actual_digest != expected_digest:
            problems.append(
                f"{label}: DRIFTED: {deployed}\n"
                f"    repository {expected_digest}\n"
                f"    deployed   {actual_digest}"
            )

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--emit-manifest", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--manifest")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--ops-deployed-dir", default=OPS_DEPLOYED_DIR)
    parser.add_argument("--systemd-deployed-dir", default=SYSTEMD_DEPLOYED_DIR)
    args = parser.parse_args()

    if args.emit_manifest == args.check:
        parser.error("choose exactly one of --emit-manifest or --check")

    if args.emit_manifest:
        json.dump(collect_sources(Path(args.repo_root)), sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return 0

    if not args.manifest:
        parser.error("--check requires --manifest")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    problems = compare(manifest["ops"], Path(args.ops_deployed_dir), "ops/qdrant")
    problems += compare(manifest["systemd"], Path(args.systemd_deployed_dir), "systemd unit")

    if not problems:
        total = len(manifest["ops"]) + len(manifest["systemd"])
        print(f"monitoring config OK: {total} files match the repository")
        return 0

    print("MONITORING CONFIG DRIFT — production is not serving what this repository says.")
    print("")
    for problem in problems:
        print(f"  {problem}")
    print("")
    print(REMEDIATION)
    return 1


if __name__ == "__main__":
    sys.exit(main())
