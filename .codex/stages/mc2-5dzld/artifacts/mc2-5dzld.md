---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-5dzld/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: web type-check and monorepo build
public_facade: pnpm --filter @megacampus/course-gen-platform build:types
bounded_acceptance: deterministic declaration rebuild with stale incremental metadata
non_goals:
  - changing runtime application behavior
  - removing TypeScript incremental metadata globally
  - refactoring package references
evidence:
  - none
task_id: mc2-5dzld
epic_id: mc2-p2908
stage_id: mc2-5dzld
session_id: mc2-5dzld
milestone: deterministic-declaration-rebuild
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner for a narrow package build contract
repo: mc2
branch: develop
base_branch: develop
base_commit: 242f351fdf80d95abfd4fc392bec977e33384adb
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform package script and README, focused CI contract, stage and Beads state
success_criteria:
  - stale tsbuildinfo cannot suppress declarations after dist cleanup
  - repeated build, workspace type-check, and production build remain green
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/course-gen-platform/README.md
selected_skills:
  - orchestrator-stage
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
cleanup_notes: root owner used the primary develop worktree; no child worktree exists
risk_level: medium
risk_tags:
  - compatibility
affected_surfaces:
  - tooling
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: backend README documents forced declaration rebuild semantics
verification:
  - stale-dist reproducer before fix: exit 0 with admin/users.d.ts missing
  - focused real-command contract before fix: failed on missing admin/users.d.ts
  - focused real-command contract after fix: passed including repeated invocation
  - canonical closeout receipt 9cc2847e6e8215b78ceac8ffb27370281442f500d3573a130d311b015ac631e3: passed
changed_files:
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/README.md
  - scripts/ci/test_course_gen_types_rebuild.sh
  - .github/workflows/ci-cd.yml
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-5dzld
explicit_defers:
  - none
---

# Summary

The current declaration-only command was proved to exit zero without recreating a required `.d.ts`
when `dist` was absent and `tsconfig.tsbuildinfo` remained. The focused contract now exercises the
real package command, and the command uses forced TypeScript build mode so outputs are authoritative.

# Scope / Routing

The change is limited to the existing build facade, its CI regression contract, stable package
documentation, and root-owned stage state. Runtime code and package-reference topology are unchanged.

# Verification

The test failed before the package command changed, then passed after the one-line build-mode fix,
including stale-cache recovery and a normal repeated invocation. The canonical closeout then passed
the workflow contract, focused regression, workspace type-check, production build, and process
verification.

# Delivery / Cleanup

Accepted locally; commit delivery is pending. No delegated worktree exists.

# Risks / Follow-ups / Explicit Defers

The forced build trades a small amount of local compile time for deterministic output. No defer.
