---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-68qwn/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: Q12 source capture and cutover verification
public_facade: Q12 PostgreSQL catalog equality boundary
bounded_acceptance: audit named set-operation surfaces and preserve composite identities longer than PostgreSQL NAMEDATALEN
non_goals:
  - changing already-safe Q12 SQL
  - running a production capture or migration
  - broadening Q12 catalog scope
evidence:
  - tracked-q12-name-text-audit
task_id: mc2-68qwn
epic_id: n/a
stage_id: mc2-68qwn
session_id: mc2-68qwn
milestone: q12-name-text-union-audit-and-regression
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: the audit and regression share one PostgreSQL type-resolution risk and one root acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 8a613f98f
worktree: /home/me/code/mc2
write_zone:
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts
  - docs/reports/code-review/2026-08/q12-name-text-union-audit.md
  - .codex/goals/mc2-68qwn
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-68qwn
success_criteria:
  - all named Q12 SQL surfaces have an evidence-backed audit result
  - all four composite source-manifest unions retain text type anchors
  - a real PostgreSQL 17.10 probe preserves a function identity longer than 63 bytes
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - deploy/postgres/q12-source-manifest.ts
  - deploy/qdrant/q12-structural-catalog.sql
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/postgres/restore-supabase-drill.sh
selected_skills:
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - generate-report-header
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
cleanup_notes: the disposable PostgreSQL container was removed by the test; no child worktree or delegated branch exists
risk_level: medium
risk_tags:
  - data-integrity
  - postgres
affected_surfaces:
  - backend
  - operations
invariants:
  - test-matrix
  - serialization
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: the tracked audit records the exact inspected surfaces, evidence, and no-change conclusions
verification:
  - red PostgreSQL regression before test seam: failed as expected because catalogSql was not exported
  - default source-manifest text-anchor test: passed, 1 test with 37 opt-in tests skipped
  - real PostgreSQL 17.10 long-identity regression: passed, 1 test with 37 unrelated tests skipped
  - adjacent source-manifest tests with TMPDIR=/tmp: passed, 6 tests
  - focused Prettier: passed
  - focused ESLint: passed with 5 pre-existing warnings and no errors
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61451 nodes and 7327 communities
changed_files:
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts
  - docs/reports/code-review/2026-08/q12-name-text-union-audit.md
  - .beads/interactions.jsonl
  - .codex/goals/mc2-68qwn/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-68qwn
explicit_defers:
  - mc2-r7udy - truthful worker lifecycle telemetry requires a forbidden schema migration
---

# Summary

The requested audit found no additional name-versus-text truncation hazard. The source manifest is
the only named surface with composite identities in set operations, and its repaired text anchors
remain correct. Sibling capture and restore surfaces contain no unions; barrier unions either
compare bounded identifiers as `name` on both sides or cast actual values to `text`.

# Verification

A default structural test locks all four source-manifest text anchors. A separate disposable
PostgreSQL 17.10 probe executes the production SQL and preserves a function identity longer than 63
bytes in owners, ACLs, and comments. The complete evidence is in the tracked audit report.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. The disposable container was removed automatically.

# Risks / Follow-ups

No additional Q12 fix is justified by this audit. `mc2-r7udy` remains separately blocked on the
schema-migration boundary and is not part of this stage.
