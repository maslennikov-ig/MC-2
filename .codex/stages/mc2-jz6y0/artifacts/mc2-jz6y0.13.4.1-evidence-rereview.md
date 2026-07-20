---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: cross-Stage4/5/6 source provenance and automatic decision state are high-risk correctness boundaries
repo: mc2
branch: codex/q12-source-recovery-evidence-rereview
base_branch: codex/self-hosted-qdrant-platform
base_commit: b00ae0e078ddc8183a29687689da31c4434ff627
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-evidence-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-rereview.md
success_criteria:
  - independently review correction 937ca67b against b00ae0e0 and immutable review 254a8b83
  - disposition both prior P1 findings and the prior P2 finding without changing implementation
  - require exact P0/P1/P2/P3 counts and P0/P1 zero for PASS
  - run focused Stage4/5/6 tests, package type-check, diff check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence.md
  - immutable review artifact at 254a8b83
selected_skills:
  - code-review
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review assets and repository contracts fit
parallel_group: q12-source-recovery-evidence-correction-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-evidence-correction
parallel_decision: sequential - immutable correction review depends on the complete corrected tree and one shared verification result
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch remain for orchestrator consumption; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only correction review; approved source-recovery and advisory-evidence specifications remain authoritative
graph_reviewed: used
graph_review_notes: read shared GRAPH_REPORT.md and ran a focused read-only Graphify query; no refresh is appropriate for an artifact-only review
verification:
  - exact b00ae0e0..937ca67b correction diff and relevant history: reviewed
  - complete cfce2c1c..937ca67b evidence behavior and Stage5/6 contracts: reviewed
  - focused Stage4 enumeration/parser/preflight/live plus Stage5/6 tests: passed 115/115
  - focused decision-service tests: passed 11/11
  - direct automatic unrecoverable decision probe: reproduced blocking retry-not-exhausted error at state 0/2
  - course-gen-platform package type-check: passed
  - git diff --check b00ae0e0..937ca67b: passed
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-evidence-rereview.md
explicit_defers:
  - implementation correction belongs to the original evidence stream; this reviewer must not modify production code or tests
---

# Summary

**Verdict: NEEDS_WORK.** The correction fully resolves both original P1
findings: strict lower-case UUIDv4 provenance is shared, and audited-failed IDs
are partitioned before processed/markdown loads, legacy budget/full-text
resolution, and Phase 1 semantic input. It also prevents the original P2 retry
run. However, the same correction leaves the real automatic decision service
unable to record the required terminal system decision. The exact corrected
production path throws before decision materialization, so one P1 blocks
acceptance.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        1 | blocks acceptance  |
| P2       |        0 | none               |
| P3       |        0 | none               |

# Findings

## P1 — Automatic unrecoverable evidence now skips retry but cannot record its terminal decision

- **Files:**
  `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts:423`,
  `packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts:478`,
  `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts:888`
- **Evidence:** the corrected retry loop excludes
  `coverage_reason='source_file_unrecoverable'`, so the document correctly
  creates no retry directive or replacement run. The subsequent production call
  still invokes `resolveDocumentEvidenceDecisions()`. That service handles every
  degraded/failed card by loading its retry state and, in automatic mode,
  rejecting any `attempt < maxAttempts`. With no retries created, the durable RPC
  returns the ordinary initial state `0/2`; a direct call with the exact failed
  card reproduced `Evidence retry is not exhausted; automatic degraded decision
  is forbidden`. Decision materialization was never reached. The new live-wiring
  test substitutes `resolveDecisions` with a mock that returns a fabricated
  decision ID, so it cannot expose the production failure.
- **Impact:** every automatic course containing an audited unrecoverable source
  aborts Stage 4 after the accepted evidence run instead of appending exactly one
  terminal `continue_limited` system decision. This violates the approved
  automatic-mode audit contract, prevents Stage 5/6 from receiving the terminal
  decision they require, and blocks the six-row audited-failure recovery path.
