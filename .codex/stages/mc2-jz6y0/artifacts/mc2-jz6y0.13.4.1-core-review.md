---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: crash-durable publication, rollback, and exact CAS binding are data-loss-sensitive contracts
repo: mc2
branch: codex/q12-source-recovery-core-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: b553292f
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-core-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-review.md
success_criteria:
  - exhaustive independent review of b553292f..cf51722c
  - evidence-based P0-P3 findings and explicit PASS or NEEDS_WORK verdict
  - focused tests, package type-check, artifact validation, and process verification
selected_docs:
  - AGENTS.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
selected_skills:
  - code-review
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills fit the assigned stream
parallel_group: q12-source-recovery-core-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
parallel_decision: sequential - Task 1 is the contract gate for dependent streams
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch may be removed after the review artifact is integrated
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only review; the approved design is the stricter contract and implementation fixes must reconcile the narrower plan interface to it
graph_reviewed: no-change-needed
graph_review_notes: review-only artifact changes no code or architecture; GRAPH_REPORT.md is not present in this isolated review worktree
verification:
  - exact diff b553292f..cf51722c: reviewed 5 files, 1214 insertions
  - focused source-recovery unit tests: passed 10/10
  - package type-check: passed after temporary dependency symlinks were supplied
  - targeted phase/state probe: reproduced acceptance of rollback_planned at reindex_started
  - targeted initial-journal probe: reproduced acceptance of rolled_back and disposition_verified states at revision 0 planned
  - artifact schema validation: passed after adding the required risks/follow-ups heading
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-review.md
explicit_defers:
  - implementation fixes belong to orchestrator follow-up; this review does not modify implementation, tests, spec, plan, or Beads
---

# Summary

**Verdict: NEEDS_WORK.** Exact range `b553292f..cf51722c` has zero P0,
four P1, three P2, and zero P3 findings. The streaming byte identity check,
same-directory hard-link publication, file/directory fsync order, target
reconciliation, mode `0644`, and hash guard are useful foundations, but the
reviewed manifest and journal cannot yet enforce the approved recovery gate.
Any P1 blocks integration.

| Priority | Findings | Integration effect |
| -------- | -------: | ------------------ |
| P0       |        0 | none               |
| P1       |        4 | blocks integration |
| P2       |        3 | fix with Task 1    |
| P3       |        0 | none               |

# Blocking findings

## P1 — The immutable manifest does not bind the reviewed execution environment

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:83`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:7`
- **Evidence:** the strict manifest schema contains only `release_sha` plus
  counts and entries. It omits the approved generation time, operator digest,
  source-audit version, and source/target containment-root identity. The
  filesystem API then accepts arbitrary `developmentRoot` and `productionRoot`
  values outside the manifest hash. The approved design requires all of those
  fields in the reviewed manifest
  (`docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md:120`).
- **Impact:** the same reviewed manifest SHA can be executed by a different
  operator/audit generation or against a different writable root whose relative
  targets happen to be absent. Review approval therefore does not identify the
  actual mutation boundary.
- **Required fix:** extend the strict schema with the approved operator digest,
  audit version, generation metadata, and non-secret canonical mount/root
  identities. Bind executor inputs to those values before any inspection,
  publication, reconciliation, or rollback. Amend the narrower Task 1 interface
  in the plan rather than treating it as a waiver of the approved design.

## P1 — Disposition entries cannot express the exact reviewed CAS predicates

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:45`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:157`
- **Evidence:** `RecoveryDispositionEntry` records catalog/source IDs,
  organization/course, hash, path, and reason, but has no expected prior
  `file_catalog.vector_status` or `error_message`. For Career Playbook rows it
  also lacks expected `playbook_id`, `user_id`, prior `status`, and prior
  `error_message`. The strict schema rejects adding these predicates later.
  Normalization checks only disposition `entry_id` uniqueness; duplicate
  `file_catalog_id` or `career_playbook_source_id` values can satisfy the
  aggregate count at lines 193-200. The design requires exact reviewed
  ownership/path/hash/prior-status predicates and one entry per absent original
  (`design.md:98` and `design.md:127`).
