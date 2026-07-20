---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer_qa
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: crash persistence and rollback inode safety protect authoritative source bytes
repo: mc2
branch: codex/q12-source-recovery-crash-matrix-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: f4a1d0ae
reviewed_commit: 491f0f2d6080c303724fe9ca7420d2a90a9441cb
reviewed_range: f4a1d0ae9f1c62b983d9c3410824d8155d6f98a1..491f0f2d6080c303724fe9ca7420d2a90a9441cb
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-crash-matrix-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-review.md
success_criteria:
  - review the crash matrix findings-first against the approved Q12 source-recovery contract
  - verify realistic crash residue, all required persistence boundaries, 42-copy transitions, inode safety, isolation, and deterministic cleanup
  - run focused matrix, recovery/reindex regression, mutation RED, package type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
selected_skills:
  - code-review
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer/QA
catalog_candidates:
  - none - installed review and verification assets cover this bounded stream
parallel_group: q12-source-recovery-local-corrections
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
  - mc2-jz6y0.13.4.1-workflow
parallel_decision: sequential - immutable implementation review gates acceptance
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch remain for orchestrator integration; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; approved source-recovery design and plan remain the required contract
graph_reviewed: used
graph_review_notes: read the shared graph report and ran a focused source-recovery query; graph is stale at b553292f and was used only for orientation
verification:
  - implementation range f4a1d0ae..491f0f2d reviewed line by line
  - focused crash matrix passed 296/296
  - combined crash plus recovery/reindex regression passed 419/419
  - same-byte replacement-inode mutation RED failed exactly as required
  - course-gen-platform type-check passed after temporary local dependency links
  - focused Prettier and git diff checks passed
  - artifact schema validation and process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-review.md
explicit_defers:
  - none - both P2 findings must be corrected and independently re-reviewed before acceptance
---

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 0, P2: 2, P3: 0.** The matrix exercises all 42
copy-state and rollback-state transitions, validates the same-byte replacement
inode guard with a meaningful mutation RED, and passes the existing recovery
and reindex regression. It cannot close the bounded acceptance gate yet because
the journal fault mock performs ordinary cleanup after its simulated process
death, and rollback omits the directory-fsync crash boundary.

| ID      | Severity | Confidence | Finding                                                                  |
| ------- | -------- | ---------- | ------------------------------------------------------------------------ |
| Q12-CM1 | P2       | high       | Journal “crashes” run catch cleanup, hiding real temporary-file residue. |
| Q12-CM2 | P2       | high       | Rollback does not inject the parent-directory fsync after target unlink. |

## Q12-CM1 — P2 — journal crash tests model exceptions, not process death

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts:129`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts:524`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:356`
- **Evidence:** the mock refuses post-crash cleanup only when
  `isRecoveryTemporary(value)` is true. A journal temporary falls through to
  the later `isJournalTemporary(value)` branch, so `writeDurableReplacement()`
  catches the injected error and successfully unlinks that temporary at source
  line 394. Consequently the assertions at test lines 556 and 601 see only
  `journal.json`; they do not observe the residue that a terminated process
  would leave before/after journal write, fsync, hard-link, or parent-fsync.
- **Impact:** the suite gives false-positive zero-residue and restart evidence.
  In particular, the production journal temporary has a random PID/UUID name,
  and no exercised restart path identifies or reconciles an orphan left by a
  real crash. The authoritative journal remains fail-closed, so this is P2
  acceptance coverage rather than a demonstrated unsafe activation.
- **Required fix:** after a crash is armed, prevent every later journal
  temporary mutation in the same process, just as the copy test already does.
  Assert the actual residue before restart, add an exact safe reconciliation
  contract for the initial and replacement journal temporary, and require zero
  residue only after that restart reconciliation. If deterministic journal-temp
  identity requires a core change, return that change to the core owner and
  re-run the full matrix.

## Q12-CM2 — P2 — rollback directory durability boundary is absent

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts:481`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:588`
- **Evidence:** the direct rollback matrix arms only `rollback-unlink`. The next
  production operation is `fsyncDirectory(targetDirectory)` at source line 589,
  but no case injects before or after that sync. The generic `parent-fsync`
  wrapper exists, yet the rollback test never arms it. The 42-entry workflow
  cases mock physical targets as a `Set`, so they cannot supply the missing
  filesystem durability evidence.
- **Impact:** the matrix does not prove restart behavior when unlink has
  happened but deletion has not yet crossed the parent-directory durability
  boundary. This leaves one required rollback crash ordering unverified.
- **Required fix:** add before/after rollback parent-fsync cases over the real
  temporary filesystem, preserve the pre-crash journal as
  `rollback_planned`, restart through `reconcileRollbackTarget()` and the public
  workflow dependency, and assert one durable deletion, `rolled_back`, and no
  residual bound temp.

# Correctly implemented coverage

- Sixteen publication cases cover before/after temp write, both temp fsyncs,
  hard-link publication, target fsync, both publication-directory fsyncs, and
  temporary unlink over the real Node filesystem.
- The exact deterministic copy temp is refused while phase is still `planned`,
  accepted only after durable `copying`, reused when exact, and rejected when
  mismatched.
- Eighty-four copy journal cases span before/after every one of the 42
  `planned -> published` transitions. The copied terminal and copying marker
  are covered independently.
- One hundred sixty-eight rollback journal cases span before/after every one
  of the 42 `published -> rollback_planned -> rolled_back` transitions.
- Changed bytes, untracked state, and a same-byte replacement inode remain
  present. With `SOURCE_RECOVERY_TEST_MUTATION_STALE_LSTAT=1`, the targeted
  inode test fails because rollback resolves instead of rejecting, proving the
  assertion detects removal of the final inode revalidation.
- Every fixture has a unique local temporary root and removes it in `finally`;
  tests launch no database, Qdrant, Redis, container, port, or remote action.

# Verification

1. Focused matrix with synthetic local Supabase placeholders passed one file
   and 296/296 tests.
2. The combined matrix, manifest, filesystem, database, workflow, reindex plan,
   and reindex command gate passed seven files and 419/419 tests.
3. The targeted stale-`lstat` mutation command failed one selected test exactly
   at the replacement-inode rejection assertion; 295 cases were skipped.
4. `pnpm --filter @megacampus/course-gen-platform type-check` passed after
   temporary links to the already installed workspace dependencies were added.
5. Focused Prettier and `git diff --check f4a1d0ae...491f0f2d` passed.
6. Artifact schema validation and orchestration process verification passed.

# Delivery / Cleanup

Only this review artifact is owned by the reviewer. No implementation, test,
Beads record, source file, database, Qdrant, service, secret, staging, or
production state was changed. The implementation remains unaccepted pending a
correction and fresh independent re-review. No separate Beads issue is created
because the open task `mc2-jz6y0.13.4.1.1` already owns this exact acceptance
gap and the reviewer write zone excludes tracker mutation.

# Risks / Follow-ups / Explicit Defers

There is no justified defer. Correct both findings, preserve the valid 419-test
regression and inode mutation RED, then re-review the corrected immutable
commit with P0-P3 all zero before integration. This review neither authorizes
nor performs Q12 remote mutation.
