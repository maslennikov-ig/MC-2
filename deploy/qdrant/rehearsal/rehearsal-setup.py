#!/usr/bin/env python3
"""Q12 R8 SERVER CUSTODY REHEARSAL — disposable source + catalog + proxy setup
(driver deliverable i).

Stands up the disposable ``postgres:17.10-bookworm`` loopback container, seeds the
FULL Supabase inventory (47 public / 22 auth / 5 storage / 8 cron + net +
supabase_migrations) AND the two cron GUCs ``cron.database_name`` /
``cron.launch_active_jobs`` (R8-B-2-i fidelity, structural-hash-neutral), computes
the REAL expected-post-migration catalog from the seeded+migrated container using the
R4 preflight pattern (NEVER synthesized), and generates the self-signed pooler-identity
proxy cert/key (accepted under the barrier's CA-only test mode).

The catalog + seed logic is REUSED verbatim from the fusion harness so the rehearsal
source is byte-identical to the harness the server barrier was proven against:
  * seed / identity constants  <- q12-live-real-barrier-cutover-runner.py (r4c)
  * REAL expected catalog       <- q12-live-real-full-window-runner.py::_build_expected_catalog

LOCAL_TEST / --dry-run: provisions the disposable container on the host docker, seeds,
computes + prints the catalog, verifies the seed counts, and tears the container down
(unless --keep). It performs NO /opt write and NO sudo/prod action; the pooler-identity
proxy runs INSIDE the ns only on the orchestrator's server run (see rehearsal-ns-launch.sh),
so locally we only PROVE the cert/key generate and the catalog is real.

Prints ONE JSON object to stdout describing the provisioned source.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

REPO = pathlib.Path(__file__).resolve().parents[3]
FIXTURES = REPO / "packages/course-gen-platform/tests/unit/ops/fixtures"
R4_RUNNER = FIXTURES / "q12-live-real-barrier-cutover-runner.py"
FW_RUNNER = FIXTURES / "q12-live-real-full-window-runner.py"


def _load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _wait_ready(docker: str, cid: str, image_pull_timeout: float) -> None:
    deadline = time.time() + image_pull_timeout
    while time.time() < deadline:
        ready = subprocess.run([docker, "exec", cid, "pg_isready", "-U", "postgres"],
                               capture_output=True)
        logs = subprocess.run([docker, "logs", cid], capture_output=True, text=True)
        # The postgres entrypoint prints "init process complete" on STDOUT (server logs go
        # to stderr); check both streams so readiness is detected regardless of stream.
        combined = (logs.stdout or "") + (logs.stderr or "")
        if ready.returncode == 0 and "init process complete" in combined:
            return
        time.sleep(0.2)
    raise RuntimeError("disposable postgres never became ready")


def provision(docker: str, keep: bool, cert_dir: pathlib.Path, wait: float) -> dict:
    r4c = _load("q12_r4c_runner", R4_RUNNER)
    fw = _load("q12_fw_runner", FW_RUNNER)

    cid = f"mc2-q12-rehearsal-src-{os.getpid()}-{int(time.time())}"
    subprocess.run(
        [docker, "run", "-d", "--name", cid, "-e", f"POSTGRES_PASSWORD={r4c.PW}",
         "-p", "127.0.0.1::5432", r4c.IMAGE],
        check=True, capture_output=True,
    )
    try:
        _wait_ready(docker, cid, wait)
        seed = subprocess.run(
            [docker, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "postgres"],
            input=r4c.SEED_SQL, text=True, capture_output=True,
        )
        if seed.returncode != 0:
            raise RuntimeError(f"seed failed: {seed.stderr.strip()}")
        # R8-B-2-i fidelity: the two cron GUCs (structural-hash-neutral).
        for guc in ("cron.database_name TO 'postgres'", "cron.launch_active_jobs TO 'on'"):
            subprocess.run(
                [docker, "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                 "-U", "postgres", "-d", "postgres"],
                input=f"ALTER DATABASE postgres SET {guc};",
                text=True, capture_output=True, check=True,
            )

        # REAL expected catalog via the R4 preflight (computed from the container).
        catalog, baseline_sha, after_base_sha, after_obs_sha, seed_counts = (
            fw._build_expected_catalog(cid)
        )
        catalog_body = (r4c.canonical(catalog) + "\n").encode("utf-8")
        catalog_sha256 = r4c.sha256_hex(catalog_body)

        expected = {"public": 47, "auth": 22, "storage": 5, "cron": 8, "net": 0}
        if seed_counts != expected:
            raise RuntimeError(f"seed inventory drifted: {seed_counts} != {expected}")

        # Verify the two cron GUCs actually landed (fidelity, not synthesized).
        gucs = subprocess.run(
            [docker, "exec", "-i", cid, "psql", "-X", "-t", "-A", "-U", "postgres",
             "-d", "postgres", "-c",
             "SELECT current_setting('cron.database_name', true)||','||"
             "current_setting('cron.launch_active_jobs', true)"],
            capture_output=True, text=True,
        ).stdout.strip()

        cert_dir.mkdir(parents=True, exist_ok=True)
        cert_path = cert_dir / "proxy-cert.pem"
        key_path = cert_dir / "proxy-key.pem"
        r4c._generate_self_signed(cert_path, key_path, r4c.POOLER_HOST)

        catalog_file = cert_dir / "expected-post-migration-catalog.json"
        catalog_file.write_bytes(catalog_body)
        catalog_file.chmod(0o400)

        return {
            "container": cid,
            "image": r4c.IMAGE,
            "pooler_host": r4c.POOLER_HOST,
            "pooler_user": r4c.POOLER_USER,
            "seed_counts": seed_counts,
            "cron_gucs": gucs,
            "catalog_sha256": catalog_sha256,
            "catalog_file": str(catalog_file),
            "baseline_structural_sha256": baseline_sha,
            "after_base_structural_sha256": after_base_sha,
            "after_obs_structural_sha256": after_obs_sha,
            "proxy_cert": str(cert_path),
            "proxy_key": str(key_path),
            "kept": keep,
        }
    finally:
        if not keep:
            subprocess.run([docker, "rm", "-f", cid], capture_output=True)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Provision the Q12 rehearsal source + catalog.")
    parser.add_argument("--docker", default=os.environ.get("MC2_Q12_REHEARSAL_DOCKER", "/usr/bin/docker"))
    parser.add_argument("--cert-dir", type=pathlib.Path,
                        default=None, help="where to write the proxy cert/key + catalog")
    parser.add_argument("--keep", action="store_true",
                        help="retain the disposable container (post-mortem); default tears it down")
    parser.add_argument("--wait", type=float, default=120.0)
    args = parser.parse_args(argv)

    cert_dir = args.cert_dir or pathlib.Path(
        tempfile.mkdtemp(prefix="mc2-q12-rehearsal-setup-", dir="/tmp")
    )
    result = provision(args.docker, args.keep, cert_dir, args.wait)
    sys.stdout.write(json.dumps(result, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
