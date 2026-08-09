#!/usr/bin/env python3
"""Regression tests for safe stage-workspace and Next cache cleanup."""

from __future__ import annotations

import pathlib
import subprocess
import tempfile
import textwrap
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CLEANUP_SCRIPT = REPO_ROOT / "scripts" / "orchestration" / "cleanup_stage_workspace.py"


def run(
    command: list[str],
    cwd: pathlib.Path,
    *,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=check)


class CleanupStageWorkspaceTest(unittest.TestCase):
    def test_cleans_only_delivered_clean_worktree_and_reports_next_cache(self) -> None:
        with tempfile.TemporaryDirectory(prefix="mc2-cleanup-stage-") as raw_root:
            root = pathlib.Path(raw_root) / "repo"
            root.mkdir()
            run(["git", "init", "--initial-branch=develop"], root)
            run(["git", "config", "user.email", "test@example.invalid"], root)
            run(["git", "config", "user.name", "Cleanup Test"], root)
            (root / ".codex" / "stages" / "cleanup-test" / "artifacts").mkdir(parents=True)
            (root / ".codex" / "orchestrator.toml").write_text(
                textwrap.dedent(
                    """
                    [delivery]
                    primary_branch = "master"
                    dev_branch = "develop"
                    staging_branch = "master"
                    protected_branches = ["develop", "master"]
                    """
                ).strip()
                + "\n"
            )
            (root / "tracked.txt").write_text("base\n")
            (root / ".gitignore").write_text("packages/web/.next/\n")
            run(
                ["git", "add", ".codex/orchestrator.toml", ".gitignore", "tracked.txt"],
                root,
            )
            run(["git", "commit", "-m", "test: initialize cleanup fixture"], root)

            delivered = self._add_worktree(root, "delivered", "delivered change\n")
            run(["git", "merge", "--no-ff", "delivered", "-m", "test: merge delivered"], root)

            unmerged = self._add_worktree(root, "unmerged", "unmerged change\n")

            dirty = self._add_worktree(root, "dirty", "dirty committed change\n")
            run(["git", "merge", "--no-ff", "dirty", "-m", "test: merge dirty"], root)
            (dirty / "tracked.txt").write_text("dirty working tree\n")

            artifacts = root / ".codex" / "stages" / "cleanup-test" / "artifacts"
            for task_id, branch, worktree in (
                ("task-delivered", "delivered", delivered),
                ("task-unmerged", "unmerged", unmerged),
                ("task-dirty", "dirty", dirty),
            ):
                cache = worktree / "packages" / "web" / ".next" / "cache" / "webpack"
                cache.mkdir(parents=True)
                (cache / "fixture.bin").write_bytes(b"cache")
                (artifacts / f"{task_id}.md").write_text(
                    textwrap.dedent(
                        f"""
                        ---
                        status: accepted
                        accepted_by_orchestrator: yes
                        task_id: {task_id}
                        repo: {root.name}
                        worktree: {worktree}
                        branch: {branch}
                        base_branch: develop
                        delivery_method: merge
                        ---
                        """
                    ).lstrip()
                )

            dry_run = run(
                ["python3", str(CLEANUP_SCRIPT), "--stage", "cleanup-test", "--dry-run"],
                root,
                check=False,
            )
            self.assertEqual(dry_run.returncode, 1, dry_run.stdout + dry_run.stderr)
            self.assertIn(
                f"next cache candidate: {delivered / 'packages/web/.next/cache'}",
                dry_run.stdout,
                dry_run.stdout + dry_run.stderr,
            )
            self.assertNotIn(
                f"next cache candidate: {unmerged / 'packages/web/.next/cache'}",
                dry_run.stdout,
            )
            self.assertNotIn(
                f"next cache candidate: {dirty / 'packages/web/.next/cache'}",
                dry_run.stdout,
            )

            cleanup = run(
                ["python3", str(CLEANUP_SCRIPT), "--stage", "cleanup-test"],
                root,
                check=False,
            )
            self.assertEqual(cleanup.returncode, 1, cleanup.stdout + cleanup.stderr)
            self.assertFalse(delivered.exists())
            self.assertTrue(unmerged.exists())
            self.assertTrue(dirty.exists())
            self.assertFalse(self._branch_exists(root, "delivered"))
            self.assertTrue(self._branch_exists(root, "unmerged"))
            self.assertTrue(self._branch_exists(root, "dirty"))
            self.assertTrue((unmerged / "packages/web/.next/cache/webpack/fixture.bin").is_file())
            self.assertTrue((dirty / "packages/web/.next/cache/webpack/fixture.bin").is_file())

    @staticmethod
    def _add_worktree(root: pathlib.Path, branch: str, contents: str) -> pathlib.Path:
        worktree = root.parent / f"worktree-{branch}"
        run(["git", "worktree", "add", "-b", branch, str(worktree), "develop"], root)
        (worktree / "tracked.txt").write_text(contents)
        run(["git", "add", "tracked.txt"], worktree)
        run(["git", "commit", "-m", f"test: add {branch}"], worktree)
        return worktree

    @staticmethod
    def _branch_exists(root: pathlib.Path, branch: str) -> bool:
        return (
            run(
                ["git", "show-ref", "--verify", f"refs/heads/{branch}"],
                root,
                check=False,
            ).returncode
            == 0
        )


if __name__ == "__main__":
    unittest.main()
