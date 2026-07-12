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
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence
write_zone:
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - focused Stage 4/5/6 evidence tests
  - this artifact
success_criteria:
  - accept only exact audited source_file_unrecoverable file status and recovery UUID
  - persist exactly one metadata-only zero-content failed coverage card before derivative or budget use
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
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: worktree remains for independent review; temporary dependency symlinks are removed before commit
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
changed_files:
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/document-source-enumeration.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
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
`source_file_unrecoverable; recovery_run=<UUID>` disposition on a failed row.
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

# Risks / Follow-ups

- Independent correctness review must report zero P0/P1 before integration.
- Stage 6 intentionally retains its existing rule that every degraded or failed
  card has a current terminal degraded-evidence decision. With that decision,
  this failed card contributes zero refs.
- Final docs/state reconciliation and Graphify refresh belong to the parent
  integration stream after all dependent branches are accepted.
