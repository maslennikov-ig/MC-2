---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.2
stage_id: mc2-jz6y0
agent_type: db_migration_specialist/correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: privileged PostgreSQL atomic gate, approved migration hashes, rollback/reapply, tenant isolation, and fail-closed terminal exception are high risk
repo: mc2
branch: codex/q12-source-recovery-evidence-db-review
base_branch: codex/q12-source-recovery-evidence
base_commit: b9b92eaed3985a64aeb8c254ef5c5e002fb7d902
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-db-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.2-review.md
success_criteria:
  - review exact b9b92eae..9142c400 correction plus immutable final review 60d1ae42 and approved evidence/source-recovery specifications
  - prove early retry exception depends on the durable same-run/course/organization/document failed/source_file_unrecoverable item and exact terminal question
  - preserve service_role, ownership, one recommendation, idempotency, append-only system provenance, and zero retry/new-run behavior
  - independently run PostgreSQL 15.18 46/46, PostgreSQL 16.14 approved 19/19, type-check, artifact, diff, process, and cleanup gates
  - return PASS only when P0 and P1 are both zero
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - immutable final review 60d1ae4296d1365d75847790f245515a0b9f6e63
selected_skills:
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - db_migration_specialist
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills and approved repository specifications fit
parallel_group: q12-source-recovery-evidence-terminal-rpc-review
depends_on_streams:
  - mc2-jz6y0.13.4.1.2 correction at 9142c400ab3de8bd6a5418591072021826876ef5
parallel_decision: sequential - exact diff inspection, applied negative probes, approved runner, and cleanup share one migration contract
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: disposable PostgreSQL containers removed, loopback ports 55441/55442 free, and all five temporary dependency symlinks absent
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: approved specifications already require an exact audited terminal source decision; this review changes no durable behavior or operator contract
graph_reviewed: used
graph_review_notes: read the local Graphify report and ran a focused function/item query; the report predates this correction and returned no matching node, so exact diff and applied PostgreSQL evidence are authoritative; artifact-only review needs no graph refresh
verification:
  - exact b9b92eae..9142c400 diff, history, 60d1ae42, approved specs, and migration source: reviewed
  - PostgreSQL 15.18 static plus applied document-conflict matrix: passed 46/46
  - PostgreSQL 15.18 exact extra-choice RPC probe: failed contract because malformed terminal choices were accepted and materialized
  - PostgreSQL 16.14 approved migration runner: passed 19/19
  - course-gen-platform package type-check: passed
  - migration apply and rollback SHA-256 allowlists: passed exact local recomputation and approved runner
  - git diff --check b9b92eae..9142c400: passed
  - artifact schema validation: passed
  - scripts/orchestration/run_process_verification.sh: passed
  - cleanup containers ports and dependency symlinks: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.2-review.md
explicit_defers:
  - implementation is explicitly outside this review write zone; correction returns to the evidence migration worker
---

# Summary

**Verdict: NEEDS_WORK.** P0: 0, P1: 1, P2: 0, P3: 0. The correction
closes the blocker from `60d1ae42` for the canonical input: the below-max
exception requires `service_role`, an accepted tenant-scoped run, exact
`failed/source_file_unrecoverable` question metadata, canonical metadata
`choices`, one recommended `continue_limited`, and a matching durable
`document_evidence_items` row in the same run/course/organization/document.
The passing applied path records one append-only system decision, reuses the
gate idempotently, and creates neither a retry application nor another evidence
run.

Acceptance is still blocked because the RPC trusts `metadata.choices` without
proving that it equals the values in the durable question's actual
`suggested_answers`. A malformed terminal question can retain a real `retry`
choice, claim only the approved two choices in metadata, and still receive a
system `continue_limited` decision below the retry ceiling.

| Priority | Findings | Effect |
| -------- | -------: | ------ |
| P0 | 0 | none |
| P1 | 1 | blocks acceptance |
| P2 | 0 | none |
| P3 | 0 | none |

# Findings

## P1 - Terminal exception validates metadata choices but accepts different actual choices

- **File:** `packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql:879`
- **Problem:** the early exception compares only
  `v_question->'metadata'->'choices'` to
  `["continue_limited","remove_document"]` and separately verifies the sole
  recommended answer is `continue_limited`. It never derives the complete
  ordered value set from `v_question->'suggested_answers'` or checks that those
  values equal metadata choices. `ensure_document_evidence_question_atomic()`
  persists caller-provided suggested answers as-is.
