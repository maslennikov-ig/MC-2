---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1-evidence-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: exact source-truth recognition and preflight derivative exclusion cross durable Stage 4/5/6 evidence boundaries
repo: mc2
branch: codex/q12-source-recovery-evidence-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: cfce2c1c3d927e1ba1537a81d959302a166162c3
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-review.md
success_criteria:
  - exhaustive review of all nine files in cfce2c1c..b00ae0e0
  - exact lower-case UUIDv4 source_file_unrecoverable recognition only
  - no processed derivative load or influence before audited-failure preflight
  - exact durable failed-card and downstream exclusion/recovery/no-document truth
  - P0/P1 zero required for PASS
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence.md
selected_skills:
  - code-review
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - repository contracts and installed review skills cover the stream
parallel_group: q12-source-recovery-dependent-streams
depends_on_streams:
  - mc2-jz6y0.13.4.1-evidence
parallel_decision: sequential - this independent review gates evidence-stream acceptance
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks were removed before review commit; review worktree/branch remain for orchestrator use
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only review; approved source-recovery/evidence specifications remain authoritative and expose the implementation mismatches below
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md and graph.json are absent from this dedicated review worktree; no graph refresh is appropriate for a review-only artifact
verification:
  - exact cfce2c1c..b00ae0e0 nine-file diff and relevant history: reviewed
  - focused Stage 4/5/6 tests: passed 99/99
  - package type-check: passed
  - direct recovery UUID probe: reproduced acceptance of UUIDv1 and uppercase UUIDv4
  - git diff check: passed
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-review.md
explicit_defers:
  - none - both P1 findings require correction and re-review before integration
---

# Summary

**Verdict: NEEDS_WORK.** The exact range
`cfce2c1c3d927e1ba1537a81d959302a166162c3..b00ae0e078ddc8183a29687689da31c4434ff627`
has zero P0, two P1, and one P2 findings. The focused 99 tests and package
type-check pass, but the tests do not exercise the two blocking production-path
violations. This branch must not be integrated until both P1 findings are fixed
and independently re-reviewed.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        2 | blocks acceptance  |
| P2       |        1 | fix with correction |
| P3       |        0 | none               |

# Findings

## P1 — Non-v4 and uppercase recovery IDs are promoted to audited failures

- **Files:**
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:349`,
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:358`,
  `packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts:176`,
  `packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts:198`
- **Evidence:** both matchers use `[0-9a-fA-F]` and `[1-8]` in the UUID
  version nibble, then lowercase the accepted value. A direct probe returned
  `true` for `90000000-0000-1000-8000-000000000009` and for uppercase
  `90000000-0000-4000-8000-00000000000A`. The enumeration test covers generic
  text, a non-UUID, and a nonfailed row, but has no uppercase or wrong-version
  negative case.
- **Impact:** an error string outside the exact reviewed disposition contract can
  acquire `source_file_unrecoverable` coverage, skip evidence generation, and be
  counted as an audited failed document. This violates the required exact
  lower-case UUIDv4 provenance boundary and makes malformed input indistinguishable
  from the owner-reviewed outcome.
- **Fix:** use one shared strict parser with lower-case hex and a literal version
  nibble `4`, for example
  `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
  Do not normalize noncanonical input into validity. Add handler and preflight
  negatives for uppercase, UUIDv1/v8, wrong variant, whitespace, suffixes,
  generic errors, and nonfailed vector states.

## P1 — Audited-failed documents load and influence derivatives before preflight

- **Files:**
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:430`,
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:434`,
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:451`,
  `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts:472`
- **Evidence:** after the metadata snapshot, `fetchDocumentSummaries()` sends
  every document ID, including the audited-failed IDs, to the Redis
  `processed_content` batch loader. Every cache miss is then included in the
  Supabase `processed_content` query. `parseAuditedSourceFailure()` is not called
  until the final mapping step, after those derivatives are already loaded and
  attached. Before `runDocumentEvidencePhase()`, unchanged live orchestration
  also allocates the legacy document budget, resolves selected full-text
  markdown, and sends `originalDocumentSummaries[].processed_content` into Phase
  1 classification. The new live-wiring test starts after this handler path and
  therefore proves only that the later preflight adapter omits the already-loaded
  value.
