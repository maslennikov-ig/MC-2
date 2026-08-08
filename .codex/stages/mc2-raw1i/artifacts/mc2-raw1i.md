---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-raw1i/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage6-heuristic-filter
public_facade: HeuristicFilterResult.metrics.sectionCount-and-emptySections-failure
bounded_acceptance: intro-only lessons reach the existing critical emptySections guard while H2 sections retain an exact count
non_goals:
  - changing lesson generation prompts, section regeneration, or judge scoring beyond the existing guard
  - database work, reindex, migrations, deploy, live generation, or paid provider calls
  - other Tier 1 tasks from specs/026-post-triage-priorities/spec.md
evidence:
  - acceptance-receipt
task_id: mc2-raw1i
epic_id: mc2-p2908
stage_id: mc2-raw1i
session_id: mc2-raw1i
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one localized Stage 6 parsing-and-guard path owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 775582add
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform Stage 6 heuristic basic checks and focused unit tests
  - repository-local orchestration state
success_criteria:
  - intro-only and title-plus-intro content return sectionCount zero
  - the existing emptySections critical failure becomes reachable
  - real H2 content sections are counted exactly
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
cleanup_notes: root owner used the primary develop worktree; no child branch or worktree existed to clean
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
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the existing Stage 6 heuristic result remains the owner; no stable entrypoint, public contract, or operator procedure changed
verification:
  - focused unit red-green via vitest.config.unit.ts: passed, 3 tests after all 3 failed against the old behavior
  - default backend bootstrap: not evidence until mc2-3sz3d because it can exit zero without running tests
  - pnpm run type-check: passed
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh via canonical stage closeout: passed
changed_files:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/basic-checks.ts
  - packages/course-gen-platform/tests/integration/stage6/judge.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/judge/filters/section-count.test.ts
explicit_defers:
  - mc2-1ugj1 - next Tier 1 item, blocked on a live Supabase publication check
---

# Summary

The product implementation is committed at `0d551f046`. `checkContentDensity` now counts H2
content-section headers instead of non-empty fragments from `String.split()`, which makes the
existing critical `emptySections` branch reachable for intro-only lessons.

# Scope / Routing

One root-owned backend slice. The existing H2-based Stage 6 lesson structure is the acceptance
surface. No subagent, contract migration, database change, or live generation is needed.

# Verification

The focused unit test failed 3/3 against the old behavior and now passes 3/3 through
`vitest.config.unit.ts`. `pnpm run type-check`, `pnpm run build`, and canonical process verification
passed. The receipt is stored at `.codex/stages/mc2-raw1i/acceptance-receipt.json`.

# Delivery / Cleanup

Root-owned implementation is accepted on local `develop`; no merge, push, or deploy was requested
at this boundary. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

Counting every Markdown heading would treat the H1 lesson title and nested H3 headings as content
sections. The existing guard, generator metrics, and section parsers define H2 as the content
boundary, so the fix must count H2 only.
