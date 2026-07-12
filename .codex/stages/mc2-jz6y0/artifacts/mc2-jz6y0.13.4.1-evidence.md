---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1-evidence
stage_id: mc2-jz6y0
agent_type: stage4_evidence_correctness_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source-truth coverage and Stage 5/6 provenance exclusions cross durable evidence boundaries
repo: mc2
branch: codex/q12-source-recovery-evidence
base_branch: codex/self-hosted-qdrant-platform
base_commit: cfce2c1c3d927e1ba1537a81d959302a166162c3
resolves_review:
  - 254a8b83
  - ad6ce784
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence
write_zone:
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/source-failure.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - focused Stage 4/5/6 evidence tests
  - this artifact
success_criteria:
  - accept only exact audited source_file_unrecoverable file status and recovery UUID
  - persist exactly one metadata-only zero-content failed coverage card before derivative or budget use
  - make source_file_unrecoverable terminal in automatic mode without retry directives or replacement runs
  - keep failed evidence out of Stage 5 retrieval and Stage 6 source refs
  - preserve byte-equivalent no-document baselines
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - accepted mc2-jz6y0.13.4.1 core artifacts
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - code-review
selected_agents:
  - stage4 evidence correctness worker
catalog_candidates:
  - none - installed TDD, debugging, verification, and review assets fit
parallel_group: q12-source-recovery-dependent-streams
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
parallel_decision: parallel with reindex/operator streams after accepted core
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: implementation and five review/database worktrees plus all local branches were removed after integration verification; pushed remote evidence branches remain
risk_level: high
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: implementation exactly follows the owner-approved source-recovery and document-evidence designs; integration owns final runbook/state reconciliation
graph_reviewed: blocked
graph_review_notes: this isolated worktree has no graph.json; focused query used the current integration graph and the parent integration owns safe post-merge refresh
verification:
  - focused Stage 4 RED: expected 4 failures and 51 passes
  - focused Stage 4 GREEN: passed 55/55
  - focused Stage 5 and Stage 6 regression: passed 44/44
  - combined Stage 4/5/6 gate: passed 99/99
  - package type-check: passed after temporary workspace dependency links restored the isolated install view
  - focused Prettier and git diff check: passed
  - artifact validation: passed
  - process verification: passed
  - correction RED shared parser: expected module-not-found before implementation
  - correction GREEN shared parser/preflight: passed 39/39
  - correction RED derivative boundary: audited ID observed in Redis processed-content request
  - correction GREEN enumeration: passed 7/7 before the later full-text regression
  - correction RED semantic boundary: stale full-text allocation included the audited ID and the semantic selector was absent
  - correction GREEN enumeration/live wiring: passed 31/31
  - correction RED automatic decision: source_file_unrecoverable created a second retry run
  - correction GREEN automatic retry-loop: passed live wiring 24/24 with one run and no retry calls, but the mocked decision boundary left review ad6ce784 open
  - correction combined Stage 4/5/6 gate: passed 115/115 across six files
  - correction package type-check: passed after the isolated worktree dependency view was restored
  - ad6ce784 RED real decision path: expected 2 failures and 34 passes because automatic retry state 0/2 blocked materialization
  - ad6ce784 GREEN real decision path: passed 37/37 across decision-service and live-wiring tests
  - ad6ce784 prior combined Stage 4/5/6 gate: passed 115/115 unchanged
  - ad6ce784 package type-check: passed
changed_files:
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/source-failure.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/document-source-enumeration.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/decision-service.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/source-failure.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/evidence-context.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence.md
explicit_defers:
  - independent correctness review and integration acceptance remain required
  - reindex reads tenant-bound verified failed IDs through the existing accepted-run plus listItems repository path; wiring belongs to the reindex stream
---

# Summary

Stage 4 now projects `vector_status,error_message` for every enumerated course
source and recognizes only the exact lower-case
`source_file_unrecoverable; recovery_run=<UUIDv4>` disposition on a failed row.
Pending/indexed rows, generic failures, malformed run IDs, and near matches remain
ordinary sources and cannot acquire an audited outcome.

The structured failure is carried from enumeration into evidence preflight
without `processed_content` or a reusable Stage 3 summary. Preflight validates
and fingerprints the recovery outcome, removes any injected full-text or
summary derivative, excludes the source from budget allocation, and persists
one existing `createFailedEvidenceCard()` result with metadata-only mode, null
summary, no claims/terminology/constraints, and zero allocated tokens. A later
recovered source receives a different run identity rather than replaying the
accepted failed run.

# Verification

