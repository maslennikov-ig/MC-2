---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer_qa
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: journal fsync ordering and rollback durability protect authoritative recovery state
repo: mc2
branch: codex/q12-source-recovery-crash-matrix-rereview
base_branch: codex/q12-source-recovery-crash-matrix
base_commit: 491f0f2d6080c303724fe9ca7420d2a90a9441cb
reviewed_commit: ed06c0484f386d9e663118c2ed6c2b673ac25ade
reviewed_range: 491f0f2d6080c303724fe9ca7420d2a90a9441cb..ed06c0484f386d9e663118c2ed6c2b673ac25ade
resolves_review: 122f3207
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-crash-matrix-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-rereview.md
success_criteria:
  - independently verify closure of Q12-CM1 and Q12-CM2
  - review deterministic journal temporary identity, secure residue reconciliation, strict revision CAS, fsync ordering, and rollback restart durability
  - report every P0-P3 finding and pass only with all counts zero
  - run combined 426-test regression, inode mutation RED, package type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
  - review commit 122f3207
  - https://nodejs.org/docs/v24.16.0/api/fs.html
selected_skills:
  - code-review
  - superpowers:receiving-code-review
  - senior-architect
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer/QA
catalog_candidates:
  - none - installed architecture, review, and verification assets cover the delta
parallel_group: q12-source-recovery-local-corrections
depends_on_streams:
  - mc2-jz6y0.13.4.1.1-correction
parallel_decision: sequential - immutable correction must pass independent durability review
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch remain for orchestrator integration; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; the approved durability contract remains current and the correction requires another code delta
graph_reviewed: used
graph_review_notes: read the shared graph report and ran a focused recovery-journal query; the graph is stale at b553292f and was orientation-only
verification:
  - exact correction 491f0f2d..ed06c048 reviewed line by line
  - combined crash plus recovery/reindex regression passed 426/426
  - same-byte replacement-inode mutation RED failed exactly as required
  - course-gen-platform type-check passed after temporary local dependency links
  - focused Prettier and git diff checks passed
  - artifact schema validation and process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-rereview.md
explicit_defers:
  - none - Q12-CMR1 must be corrected and independently re-reviewed before acceptance
---

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 1, P2: 0, P3: 0.** Correction `ed06c048`
closes both original findings at the logical restart layer: journal faults now
leave real residue, deterministic content-bound temporaries are checked
fail-closed, committed replay cleans an exact temporary while still returning
the stale-revision error, and rollback covers the post-unlink parent-directory
fsync through the public workflow. Acceptance is still blocked because an exact
but not-yet-fsynced journal temporary is published on restart without first
fsyncing its own inode.

| ID       | Severity | Confidence | Finding                                                                          |
| -------- | -------- | ---------- | -------------------------------------------------------------------------------- |
| Q12-CMR1 | P1       | high       | Restart publishes an exact crash temporary without re-fsyncing its file content. |

## Q12-CMR1 — P1 — exact temporary reuse skips the file durability barrier

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:478`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts:639`
- **Reproduction path:** the initial and replacement matrices inject a crash
  immediately after `journal-temp-write` and immediately before
  `journal-temp-fsync`. At that point the complete bytes are visible through
  the page cache, so the restart classifies the deterministic temporary as
  `exact`. `writeDurableReplacement()` then executes only
  `assertStableOwnerOnlyFile()` at source line 498 before hard-linking or
  renaming it at lines 502/513. Only newly created temporaries execute
  `handle.sync()` at line 494. `reconcileCommittedTemporary()` syncs an already
  committed target, but it is not used while the target still has the expected
  old revision or is absent.
- **Why the tests are false-positive:** the real filesystem exposes the bytes
  written before the simulated death, so content and inode assertions pass.
  The tests verify the later directory fsyncs and final JSON, but do not require
  a second `FileHandle.sync()` on the reused temporary. Directory fsync does not
  replace the required data-file fsync in the approved write ordering.
- **Impact:** after restart, the journal name can become durable while its data
  was never durably flushed. A second host/process failure can therefore leave
  a missing, empty, or partial authoritative progress journal despite the
  recovery command having crossed the publication barrier. This directly
  violates the crash-durable journal contract and can make copy/disposition
  ownership ambiguous, so the finding is P1.
