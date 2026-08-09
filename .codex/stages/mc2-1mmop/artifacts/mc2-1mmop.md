---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-1mmop/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: orchestration stage closeout
public_facade: scripts/orchestration/cleanup_stage_workspace.py
bounded_acceptance: preserve dirty and unmerged work while pruning exact safe cache candidates
non_goals:
  - deleting any real local cache during implementation
  - pruning remote branches or the primary worktree
  - cleaning root node_modules or arbitrary generated directories
evidence:
  - none
task_id: mc2-1mmop
epic_id: n/a
stage_id: mc2-1mmop
session_id: mc2-1mmop
milestone: safe-stage-workspace-cleanup
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner for a destructive-operation safety boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: e1857fadc
worktree: /home/me/code/mc2
write_zone:
  - stage cleanup script, its synthetic regression, CI/process contract, docs, stage and Beads state
success_criteria:
  - dry-run exposes only exact safe Next cache candidates
  - actual cleanup preserves dirty, unmerged, protected, and primary worktrees and caches
  - CI and durable closeout guidance enforce the regression and dry-run-first operation
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - .codex/repository-failure-modes.md
  - .codex/handoff.md
selected_skills:
  - orchestrator-stage
  - cleanup-audit
  - task-router
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner used the primary develop worktree; only synthetic temporary worktrees were removed
risk_level: high
risk_tags:
  - data
affected_surfaces:
  - data
invariants:
  - rollback
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: handoff and failure-mode guidance now require dry-run-first exact cleanup
verification:
  - baseline synthetic regression: failed because no Next cache candidate was reported
  - focused synthetic regression after fix: passed
  - canonical closeout receipt 2124fa538de8a696f93a93c1f1e695d59bee897f4ef87b00e6b8d71c72faa723: passed
changed_files:
  - scripts/orchestration/cleanup_stage_workspace.py
  - scripts/orchestration/test_cleanup_stage_workspace.py
  - scripts/orchestration/run_process_verification.sh
  - .github/workflows/ci-cd.yml
  - .codex/repository-failure-modes.md
  - .beads/interactions.jsonl
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-1mmop
explicit_defers:
  - none
---

# Summary

The stage cleanup command now treats generated cache deletion and child-worktree deletion as one
safety boundary. It reports and removes `packages/web/.next/cache` only inside an accepted, clean
child worktree whose branch is already merged into a configured delivery target.

# Scope / Routing

The implementation is limited to the repository-owned closeout helper, its synthetic Git-worktree
regression, CI/process contracts, and durable operator guidance. The primary worktree, remote
branches, root dependencies, and arbitrary generated paths are outside scope.

# Verification

The synthetic test creates clean merged, clean unmerged, and dirty merged worktrees. It proves the
dry-run exposes only the safe cache and the real temporary cleanup removes only the merged clean
worktree and local branch. Workspace acceptance is recorded by the canonical closeout receipt.

# Delivery / Cleanup

Accepted locally; commit delivery is pending. No delegated worktree exists. No real repository
cache was deleted; the cleanup test used a temporary repository that was removed automatically.

# Risks / Follow-ups / Explicit Defers

The script refuses symbolic-link cache paths and retains any worktree with uncertain branch or
cleanliness evidence. Such retained candidates intentionally make cleanup return nonzero for manual
review. No defer.
