---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1-reindex-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: recovery-bound reindex resume and write-ahead ordering protect production rollback and exact document coverage
repo: mc2
branch: codex/q12-source-recovery-reindex-review
base_branch: codex/q12-source-recovery-core
base_commit: cfce2c1c
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-reindex-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex-review.md
success_criteria:
  - independently review cfce2c1c..767554c8 against the approved Q12 reindex contract
  - verify exact 240=234+6 truth, canonical recovery binding, schema-v3 resume, pre-enqueue durability, idempotency, no allow-gaps, and aggregate-only output
  - run focused core and reindex tests, package type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex.md
selected_skills:
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review and verification skills cover this bounded stream
parallel_group: q12-source-recovery-reindex-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
  - mc2-jz6y0.13.4.1-reindex
parallel_decision: sequential - this independent review gates acceptance of the complete reindex stream
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: temporary dependency symlinks were removed before commit; only this review artifact remains changed
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; the approved Q12 design and plan remain the correction authority
graph_reviewed: used
graph_review_notes: read the root graph report and ran a focused Qdrant reindex/source-recovery/queue query; the graph is stale and provided orientation only, and this review makes no graph-worthy implementation change
verification:
  - exact range cfce2c1c..767554c8 and all five changed files reviewed
  - focused core plus reindex regression passed 70/70
  - course-gen-platform package type-check passed
  - UUID probe proved generic Zod uuid accepts version 1 and NIL identifiers
  - git diff check passed
  - artifact schema validation passed
  - orchestration process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex-review.md
explicit_defers:
  - no finding is accepted as deferred; all P1 findings require correction and independent re-review before integration
---

# Summary

**Verdict: NEEDS_WORK / NOT ACCEPTED.** Exact range
`cfce2c1c..767554c8` has zero P0, five P1, three P2, and zero P3 findings.
The exact planner truth, raw diagnostics, no-`--allow-gaps` behavior, and focused
tests are correct, but the crash/resume and disclosure boundaries do not satisfy
the approved contract. P1 must be zero before this stream can be integrated.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        5 | hard stop          |
| P2       |        3 | correct in rework  |
| P3       |        0 | none               |

# Findings

## P1 — Schema-v3 artifact is not crash-durable or initial no-replace

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:1004`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:694`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:696`
- **Evidence:** `persistExecutionArtifact()` writes a predictable temporary
  path and renames it over the target, but never fsyncs the temporary inode or
  parent directory and never uses atomic no-replace for the initial ledger.
  Fresh execution treats that return as durable, then persists
  `reindex_started`. A raced writer can also replace an artifact between the
  earlier load and this rename.
- **Impact:** after a host crash, the recovery journal can durably prohibit
  rollback while the ledger is absent or corrupt. Restart sees
  `reindex_started` plus no artifact and rejects it as a fresh run, so even a
  pre-enqueue crash cannot be reconciled. A race can silently destroy a prior
  run ledger.
- **Required correction:** use an owner-only secure state directory, random
  same-directory temp, temp fsync, atomic no-replace initial publication,
  parent fsync, and durable temp/fsync/rename/parent-fsync replacement for later
  checkpoints. Add crash injection around initial artifact, journal transition,
  and first enqueue, including artifact/Redis loss recovery.

## P1 — `reindex_started` confirmation trusts an adapter echo

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:137`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:702`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:1047`
- **Evidence:** the persistence dependency returns a journal object and the
  command only compares that returned object with `next`. There is no separate
  journal reload/parse after persistence. Both the unit seam and fixture adapter
  demonstrate the unsafe implementation by returning `next` unchanged.
- **Impact:** an adapter can acknowledge without durably writing. The command
  then enqueues work while the on-disk phase remains `verified`, leaving
  rollback apparently permitted after reindex side effects begin.
- **Required correction:** wire the core crash-durable journal replacement,
  then independently reload and strictly parse the persisted journal and
  confirm run, canonical manifest SHA, revision, phase, and exact states before
  any enqueue. Tests must distinguish write acknowledgement from persisted
  re-read.

## P1 — A structurally valid but inconsistent ledger can skip unprocessed jobs

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:623`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:948`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:979`
- **Evidence:** the schema validates job-ID arrays and numeric fields
  independently. It does not require unique IDs, exact planned IDs, completed
  to be a subset of accepted/planned, failure disjointness, or counts to equal
  their arrays. When Redis no longer retains a job, execution trusts membership
  in `completedJobIds` alone and skips the source even if `acceptedJobIds` is
  empty and `counts.completed` is zero.
- **Impact:** a parse-valid stale, manually damaged, or previously malformed
  ledger can make execute report completion without enqueuing one or more of
  the 234 recoverable documents. Later parity verification may catch the gap,
  but schema-v3 resume and execution idempotency are already false.
- **Required correction:** strictly validate the complete ledger invariant
  against the current fingerprint-derived deterministic job set and recompute
  every count. Only a coherent terminal-success checkpoint may survive Redis
  retention; otherwise retry deterministically or stop.

## P1 — CLI exception and success paths are not aggregate-only

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:419`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:529`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:596`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:1403`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:1511`
- **Evidence:** normal execute stderr prints the full run ID. Several thrown
  errors embed artifact paths, run IDs, or job IDs; job IDs contain both run and
  file IDs. Source paging and Qdrant conflict errors also embed full file or
  document IDs. The direct CLI catch writes raw `error.message`, bypassing the
  report redactor.