- **Required fix:** before publishing any exact pre-existing temporary, reopen
  it with `O_NOFOLLOW`, revalidate mode, UID, device, inode, and exact bytes on
  that descriptor, call `FileHandle.sync()`, close it, then perform the final
  stable-identity check and `link`/`rename`. Extend both initial and replacement
  restart cases to require the retry-time temp fsync after crashes before or
  after the original write boundary. Preserve mismatch/symlink/mode/owner
  refusal and the current stale-`expectedRevision` error after committed replay.

# Original finding closure

| Original finding                                    | Result                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q12-CM1 — simulated crashes performed catch cleanup | Partially closed; superseded by Q12-CMR1 | The mock now blocks journal-temp unlink after the injected death and observes real residue. Content-SHA paths, `O_NOFOLLOW`, mode 0600, current UID, content, and device/inode checks securely distinguish exact reuse from mismatch. Exact committed replay fsyncs the target and parent, removes only the exact temp, fsyncs the parent again, and still rejects stale CAS. The remaining file-fsync gap is the finding above. |
| Q12-CM2 — rollback parent fsync absent              | Closed                                   | Two real-filesystem cases inject before/after the post-unlink parent fsync, retain durable `rollback_planned`, restart through `runSourceRecoveryCommand()` plus `reconcileRollbackTarget()`, persist `rolled_back`, count one unlink, and leave no bound temp.                                                                                                                                                                  |

# Correctly implemented correction controls

- Temporary identity is deterministic from the exact serialized next journal
  content and scoped to its target path; no wildcard deletion is introduced.
- Existing residue must be a non-symlink regular mode-0600 current-UID file.
  The protected open uses `O_NOFOLLOW`, compares descriptor device/inode with
  `lstat`, and requires complete byte equality.
- Wrong content, mode, apparent owner, or symlink fails closed and remains for
  operator investigation.
- Exclusive-open races do not set `safeTemporary`, so a path that appears after
  the absence inspection is never unlinked by catch cleanup.
- Committed exact replay is recognized only when disk revision equals
  `expectedRevision + 1` and canonical current bytes equal canonical `next`.
  Reconciliation does not return success: it cleans exact residue, then retains
  the original revision-mismatch error. Other stale revisions remain rejected.
- The rollback correction uses real files and the public workflow rather than
  a mock-only `Set`; before/after parent-fsync retries perform exactly one
  physical unlink and persist the terminal state.
- The replacement-inode mutation remains behaviorally meaningful.

# Verification

1. The exact correction range contains four changed files and passed
   `git diff --check 491f0f2d..ed06c048`.
2. The combined crash matrix, manifest, filesystem, database, workflow, reindex
   plan, and reindex command suite passed seven files and 426/426 tests.
3. With `SOURCE_RECOVERY_TEST_MUTATION_STALE_LSTAT=1`, the selected same-byte
   replacement-inode test failed exactly because rollback resolved instead of
   rejecting; 301 tests were skipped.
4. `pnpm --filter @megacampus/course-gen-platform type-check` passed using only
   temporary links to already installed workspace dependencies.
5. Workspace build was not repeated in this bounded delta review; the
   orchestrator's combined integration/release gate owns that broader command.
6. Artifact schema validation, focused Prettier, and orchestration process
   verification passed.

# Delivery / Cleanup

Only this immutable re-review artifact is owned by the reviewer. No
implementation, test, Beads record, source file, database, Qdrant, service,
secret, staging, or production state was changed. The corrected implementation
remains unaccepted pending Q12-CMR1 correction and fresh independent review.
No separate Beads issue is created because the open task
`mc2-jz6y0.13.4.1.1` already owns this exact durability gate and the reviewer
write zone excludes tracker mutation.

# Risks / Follow-ups / Explicit Defers

There is no justified defer for Q12-CMR1. Preserve the 426-test regression,
inode mutation RED, strict CAS rejection, secure temporary validation, and
rollback fsync coverage while adding the retry-time file fsync. This review
does not authorize or perform any Q12 remote mutation.
