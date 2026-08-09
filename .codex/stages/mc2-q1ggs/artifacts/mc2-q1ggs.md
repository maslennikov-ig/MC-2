---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-q1ggs/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: production-and-development-deploy-entrypoints
public_facade: shared-host-operation-lock-wrapper
bounded_acceptance: repository-declared deploy and rollback operations fail before mutation when another cooperating host operation holds the shared lock
non_goals:
  - creating accounts or changing sudoers, SSH keys, secrets, or access
  - enforcing the advisory lock against root commands that deliberately bypass the wrapper
  - deploy, production mutation, migration, reindex, or paid work
evidence:
  - acceptance-receipt
task_id: mc2-q1ggs
epic_id: n/a
stage_id: mc2-q1ggs
session_id: mc2-q1ggs
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one small concurrency boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 46e64e30c
worktree: /home/me/code/mc2
write_zone:
  - repository deployment and rollback shell entrypoints, focused contract tests, deployment docs, and local orchestration state
success_criteria:
  - all repository deploy and rollback entrypoints acquire one non-blocking host lock before mutation
  - a second operation exits nonzero and does not run its command
  - the lock is released when the owning process exits
  - CI ships the helper and helper changes trigger a deployment
  - focused tests, type-check, build, and canonical process verification pass locally
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - GitHub Actions concurrency documentation
  - util-linux flock manual
selected_skills:
  - orchestrator-stage
  - technical-premortem
  - superpowers-test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner uses the primary develop worktree; no child branch or worktree exists
risk_level: high
risk_tags:
  - concurrency
  - state-transition
  - rollback
affected_surfaces:
  - backend
invariants:
  - state-transition
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: deployment guidance will name the one supported wrapper for cooperating infrastructure work
verification:
  - focused shell contention red-green: passed after the wrapper-missing test failed against the old behavior
  - deploy contract tests: passed after helper-delivery and deploy-relevance checks failed against the old behavior
  - pnpm run type-check: passed
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - canonical process verification: passed through the stage closeout entrypoint
changed_files:
  - .claude/docs/deployment-guide.md
  - .github/workflows/ci-cd.yml
  - scripts/ci/detect_deploy_changes.sh
  - scripts/ci/test_ci_cd_workflow_gates.mjs
  - scripts/ci/test_detect_deploy_changes.sh
  - scripts/ci/test_host_operation_lock.sh
  - scripts/deploy.sh
  - scripts/deploy_blue_green.sh
  - scripts/deploy_dev.sh
  - scripts/lib/host-operation-lock.sh
  - scripts/rollback_blue_green.sh
  - scripts/with_host_operation_lock.sh
explicit_defers:
  - separate accounts and narrower sudoers remain deliberately out of scope until another persistent operator exists
---

# Summary

The owner-selected shared-lock implementation is committed at `beca7ef72`. Production, development,
rollback, and legacy deploy entrypoints now acquire the same fail-fast lock, while the generic
wrapper gives cooperating infrastructure commands the same boundary.

# Scope / Routing

One root-owned deployment concurrency slice. The lock is cooperative and repository-enforced; it
does not claim to constrain root commands that deliberately bypass the wrapper.

# Verification

The focused contention test first failed because the wrapper was absent. Deploy relevance and CI
delivery contract tests also failed against the old behavior. The implemented wrapper then blocked
the contending command and every real deploy/rollback entrypoint with exit 75, released after the
holder exited, and passed the deploy contract suite. Type-check, build, and canonical process
verification passed; the receipt is `.codex/stages/mc2-q1ggs/acceptance-receipt.json`.

# Delivery / Cleanup

The accepted product change is committed locally on `develop`. No child branch or worktree exists.
No push, deploy, access change, or production action was performed.

# Risks / Follow-ups / Explicit Defers

Separate identities and narrower sudoers are intentionally deferred. The lock is deliberately
cooperative: direct root commands can bypass it and remain outside the supported operating path.
