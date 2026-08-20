from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("run_stage_closeout.py")
SPEC = importlib.util.spec_from_file_location("run_stage_closeout", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def load_evidence_helper():
    helper_path = SCRIPT.with_name("verification_evidence.py")
    if not helper_path.is_file():
        raise AssertionError("verification-evidence/v2 helper is missing")
    spec = importlib.util.spec_from_file_location("mc2_verification_evidence", helper_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ChangedLineDebtHitsTests(unittest.TestCase):
    def make_repo(self) -> Path:
        temporary = tempfile.TemporaryDirectory(prefix="mc2-closeout-")
        self.addCleanup(temporary.cleanup)
        repo = Path(temporary.name)
        subprocess.run(["git", "init", "--quiet"], cwd=repo, check=True)
        return repo

    def test_intentional_placeholder_validator_fixture_is_not_debt(self) -> None:
        repo = self.make_repo()
        fixture_paths = (
            "packages/course-gen-platform/tests/unit/stages/stage5-generation/"
            "validators/placeholder-validator.test.ts",
            "packages/course-gen-platform/tests/unit/validators/placeholder-validator.test.ts",
        )
        for fixture_path in fixture_paths:
            fixture = repo / fixture_path
            fixture.parent.mkdir(parents=True, exist_ok=True)
            fixture.write_text("expect(hasPlaceholders('TODO')).toBe(true);\n")

        self.assertEqual(MODULE.changed_line_debt_hits(repo), [])

    def test_production_marker_remains_blocking(self) -> None:
        repo = self.make_repo()
        source = repo / "packages/course-gen-platform/src/example.ts"
        source.parent.mkdir(parents=True)
        source.write_text("// TODO: real production debt\n")

        hits = MODULE.changed_line_debt_hits(repo)

        self.assertEqual(len(hits), 1)
        self.assertIn("packages/course-gen-platform/src/example.ts", hits[0])


class VerificationEvidenceRegressionTests(unittest.TestCase):
    def test_artifact_checksum_manifest_and_every_target_invalidate_reuse(self) -> None:
        helper = load_evidence_helper()
        temporary = tempfile.TemporaryDirectory(prefix="mc2-evidence-v2-")
        self.addCleanup(temporary.cleanup)
        repo = Path(temporary.name)
        subprocess.run(["git", "init", "--quiet"], cwd=repo, check=True)
        evidence = repo / ".codex/stages/stage-a/evidence"
        targets = repo / "packages/course-gen-platform/artifacts/career-playbook-quality"
        evidence.mkdir(parents=True)
        targets.mkdir(parents=True)
        target_names = (
            "career-playbook.md",
            "career-playbook.pdf",
            "career-playbook-card.webp",
            "run-record.json",
        )
        for name in target_names:
            (targets / name).write_text(f"{name}\n", encoding="utf-8")
        checksums = evidence / "artifacts.sha256"
        checksum_lines = subprocess.run(
            ["sha256sum", *(str(targets / name) for name in target_names)],
            cwd=repo,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.replace(str(repo) + "/", "")
        checksums.write_text(checksum_lines, encoding="utf-8")
        manifest_path = repo / ".codex/verification-manifest.json"
        command = "sha256sum --check .codex/stages/stage-a/evidence/artifacts.sha256"
        manifest_path.write_text(
            json.dumps(
                {
                    "schema_version": "verification-manifest/v2",
                    "producer": "orchestration-setup",
                    "required_steps": ["artifact-integrity"],
                    "steps": [
                        {
                            "id": "artifact-integrity",
                            "command": command,
                            "cwd": ".",
                            "inputs": [
                                ".codex/stages/stage-a/evidence/artifacts.sha256",
                                *[
                                    "packages/course-gen-platform/artifacts/"
                                    f"career-playbook-quality/{name}"
                                    for name in target_names
                                ],
                            ],
                            "lockfiles": [],
                            "tools": [{"name": "sha256sum", "executable": "sha256sum"}],
                            "environment": [],
                            "dependencies": [],
                            "external": False,
                            "inputs_complete": True,
                            "cache": {
                                "eligible": True,
                                "reason": "checks only the declared checksum manifest and targets",
                            },
                        }
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        receipt = repo / ".codex/stages/stage-a/acceptance-receipt.json"
        report_dir = repo / ".git/orchestration-evidence/v2"

        def execute(*, reuse: bool):
            return helper.run_verification(
                repo_root=repo,
                manifest_path=manifest_path,
                receipt_path=receipt,
                report_dir=report_dir,
                stage_id="stage-a",
                orchestration_level="integration",
                reuse_requested=reuse,
                must_run=not reuse,
                shadow=False,
                reuse_policy_enabled=True,
            )

        self.assertEqual(execute(reuse=False)["result"], "PASS")
        self.assertEqual(execute(reuse=True)["steps"][0]["disposition"], "cached")

        checksums.write_text("0" * 64 + "  missing.bin\n", encoding="utf-8")
        changed_manifest = execute(reuse=True)
        self.assertEqual(changed_manifest["result"], "FAIL")
        self.assertEqual(changed_manifest["steps"][0]["disposition"], "executed")


class VerificationEvidenceContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.helper = load_evidence_helper()
        temporary = tempfile.TemporaryDirectory(prefix="mc2-evidence-contract-")
        self.addCleanup(temporary.cleanup)
        self.repo = Path(temporary.name)
        (self.repo / ".codex").mkdir()
        (self.repo / "src.txt").write_text("source-one\n", encoding="utf-8")
        (self.repo / "ignored.txt").write_text("ignored-one\n", encoding="utf-8")
        (self.repo / "lock.txt").write_text("lock-one\n", encoding="utf-8")
        (self.repo / ".gitignore").write_text("ignored.txt\n", encoding="utf-8")
        subprocess.run(["git", "init", "--quiet"], cwd=self.repo, check=True)
        self.counter = self.repo / "counter.txt"
        self.manifest_path = self.repo / ".codex/verification-manifest.json"
        self.receipt = self.repo / ".codex/stages/stage-a/acceptance-receipt.json"
        self.report_dir = self.repo / ".git/orchestration-evidence/v2"

    def command(self, marker: str, *, fail: bool = False) -> str:
        code = (
            "from pathlib import Path; "
            f"p=Path({str(self.counter)!r}); "
            f"p.write_text((p.read_text() if p.exists() else '') + {marker!r}); "
            + ("raise SystemExit(7)" if fail else "")
        )
        return f"{shlex.quote(sys.executable)} -c {shlex.quote(code)}"

    def manifest(self, *, steps=None):
        steps = steps or [
            {
                "id": "unit",
                "command": self.command("u"),
                "cwd": ".",
                "inputs": ["src.txt", "ignored.txt"],
                "lockfiles": ["lock.txt"],
                "tools": [{"name": "python", "executable": sys.executable}],
                "environment": ["VERIFY_MODE"],
                "dependencies": [],
                "external": False,
                "inputs_complete": True,
                "cache": {
                    "eligible": True,
                    "reason": "reads only declared fixture inputs and captured identity",
                },
            }
        ]
        return {
            "schema_version": "verification-manifest/v2",
            "producer": "orchestration-setup",
            "required_steps": [step["id"] for step in steps],
            "steps": steps,
        }

    def write_manifest(self, payload=None) -> None:
        self.manifest_path.write_text(
            json.dumps(payload or self.manifest(), indent=2) + "\n", encoding="utf-8"
        )

    def execute(
        self, *, level="slice_acceptance", reuse=False, must_run=None, shadow=False
    ):
        return self.helper.run_verification(
            repo_root=self.repo,
            manifest_path=self.manifest_path,
            receipt_path=self.receipt,
            report_dir=self.report_dir,
            stage_id="stage-a",
            orchestration_level=level,
            reuse_requested=reuse,
            must_run=(not reuse) if must_run is None else must_run,
            shadow=shadow,
            reuse_policy_enabled=True,
        )

    def test_v1_forged_and_tampered_report_evidence_are_misses(self) -> None:
        self.write_manifest()
        self.receipt.parent.mkdir(parents=True)
        self.receipt.write_text(
            json.dumps({"schema_version": "acceptance-receipt/v1", "result": "passed"}),
            encoding="utf-8",
        )
        self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "executed")

        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        receipt["report_digest"] = "0" * 64
        self.receipt.write_text(json.dumps(receipt), encoding="utf-8")
        self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "executed")

        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        report = self.repo / ".git" / receipt["report_path"]
        payload = json.loads(report.read_text(encoding="utf-8"))
        payload["result"] = "FAIL"
        report.write_text(json.dumps(payload), encoding="utf-8")
        self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "executed")

    def test_orchestration_level_is_part_of_identity(self) -> None:
        self.write_manifest()
        self.execute(level="slice_acceptance")
        for level in ("integration", "release"):
            reusable = self.helper.validate_reusable_receipt(
                repo_root=self.repo,
                manifest_path=self.manifest_path,
                receipt_path=self.receipt,
                report_dir=self.report_dir,
                stage_id="stage-a",
                orchestration_level=level,
            )
            with self.subTest(level=level):
                self.assertIsNone(reusable)

    def test_source_ignored_env_lock_and_tool_changes_each_force_execution(self) -> None:
        self.write_manifest()
        with patch.dict(os.environ, {"VERIFY_MODE": "one"}):
            self.execute()
            self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "cached")

            for path, content in (
                (self.repo / "src.txt", "source-two\n"),
                (self.repo / "ignored.txt", "ignored-two\n"),
                (self.repo / "lock.txt", "lock-two\n"),
            ):
                path.write_text(content, encoding="utf-8")
                self.assertEqual(
                    self.execute(reuse=True)["steps"][0]["disposition"], "executed"
                )

        with patch.dict(os.environ, {"VERIFY_MODE": "two"}):
            self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "executed")

        payload = self.manifest()
        payload["steps"][0]["tools"] = [{"name": "python", "executable": "/bin/sh"}]
        self.write_manifest(payload)
        self.assertEqual(self.execute(reuse=True)["steps"][0]["disposition"], "executed")

    def test_kill_switch_prevents_cache_hit(self) -> None:
        self.write_manifest()
        self.execute()
        with patch.dict(os.environ, {"ORCHESTRATION_EVIDENCE_REUSE_DISABLED": "1"}):
            result = self.execute(reuse=True)
        self.assertEqual(result["steps"][0]["disposition"], "executed")

    def test_shadow_executes_and_records_would_hit(self) -> None:
        self.write_manifest()
        self.execute()
        result = self.execute(reuse=False, must_run=False, shadow=True)
        self.assertEqual(result["steps"][0]["disposition"], "executed")
        self.assertEqual(result["steps"][0]["cache_decision"], "would-hit")

    def test_required_step_set_is_exact_and_failures_are_aggregated(self) -> None:
        invalid = self.manifest()
        invalid["required_steps"] = ["unit", "missing"]
        self.write_manifest(invalid)
        with self.assertRaisesRegex(self.helper.EvidenceError, "required_steps"):
            self.execute()

        steps = []
        for step_id, marker in (("first", "a"), ("second", "b")):
            step = self.manifest()["steps"][0].copy()
            step.update({"id": step_id, "command": self.command(marker, fail=True)})
            step["cache"] = {"eligible": False, "reason": "independent failure fixture"}
            steps.append(step)
        self.write_manifest(self.manifest(steps=steps))
        report = self.execute()
        self.assertEqual(report["result"], "FAIL")
        self.assertEqual(
            [(step["id"], step["result"]) for step in report["steps"]],
            [("first", "failed"), ("second", "failed")],
        )

    def test_repository_release_required_step_set_is_unchanged(self) -> None:
        root = SCRIPT.parents[2]
        payload = json.loads(
            (root / ".codex/verification-manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(payload["required_steps"], ["type-check", "build", "test"])
        self.assertEqual(
            [step["command"] for step in payload["steps"]],
            ["pnpm type-check", "pnpm build", "pnpm test"],
        )
        declared = [path for step in payload["steps"] for path in step["inputs"]]
        self.assertFalse(
            any(
                path.startswith(".git/")
                or "acceptance-receipt" in path
                or "orchestration-evidence" in path
                for path in declared
            ),
            "manifest inputs must not depend on their own generated reports or receipts",
        )


if __name__ == "__main__":
    unittest.main()
