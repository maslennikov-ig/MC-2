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
  - Focused PostgreSQL 16 gate: 8/8 passed against disposable loopback mc2_q12_migrations_test.
  - Recovery coverage: apply, reuse, reverse rollback, rollback reuse, reapply, live/history mismatch refusal, and exact-live missing-history recovery passed.
  - Remote/security coverage: PostgreSQL-only, disabled-by-default remote, exact direction confirmation, verify-full, fixed SHA-256 allowlist, and credential-safe CLI failure passed.
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

Added a dedicated runner for the three approved document-evidence migrations. It loads only fixed SHA-256 allowlisted SQL, uses the Supabase CLI v2.106.0-compatible statement split already established in the repository, requires the supported `supabase_migrations.schema_migrations` shape, and records exact `name` plus `statements[]` history rows.

Apply runs in ascending order and rollback in descending order under one PostgreSQL advisory lock. Each migration is transactional and independently recoverable: exact history plus exact live state is reused; exact live state without its history row is repaired; history/live drift, partial residue, a non-prefix history topology, or altered history fails before further mutation. Live checks cover the baseline evidence tables/RLS/RPCs, automatic-decision tables/columns/indexes/RPCs, and durable conflict-side column/constraints/function/trigger.

Remote execution remains disabled by default. A remote target requires PostgreSQL, `sslmode=verify-full`, `--allow-remote`, and the exact order-sensitive direction confirmation. CLI output contains only the direction and bounded result; a child-process test proves a URL password is absent from fail-closed stderr. No remote target was contacted.

# Verification

The initial focused test failed at module resolution because the runner did not exist. After implementation, the static suite passed source digests, statement loading, target gates, confirmations, and credential-safe CLI errors.

An isolated `postgres:16-alpine` container on loopback port 55432 ran all eight tests. The suite applied all three migrations, verified exact history, reused them, rolled them back in reverse, reused the empty rollback, reapplied, rejected a deliberately removed live side-identity column while history remained, and recovered an exact final live migration whose history row was deliberately removed. The container was deleted immediately after the run.

The package TypeScript sequence passed after building the three required shared packages. Prettier and diff whitespace checks are green. The artifact validator is run immediately before commit.

# Risks / Follow-ups

The runner deliberately refuses unknown migration source changes even when SQL remains syntactically valid; an intentional SQL edit therefore requires a reviewed digest update. Live parity checks target durable contract objects rather than hashing PostgreSQL-normalized function bodies; exact source plus exact history statements remain the authoritative byte-level proof.

The parent orchestrator must perform independent correctness/security review, integrate the branch, rerun the focused database gate, refresh Graphify in the integration workspace, and update Q12 activation documentation. This stream grants no authority for a remote database connection or deployment.
