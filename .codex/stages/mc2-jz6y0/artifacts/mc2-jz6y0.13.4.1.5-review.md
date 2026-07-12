---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.5
stage_id: mc2-jz6y0
agent_type: correctness_reviewer_qa
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: exact-count acceptance joins filesystem recovery, tenant CAS, evidence ledgers, and reindex cutover truth
repo: mc2
branch: codex/q12-source-recovery-acceptance-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: 25397d4cfc2af98a0cd84f56f26ae8fff056b2f5
reviewed_commit: 0211319023b528799f17a4d45cf919af4eb63507
reviewed_range: 25397d4cfc2af98a0cd84f56f26ae8fff056b2f5..0211319023b528799f17a4d45cf919af4eb63507
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-acceptance-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5-review.md
success_criteria:
  - review the exact two-file Task 6 acceptance delta findings-first
  - verify public workflow and concrete adapter composition rather than duplicated acceptance logic
  - verify exact 261/240/109/129/2/21 to 261/240/234/4/2/21 truth, 42 physical and 125 logical copies, interruption resume, tenant CAS, accepted evidence, reindex equation, rollback, and cleanup
  - run focused 2/2, combined 455/455, package type-check, artifact validation, process verification, and diff checks
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md Task 6
  - accepted source-recovery workflow, crash, evidence, reindex, adapter, and runtime final artifacts/reviews
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5.md
selected_skills:
  - code-review
  - senior-architect
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer/QA
catalog_candidates:
  - none - installed architecture, review, and verification assets cover this acceptance delta
parallel_group: q12-source-recovery-task6-acceptance
depends_on_streams:
  - mc2-jz6y0.13.4.1.1
  - mc2-jz6y0.13.4.1.2
  - mc2-jz6y0.13.4.1.3
  - mc2-jz6y0.13.4.1.4
parallel_decision: sequential - the acceptance join depends on every accepted recovery stream
status: returned
delivery_method: cherry-pick
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: immutable negative review was integrated as history; its dedicated worktree/local branch were removed after the linked correction rereview passed and integration verification completed
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; the approved Task 6 contract remains current and requires acceptance-test correction
graph_reviewed: used
graph_review_notes: read the shared graph report and ran a focused recovery/evidence/reindex query; the b553292f graph is stale and was orientation-only
verification:
  - exact two-file range 25397d4c..02113190 reviewed line by line
  - focused source-recovery acceptance passed 2/2
  - combined accepted recovery plus acceptance matrix passed 455/455 across nine files
  - course-gen-platform type-check passed after temporary local dependency links
  - focused Prettier and git diff checks passed
  - artifact schema validation and process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.5-review.md
explicit_defers:
  - none - both findings must be corrected and independently re-reviewed before Task 6 acceptance
---

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 1, P2: 1, P3: 0.** The harness proves the
literal corpus equations, physical no-replace recovery, publish-before-journal
resume, exact successful 6+18 disposition states, eligible cross-tenant CAS
refusal, two-scope Stage 4 failed cards, reindex `234+6=240`, and guarded
rollback over real temporary files. It does not yet satisfy the Task 6
integration contract because it manually reconstructs the accepted coverage
binding instead of using the accepted concrete reindex adapter, and its
zero-residue assertion excludes several owned temporary classes.

| ID     | Severity | Confidence | Finding                                                                    |
| ------ | -------- | ---------- | -------------------------------------------------------------------------- |
| Q12-A1 | P1       | high       | Stage 4 output bypasses the concrete source-recovery reindex adapter join. |
| Q12-A2 | P2       | high       | Zero-residue assertion matches only copy temporaries and hides others.     |

## Q12-A1 — P1 — the acceptance path hand-builds the reindex binding

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts:41`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts:781`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts:198`
- **Evidence:** the test imports `buildReindexPlan()` and
  `calculateAcceptedFailedCoverageFingerprint()` directly but never imports or
  invokes `createSourceRecoveryReindexAdapters()`. After real
  `runDocumentEvidencePreflight()` calls, `createAcceptedFailedCoverage()`
  duplicates the production adapter's scope grouping, failed-card projection,
  accepted-ledger construction, recovery binding, and fingerprint assembly.
  `buildReindexPlan()` therefore receives a hand-built
  `AcceptedFailedCoverageBinding`, not the concrete adapter's
  `loadRecoveryBinding()` result.
- **False-positive mechanism:** the nine-file 455-test command includes the
  adapter's unit tests separately, but it never composes the actual Stage 4
  repository outputs from this 261-row fixture through that adapter. A shape,
  accepted-run scope, repository query, configured run, or fingerprint mismatch
  at the Stage 4 → adapter seam can fail in the operator while both independent
  test groups remain green.
- **Impact:** Task 6 is the final safe-execution integration gate and its Beads
  acceptance explicitly requires public workflow/adapters instead of duplicated
  logic. The current harness can authorize the exact reindex equation without
  executing the component that must produce its production binding. That leaves
  the local activation packet unproven and is blocking P1 coverage.
- **Required fix:** make the in-memory evidence repository also implement
  `SourceRecoveryReindexEvidenceRepository`, persist and validate each accepted
  run's organization/course/status, configure the exact two accepted run IDs
  and owner-pinned fingerprint, and invoke
  `createSourceRecoveryReindexAdapters(...).loadRecoveryBinding()` against the
  real manifest/journal files. Pass that returned binding—not a hand-built
  equivalent—to `buildReindexPlan()`. Assert the adapter queried both accepted
  scopes and that its canonical binding/fingerprint equals the independent
  literal oracle.

## Q12-A2 — P2 — cleanup proof ignores journal, manifest, and capability residue

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts:146`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts:196`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-acceptance.test.ts:564`
- **Evidence:** `findBoundRecoveryTemporaries()` reports only names beginning
  `.source-recovery.<RUN_ID>.` and ending `.tmp`, which covers copy temporaries.
  It cannot see deterministic `manifest.json.<sha>.tmp` or
  `journal.json.<sha>.tmp`, `.source-recovery-capability.*` probe residue, or the
  rollback fixture's `.manifest-created` backup. The final
  `rm(fixture.root, recursive)` followed by `existsSync(root) === false` proves
  only that test teardown can delete leftovers, not that the recovery workflow
  left none.
