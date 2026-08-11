---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-vr7ic/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: repository contributors committing local changes
public_facade: normal Husky pre-commit and canonical stage closeout commands
bounded_acceptance: focused temporary-git red-green tests plus the real staged pre-commit path
non_goals:
  - application behavior, dependency upgrades, remote delivery or deployment
evidence:
  - precommit-policy-red-green
  - closeout-marker-red-green
task_id: mc2-vr7ic
stage_id: mc2-vr7ic
session_id: mc2-vr7ic
milestone: local-commit-and-closeout-safety
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner controls the hook and closeout acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 95a1f2f46
worktree: /home/me/code/mc2
write_zone:
  - .husky/pre-commit
  - .lintstagedrc.mjs
  - scripts/precommit
  - scripts/orchestration/run_stage_closeout.py
  - scripts/orchestration/test_run_stage_closeout.py
  - .codex/stages/mc2-vr7ic
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: confirmed no delegated branch, worktree, runtime tail or generated task artifact exists to remove
risk_level: medium
risk_tags:
  - false-positive-quality-gate
  - staged-scope-loss
affected_surfaces:
  - tooling
  - orchestration
verification:
  - node pre-commit policy tests pass after an observed red state
  - python debt-marker tests pass after an observed red state
  - normal staged pre-commit path exits zero without broad staging
changed_files:
  - .husky/pre-commit
  - .lintstagedrc.mjs
  - scripts/precommit/staged-file-policy.mjs
  - scripts/precommit/format-tracked-goal-snapshots.mjs
  - scripts/precommit/test_precommit_policy.mjs
  - scripts/orchestration/run_stage_closeout.py
  - scripts/orchestration/test_run_stage_closeout.py
  - .codex/goals/mc2-vr7ic/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-vr7ic/stage-manifest.json
  - .codex/stages/mc2-vr7ic/summary.md
  - .codex/stages/mc2-vr7ic/artifacts/mc2-vr7ic.md
  - .beads/interactions.jsonl
explicit_defers:
  - mc2-p2908.1 remains the next independent version-sensitive build-warning stage
---

# Summary

The normal pre-commit path now handles canonical formatting-only source and deliberately tracked
ignored goal snapshots without weakening ESLint for semantic source changes. Closeout ignores debt
markers only in exact test-fixture paths.

# Verification

The focused Node and Python suites both demonstrated the old failures and now pass. The staged
repository set also passed `sh .husky/pre-commit`; the canonical stage close command is the final
root-owned acceptance boundary.

# Risks / Follow-ups

The formatting-only comparison deliberately falls back to ESLint whenever either Git read fails,
so new, renamed or ambiguous files fail safely. The unrelated Node build deprecation remains owned
by `mc2-p2908.1`.
