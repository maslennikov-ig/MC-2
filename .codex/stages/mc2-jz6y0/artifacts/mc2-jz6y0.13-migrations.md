---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.1
stage_id: mc2-jz6y0
agent_type: migration-worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Security-sensitive PostgreSQL migration apply/rollback, history parity, and recovery require exact cross-file reasoning.
repo: mc2
branch: codex/q12-migrations
base_branch: codex/self-hosted-qdrant-platform
base_commit: f9389b69e3b4a48bf9cfc6868ff1ef432e32027e
worktree: /home/me/code/mc2/.worktrees/q12-migrations
write_zone:
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-migrations.md
success_criteria:
  - Apply and reverse exactly the approved 20260711120000, 20260711130000, and 20260711140000 migrations.
  - Fail closed on source drift, unsupported targets/history, remote use without exact gates, and history/live divergence.
  - Prove idempotent apply/rollback, deterministic recovery, and credential-safe failures on disposable local PostgreSQL.
selected_docs:
  - packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts
  - packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql
  - packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql
  - packages/course-gen-platform/supabase/migrations/20260711140000_document_conflict_side_identity.sql
  - matching rollback migrations and existing applied PostgreSQL integration tests
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - correctness/security migration worker
catalog_candidates:
  - none because the installed skills and accepted repo migration pattern cover the bounded stream
parallel_group: Q12-M alongside disjoint Q12 CI/deployment streams
depends_on_streams:
  - accepted E1-E7 migrations and local evidence verification
parallel_decision: parallel in a dedicated worktree with a strict migration-only write zone
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Worker dependency symlinks and disposable PostgreSQL container are removed before handoff; worktree remains for orchestrator review and merge.
risk_level: high
docs_impact: migration
docs_reviewed: no-change-needed
docs_review_notes: Public operator/deployment prose belongs to the separate Q12 docs/deploy stream; this change adds self-describing package commands and a tracked security evidence artifact.
graph_reviewed: blocked
graph_review_notes: The isolated child does not own the parent graphify-out refresh; parent must refresh after integration. The implementation followed the already accepted runner and exact migration files rather than introducing a new architecture.
verification:
  - TDD RED: focused Vitest failed because document-evidence-approved runner did not exist.
  - Initial implementation gate: focused PostgreSQL 16 suite passed 8/8 against disposable loopback mc2_q12_migrations_test.
  - Independent review 47b7623e returned 3 P1 findings for repository frontier, downstream rollback order, and shallow security verification.
  - Remediation RED: 6/14 tests failed for earlier pending/unknown/gapped/later history, downstream 150/151 rollback, policy drift, RPC/grant drift, and exact catalog drift.
  - Final remediation PostgreSQL 16 gate: 16/16 passed, including historyless downstream live residue and post-rollback introduced-object residue.
  - Recovery coverage: apply, reuse, reverse rollback, rollback reuse, reapply, live/history mismatch refusal, and exact-live missing-history recovery passed.
  - Frontier coverage: fixed 223-file repository manifest, exact prior history, approved 120/130/140/150/151 prefix, unknown/gap/tail refusal, and downstream history/live rollback refusal passed.
  - Security coverage: exact normalized tables, columns, constraints, indexes, triggers, RLS enable/force, policies, table ACLs, function signatures/bodies/security/search_path, and function ACLs passed tamper regressions.
  - Remote coverage: PostgreSQL-only, disabled-by-default remote, exact direction confirmation, verify-full, fixed SHA-256 source allowlist, and credential-safe CLI failure passed.
  - Package TypeScript gate: shared-logger build, shared-types forced build, shared-utils build, and course-gen-platform tsc --noEmit passed.
  - Prettier check and git diff --check passed.
  - Disposable PostgreSQL container mc2-q12-migrations-test removed after verification.
changed_files:
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-migrations.md
explicit_defers:
  - Independent correctness/security review, integration rerun, Beads close, Graphify refresh, and stage closeout remain orchestrator-owned.
  - No remote database, Supabase, staging, production, deploy, service, secret, or CI state was read or mutated.
---

# Summary

Added a dedicated runner for the three approved document-evidence migrations. It loads only fixed SHA-256 allowlisted SQL, uses the Supabase CLI v2.106.0-compatible statement split already established in the repository, requires the supported `supabase_migrations.schema_migrations` shape, and records exact `name` plus `statements[]` history rows. The remediation pins the sorted 223-file repository migration inventory and accepts only exact prior history followed by a contiguous prefix of 120/130/140/150/151; pending earlier files, unknown rows, gaps, and later tails fail before mutation.

Apply runs in ascending order and rollback in descending order under one PostgreSQL advisory lock. Each migration is transactional and independently recoverable: exact history plus exact live state is reused; exact live state without its history row is repaired; history/live drift, partial residue, a non-prefix history topology, or altered history fails before further mutation. Base rollback refuses while either 150/151 history or their live index/totals/RPC remains.

Live checks now hash normalized PostgreSQL catalog evidence for every allowed cumulative forward and rollback state. The manifest includes all owned tables and columns, constraints and definitions, indexes and definitions, triggers and enablement, RLS enable/force flags, exact policies/roles/commands/qualifiers, table ACLs, relevant function signatures/results/languages/body hashes/security-definer/search-path configuration, and non-owner execute ACLs. Missing or altered policy, RPC security, execute grant, constraint, trigger, index, or rollback residue fails closed.

Remote execution remains disabled by default. A remote target requires PostgreSQL, `sslmode=verify-full`, `--allow-remote`, and the exact order-sensitive direction confirmation. CLI output contains only the direction and bounded result; a child-process test proves a URL password is absent from fail-closed stderr. No remote target was contacted.

# Verification

The initial focused test failed at module resolution because the runner did not exist. After implementation, the static suite passed source digests, statement loading, target gates, confirmations, and credential-safe CLI errors. Independent review commit `47b7623e` then reproduced all three P1 gaps. Six new regression groups failed before remediation and passed afterwards.

An isolated `postgres:16-alpine` container on loopback port 55432 ran all sixteen tests. In addition to the original apply/reuse/rollback/reapply and recovery paths, the suite now rejects an earlier pending repository migration, unknown history, a chain gap, a later tail, 150/151 history or historyless live residue during base rollback, dropped RLS policy, changed RPC security, revoked execute grant, altered same-name constraint/index, disabled trigger, and an introduced function left after rollback.

The package TypeScript sequence passed after building the three required shared packages. Prettier and diff whitespace checks are green. The artifact validator is run immediately before commit.

# Risks / Follow-ups

The runner deliberately refuses unknown migration inventory or source changes even when SQL remains syntactically valid; an intentional migration addition or SQL edit therefore requires a reviewed manifest/source digest update. PostgreSQL catalog formatting is normalized before hashing, while function bodies use exact normalized body hashes. The approved forward files, rollback files, repository filenames, and allowed forward/rollback catalog states form one reviewed activation unit.

The parent orchestrator must perform independent correctness/security review, integrate the branch, rerun the focused database gate, refresh Graphify in the integration workspace, and update Q12 activation documentation. This stream grants no authority for a remote database connection or deployment.