- **Impact:** a regression in manifest/journal replacement cleanup, capability
  probe cleanup, or rollback fixture reconciliation can pass both acceptance
  tests and then be erased by `finally`. This contradicts the Beads zero-residue
  criterion, though the dedicated lower-level matrices still bound the
  production safety risk, so the finding is P2.
- **Required fix:** before teardown, recursively reject every owned `*.tmp`,
  `.source-recovery-capability.*`, and `.manifest-created` entry; require the
  capability directory to be empty; require the state directory to contain
  exactly the durable manifest and journal; and require the production recovery
  directory to contain exactly 42 targets forward and zero after rollback.
  Add a mutation/sentinel assertion demonstrating that each residue class is
  detected rather than relying on final recursive deletion.

# Verified acceptance behavior

- Fixture IDs are exact and disjoint: existing eligible rows `1..109`, recovered
  rows `110..234`, audited failures `235..240`, and unsupported rows `241..261`.
- The first physical target represents 84 logical rows; the remaining 41 each
  represent one, yielding exactly 42 physical copies and 125 recovered rows.
- Before publication, 109 eligible rows share the preserved existing file,
  125 recovered rows are missing, four audited rows are missing, two are
  classified invalid, and 21 have no course. After publication the literal
  assertions require `234/4/2/21`.
- The seventeenth copy stops after `publishNoReplace()` but before its journal
  checkpoint. Disk has 17 targets while the journal has 16 published entries.
  Resume reconciles the unchanged inode, invokes physical publication exactly
  42 times total, and reaches `copied` without a duplicate link.
- The in-memory gateway uses exact complete-row expected predicates and the real
  `createRecoveryDispositionDatabase()` / `applyDispositionEntry()` seams.
  Six eligible and 18 Career Playbook entries reach verified failed states; a
  cloned eligible row with cross-tenant organization drift produces no row or
  checkpoint mutation.
- Two real Stage 4 preflight calls create four and two failed metadata-only cards
  with null summaries, empty evidence arrays, and zero allocation. The pure
  reindex validator independently rejects wrong scope/card identity and requires
  the canonical fingerprint, exact six audited rows, 234 recoverable rows, zero
  unresolved eligible gaps, 21 `missing_course` gaps, and exit code zero.
- Rollback first persists `rollback_planned`, refuses and preserves a replacement
  inode, then resumes all 42 manifest-created targets after restoration. The
  unrelated pre-existing file remains byte-identical and source counts return
  to the literal pre-copy truth.
- All dependencies are local filesystem or injected memory repositories. No
  default Supabase, Redis, Qdrant, queue, container, port, service, or remote
  mutation path is invoked.

# Verification

1. Focused acceptance passed one file and 2/2 tests.
2. Combined acceptance, crash matrix, manifest, filesystem, database, workflow,
   concrete adapter, reindex plan, and reindex command passed nine files and
   455/455 tests.
3. `pnpm --filter @megacampus/course-gen-platform type-check` passed using only
   temporary links to already installed workspace dependencies.
4. `git diff --check 25397d4c..02113190` passed.
5. Workspace build was not repeated in this bounded review; the orchestrator's
   Task 6 release-confidence gate owns the broader build.
6. Artifact schema validation, focused Prettier, and orchestration process
   verification passed.

# Delivery / Cleanup

Only this immutable review artifact is owned by the reviewer. No implementation,
test, Beads record, source file, database, Qdrant, Redis, service, port, secret,
staging, or production state was changed. The implementation remains unaccepted
pending correction and fresh independent review. No separate Beads issue is
created because open task `mc2-jz6y0.13.4.1.5` already owns the exact acceptance
gate and the reviewer write zone excludes tracker mutation.

# Risks / Follow-ups / Explicit Defers

There is no justified defer. Correct both findings, preserve the 455-test
regression and literal equations, then rerun independent P0-P3-zero review
before Task 6 integration. This review does not authorize or perform any Q12
remote action.
