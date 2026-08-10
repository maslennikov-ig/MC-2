from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("run_stage_closeout.py")
SPEC = importlib.util.spec_from_file_location("run_stage_closeout", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


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


if __name__ == "__main__":
    unittest.main()
