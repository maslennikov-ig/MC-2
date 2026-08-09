---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-zt4ju/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: local Playwright and compiled backend startup
public_facade: pnpm --filter @megacampus/course-gen-platform start
bounded_acceptance: compiled API loads without Node 24 extensionless-import failure
non_goals:
  - rewriting all relative imports with explicit file extensions
  - changing worker start commands
  - running live E2E or paid services
evidence:
  - none
task_id: mc2-zt4ju
epic_id: mc2-p2908
stage_id: mc2-zt4ju
session_id: mc2-zt4ju
milestone: node24-compiled-api-start
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner for a narrow package runtime contract
repo: mc2
branch: develop
base_branch: develop
base_commit: 858e4a707
worktree: /home/me/code/mc2
write_zone:
  - course-gen package start facade, focused CI contract, usage docs, stage and Beads state
success_criteria:
  - compiled API start has no extensionless-import ERR_MODULE_NOT_FOUND under Node 24
  - isolated real-command proof reaches a known missing-configuration boundary
  - workspace type-check and production build remain green
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/course-gen-platform/README.md
  - https://nodejs.org/api/esm.html#mandatory-file-extensions
selected_skills:
  - orchestrator-stage
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
docs_review_notes: README and entrypoint usage document the supported compiled start path
verification:
  - native pnpm start before fix: ERR_MODULE_NOT_FOUND for dist/shared/supabase/admin
  - focused isolated start contract before fix: failed on ERR_MODULE_NOT_FOUND
  - focused isolated start contract after fix: passed at known missing-configuration boundary
  - canonical closeout receipt 7a45b5a92136098a6aaf1cc45701a90b8a110df435825b251a406650747102c4: passed
changed_files:
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/README.md
  - packages/course-gen-platform/src/server/index.ts
  - scripts/ci/test_course_gen_start_runtime.sh
  - .github/workflows/ci-cd.yml
  - .beads/interactions.jsonl
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-zt4ju
explicit_defers:
  - none
---

# Summary

Native Node 24 was proved to reject the compiled server's extensionless relative imports. The
package start facade now uses the same pinned `tsx` runtime as local development and the production
container, while a safe CI contract proves resolution without loading real environment values.

# Scope / Routing

The change is limited to the existing API start command, its CI regression contract, stable usage
documentation, and root-owned stage state. Worker commands and the application module graph are
unchanged.

# Verification

The focused contract failed before the package command changed, then passed after the one-line
runtime alignment by reaching an expected missing-configuration boundary with repository `.env`
loading disabled. The canonical closeout then passed the workflow contract, workspace type-check,
fresh production build, focused built-runtime proof, and process verification.

# Delivery / Cleanup

Accepted locally; commit delivery is pending. No delegated worktree exists.

# Risks / Follow-ups / Explicit Defers

The package retains its existing extensionless import graph; `tsx` is therefore part of the start
contract, as it already is in the production image. No defer.