The first focused run failed in the four intended places: missing metadata
projection, missing live structured wiring, missing failed-card behavior, and
unchanged run identity. The remaining 51 tests passed. The minimal implementation
then passed 55/55 Stage 4 tests. Existing downstream code required no production
change: a focused Stage 5 regression proves the exact failed card produces no
retrieval and returns the byte-equivalent baseline, while Stage 6 with its
terminal decision emits no source reference or allowed document ID. The joined
fresh gate passed 99/99.

The first type-check attempt stopped before project compilation because the
isolated worktree lacked `shared-logger/node_modules`; temporary links to the
already-installed primary workspace dependencies restored the intended package
view, and the repeated package type-check passed.

# Cross-stream contract

The existing tenant-bound read path is
`DocumentEvidenceRepository.getAcceptedRun(runId, courseId, organizationId)`
followed by `listItems(runId)`. The durable source is
`public.document_evidence_items`, whose rows include run, course, organization,
document, coverage status/reason, processing mode, claims, and token counts.
Reindex/integration may filter the schema-validated cards for the exact failed
shape without adding any Stage 4 API.

# Correction for review `254a8b83`

All two P1 and one P2 findings from the independent evidence review are
corrected through three explicit RED/GREEN cycles.

## Exact recovery identity

One shared parser in `evidence/source-failure.ts` now accepts only an exact
lower-case UUIDv4 with variant `8|9|a|b`. Handler enumeration and preflight both
use that parser. Uppercase, UUIDv1, UUIDv8, wrong variant, whitespace, suffixes,
malformed values, and nonfailed vector states remain ordinary non-audited
inputs; no normalization can promote them.

## Pre-derivative and pre-semantic partition

Immediately after the twice-verified metadata snapshot, handler enumeration
parses and partitions audited failures. Their IDs are absent from the Redis
`processed_content` batch and every bounded Supabase content fallback. They
retain exactly one metadata-only `DocumentSummaryResult` with empty content and
the structured recovery identity.

The orchestration initialization keeps that complete original source set only
for the durable evidence ledger, while a separate semantic set excludes audited
failures before legacy budget allocation and full-text resolution. The Phase 1
input builder also filters the terminal outcome defensively. A stale allocation
cannot force an audited ID into the markdown cache/database loader. The existing
preflight then persists exactly one metadata-only failed card with no summary,
claims, terminology, constraints, source loading, verification, or allocated
tokens.

## Terminal automatic outcome

The automatic retry loop now excludes cards whose exact coverage reason is
`source_file_unrecoverable`. The focused regression proves one accepted run,
zero automatic retry-state lookup, zero retry decision, zero retry consumption,
and no replacement evidence run.

## Real decision-service terminal correction for review `ad6ce784`

The immutable re-review correctly found that the first correction mocked the
downstream decision boundary. The real `resolveDocumentEvidenceDecisions()`
still read durable retry state `0/2` and rejected the automatic decision before
atomic materialization.

The decision service now treats only the exact combination
`coverage_status='failed'` and
`coverage_reason='source_file_unrecoverable'` as terminal and non-retryable. It
does not pretend that retries were exhausted: the persisted `0/2` state remains
visible in the decision subject, but the automatic exhaustion guard does not
apply and the question contains only `continue_limited` and `remove_document`.
The recommendation remains `continue_limited`, so the existing atomic gate
appends one idempotent system decision on the original accepted evidence run.

The live-wiring regression now invokes the real decision service with a
repository double rather than mocking `resolveDecisions`. It proves one
preflight run, no automatic retry lookup/record/consume, one atomic terminal
decision, and the unchanged metadata-only card with null summary, no claims,
and zero allocated tokens. A separate negative control proves every other
degraded or failed reason still throws before materialization at `0/2`.

## Correction verification

The final combined command passed six files and 115/115 tests: Stage 4 source
enumeration 8, strict source-failure identity 12, preflight 27, live wiring 24,
Stage 5 advisory exclusion 30, and Stage 6 evidence-context exclusion 14. The
course-gen-platform package type-check passed. Final artifact, process,
formatting, and diff checks are recorded at delivery after temporary dependency
links are removed.

For the `ad6ce784` correction, the real-path RED produced exactly two expected
failures with 34 passes. The GREEN targeted command passed 37/37 across
decision-service and live wiring. The unchanged prior Stage 4/5/6 gate passed
115/115, and package type-check passed.

# Risks / Follow-ups

- Independent correctness review must report zero P0/P1 before integration.
- Stage 6 intentionally retains its existing rule that every degraded or failed
  card has a current terminal degraded-evidence decision. With that decision,
  this failed card contributes zero refs.
- Final docs/state reconciliation and Graphify refresh belong to the parent
  integration stream after all dependent branches are accepted.
