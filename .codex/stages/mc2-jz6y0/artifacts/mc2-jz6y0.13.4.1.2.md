---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1.2
stage_id: mc2-jz6y0
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: PostgreSQL atomic decision RPC, rollback/reapply, idempotency, and tenant isolation are high risk
repo: mc2
branch: codex/q12-source-recovery-evidence-db
base_branch: codex/q12-source-recovery-evidence
base_commit: b9b92eaed3985a64aeb8c254ef5c5e002fb7d902
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-db
write_zone:
  - packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions.test.ts
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions-applied.test.ts
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.2.md
success_criteria:
  - terminal failed/source_file_unrecoverable at retry 0/2 atomically writes one continue_limited system decision without retry or replacement run
  - every other below-max degraded/failed reason and malformed terminal metadata fails closed
  - preserve one recommendation, tenant/course/run ownership, idempotency, append-only audit, system provenance, and rollback semantics
  - static, applied PostgreSQL, approved migration, rollback/reapply, and isolation gates pass
  - resolve immutable review 60d1ae42 without accepting this correction before independent review
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-rereview/.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-final-review.md
  - /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform/.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.2-review.md
selected_skills:
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - orchestration-closeout
selected_agents:
  - db_migration_specialist
catalog_candidates:
  - none - installed assets and approved local specifications fit
parallel_group: q12-source-recovery-evidence-terminal-rpc
depends_on_streams:
  - mc2-jz6y0.13.4.1-evidence-final-review
parallel_decision: sequential - RED, SQL correction, catalog re-approval, rollback/reapply, and final verification share one migration and disposable database state
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: disposable databases, ports, volumes and dependency symlinks were removed; implementation and both database review worktrees/local branches were removed after integration verification
risk_level: high
docs_impact: migration
docs_reviewed: no-change-needed
docs_review_notes: approved specifications already require terminal source-file failure to continue through an audited automatic decision; no operator or public API prose changed
graph_reviewed: blocked
graph_review_notes: focused orientation used /home/me/code/mc2/graphify-out/GRAPH_REPORT.md plus a local query; this isolated worktree has no graphify-out and the parent integration stream owns the post-integration graph refresh
resolves_review:
  - 60d1ae42
  - 845dc0ee
verification:
  - RED static migration test: failed 1/1 because the RPC lacked the exact terminal predicate
  - RED disposable PostgreSQL 15.18 applied test: failed 1/1 with Automatic degraded decision requires exhausted retry attempts
  - targeted terminal and fail-closed PostgreSQL 15.18 matrix: passed 9/9
  - review 845dc0ee RED on disposable PostgreSQL 15.18: 4/4 malformed actual suggested-answer arrays materialized decisions instead of rejecting
  - targeted actual-choice correction PostgreSQL 15.18 matrix: passed 5/5 including four rollback negatives and resolver text fallback
  - full document-conflict static and applied PostgreSQL 15.18 matrix: passed 51/51 including rollback/reapply
  - approved migration guard RED: failed on the old source SHA and cumulative catalog allowlists
  - approved migration PostgreSQL 16.14 matrix: passed 19/19 including apply/reuse/reverse rollback/reapply
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - scripts/orchestration/run_process_verification.sh: passed
  - git diff --check: passed
changed_files:
  - packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions.test.ts
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions-applied.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.2.md
explicit_defers:
  - none - independent final review and orchestrator integration verification passed
---

# Summary

Resolved review `60d1ae42` at the durable PostgreSQL boundary. The atomic gate
now permits a below-max automatic decision only when question metadata and the
tenant/course/run-scoped durable evidence item both equal
`failed/source_file_unrecoverable`, the choices are exactly
`continue_limited/remove_document`, and the sole recommendation is
`continue_limited`. Retry counters remain truthful at `0/2`; the transaction
creates no retry application or replacement evidence run.

The correction for review `845dc0ee` additionally derives the complete ordered
choice-value array from the persisted question's actual `suggested_answers`
using the resolver's `value` then `text` fallback. The terminal exception now
requires that derived array to equal exactly
`[continue_limited, remove_document]` and requires `metadata.choices` to equal
the same derived array.

# Scope / Routing

The implementation stayed within the migration, its static/applied tests, and
the orchestrator-authorized approved-migration SHA/catalog update. The approved
version list, ordering, rollback SQL, remote target gates, repository migration
manifest, TypeScript production services, and unrelated evidence behavior were
not changed. The stream remained sequential because every step depended on the
same SQL object and disposable database state.

# Verification

Strict TDD reproduced the exact production failure on PostgreSQL 15.18 before
the SQL edit. GREEN covers the canonical terminal path, eight rejected
below-max variants, one decision/question, system provenance, append-only root,
idempotent replay, zero retries/new runs, and tenant mismatch. The expanded 51-test
document-conflict suite proves rollback/reapply and existing atomic behavior.

The `845dc0ee` delta RED then reproduced four independently materialized
malformed questions: extra `retry`, missing `remove_document`, duplicate
values, and actual/metadata order disagreement. The correction rejects all
four atomically with zero question/decision rows and preserves a positive
resolver-fallback case. The expanded full document-conflict suite is 51/51.

The applied delta used `postgres:15.18-alpine` at image digest
`sha256:3d0f7584ed7d04e27fa050d6683a74746608faf21f202be78460d679cc56461f`
and the approved catalog guard used `postgres:16.14-alpine` at image digest
`sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`.
Named containers, named data volumes, loopback ports `55443`/`55444`, and all
five temporary dependency symlinks were removed after the final fresh gates.

Changing an approved migration correctly made the fixed allowlist fail RED.
Only the `20260711130000` source SHA and affected cumulative PostgreSQL 16.14
catalog digests were refreshed. The 19-test approved runner then passed source,
apply/reuse, reverse rollback/reapply, history/frontier, RLS, ACL, function,
trigger, constraint, index, pgcrypto, and residue checks.

Self-review: P0 0, P1 0. The SQL exception is fail-closed on missing/invalid
retry metadata, forged coverage metadata, nonterminal durable items, changed
choices, and a non-`continue_limited` recommendation.

# Delivery / Cleanup

Delivery is returned on `codex/q12-source-recovery-evidence-db` and remains
unaccepted. Temporary dependency symlinks and disposable PostgreSQL containers
are removed before the completion report; the dedicated branch/worktree remain
for independent review and orchestrator integration.

# Risks / Follow-ups / Explicit Defers

No product or migration debt is deferred. Independent review must inspect the
SQL predicate, applied isolation evidence, and refreshed approved catalog
digests before acceptance. No remote database, Supabase, staging, production,
Qdrant, Redis, server, deploy, or live source state was read or mutated.
