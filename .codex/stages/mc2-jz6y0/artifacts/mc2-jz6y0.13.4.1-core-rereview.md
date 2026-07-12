---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: corrected recovery publication and rollback remain data-loss-sensitive contract boundaries
repo: mc2
branch: codex/q12-source-recovery-core-rereview
base_branch: codex/self-hosted-qdrant-platform
base_commit: b553292f
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-core-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-rereview.md
success_criteria:
  - review b553292f..ddd77560 and correction cf51722c..ddd77560
  - disposition every prior 4 P1 and 3 P2 finding
  - fresh focused tests, type-check, artifact validation, and process verification
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-review.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
selected_skills:
  - code-review
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review assets fit
parallel_group: q12-source-recovery-core-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-core-correction
parallel_decision: sequential - corrected Task 1 remains the dependency gate
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch may be removed after artifact integration
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only correction review; approved design remains the controlling contract
graph_reviewed: no-change-needed
graph_review_notes: review artifact changes no code or architecture; no local graph refresh is warranted
verification:
  - exact ranges b553292f..ddd77560 and cf51722c..ddd77560: reviewed
  - focused source-recovery tests: passed 17/17
  - package type-check: passed
  - Career Playbook checkpoint probe: reproduced direct planned-to-applied acceptance
  - canonical manifest SHA probe: reproduced acceptance of a nonmatching journal hash
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-rereview.md
explicit_defers:
  - implementation fixes belong to orchestrator follow-up; this review does not modify code, tests, docs, plan, spec, or Beads
  - stable exclusively owned upload directory components and stopped writers remain a mandatory operator proof before any mutation
---

# Summary

**Verdict: NEEDS_WORK.** The correction materially resolves five prior findings
and bounds the filesystem TOCTOU finding, but two P1 and two P2 findings remain.
Any P1 blocks Task 1 acceptance and dependent implementation streams.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        2 | blocks integration |
| P2       |        2 | fix with Task 1    |
| P3       |        0 | none               |

# Findings

## P1 — Career Playbook dispositions can still skip the durable source-CAS checkpoint

- **File:** `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:542`
- **Evidence:** the generic transition table permits
  `disposition_planned -> disposition_applied` at lines 543-547. Kind-specific
  validation only forbids an eligible disposition from entering
  `career_playbook_source_applied`; it does not require a Career Playbook entry
  to pass through that state. A targeted probe with a copied-phase Career
  Playbook entry accepted the direct transition and returned
  `disposition_applied`.
- **Impact:** Task 2 can persist a state that claims both CAS operations are
  complete without ever durably recording the source-row CAS. A crash between
  source and catalog writes again becomes indistinguishable from a completed
  pair, so prior P1 finding 3 is still open.
- **Required fix:** make transitions kind-specific: eligible entries may move
  directly from planned to applied, while Career Playbook entries must move
  `planned -> career_playbook_source_applied -> disposition_applied`. Add the
  missing negative regression test for the direct Career Playbook skip.

## P1 — The journal hash is not verified against canonical manifest bytes

- **File:** `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:407`
- **Evidence:** `createInitialProgressJournal()` validates only that the supplied
  `manifestSha256` has 64 lower-case hex characters. On the initial write,
  `replaceProgressJournal()` constructs its canonical comparison using
  `next.manifest_sha256` itself at lines 600-605. It never serializes/hashes the
  supplied normalized manifest and compares the result. A targeted probe passed
  a format-valid fake digest different from SHA-256 of the canonical manifest;
  the initial journal was accepted and written.
- **Impact:** the core contract can create a journal that claims a different
  immutable execution identity. Downstream actors cannot safely treat
  `run_id + manifest_sha256` as the reviewed binding without adding an
  out-of-band rule, contrary to the approved Task 1 contract.
- **Required fix:** expose/use one canonical manifest serialization/hash helper,
  recompute the digest inside initial journal creation/persistence, and reject
  any mismatch. Add a regression test that supplies a valid but incorrect hash.

## P2 — Initial journal publication can overwrite a raced journal

- **File:** `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:579`
- **Evidence:** after observing `ENOENT`, `replaceProgressJournal()` calls
  `writeDurableReplacement(..., { publication: 'replace' })` at line 608.
  Ordinary rename replaces a journal that appears between the read and rename;
  the immutable no-replace hard-link path is used only for the manifest.
- **Impact:** a concurrent same-UID writer can replace newly durable progress
  with revision zero. The mandatory host-level `flock` bounds cooperative
  writers, but initial write-ahead publication should fail closed even when that
  operational assumption is violated.
- **Fix:** use atomic no-replace publication whenever `expectedRevision === -1`;
  retain replace publication only for an existing journal under the mandatory
  single-writer lock. Add an initial-journal target-race test.

## P2 — Required crash-order and cleanup tests remain incomplete