- **Required fix:** make `source_file_unrecoverable` a terminal, non-retryable
  subject inside the real decision service (or pass an explicit terminal policy
  into that service) without pretending that retries were exhausted. Materialize
  exactly one idempotent automatic `continue_limited` decision on the original
  run. Add an integration regression that uses the real decision service at
  retry state `0/2` and proves one accepted run, zero retry records/directives,
  one atomic terminal decision, and safe resume without duplication.

# Prior-finding disposition

| Immutable finding | Disposition | Evidence |
| ----------------- | ----------- | -------- |
| P1 non-v4/uppercase recovery IDs | Fixed | `evidence/source-failure.ts` has one anchored lower-case UUIDv4/variant parser used by enumeration and preflight. Focused negatives cover uppercase, v1, v8, wrong variant, whitespace, suffix, malformed text, and nonfailed states. |
| P1 derivatives loaded before preflight | Fixed | Handler partitions immediately after the twice-verified metadata snapshot; failed IDs are excluded from Redis and Supabase processed-content batches. Initialization builds budget/full-text and Phase 1 inputs from the semantic-only set, while preflight retains the original metadata-only set for exact coverage. Stale full-text allocations are filtered defensively. |
| P2 automatic retry of deterministic failure | Partially fixed / now P1 | The retry/new-run behavior is removed, but production terminal-decision creation now fails as described above. |

# Accepted behavior confirmed

- `parseLowerCaseUuidV4()` accepts only exact lower-case UUIDv4 with RFC variant
  `8|9|a|b`; neither handler nor preflight normalizes invalid input.
- The handler preserves exactly one metadata-only source record for the durable
  ledger while excluding its ID from every inspected derivative load.
- Preflight sanitizes injected full text and Stage 3 summary, excludes the source
  from budget/generation/verification, and persists one failed card with null
  summary, empty claims/terminology/constraints, and zero allocated tokens.
- No-document behavior remains unchanged in the focused live suite.
- Stage 5 remains baseline-first, tenant/course/version filtered, filters failed
  cards before retrieval, and returns the byte-identical baseline when no card is
  eligible.
- Stage 6 still requires a terminal decision for failed/degraded evidence,
  validates accepted-run/source-version allowlists, and emits zero refs and zero
  allowed document IDs for the empty audited-failure card once a valid terminal
  decision exists.

# Verification

- Reviewed the exact correction range `b00ae0e0..937ca67b`, relevant file
  history/blame, and the complete behavior range `cfce2c1c..937ca67b`; review was
  not inferred from tests alone.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm
  --filter @megacampus/course-gen-platform exec vitest run --config
  vitest.config.unit.ts` over the six assigned Stage4/5/6 files passed 6 files,
  115 tests, zero failures: enumeration 8, parser 12, preflight 27, live wiring
  24, Stage 5 30, and Stage 6 14.
- The focused real decision-service suite passed 11/11 but has no
  `source_file_unrecoverable` case.
- A direct `tsx` call to the real decision service with one exact failed card and
  durable retry state `{ attempt: 0, maxAttempts: 2 }` reproduced the blocking
  retry-not-exhausted error before `materializeDecisionGateAtomic()`.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after the
  allowed temporary isolated-worktree dependency symlinks were supplied.
- `git diff --check b00ae0e0..937ca67b` passed.

# Delivery / Cleanup

Only this immutable re-review artifact is owned by the reviewer. No
implementation, test, plan, specification, Beads state, database, Redis,
Qdrant, service, or source file was modified. Temporary dependency symlinks are
removed before commit. The review branch remains for orchestrator consumption;
delivery is returned and not accepted, with cleanup pending.

# Risks / Follow-ups / Explicit Defers

There is no justified defer for the P1. Correct the production decision-service
boundary and independently re-review it before evidence-stream integration. The
existing Stage 5/6 guards intentionally make the missing terminal decision
visible rather than silently accepting unaudited evidence.
