---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: terminal automatic evidence decisions cross TypeScript service and PostgreSQL atomic audit boundaries
repo: mc2
branch: codex/q12-source-recovery-evidence-final-review
base_branch: codex/q12-source-recovery-evidence
base_commit: 937ca67b428556e658dcfe80fdf481bddec8dd5d
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-final-review.md
success_criteria:
  - review exact 937ca67b..b9b92eae delta against immutable reviews 254a8b83 and ad6ce784
  - prove the real automatic retry-0/2 path writes one atomic continue_limited system decision without retry or replacement run
  - preserve exhaustion for every other degraded or failed reason and zero downstream refs for audited failure
  - require exact P0/P1/P2/P3 counts and P0/P1 zero for PASS
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - immutable review artifacts at 254a8b83 and ad6ce784
selected_skills:
  - code-review
  - superpowers:verification-before-completion
  - orchestration-closeout
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review assets and repository contracts fit
parallel_group: q12-source-recovery-evidence-final-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-evidence-terminal-correction
parallel_decision: sequential - final immutable review depends on the complete correction and shared verification path
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: final-review worktree and branch remain for orchestrator consumption; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only correction review; approved source-recovery and evidence specifications remain authoritative
graph_reviewed: no-change-needed
graph_review_notes: stage-local immutable review only; the prior focused Graphify orientation remains sufficient and no durable code/docs graph change is owned here
verification:
  - exact 937ca67b..b9b92eae four-file delta and relevant history: reviewed
  - immutable 254a8b83 and ad6ce784 findings: re-dispositioned
  - decision-service plus live-wiring tests: passed 37/37
  - prior Stage4/5/6 provenance matrix: passed 115/115
  - course-gen-platform package type-check: passed
  - production repository-to-SQL atomic path: blocking retry-exhaustion guard reproduced by exact code-path inspection
  - git diff --check 937ca67b..b9b92eae and b00ae0e0..b9b92eae: passed
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-final-review.md
explicit_defers:
  - implementation and migration correction belong to the evidence worker; this reviewer must not modify production code, SQL, or tests
---

# Summary

**Verdict: NEEDS_WORK.** The TypeScript delta fixes the service-layer defect
reported by `ad6ce784`: the exact failed/unrecoverable card bypasses retry
exhaustion, exposes only `continue_limited`/`remove_document`, and reaches one
`materializeDecisionGateAtomic()` call. However, the production repository sends
that unchanged terminal question with retry metadata `0/2` to the PostgreSQL
atomic RPC, whose durable guard still rejects every degraded-evidence question
with `attempt < max_attempts`. No terminal system decision is written. One P1
therefore remains and blocks evidence-stream acceptance.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        1 | blocks acceptance  |
| P2       |        0 | none               |
| P3       |        0 | none               |

# Findings

## P1 — PostgreSQL atomic gate still rejects the terminal unrecoverable decision at retry 0/2

- **Files:**
  `packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts:283`,
  `packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts:427`,
  `packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql:856`,
  `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts:948`
- **Evidence:** `isTerminalUnrecoverableSource()` now correctly bypasses the
  TypeScript exhaustion guard and removes `retry` from the question, but
  `degradedQuestion()` deliberately preserves `attempt=0,max_attempts=2` in
  metadata. The production repository forwards the question to
  `materialize_document_evidence_decision_gate_atomic`. Inside that RPC, lines
  856-860 still raise `Automatic degraded decision requires exhausted retry
  attempts` for every `subject_kind='degraded_evidence'` whenever
  `attempt < max_attempts`; it has no exact terminal-unrecoverable exception.
  The new 37-test gate uses a repository double whose
  `materializeDecisionGateAtomic()` fabricates a decision ID and therefore never
  executes the SQL guard.
- **Impact:** the exact automatic Q12 path still aborts inside the atomic audit
  transaction at retry state `0/2`. It creates no retry/new evidence run, but it
  also records no terminal `continue_limited` system decision. Stage 5/6 then
  cannot consume the required accepted decision, and the six audited-failed
  source dispositions remain unusable in automatic courses.
- **Required fix:** update the durable SQL guard using the same exact predicate
  as the service: only `coverage_status='failed'` plus
  `coverage_reason='source_file_unrecoverable'` may bypass exhaustion. Preserve
  `0/2` without pretending retries occurred, require the recommended value
  `continue_limited`, and retain exhaustion for every other degraded/failed
  reason. Add an applied disposable-PostgreSQL regression proving one atomic
  system decision, idempotent reuse without duplication, and rejection of a
  nonterminal failed reason at `0/2`.

# Prior-finding disposition

| Immutable finding | Disposition | Evidence |
| ----------------- | ----------- | -------- |
| `254a8b83` P1 strict UUIDv4 | Fixed | Shared anchored lower-case UUIDv4 parser and negative matrix remain unchanged; parser suite passes 12/12. |
| `254a8b83` P1 pre-derivative partition | Fixed | Redis/DB processed content, markdown, legacy budget/full text and Phase 1 semantic input exclusions remain unchanged; combined matrix passes. |
| `254a8b83` P2 no deterministic retry/new run | Fixed | Live orchestration creates no retry-state lookup/record/consume in its retry coordinator and runs preflight exactly once. |
| `ad6ce784` P1 TypeScript decision-service rejection | Fixed at service layer only | Exact terminal card reaches one repository materialization call at `0/2`; all other reasons remain blocked before that call. Production SQL still blocks the call as reported above. |

# Accepted behavior confirmed

- Exact `failed/source_file_unrecoverable` is the only service-layer bypass;
  degraded cards and every other failed reason still require exhausted retries.
- The terminal question contains exactly `continue_limited` and
  `remove_document`, with `continue_limited` as the sole recommendation.
- The original evidence run/card remains unchanged: metadata-only, null summary,
  empty claims/terminology/constraints, zero allocation, and no replacement run.
- Stage 5 remains baseline-first and excludes the failed card from retrieval.
- Stage 6 still requires a terminal decision and emits zero source refs and zero
  allowed document IDs for the audited card once that decision is durably valid.
- No-document, tenant/course/version and full-ledger contracts are unchanged.

# Verification

- Inspected the exact four-file `937ca67b..b9b92eae` delta, file history, both
  immutable finding artifacts, the TypeScript service/repository call chain, and
  the PostgreSQL RPC implementation; conclusions are not inferred from unit
  tests alone.
- Decision-service plus live-wiring command passed 2 files and 37/37 tests
  (13 + 24). These tests prove the TypeScript boundary and expose the repository
  double that omits the production SQL constraint.
- The unchanged six-file Stage4/5/6 matrix passed 115/115: enumeration 8,
  parser 12, preflight 27, live wiring 24, Stage 5 30, Stage 6 14.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed using only
  temporary dependency symlinks, removed before artifact delivery.
- Both required `git diff --check` ranges passed.

# Delivery / Cleanup

Only this immutable final-review artifact is owned by the reviewer. No
implementation, migration, test, specification, plan, Beads state, database,
Redis, Qdrant, service, or live source was modified. The final-review branch was
created from `b9b92eae` and preserves the prior immutable review via cherry-pick;
no published history was rewritten. Delivery is returned and not accepted;
cleanup remains pending for the orchestrator.

# Risks / Follow-ups / Explicit Defers

There is no justified defer for the P1. The PostgreSQL atomic guard must be
corrected and verified against an applied disposable database before the
evidence stream can pass independent review.