- **Impact:** parsed/processed/cache-derived text for an original that the owner
  declared unrecoverable can enter process memory and influence Phase 1,
  budgeting, model selection, or legacy full-text resolution before the failed
  card exists. This is the prohibited derived-source substitution path; later
  deletion in `sortedSources()` cannot undo earlier semantic influence.
- **Fix:** parse the exact disposition immediately from the metadata snapshot,
  partition audited-failed IDs before any cache or content query, and never pass
  them to Redis, `processed_content`, `markdown_content`, budget allocation, or
  legacy Phase 1/2/3/4 document content. Preserve their metadata-only identity
  separately for the coverage ledger. Add an end-to-end handler/orchestration
  regression that asserts the failed ID is absent from every cache/DB content
  request and from every pre-preflight semantic document input.

## P2 — Automatic mode retries deterministic unrecoverable outcomes

- **File:**
  `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts:408`
- **Evidence:** the automatic retry loop selects every `degraded` or `failed`
  card and records an automatic retry without excluding
  `coverage_reason='source_file_unrecoverable'`. Retry directives are part of
  the evidence fingerprint, so the same owner-approved deterministic failure
  creates additional immutable runs and retry decisions even though preflight
  deliberately performs no loader or generator work for it.
- **Impact:** this does not reintroduce source text, but it creates misleading
  retry audit history and redundant accepted runs for a condition that can only
  change through a new source-recovery state. It also obscures the intended
  one-outcome recovery provenance during resume analysis.
- **Fix:** exclude `source_file_unrecoverable` cards from automatic generation
  retry and proceed directly to the existing terminal degraded-evidence
  decision. Add an automatic-mode regression proving one accepted recovery-bound
  run, zero retry directives, and one terminal decision.

# Accepted behavior confirmed

- Inside `runDocumentEvidencePreflight()`, a correctly structured failure is
  removed from evidence budget allocation, source loading, generator calls, and
  targeted verification. Its initial durable card is produced through
  `createFailedEvidenceCard()` with `metadata_only`, null summary, empty claims,
  terminology and constraints, and zero allocated tokens.
- The recovery run ID participates in the input fingerprint. Removing
  `sourceFailure` after real source recovery produces a new run/fingerprint in
  the focused regression.
- The initial full-ledger commit preserves one card per exact source ID, and
  normal resume uses the accepted run when the fingerprint is unchanged.
- Stage 5 production code filters all failed cards before retrieval and returns
  the byte-equivalent baseline when none remain. Stage 6 derives refs only from
  card claims, so the exact empty failed card emits zero refs and no allowed
  document ID. Existing tenant/course and source-version checks remain intact.
- The zero-document live path remains a no-op and the focused regression is
  unchanged.

# Verification

The fresh focused command passed five files and 99 tests: Stage 4 enumeration
6, live wiring 22, preflight 27, Stage 5 enrichment 30, and Stage 6 evidence
context 14. Package type-check exited zero after the allowed temporary workspace
dependency links were supplied. `git diff --check cfce2c1c..b00ae0e0` passed.

The direct matcher probe separately proved the blocking test gap by evaluating
the implementation pattern against lower-case UUIDv1, uppercase UUIDv4, and
canonical lower-case UUIDv4; all three were accepted.

# Delivery / Cleanup

Only this immutable review artifact is owned by the reviewer. No implementation,
test, database, cache, Qdrant instance, source file, service, plan, spec, Beads
state, or runtime was modified. Temporary dependency symlinks are removed before
the review commit. The review branch remains for orchestrator consumption.

# Risks / Follow-ups / Explicit Defers

There is no justified defer for either P1. Correct the exact matcher and move
failure partitioning ahead of every derivative/budget/semantic consumer, cover
the real handler/orchestration path, and request independent re-review. The P2
automatic-retry exclusion should be included in the same correction to keep the
recovery audit trail truthful.