- **Impact:** Task 2 cannot derive an immutable, owner-reviewed exact CAS from
  this manifest. A six-entry manifest can name the same row repeatedly, and
  mutable database state loaded after review would have to supply missing
  predicates. That breaks tenant/ownership immutability and the six-plus-eighteen
  disposition truth.
- **Required fix:** store every prior predicate needed for both CAS operations
  in the immutable entry, enforce kind-specific fields, and reject duplicate
  catalog/source identities. Task 2 must compare the live rows to those exact
  values, not populate expected predicates from a post-review read.

## P1 — One disposition state cannot durably checkpoint the paired Career Playbook CAS

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:105`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:378`
- **Evidence:** each disposition has only
  `disposition_planned -> disposition_applied -> disposition_verified`.
  Eighteen Career Playbook outcomes require two writes: the linked
  `career_playbook_sources` row and the `file_catalog` row. The approved design
  says every CAS result is persisted before advancing (`design.md:108` and
  `design.md:114`), while Task 2 explicitly requires paired Career Playbook
  substates. No state here distinguishes “source CAS durable, catalog CAS not
  yet applied” from “both applied.”
- **Impact:** a crash between the two CAS operations leaves the journal unable
  to state which reviewed mutation is durable. A later generic `applied` state
  can either skip the second row or falsely imply both writes completed; leaving
  the entry `planned` fails the required per-CAS write-ahead checkpoint.
- **Required fix:** add kind-specific durable substates (or separately bound
  per-table state) for source-applied and catalog-applied, with legal idempotent
  reconciliation transitions and tests for crashes before and after each CAS.

