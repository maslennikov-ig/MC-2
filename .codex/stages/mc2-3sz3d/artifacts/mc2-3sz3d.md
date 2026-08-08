---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-3sz3d/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: backend-test-runner
public_facade: default-backend-vitest-exit-status
bounded_acceptance: backend bootstrap, cleanup, and zero-test paths cannot report success, with Qdrant skipped only by an exact explicit opt-out
non_goals:
  - changing the pinned Qdrant client/server compatibility contract or collection schema
  - running the live integration suite, live Qdrant mutations, reindex, migrations, or paid calls
  - deploy, merge, push, secrets, or access changes
evidence:
  - acceptance-receipt
task_id: mc2-3sz3d
epic_id: mc2-p2908
stage_id: mc2-3sz3d
session_id: mc2-3sz3d
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one test-runner integrity boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: d88dd3dbb
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform backend Vitest config, global setup/teardown, env example, and focused unit tests
  - repository-local orchestration state
success_criteria:
  - default backend config rejects an empty test result
  - setup and cleanup failures leave a nonzero process status
  - only SKIP_QDRANT_TEST_SETUP=1 bypasses Qdrant bootstrap and the bypass is visible
  - Qdrant bootstrap and worker startup remain strict defaults
  - focused unit tests, safe child-process proof, type-check, and build pass without live work
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - installed Vitest 4.1.8 runtime and type declarations
selected_skills:
  - orchestrator-stage
  - graphify-project
  - superpowers-systematic-debugging
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
risk_level: medium
risk_tags:
  - backend
  - state-transition
  - user-flow
affected_surfaces:
  - backend
invariants:
  - fallback
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: the explicit test-only opt-out will be documented beside Qdrant variables in the package env example
verification:
  - safe loopback reproduction before changes: setup failed and printed the misleading no-tests code-0 message, but final child status was 1; the historical configured-environment exit 0 was not rerun because collection bootstrap can mutate live Qdrant
  - focused backend unit red-green via vitest.config.unit.ts: passed, 21 tests after 8 checks failed against the old behavior
  - safe loopback child process after implementation: passed, Qdrant bootstrap failure reported code 1 and child exited 1 with no code-0 message
  - pnpm run type-check: passed
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh via canonical stage closeout: passed
changed_files:
  - packages/course-gen-platform/vitest.config.ts
  - packages/course-gen-platform/tests/global-setup.ts
  - packages/course-gen-platform/tests/unit/global-setup.test.ts
  - packages/course-gen-platform/tests/unit/vitest-config.test.ts
  - packages/course-gen-platform/.env.example
explicit_defers:
  - mc2-q1ggs - next item is an owner decision and stop boundary
---

# Summary

The implementation is committed at `f2eab74db`. The default backend config rejects zero collected
tests, setup/teardown logic is directly testable, cleanup failures force exit 1, and only
`SKIP_QDRANT_TEST_SETUP=1` skips the Qdrant precondition while retaining worker startup.

# Scope / Routing

One root-owned test-runner integrity slice. The installed Vitest 4.1.8 source is the authority for
versioned runner behavior; live services are outside the proof.

# Verification

The focused tests failed 8 checks against the old behavior and now pass 21/21 through
`vitest.config.unit.ts`. A safe loopback child process reports no-tests code 1 and exits 1 without
a code-0 message. `pnpm run type-check`, `pnpm run build`, and canonical process verification
passed. The receipt is stored at `.codex/stages/mc2-3sz3d/acceptance-receipt.json`.

# Delivery / Cleanup

Root-owned implementation is accepted on local `develop`; no merge, push, or deploy was requested
at this boundary. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

The exact historical live-config exit 0 remains accepted measured evidence but was not rerun. The
safe loopback baseline ended 1, so this stage does not claim the current live-config incident was
reproduced locally. Changing Qdrant compatibility or live state remains out of scope.
