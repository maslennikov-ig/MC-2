---
task_id: <task-id>
stage_id: <stage-id>
repo: <repo-or-n/a>
branch: <branch>
base_branch: <base-branch>
base_commit: <base-commit-or-unknown>
worktree: <absolute-path-or-unknown>
status: <returned|accepted|merged|blocked>
verification:
  - <command>: <passed|failed|blocked>
changed_files:
  - <path>
---

# Summary

Short outcome summary.

# Verification

List the commands that were actually run and the result.

# Risks / Follow-ups / Explicit Defers

List residual risks, blockers, explicit next steps, and any justified defer.
Do not leave silent technical debt behind this artifact.