- **Files:**
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts:109`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:295`
- **Evidence:** the new filesystem test proves exact deterministic temp reuse,
  cleanup, and mismatch refusal. It still does not inject failures before/after
  hard link, target fsync, first parent fsync, temp unlink, second parent fsync,
  or the subsequent journal transition. The rollback test does not exercise the
  new device/inode mismatch guard. The plan explicitly requires crash/restart
  cases for temp leftover, published-before-journal, and rollback-before-journal
  (`docs/superpowers/plans/2026-07-12-q12-source-recovery.md:214`).
- **Impact:** 17/17 validates ordinary paths but does not prove the full
  durability/error-cleanup order or the new inode guard under injected failure.
- **Fix:** inject filesystem operations or add a purpose-built adapter, fail at
  every ordered boundary, and assert target/temp/journal plus directory-fsync
  postconditions after restart. Add a same-content replacement-inode rollback
  test.

# Prior-finding disposition

| Prior finding | Disposition | Evidence |
| ------------- | ----------- | -------- |
| P1 environment/audit/root binding | Fixed | Manifest now binds timestamp, release, operator digest, audit version, and normalized roots at `source-recovery-manifest.ts:110`; runtime roots are realpath-compared and overlap-rejected at `source-recovery-filesystem.ts:68`. |
| P1 exact CAS predicates and uniqueness | Fixed | Prior file status/error and Career Playbook playbook/user/status/error predicates are strict at `source-recovery-manifest.ts:56`; catalog and source IDs are unique at lines 205-229. |
| P1 paired Career Playbook state | Still open | Dedicated state exists, but direct planned-to-applied remains legal at lines 542-564. |
| P1 canonical phase/state coherence | Fixed | Canonical initial keys/states, phase completion gates, reindex freeze, and immutable kinds are enforced at lines 407-575 and 599-605. The separate canonical-hash finding above remains new/open. |
| P2 immutable no-replace and mode 0700 | Fixed | State directory ownership/mode checks and hard-link no-replace publication are implemented at lines 298-404 and covered by race/mode tests. |
| P2 containment/rollback TOCTOU | Bounded defer | Runtime roots are bound; rollback compares device/inode immediately before unlink at `source-recovery-filesystem.ts:389`. A final path-operation race remains bounded only by stopped writers, stable exclusively owned directories, and the host-level lock; this proof remains mandatory before mutation. |
| P2 crash temporary and tests | Partially fixed / still P2 | Deterministic run/entry temp reconciliation is implemented at `source-recovery-filesystem.ts:182-229`; the required failure-injection matrix remains absent. |

# Positive evidence

- Immutable manifest publication now uses a same-directory no-replace hard link,
  fsyncs publication and cleanup directory changes, and rejects non-`0700`,
  symlink, non-directory, or wrong-owner state directories.
- The manifest now binds the approved operator/audit/root metadata and exact CAS
  predicates without admitting duplicate catalog or Career Playbook source IDs.
- Whole-journal validation enforces canonical entry sets, phase order, copy
  completion before `copied`, disposition completion before later phases, and
  fully published/verified state before frozen `reindex_started`.
- Filesystem publication retains streamed source/temp identity checks, atomic
  no-replace target linking, target and parent fsync, deterministic exact-temp
  reconciliation, root separation, symlink rejection, and mode `0644`.
- Rollback remains forbidden after reindex start, verifies size/hash, compares
  device/inode immediately before unlink, fsyncs the directory, and reconciles
  only exact deterministic temporaries.

# Verification evidence

- Reviewed complete implementation range `b553292f..ddd77560` and correction
  range `cf51722c..ddd77560`; correction modifies the two core modules, their two
  unit files, and the implementation artifact, while carrying the immutable
  prior review artifact.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=unit-test-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/source-recovery-manifest.test.ts tests/unit/tools/qdrant/source-recovery-filesystem.test.ts`
  passed: 2 files, 17 tests, zero failures.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after the
  allowed temporary dependency symlinks were supplied.
- Targeted `tsx` phase probe reproduced direct Career Playbook
  `disposition_planned -> disposition_applied` acceptance.
- Targeted `tsx` binding probe proved an initial journal accepts a format-valid
  digest different from SHA-256 of its canonical manifest bytes.
- `git diff --check cf51722c..ddd77560` passed.

# Delivery / cleanup

Only this re-review artifact is owned by the reviewer. Temporary dependency
symlinks must be removed before commit. No implementation, tests, docs, plan,
spec, Beads state, service, database, Qdrant instance, or runtime data was
mutated.

# Risks / Follow-ups / Explicit Defers

Task 1 remains blocked until both P1 findings are corrected and re-reviewed.
The P2 test gaps should close in the same correction. The residual path-level
TOCTOU boundary is acceptable only as an explicit operator defer with proof of
stopped writers, stable exclusively owned directory components, and one
host-level lock across the complete recovery window.
