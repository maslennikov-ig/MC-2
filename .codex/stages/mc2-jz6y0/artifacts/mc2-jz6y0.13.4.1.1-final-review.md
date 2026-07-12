---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer_qa
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: final retry-time fsync review protects crash-durable recovery state
repo: mc2
branch: codex/q12-source-recovery-crash-matrix-final-review
base_branch: codex/q12-source-recovery-crash-matrix
base_commit: ed06c0484f386d9e663118c2ed6c2b673ac25ade
reviewed_commit: 6f237f1e60d3ea92be5580c8671cb7dd9a3f9776
reviewed_range: ed06c0484f386d9e663118c2ed6c2b673ac25ade..6f237f1e60d3ea92be5580c8671cb7dd9a3f9776
resolves_review: 8a6a3b15
review_lineage:
  - 122f3207
  - 8a6a3b15
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-crash-matrix-final-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-final-review.md
success_criteria:
  - verify the exact reused journal temporary is descriptor-fsynced before initial link or replacement rename
  - verify O_NOFOLLOW mode/UID/device/inode/content revalidation and safe race cleanup
  - verify no regression to CM1, CM2, stale revision CAS, rollback inode safety, or zero-residue exact replay
  - run targeted 4/4, combined 430/430, inode mutation RED, package type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
  - review commits 122f3207 and 8a6a3b15
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
  - none - installed architecture, review, and verification assets cover the final delta
parallel_group: q12-source-recovery-local-corrections
depends_on_streams:
  - mc2-jz6y0.13.4.1.1-correction-2
parallel_decision: sequential - final immutable correction review gates acceptance
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch remain for orchestrator integration; temporary dependency symlinks are removed before commit
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: final review-only artifact; implementation remains aligned with the approved durability contract
graph_reviewed: used
graph_review_notes: read the shared graph report and ran a focused recovery-journal query; the stale b553292f graph was orientation-only
verification:
  - exact correction ed06c048..6f237f1e reviewed line by line
  - reused-temp retry fsync ordering passed 4/4
  - combined crash plus recovery/reindex regression passed 430/430
  - same-byte replacement-inode mutation RED failed exactly as required
  - course-gen-platform type-check passed after temporary local dependency links
  - focused Prettier and git diff checks passed
  - artifact schema validation and process verification passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1-final-review.md
explicit_defers:
  - none within this reviewed delta; mc2-jz6y0.13.4.1.3 separately owns the mandatory host-flock and stopped-writer runtime proof
---

# Summary

## Findings-first verdict

**PASS; P0: 0, P1: 0, P2: 0, P3: 0.** Final correction `6f237f1e`
closes Q12-CMR1 without weakening the earlier residue, tamper, revision-CAS,
rollback-fsync, or replacement-inode controls. An exact uncommitted journal
temporary is now reopened through a protected descriptor, fully revalidated,
fsynced, closed, and path-identity checked before either hard-link publication
or replacement rename.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        0 | none               |
| P2       |        0 | none               |
| P3       |        0 | none               |

# Q12-CMR1 closure

- **Implementation:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:435`
  adds `fsyncProtectedOwnerOnlyContentFile()`. It opens the exact deterministic
  temporary with `O_NOFOLLOW`, requires a regular mode-0600 file, compares
  descriptor device/inode with the previously inspected identity, requires the
  current UID, reads and compares the complete canonical content, and calls
  `FileHandle.sync()` on that same descriptor.
- **Ordering:** `writeDurableReplacement()` invokes the protected fsync at
  source line 528, closes the descriptor in the helper, then rechecks the path
  identity at line 534 before setting `safeTemporary=true`. Initial `link()` and
  replacement `rename()` occur only afterwards at lines 539 and 550.
- **Cleanup safety:** if protected open, identity, ownership, content, fsync, or
  final path stability fails, `safeTemporary` remains false; catch cleanup does
  not unlink the untrusted/raced path. A temporary created successfully by the
  current call remains eligible for bounded cleanup. The existing exclusive
  open race test continues to require zero unlink calls.
- **Behavioral proof:** four cases create real exact residue by crashing after
  temporary write or before the original temporary fsync for both initial and
  replacement publication. After clearing the simulated process death, each
  case observes a new `journal-temp-fsync` event followed later by the correct
  `journal-link` or `journal-rename` event. All four pass.

# Preserved controls

- CM1 remains closed: process-death simulation blocks catch cleanup, exact
  content-SHA residue is securely reusable, mismatch/mode/owner/symlink fails
  closed, and exact committed replay cleans only its bound temporary.
- Stale `expectedRevision` is not converted to permissive idempotency. Exact
  next-revision replay performs the required target/directory reconciliation
  and still returns the revision-mismatch error; every other stale revision is
  rejected without journal transition.
- CM2 remains closed: rollback injects before/after the post-unlink parent
  directory fsync through real files and the public workflow, performs one
  physical unlink, persists `rolled_back`, and leaves no bound temporary.
- The same-byte replacement-inode guard remains effective. Its mutation still
  causes the selected test to fail because rollback deletes the replacement
  instead of rejecting.
- Copy publication, all 42 copy transitions, all 42 rollback transitions,
  journal initial/replacement boundaries, target/temp committed replay, and
  mismatch isolation remain in the 430-test combined gate.

# Verification

1. `git diff --check ed06c048..6f237f1e` passed for the exact three-file delta.
2. The targeted reused-temporary ordering command passed 4/4; 302 unrelated
   matrix cases were skipped.
3. The combined crash matrix, manifest, filesystem, database, workflow, reindex
   plan, and reindex command passed seven files and 430/430 tests.
4. With `SOURCE_RECOVERY_TEST_MUTATION_STALE_LSTAT=1`, the selected same-byte
   replacement-inode test failed exactly at its rejection assertion; 305 tests
   were skipped.
5. `pnpm --filter @megacampus/course-gen-platform type-check` passed using only
   temporary links to existing workspace dependencies.
6. Workspace build was not repeated in this bounded final delta review; the
   orchestrator's combined integration/release gate owns that broader command.
7. Artifact schema validation, focused Prettier, and orchestration process
   verification passed.

# Delivery / Cleanup

Only this immutable final-review artifact is owned by the reviewer. No
implementation, test, Beads record, source file, database, Qdrant, service,
secret, staging, or production state was changed. The corrected stream is safe
for orchestrator acceptance and integration, but this review does not itself
authorize any remote Q12 action.

# Risks / Follow-ups / Explicit Defers

No P0-P3 finding or in-scope defer remains. The separate runtime stream must
still prove host-level flock coverage, stopped writers, stable exclusively
owned directories, UID/GID 1001, and exact state restoration before any
authorized remote execution.
