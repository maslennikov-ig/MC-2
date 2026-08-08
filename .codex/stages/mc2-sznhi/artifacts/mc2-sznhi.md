---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-sznhi/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage6-single-call-intro-retry
public_facade: validateIntroStructure-localized-teaser-detection
bounded_acceptance: every CONTENT_LABELS locale rejects explicit future-lesson teaser language without rejecting ordinary transitions
non_goals:
  - redesigning lesson prompts, retry policy, or post-processing
  - linguistic fuzzy matching beyond exact bounded teaser phrases
  - deploy, merge, push, live generation, paid calls, reindex, migration, secrets, or access changes
evidence:
  - acceptance-receipt
task_id: mc2-sznhi
epic_id: mc2-p2908
stage_id: mc2-sznhi
session_id: mc2-sznhi
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one localized Stage 6 guard transition owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: a50cef60f
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform Stage 6 intro guard, its caller, and focused unit tests
  - repository-local orchestration state
success_criteria:
  - all CONTENT_LABELS languages select an explicit locale pattern set
  - positive teaser cases cover at least three non-ru-en writing systems
  - normal same-lesson transitions remain accepted
  - existing en, ru, and exact next-lesson-title detection remain accepted behavior
  - focused backend unit tests, type-check, and build pass without live work
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
  - graphify-project
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
  - parser
  - user-flow
affected_surfaces:
  - backend
  - user-flow
invariants:
  - parsing
  - fallback
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the existing Stage 6 guard remains the owner; no stable entrypoint, public contract, or operator procedure changes
verification:
  - focused backend unit red-green via vitest.config.unit.ts: passed, 40 tests after 18 localized teaser cases failed against the old behavior
  - default backend bootstrap: not evidence until mc2-3sz3d because it can exit zero without running tests
  - pnpm run type-check: passed
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh via canonical stage closeout: passed
changed_files:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-intro-guard.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/nodes/generator/generator-intro-guard.test.ts
explicit_defers:
  - mc2-3sz3d - next task in exact spec order after Tier 1 closes
---

# Summary

The product implementation is committed at `bcb197989`. The teaser detector now selects an
exhaustive language-specific pattern set through the shared content-language contract. The
generator supplies its language on both initial and corrective validation passes.

# Scope / Routing

One root-owned Stage 6 guard slice. Locale selection comes from the shared language contract; no
external or versioned behavior is involved.

# Verification

The focused unit test failed 18 localized teaser cases against the old behavior and now passes all
40 positive, negative, title-match, and fallback cases through `vitest.config.unit.ts`. `pnpm run
type-check`, `pnpm run build`, and canonical process verification passed. The receipt is stored at
`.codex/stages/mc2-sznhi/acceptance-receipt.json`.

# Delivery / Cleanup

Root-owned implementation is accepted on local `develop`; no merge, push, or deploy was requested
at this boundary. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

Broad words such as “next” or their translations would reject normal same-lesson transitions. The
detector therefore requires an explicit localized lesson, section, or chapter phrase. The old
Russian patterns also relied on ASCII-only word boundaries; the localized map removes that hidden
failure.
