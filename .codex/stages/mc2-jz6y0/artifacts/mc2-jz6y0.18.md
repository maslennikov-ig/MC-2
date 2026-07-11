---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.18
stage_id: mc2-jz6y0
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Canonical cross-package contracts, tenant RLS, immutable records, append-only chains, and rollback correctness are high-risk data-integrity work.
repo: /home/me/code/mc2
branch: codex/document-evidence-e1
base_branch: codex/self-hosted-qdrant-platform
base_commit: cd6f0984c25709d967fd866cbf7ec2e0901fee9a
worktree: /home/me/code/mc2/.worktrees/document-evidence-e1
write_zone:
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/src/clarifying-questions.ts
  - packages/shared-types/src/analysis-schemas.ts
  - packages/shared-types/src/index.ts
  - packages/shared-types/tests/document-evidence.test.ts
  - packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-rls.test.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/repository.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md
success_criteria:
  - Canonical Zod schemas cover source refs, claims, cards, conflicts, decisions, run summaries, coverage, authority, processing modes, and compact analysis snapshots.
  - Durable runs/items/conflicts/decisions preserve exact coverage, idempotency, tenant isolation, conflict immutability, and append-only decision chains.
  - Focused shared, repository, migration/RLS, type-check, and formatting gates pass or have an exact environment blocker.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E1 lines 43-86 of docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - repository-local Supabase migration, RLS, immutable-table, RPC, and persistence patterns
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/receiving-code-review/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-architect/SKILL.md
selected_agents:
  - db_migration_specialist
  - backend_developer
catalog_candidates:
  - none - assigned installed skills and local first-party patterns fully covered E1
parallel_group: E1-contracts-persistence
depends_on_streams:
  - none
parallel_decision: parallel with the orchestrator's disjoint Q6 stream; E1 itself is sequential because repository behavior depends on the canonical contracts and migration invariants
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Integration merge 528fdfc2 passed focused, applied PostgreSQL, type-check, artifact, and process gates; the disposable database container, dedicated worktree, and local branch were removed. The remote evidence branch remains.
risk_level: high
docs_impact: migration
docs_reviewed: no-change-needed
docs_review_notes: The approved design and E1 plan already document the durable contract and persistence behavior; no additional project documentation was inside this worker's strict write zone.
graph_reviewed: used
graph_review_notes: Read /home/me/code/mc2/graphify-out/GRAPH_REPORT.md and ran a focused query for clarifying schemas, analysis contracts, RLS, immutability, and Stage 4 repositories; no graph refresh per assigned worker contract.
verification:
  - Orchestrator integration merge 528fdfc2: shared contracts 11/11, repository 11/11, applied PostgreSQL 15.18 9/9, both package type-checks, artifact validation, and scripts/orchestration/run_process_verification.sh passed; remote integration SHA matched local HEAD.
  - Final independent review on bc439c63: findings none; Spec PASS; Quality APPROVED. The reviewer confirmed all five prior findings are closed and identified only the bounded residual that full automatic conflict workflow belongs to E3.
  - shared contracts RED type-check: failed with 8 expected missing-schema/union/analysis-field diagnostics
  - original plan-path test discovery: blocked because package Vitest includes tests/**/*.test.ts while the plan named src/__tests__; orchestrator authorized one canonical test under packages/shared-types/tests
  - shared contracts GREEN direct gate before review: passed 9 of 9 tests
  - repository RED: failed because the repository module did not exist
  - migration/RLS RED: failed 6 of 6 checks because migration and rollback did not exist
  - conflict provenance RED then GREEN: failed 1 of 6, then passed 6 of 6 repository tests
  - auto-answer rollback/error semantics RED then GREEN: failed 2 of 6, then passed 6 of 6 migration/RLS checks
  - independent review verdict on 31bb2733: Spec FAIL and Quality CHANGES_REQUIRED because the migration test was regex-only, runs lacked exact source IDs, source deletion cascaded evidence, failure summaries were dishonest, and audit equivalence was one-way
  - review fix RED shared contracts: failed 3 of 10 tests on missing-summary handling, iff audit semantics, and absent source_document_ids
  - review fix RED repository: failed 4 of 10 tests on normalized source sets/counts, race mismatch reuse, summary omission, and user/system audit mismatch
  - review fix RED applied migration: failed 4 of 8 tests; the real PostgreSQL failure was column source_document_ids does not exist
  - pnpm --filter @megacampus/shared-types test -- document-evidence: passed 10 of 10 tests
  - pnpm --filter @megacampus/shared-types type-check: passed
  - pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/repository.test.ts: passed 10 of 10 tests after loading the existing local unit-test env without printing values
  - migration/RLS suite without DOCUMENT_EVIDENCE_DATABASE_URL: passed 7 static tests with the applied test explicitly skipped
  - migration/RLS suite with DOCUMENT_EVIDENCE_DATABASE_URL against disposable PostgreSQL 15.18: passed 8 of 8 tests including real apply, RLS/service access, exact-set RPC, immutability, chain constraints, source deletion survival, and rollback
  - second independent review verdict on 8a48c7ed: Spec FAIL and Quality CHANGES_REQUIRED because authenticated direct writes could corrupt coverage, source deletion before first persistence was unhandled, the applied URL lacked a destructive-test guard, the tenant matrix was incomplete, and system decisions could supersede user decisions
  - second review RED shared contracts: failed 3 of 11 tests on the absent source manifest and invalid system supersede semantics
  - second review RED repository: failed 6 of 11 tests on old source IDs/direct table writes, missing guarded conflict/decision RPCs, and invalid system supersede acceptance
  - second review RED migration/safety: failed 6 of 9 tests on absent manifest/guarded RPC/terminal/rollback invariants, authenticated write grants, and the missing URL guard; the applied block was intentionally skipped during RED
  - second review GREEN shared contracts: passed 11 of 11 tests
  - second review GREEN repository: passed 11 of 11 tests
  - second review GREEN migration/safety without URL: passed 8 static/safety tests with the applied block explicitly skipped
  - second review GREEN applied PostgreSQL 15.18 on loopback document_evidence_test: passed 9 of 9 tests, including snapshot-before-delete persistence, authenticated A/B read isolation and direct-write denial, own/cross-tenant RPC checks, service access, terminal immutability, decision override direction, and rollback
  - pnpm exec supabase --version: passed and reported 2.106.0; no Supabase stack was needed or started because the applied harness uses direct pg against a disposable PostgreSQL database
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - targeted Prettier check: passed
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md: passed
changed_files:
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/src/clarifying-questions.ts
  - packages/shared-types/src/analysis-schemas.ts
  - packages/shared-types/src/index.ts
  - packages/shared-types/tests/document-evidence.test.ts
  - packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-rls.test.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/repository.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md
