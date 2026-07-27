#!/usr/bin/python3
"""Review P2 harness: the controller must PREFLIGHT the privileged launcher.

Without it, a staging miss (launcher not installed, wrong mode, sudo authority gone) is discovered at
C5 — after C2 has already stopped all ten production writers — which is the worst possible moment.
The preflight must fail closed BEFORE any journal row, exactly like the existing
``require_post_activate_executor`` pre-flight, and be production-gated so fixture runs are unaffected.

Each case prints ONE JSON object; the TypeScript test asserts on it. Cases that need a root-owned
0555 file run inside an unprivileged user namespace (where our own files stat as 0:0), which is why
the case name is a parameter rather than a single all-cases run. Nothing outside /tmp is written.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO / "deploy/qdrant/q12-lifecycle-core.py"
_spec = importlib.util.spec_from_file_location("q12_core", CORE_PATH)
core = importlib.util.module_from_spec(_spec)
sys.modules["q12_core"] = core
_spec.loader.exec_module(core)


def outcome(action) -> dict[str, object]:
    try:
        action()
    except core.LifecycleError as error:
        return {"refused": True, "reason": str(error)}
    except Exception as error:  # noqa: BLE001 — an unnamed failure is itself the defect
        return {"refused": False, "reason": f"{type(error).__name__}: {error}"}
    return {"refused": False}


def launcher_case(name: str, root: pathlib.Path) -> pathlib.Path:
    """Materialise a candidate launcher with exactly one property wrong."""
    good = root / "q12-privileged-launch.sh"
    good.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    if name == "absent":
        return root / "not-installed.sh"
    if name == "symlink":
        os.chmod(good, 0o555)
        link = root / "linked-launcher.sh"
        link.symlink_to(good)
        return link
    if name == "directory":
        target = root / "launcher-as-directory.sh"
        target.mkdir()
        return target
    if name == "mode":
        os.chmod(good, 0o755)
        return good
    if name == "writable-mode":
        os.chmod(good, 0o557)
        return good
    if name == "installed":
        os.chmod(good, 0o555)
        return good
    raise SystemExit(f"unknown launcher case: {name}")


def main() -> int:
    case = sys.argv[1]
    report: dict[str, object] = {"case": case, "euid": os.geteuid()}

    if case == "non-production":
        # The gate must be production-only: a fixture run must not need a root-owned launcher.
        report["result"] = outcome(lambda: core.require_privileged_launcher({"production": False}))
        report["alsoMissingKey"] = outcome(lambda: core.require_privileged_launcher({}))
        # The production flag is what gates this, not the run-root shape: a fixture run that happens
        # to name a production-shaped run root must still be a no-op.
        run_id = "3f2b9c1e-5d47-4a80-9c11-6e8f0b2d7a35"
        report["alsoProductionShapedRunRoot"] = outcome(
            lambda: core.require_privileged_launcher(
                {
                    "production": False,
                    "run_id": run_id,
                    "run_root": f"/opt/megacampus/backups/q12/{run_id}",
                }
            )
        )
    elif case == "non-production-run-root":
        # A production request that cannot reach C5 (its run root is not THE production run root) is
        # Engine's to refuse, by its own name. The host-staging check must not mask that.
        report["result"] = outcome(
            lambda: core.require_privileged_launcher(
                {
                    "production": True,
                    "run_id": "3f2b9c1e-5d47-4a80-9c11-6e8f0b2d7a35",
                    "run_root": "/tmp/mc2-q12-d5-root-not-production",
                }
            )
        )
    elif case == "production-derives-sibling":
        # A production request resolves the launcher as the controller's own sibling — the same
        # precedent launch_claim uses — so the repo checkout (owned by the developer, mode 0755)
        # fails the root-owned assertion. That proves both the derivation and the production gate.
        run_id = "3f2b9c1e-5d47-4a80-9c11-6e8f0b2d7a35"
        report["result"] = outcome(
            lambda: core.require_privileged_launcher(
                {
                    "production": True,
                    "run_id": run_id,
                    "run_root": f"/opt/megacampus/backups/q12/{run_id}",
                }
            )
        )
        report["expectedPath"] = str(CORE_PATH.with_name("q12-privileged-launch.sh"))
    elif case in ("sudo-authority-refused", "sudo-authority-granted"):
        # mc2-f2il0: pin BOTH directions of the probe's contract without asking the host who may
        # become root. Driving the real sudoers made this assertion true on a dev box (interactive
        # auth) and false on a GitHub runner (passwordless sudo), which is what turned develop's CI
        # red on 2026-07-26. The probe's own logic — shell the binary, refuse by name on a non-zero
        # exit — is exercised verbatim; only WHICH binary it shells is redirected, in this
        # short-lived fixture process, and the production constant is reported back so the test can
        # prove the redirection is local.
        stub = "/bin/false" if case == "sudo-authority-refused" else "/bin/true"
        report["productionBinary"] = core.SUDO_BIN
        report["probedBinary"] = stub
        core.SUDO_BIN = stub
        try:
            report["result"] = outcome(core.probe_privileged_launch_authority)
        finally:
            core.SUDO_BIN = report["productionBinary"]
    else:
        with tempfile.TemporaryDirectory(prefix="mc2-q12-preflight-") as tmp:
            candidate = launcher_case(case, pathlib.Path(tmp))
            report["result"] = outcome(lambda: core.validate_privileged_launcher(candidate))

    sys.stdout.write(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