## P1 — Phase transitions are not coherent with entry states

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:340`,
  `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:394`
- **Evidence:** validation limits a phase to the same or next enum value and
  validates each entry locally, but never requires all copies to be published
  before `copied`, all dispositions to be applied before
  `dispositions_applied`, or all dispositions verified before `verified` and
  `reindex_started`. Its rollback freeze tests `current.phase`, so the accepted
  transition `verified -> reindex_started` may simultaneously change a copy
  from `published -> rollback_planned`. A targeted probe reproduced that exact
  accepted value. Initial persistence checks only revision `0` plus phase
  `planned`; a second probe wrote an initial journal whose copy was already
  `rolled_back` and disposition already `disposition_verified`.
- **Impact:** the durable journal can authorize Qdrant reindex while bytes are
  absent/rolling back or dispositions are incomplete. This defeats the final
  no-gap hard gate and can make rollback and reindex overlap.
- **Required fix:** validate whole-journal invariants for every phase, freeze
  copy states when `next.phase >= reindex_started`, and require canonical initial
  key sets/states derived from the bound manifest. Add negative tests for every
  skipped/incoherent phase-state combination.

# Non-blocking findings / required hardening

## P2 — Immutable creation has a check-then-replace race and does not enforce the owner-only directory

- **File:** `packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts:231`
- **Evidence:** `writeImmutableManifest()` calls `lstat` through
  `assertAbsent()`, then later publishes with ordinary `rename()`. If a target
  appears between those operations, POSIX rename replaces it rather than
  failing no-replace. Also, `mkdir(..., { mode: 0o700 })` applies the mode only
  when creating a directory; an existing broader directory is accepted without
  ownership/mode verification. The file itself is correctly chmodded `0600` and
  fsynced before rename.
- **Impact:** a concurrent planner can overwrite a different write-ahead
  manifest, and sensitive IDs/paths/hashes can be placed under a directory that
  is not actually owner-only. The host `flock` reduces cooperative concurrency
  but should not be the only enforcement of immutability or secret-safe mode.
- **Fix:** publish the immutable target with an atomic no-replace primitive,
  validate the state directory is a real directory owned by the executor with
  mode `0700`, and keep the current file plus parent fsync sequence. Add a race
  test where the target appears after the absence check.

## P2 — Path containment and rollback retain check/use race windows

- **File:** `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:52`
- **Evidence:** roots/components are resolved and checked first, but later
  `open`, `link`, `fsync`, and `unlink` calls use path strings. In rollback, the
  target is opened and hashed at lines 278-285, then independently unlinked by
  path at line 286. A writable parent or target can be exchanged between the
  check and use, causing the code to fsync or unlink a different inode. The
  approved host-level pause/flock is external to this module and does not by
  itself prevent non-cooperating filesystem mutation.
- **Impact:** without exclusive directory ownership/enforcement, rollback can
  delete a changed/untracked file after hashing the expected inode, contrary to
  the promise never to remove changed or pre-existing data. Publication can
  also validate/fsync a different directory generation from the one used by
  `link`.
- **Fix:** make the later operator gate prove exclusive ownership and stable
  non-writable directory components for the whole window. Where feasible, bind
  operations to directory handles/inode identities and revalidate target inode
  identity immediately before unlink; otherwise fail closed when the required
  filesystem primitive is unavailable.

## P2 — Crash leftovers and required failure-order tests are absent

- **Files:**
  `packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts:207`,
  `packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts:49`
- **Evidence:** a crash after temporary creation/chmod but before unlink leaves
  a random `.source-recovery.*.tmp` file. Restart reconciliation examines only
  the final target, and neither discovers nor safely removes a manifest-bound
  orphan. The four filesystem tests cover success, basic rejection,
  target-state reconciliation, and rollback, but do not inject crashes before/
  after link, target fsync, either directory fsync, or journal transition; they
  do not cover a temp leftover or published-before-journal cleanup. The plan
  explicitly requires those cases (`plan.md:214-227`). Manifest tests likewise
  assert the success call order but not temporary cleanup on each failure edge.
- **Impact:** interrupted runs can leave untracked source-byte copies in the
  production tree, and the current 10/10 pass does not establish the crash
  durability/order claimed by the implementation artifact.
- **Fix:** use deterministic manifest/run/entry-bound temp names or a separately
  recorded temp identity, reconcile only exact safe orphans, fsync cleanup, and
  add injected failure tests at every ordered durability boundary plus restart
  tests for absent/exact/mismatched targets and rollback-before-journal.

# Positive evidence

- `publishNoReplace()` streams the opened non-symlink regular source, verifies
  expected size/SHA-256, re-hashes the temp, and uses a same-directory hard link
  whose `EEXIST` path fails closed.
- After link publication it fsyncs the target and parent before removing the
  temp, then fsyncs the parent again. Ambiguous post-link errors leave the final
  target for exact restart reconciliation rather than deleting it.
- `inspectRecoveryTarget()` and published-state reconciliation reject missing
  or mismatched targets; rollback requires `rollback_planned`, hashes the target,
  unlinks it, and fsyncs the parent.
- Manifest and journal files are serialized strictly, file handles are fsynced,
  and parent directories are fsynced after rename. Runtime files are mode
  `0600`; published content is mode `0644`.
- No implementation path contains credentials or source text. Full runtime
  paths can still appear in thrown errors, so the later CLI must preserve the
  approved aggregate/redacted logging boundary.

# Verification evidence

- Reviewed exactly `git diff b553292f..cf51722c`: five added files and 1,214
  insertions. History contains one implementation commit, `cf51722c`.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=unit-test-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/source-recovery-manifest.test.ts tests/unit/tools/qdrant/source-recovery-filesystem.test.ts`
  passed: 2 files, 10 tests, zero failures.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed after
  temporary symlinks to the main workspace dependency directories were added.
  The initial environment-only attempt failed because shared package
  `node_modules` links were absent; it passed after supplying the allowed links.
- A `tsx` probe against `validateRecoveryJournalTransition()` reproduced
  acceptance of `verified/published -> reindex_started/rollback_planned`.
- A second `tsx` probe against `replaceProgressJournal()` reproduced acceptance
  of an initial revision-0/planned journal with terminal per-entry states.
- `git diff --check b553292f..cf51722c` passed.

# Delivery / cleanup

Only this review artifact is owned by the reviewer. No implementation, tests,
spec, plan, Beads state, staging service, database, Qdrant instance, or runtime
data was changed. Temporary dependency symlinks must be removed before commit.

# Risks / Follow-ups / Explicit Defers

All implementation fixes and regression tests belong to orchestrator follow-up
on the Task 1 implementation stream. Dependent Tasks 2-5 must not branch from
or integrate `cf51722c` until every P1 above is resolved and independently
re-reviewed.