explicit_defers:
  - none
---

# Summary

Added canonical evidence schemas and the compact optional `analysis_result.document_evidence` snapshot, while keeping full cards/conflicts/decision history in durable tables. Runs now persist an immutable normalized source manifest containing document ID, version hash, and display name; item persistence compares source/item sets bidirectionally and no longer depends on a live `file_catalog` row. Authenticated callers have tenant-scoped reads plus guarded RPCs instead of direct table writes, terminal runs/items are immutable, degraded/failed cards may honestly omit summaries, and only user events may supersede an existing decision. The migration and rollback are exercised on a loopback `_test` database behind a destructive-test URL guard.

# Scope / Routing

The worker stayed in the assigned isolated branch/worktree and strict E1 write zone, with the orchestrator-authorized correction that moved the single shared-types test from the non-discoverable plan path `src/__tests__` to the package's canonical `tests/` directory. Local approved design/plan and existing first-party repository patterns were sufficient; no external dependency documentation or catalog promotion was needed.

# Verification

TDD evidence includes the initial implementation cycles and both independent-review fix cycles above. Current focused GREEN totals are 11 shared contract tests, 11 repository tests, and 9 migration/RLS/safety tests. The applied harness refuses non-loopback or non-`_test` URLs before connecting or resetting schemas, then creates minimal PostgreSQL prerequisites and auth helpers, applies the real migration, executes the two-tenant and terminal-integrity matrix, applies rollback, verifies evidence objects are gone and prior automatic-answer semantics are restored, and resets only the disposable test database.

# Delivery / Cleanup

Delivery was integrated as merge `528fdfc2` after fresh root gates and independent Spec PASS / Quality APPROVED. Post-integration verification passed; the disposable PostgreSQL container, dedicated worktree, and local branch were removed, while the remote evidence branch remains as review evidence.

# Risks / Follow-ups / Explicit Defers

- Material finding: the plan's original shared test path was excluded by package Vitest configuration; the orchestrator authorized the canonical `packages/shared-types/tests/document-evidence.test.ts` path. Promote to: none (captured in this artifact and corrected locally).
- Material finding: the first implementation incorrectly reported the CLI as absent; `pnpm exec supabase --version` resolves 2.106.0. The actual missing component was a running local stack. The review fix uses direct `pg` with an explicit disposable PostgreSQL URL and now provides applied behavior evidence. Promote to: none (artifact truth corrected and applied gate added).
- Material finding: the first applied harness accepted an arbitrary database URL and reset shared schemas. It now rejects non-loopback hosts and database names not ending in `_test` before connection/reset. Promote to: none (guard and negative tests are in scope).
- Material finding: the second worker turn produced the RED tests/contracts/repository changes but stalled before production SQL. The orchestrator stopped the worker and completed the narrow migration/rollback GREEN patch in the same isolated worktree. Promote to: none (ownership remained isolated and all edits are independently reviewed before acceptance).
- No source JSON bodies are logged by the repository or migration. Repository errors expose only operation and database code.
- No Graphify refresh, generated database type update, live database action, deployment, Beads closure, or integration was performed.