- **Applied evidence:** on exact `postgres:15.18`, the review reset a disposable
  accepted run to one durable item with `coverage_status='failed'` and
  `coverage_reason='source_file_unrecoverable'`, then called
  `materialize_document_evidence_decision_gate_atomic()` at retry `0/2`. The
  payload declared metadata choices
  `["continue_limited","remove_document"]`, but supplied actual answers
  `continue_limited` (recommended), `remove_document`, and an additional
  non-recommended `retry`. The RPC returned `reused:false`, inserted one system
  decision, and persisted all three choices in `clarifying_questions`.
- **Impact:** the privileged durable boundary does not enforce the exact
  terminal question contract. A malformed repository/service payload can
  materialize an early terminal decision while its persisted audit question
  still advertises retry, contrary to the explicit fail-closed acceptance
  criterion. The existing 46-test matrix misses this because its negative
  choices case changes only metadata, not actual suggested answers.
- **Required fix:** inside the atomic gate, derive the ordered complete value
  array from `suggested_answers`, require it to equal exactly
  `["continue_limited","remove_document"]`, and require metadata choices to
  equal that derived array. Add applied cases for an extra `retry`, missing
  `remove_document`, duplicate values, and metadata/answer disagreement; each
  must roll back question and decision creation.

# Scope / Routing

The review inspected only `b9b92eaed3985a64aeb8c254ef5c5e002fb7d902` through
`9142c400ab3de8bd6a5418591072021826876ef5`, immutable final review
`60d1ae4296d1365d75847790f245515a0b9f6e63`, and the approved evidence/source
recovery specifications. No production SQL, tests, TypeScript service, Beads
state, staging system, Supabase project, Qdrant, Redis, or source file was
modified. The only owned write is this immutable review artifact.

# Verification

- PostgreSQL 15 image: `postgres:15.18`, server
  `15.18 (Debian 15.18-1.pgdg13+1)`, digest
  `sha256:bcab099bfaab33333a73a2ebe8c1d615c9f4c2402dd43452f989a36c6da9a5ba`.
- PostgreSQL 16 image: `postgres:16.14`, server
  `16.14 (Debian 16.14-1.pgdg13+1)`, digest
  `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`.
- Static plus applied 15.18 gate:
  `DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:***@127.0.0.1:55441/document_evidence_review15_test pnpm --filter @megacampus/course-gen-platform exec vitest run --config ../../vitest.shared.ts tests/integration/document-conflict-auto-decisions.test.ts tests/integration/document-conflict-auto-decisions-applied.test.ts`
  passed 2 files and 46/46 tests.
- Approved 16.14 runner:
  `DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:***@127.0.0.1:55442/document_evidence_review16_test pnpm --filter @megacampus/course-gen-platform exec vitest run --config ../../vitest.shared.ts tests/integration/document-evidence-approved-migrations.test.ts`
  passed 1 file and 19/19 tests, including apply/reuse, reverse rollback/reapply,
  frontier/history, RLS, ACL, function, trigger, constraint, index, pgcrypto, and
  residue drift checks.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after adding
  the isolated worktree's temporary dependency links. An initial attempt stopped
  in `shared-logger` because those links were absent; no project type failure
  remained after reconstructing the existing pnpm workspace links.
- `sha256sum` recomputed apply
  `c0801f0c2ca135f9ea28374448b00dcf33d18dea0475f2e3d363e0739f97fc64`
  and unchanged rollback
  `91036c5bff892817ec702719acd7e9d58f0aa0bda7d2b795201b80b70361d1cc`;
  both equal the approved allowlist, and the 19/19 runner independently accepted
  affected cumulative security manifests.
- `git diff --check b9b92eae..9142c400` passed.
- The exact negative RPC probe used `auth.role=service_role`, the same
  run/course/organization/document IDs as the durable row, retry `0/2`, exact
  terminal status/reason and metadata choices, one recommended
  `continue_limited`, plus an actual third `retry` suggested answer. PostgreSQL
  returned a new decision instead of rejecting the malformed question.

The initial Vitest invocation without `../../vitest.shared.ts` activated the
unrelated global Qdrant setup and executed no target tests; the explicit
setup-free commands above are the authoritative successful gates.

# Delivery / Cleanup

Delivery is returned and not accepted. Both disposable containers
`mc2-evidence-db-review-pg15` and `mc2-evidence-db-review-pg16` were removed.
Loopback ports `55441` and `55442` are free. Temporary `node_modules` symlinks at
the worktree root and under `course-gen-platform`, `shared-logger`,
`shared-types`, and `shared-utils` were removed and verified absent. The review
performed no remote database, staging, production, deploy, or live-source
mutation.

# Risks / Follow-ups / Explicit Defers

There is no acceptable defer for the P1 because exact terminal choices are an
explicit acceptance condition for the early retry exception. The correction
must return to the migration worker for a fail-closed suggested-answer/value
check and applied regression coverage, followed by another independent review.
This reviewer must not implement that change.
