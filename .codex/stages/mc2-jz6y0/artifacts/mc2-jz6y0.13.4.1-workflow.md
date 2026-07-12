---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1-workflow
stage_id: mc2-jz6y0
agent_type: search/data worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: exact tenant-aware CAS, resumability, reviewed identity binding, and redaction are data-integrity sensitive
repo: mc2
branch: codex/q12-source-recovery-workflow
base_branch: codex/self-hosted-qdrant-platform
base_commit: cfce2c1c3d927e1ba1537a81d959302a166162c3
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-workflow
write_zone:
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery.test.ts
  - packages/course-gen-platform/package.json
  - this artifact
success_criteria:
  - bounded reviewed-row reads and exact tenant/course/hash/path/prior-state CAS
  - idempotent applied-state reconciliation without re-querying reviewed prior predicates
  - mandatory Career Playbook source-CAS checkpoint before catalog CAS
  - exact 261/240 counts, 42 copy targets, 125 affected rows, 6 eligible and 18 Career Playbook dispositions
  - strict canonical manifest SHA, run confirmation, journal binding and phase gates
  - aggregate-redacted stdout and rollback rejection at or after reindex_started
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - accepted source-audit and source-recovery-core artifacts
  - file_catalog and career_playbook_sources migrations and shared database types
  - existing source reindex Supabase adapter
  - Supabase JavaScript v2 update/filter documentation
  - PostgREST 14 Tables and Views API documentation
selected_skills:
  - superpowers:test-driven-development
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - search/data worker
catalog_candidates:
  - none - accepted core, repository schema, installed skills, and first-party docs cover the stream
parallel_group: q12-source-recovery-dependent-streams
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
parallel_decision: parallel - Task 2 has a disjoint write zone from reindex and Stage 4 streams
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks must be removed before commit; worktree/branch remain for orchestrator review
risk_level: high
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: implementation follows the already approved Q12 design/plan; operator/Compose and durable runbook wiring belong to later integration tasks
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this dedicated worktree; parent integration owns the safe local graph refresh after accepted merges
verification:
  - database TDD RED: expected missing-module failure
  - CLI TDD RED: expected missing-module failure
  - parser correction RED: 1 expected failure for fail-closed unknown --allow-gaps handling
  - self-review identity/order RED: 2 expected failures for noncanonical raw manifest bytes and PATCH predicate ordering
  - duplicate Career Playbook identity RED: 1 expected failure
  - exact returned CAS state RED: 1 expected failure
  - new database and CLI GREEN: passed 12/12
  - accepted core plus new focused recovery tests: passed 30/30
  - package type-check: passed
  - focused Prettier and git diff check: passed
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery.test.ts
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow.md
explicit_defers:
  - Task 3 owns reindex recovery-binding consumption and verified-to-reindex_started persistence before enqueue
  - Task 4 owns exact failed-coverage card verification IDs; this stream does not invent them
  - operator/Compose integration and any protected host execution remain later reviewed tasks; no remote mutation was performed
---

# Summary

Task 2 now provides a bounded Supabase/PostgREST adapter, exact resumable
disposition CAS, strict reviewed-state loading, and all six approved recovery
CLI modes. The immutable manifest's actual bytes must hash to the same canonical
SHA-256 bound into the journal. Mutating modes require the exact reviewed run
confirmation, every journal advance uses the accepted core transition rules,
and direct command reports contain aggregate counts only.

Eligible dispositions update only the exact reviewed `file_catalog` row.
Career Playbook dispositions first update the exact source row, durably persist
`career_playbook_source_applied`, and only then update the linked catalog row.
A zero-row CAS reconciles only the exact final state; it never retries the prior
review predicate or overwrites drift. No cross-table transactionality is
claimed.

# Scope / Routing

The stream stayed inside its six-path write zone and imported the accepted
manifest/filesystem core without modifying it. Planning consumes the protected
audit proposal, independently recounts sources through the existing bounded
keyset reindex reader, and revalidates all 24 prior database predicates before
publishing the immutable review manifest. Execution and rollback use lazy
dependencies and do not instantiate a Supabase client, preserving the later
networkless executor boundary.

Version-sensitive behavior was checked only against first-party sources on
2026-07-12:

- repository lock: `@supabase/supabase-js` and
  `@supabase/postgrest-js` `2.87.2`;
- Supabase JavaScript v2 update semantics:
  `https://supabase.com/docs/reference/javascript/update`;
- Supabase JavaScript v2 filter chaining:
  `https://supabase.com/docs/reference/javascript/using-filters`;
- PostgREST 14 horizontal filters, PATCH, and
  `return=representation`:
  `https://docs.postgrest.org/en/v14/references/api/tables_views.html`.

The implementation applies every immutable predicate before `.select()` on a
PATCH and limits the returned representation to two rows so any non-unique
effect fails closed.

# Verification

The initial database and CLI runs each failed for the expected missing Task 2
module. GREEN then covered bounded batches, exact nullable filters, affected-row
zero, exact already-applied reconciliation, unrelated tenant immutability,
Career Playbook checkpoint order, all modes, exact totals, confirmation,
canonical raw manifest identity, journal phases, aggregate-only output, and the
rollback gate.

Self-review found and corrected four additional gaps through RED/GREEN cycles:
unknown options had to fail immediately; PATCH filters had to precede returned
row selection; raw reviewed manifest bytes had to match the journal's canonical
SHA; and a nominal one-row PATCH response had to equal the exact requested
final state before progress could advance. The final focused run passed 30/30,
including all 18 accepted core tests. Package type-check, formatting, and
whitespace checks passed.

# Delivery / Cleanup

The stream is returned for independent orchestrator review. No staging host,
database, upload root, Qdrant service, queue, secret, deployment, or live
runtime was accessed or mutated. Temporary dependency symlinks are local-only
and are removed before the implementation commit.

# Risks / Follow-ups / Explicit Defers

- The protected plan input remains sensitive owner-only state and is never
  printed or tracked. Real execution remains blocked on the later operator and
  staging gates.
- Task 3 must consume the exported strict reviewed-state loader/persistence
  primitives and bind exact Stage 4 verified failed-coverage IDs before moving
  `verified -> reindex_started`.
- Task 4 owns failed evidence coverage; this stream intentionally accepts no
  generic failed status as coverage proof.
- Integration owns operator service isolation, the host-level lock, final docs,
  Graphify refresh, and independent review. No cross-table atomicity or remote
  readiness is claimed here.
