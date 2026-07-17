#!/usr/bin/python3
"""Fixture runner: drive q12-lifecycle-core `run_plan` with an injected fake
PlanExecutor so the deterministic catalog builder can be exercised without any
Docker/PostgreSQL access.  Reads one JSON spec on stdin and writes the plan
result JSON on stdout, or a `plan rejected:`/`plan error:` line on stderr with a
non-zero exit for negative assertions."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
CORE_PATH = REPO_ROOT / "deploy/qdrant/q12-lifecycle-core.py"
SPEC = importlib.util.spec_from_file_location("q12_plan_core", CORE_PATH)
CORE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CORE
SPEC.loader.exec_module(CORE)


class FakePlanExecutor:
    """Returns pre-baked synthetic capture evidence; performs no I/O.

    When ``capture_fault`` is set the executor raises to exercise the failed
    pre-emission path (run-dir cleanup); ``teardown`` is always a no-op so the
    only thing that can reclaim the run dir is ``run_plan`` itself.
    """

    def __init__(
        self,
        evidence: object,
        capture_fault: str | None = None,
        write_diag: bool = False,
    ) -> None:
        self._evidence = evidence
        self._capture_fault = capture_fault
        self._write_diag = write_diag

    def capture(self, request: dict[str, object]) -> object:
        if self._write_diag:
            # Simulate an equality-proof failure that preserved diagnostics under the
            # run dir, so run_plan's failed-run cleanup must keep the dir.
            diag = pathlib.Path(str(request["run_root"])) / "equality-diagnostics"
            diag.mkdir(mode=0o700)
            (diag / "equality-diff.txt").write_text("synthetic diff\n")
        if self._capture_fault:
            raise CORE.LifecycleError(self._capture_fault)
        # Deep copy through JSON so the builder cannot mutate the fixture.
        return json.loads(json.dumps(self._evidence))

    def teardown(self) -> None:
        return None


def main() -> int:
    payload = json.load(sys.stdin)
    arguments = CORE.parser().parse_args(
        [
            "plan",
            "--run-id",
            payload["run_id"],
            "--release-sha",
            payload["release_sha"],
            "--db-url-file",
            payload["db_url_file"],
            "--ca-file",
            payload["ca_file"],
            "--run-root",
            payload["run_root"],
        ]
    )
    executor = FakePlanExecutor(
        payload["evidence"], payload.get("capture_fault"), bool(payload.get("write_diag"))
    )
    result = CORE.run_plan(arguments, executor)
    sys.stdout.write(json.dumps(result))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CORE.LifecycleError as error:
        sys.stderr.write(f"plan rejected: {error}\n")
        raise SystemExit(3) from None
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        sys.stderr.write(f"plan error: {error}\n")
        raise SystemExit(4) from None
