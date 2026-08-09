---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-n6szm/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: lint-staged and reindex unit tests
public_facade: reindex course embeddings unit test surface
bounded_acceptance: zero lint problems with all focused tests preserved
non_goals:
  - changing Qdrant reindex production behavior
  - changing repository lint rules
  - cleaning unrelated test-tree lint debt
evidence:
  - none
task_id: mc2-n6szm
epic_id: mc2-p2908
stage_id: mc2-n6szm
session_id: mc2-n6szm
milestone: reindex-test-lint-clean
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one root owner for a cohesive test-only refactor
repo: mc2
branch: develop
base_branch: develop
base_commit: 05d7fc7e7
worktree: /home/me/code/mc2
write_zone:
  - reindex course embeddings unit tests, shared fixtures, stage and Beads state
success_criteria:
  - affected test surface has zero ESLint errors and warnings
  - all 67 focused unit tests remain green after the split
  - workspace type-check and production build remain green
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - eslint.config.mjs
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
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: test-only file organization; production and operator docs remain current
verification:
  - baseline ESLint: 16 errors and 4 warnings
  - post-mock cleanup ESLint: zero errors and 2 size warnings
  - post-split ESLint: zero problems across all three affected files
  - focused Vitest: 2 files and 67 tests passed
  - canonical closeout receipt db29552b8802048ea01f6efcb779d1aeff8111ce3178696ba3dec6b46b25495e: passed
changed_files:
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.cli.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/reindex-course-embeddings.fixtures.ts
  - .beads/interactions.jsonl
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-n6szm
explicit_defers:
  - none
---

# Summary

The measured file had 16 `require-await` errors, two unsafe-argument warnings, and two size
warnings. Promise-returning mocks and precise ledger typing removed the rule violations; shared
fixtures and CLI coverage now live in bounded files, while the command tests are split into command
and recovery groups.

# Scope / Routing

The change is test-only and preserves the existing production module under test. The repository's
lint thresholds are enforced rather than disabled.

# Verification

ESLint reports zero problems across the original, fixture, and CLI files. Vitest reports both specs
and all 67 tests green. The canonical closeout also passed workspace type-check, production build,
and process verification.

# Delivery / Cleanup

Accepted locally; commit delivery is pending. No delegated worktree exists.

# Risks / Follow-ups / Explicit Defers

Moving tests can accidentally change registration; the exact 67-test count and both discovered
files are therefore part of acceptance. No defer.