- **Impact:** operator logs can expose full identities and filesystem paths,
  contradicting the approved aggregate-only output and leak gate. Current tests
  cover only successful plan and unresolved execute output, not thrown errors or
  successful execute stderr.
- **Required correction:** map all CLI failures to bounded reason codes and
  aggregate counts, omit run/job/file IDs and paths from human output, and add
  adversarial tests for retained-job mismatch, artifact mismatch, paging error,
  malformed fixture, and successful execute.

## P1 — Failed coverage is not bound to its accepted recovery run

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:74`,
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:153`,
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:182`
- **Evidence:** `RecoveryReindexBinding` carries only
  `verifiedFailedCoverageFileIds`. Exact set equality proves identities, but no
  accepted coverage-ledger identity, recovery run ID, manifest SHA, tenant/course
  binding, or coverage fingerprint is supplied. The verification fingerprint
  hashes the file IDs but cannot prove which coverage run verified them.
- **Impact:** failed coverage from an older recovery run with the same six file
  IDs satisfies the gate even when its recorded `recovery_run` is stale. Reindex
  may exclude documents without the exact current accepted coverage truth.
- **Required correction:** bind an accepted coverage ledger/fingerprint to the
  canonical recovery run and manifest SHA and validate exact file, tenant,
  course, failed reason, and zero-evidence invariants before classification.

## P2 — Explicit reindex run IDs are not exact lower-case UUIDv4

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:385`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:948`
- **Evidence:** generic `z.string().uuid()` is used for CLI and schema-v3 run
  IDs. A focused runtime probe showed it accepts a version-1 UUID and the NIL
  UUID, whereas the recovery-core contract uses a lower-case UUIDv4 regex.
- **Impact:** operator-supplied non-v4 identities violate the exact run
  namespace contract and can weaken deterministic resume assumptions.
- **Required correction:** reuse one strict lower-case UUIDv4 schema for CLI,
  fixture, artifact, and queue run binding, with version-1, NIL, uppercase, and
  malformed negative tests.

## P2 — `complete` is accepted, then rejected by every operational path

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:83`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:476`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:806`
- **Evidence:** binding validation recognizes `complete` as verified, but
  `assertRecoveryPhase()` accepts only `verified` without an artifact or
  `reindex_started` with one. Verify never persists `complete` after success and
  cannot be rerun once another operator step does so.
- **Impact:** the declared state machine has no idempotent terminal inspection
  behavior and completion ownership is ambiguous.
- **Required correction:** define and test who durably transitions successful
  verify to `complete`; permit read-only plan/verify at `complete` with the exact
  ledger while continuing to reject execute and rollback.

## P2 — Recovery binding breaks the documented course-scoped mode

- **Files:**
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:149`,
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:159`,
  `packages/course-gen-platform/tools/qdrant/reindex-plan.ts:345`,
  `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts:399`
- **Evidence:** `--course-id` filters source rows first, but binding validation
  still requires all six global dispositions to exist in that subset and later
  compares the subset with global `240/234/4/2/21` counts. No focused test uses
  `courseId` with a real recovery binding.
- **Impact:** the still-documented plan/execute/verify option fails for normal
  course subsets.
- **Required correction:** either remove course-scoped operation explicitly for
  recovery-bound Q12 runs or define a canonical, manifest-derived scoped
  projection whose coverage and counts remain exact; add all three mode tests.

# Positive evidence

- The exact full-run planner test proves 240 eligible equals 234 recoverable plus
  6 audited failures, raw diagnostics remain 4 missing plus 2 invalid, unresolved
  gaps are zero, and expected documents equal 234.
- The canonical manifest SHA is recomputed; exact journal copy/disposition key
  sets and verified states are checked; current source owner/course/hash/path/
  status/error predicates are matched.
- Generic failed rows remain unresolved and `--allow-gaps` is removed from both
  API and CLI parsing.
- Unresolved gaps stop execute before journal/enqueue and stop verify before
  Qdrant reads. Candidate and verification document IDs contain only recoverable
  rows.
- Fresh happy-path ordering places the requested journal transition before the
  first enqueue; retained jobs use deterministic run/file job IDs.

# Verification

- Reviewed exact history and diff `cfce2c1c..767554c8` across the two production
  modules, two focused test modules, and stream artifact. `git diff --check`
  passed.
- Focused regression passed: 4 files, 70 tests, zero failures across recovery
  manifest/filesystem and reindex planner/command.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed, including
  required shared-package builds.
- Runtime Zod probe returned `true` for version-1, version-4, and NIL UUIDs,
  confirming the strict-UUID finding.
- No live database, Redis, Qdrant, server, source-recovery filesystem, deploy,
  or alias operation was invoked.

# Risks / Follow-ups

Do not merge or operate this reindex stream until all five P1 findings are
corrected and independently re-reviewed. Correction should add negative tests
for every listed crash, echo, ledger-coherence, disclosure, and stale-coverage
case; the green 70-test suite alone does not exercise those boundaries. The P2
UUID, terminal-phase, and course-scope contracts should be corrected in the
same bounded rework so the operator integration receives one coherent API.
