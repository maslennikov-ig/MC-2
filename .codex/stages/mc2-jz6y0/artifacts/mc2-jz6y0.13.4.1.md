---
schema_version: orchestration-artifact/v1
artifact_type: integration-acceptance
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: root_orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source recovery joins crash-durable filesystem publication, tenant CAS, accepted evidence, reindex parity, rollback, and isolated runtime boundaries
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 25397d4cfc2af98a0cd84f56f26ae8fff056b2f5
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - accepted source-recovery implementation, review, tests, runtime, docs, and stage artifacts
success_criteria:
  - exact 42 no-replace copies recover 125 logical rows from the reviewed 261-row source truth
  - six eligible failures and eighteen retained-derived-only dispositions are durable and tenant scoped
  - accepted Stage 4 ledgers join through the concrete adapter into a gap-free 234+6 reindex plan
  - crash resume, inode-guarded rollback, runtime isolation, and zero owned residue are independently reviewed
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:subagent-driven-development
  - superpowers:test-driven-development
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - source recovery workers
  - deploy_specialist
  - correctness_reviewer
catalog_candidates:
  - none - installed specialists and accepted repository contracts covered every stream
parallel_decision: core preceded workflow/evidence/reindex; runtime, adapters, and crash matrix used isolated streams; exact-count Task 6 joined them sequentially
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: all accepted .13.4.1 implementation/review worktrees and local branches are removed; pushed evidence branches remain; integration branch is retained for Q12
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: runbooks now distinguish locally accepted recovery implementation from the still-unexecuted authorized staging copy/disposition/reindex window
graph_reviewed: pending
graph_review_notes: final integration Graphify refresh belongs to the Q12 local closeout after all durable docs are committed
verification:
  - accepted core/workflow/reindex/evidence/adapters/runtime/crash reviews each ended P0-P3 zero
  - fresh Task 6 focused acceptance passed 3/3
  - fresh integrated recovery/crash/reindex matrix passed 456/456 across nine files
  - fresh course-gen-platform type-check, focused Prettier, diff, artifact, and process verification passed
changed_files:
  - source-recovery implementation, runtime, tests, reviews, operations docs, and stage artifacts recorded by child artifacts
explicit_defers:
  - no local implementation defer; real 42-copy execution remains inside authorized Q12 and requires the current verify-full database URL plus truthful backup gate
---

# Summary

The reviewed local operator is complete. It plans from protected catalog truth,
publishes exactly 42 canonical files without replacement, restores 125 logical
rows, applies six eligible and eighteen retained-derived-only dispositions,
binds accepted Stage 4 failed-card ledgers through the concrete reindex adapter,
and proves `234 recoverable + 6 audited failed = 240 eligible` without an
allow-gaps path.

# Verification

The disposable Task 6 fixture stops after physical publication 17 but before
journal checkpoint 17, resumes with the inode unchanged and exactly 42 total
publish calls, rejects cross-tenant CAS drift without partial state, protects a
replacement inode during rollback, and proves all owned temporary classes and
directories clean before fixture teardown. The final independent rereview is
P0/P1/P2/P3 `0/0/0/0`. Fresh integration independently repeated 3/3 focused,
456/456 joined recovery/reindex, package type-check, artifact validation, and
process verification.

# Risks / Follow-ups

This acceptance is local evidence, not a claim that staging files were copied.
No server source, database, Qdrant, Redis, queue, service, secret, or runtime was
mutated by Task 6. Authorized staging execution remains atomic and fail-closed
on the current Session pooler URL, fresh restore-validated database backup, and
the complete Q12 activation window.
