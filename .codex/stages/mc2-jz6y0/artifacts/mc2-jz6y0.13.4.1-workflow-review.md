---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1-workflow-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source recovery publishes production source files and mutates audited database dispositions, so manifest binding, owner-only state, and pre-publication invariants require independent high-rigor review
repo: mc2
branch: codex/q12-source-recovery-workflow-review
base_branch: codex/q12-source-recovery-workflow
base_commit: cfce2c1c3d927e1ba1537a81d959302a166162c3
reviewed_commit: f4a23c593acccff2fad50f62a1a99427c93f9a77
reviewed_range: cfce2c1c3d927e1ba1537a81d959302a166162c3..f4a23c593acccff2fad50f62a1a99427c93f9a77
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-workflow-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow-review.md
success_criteria:
  - Review immutable manifest and journal binding, owner-only state, all-copy planning, execution, rollback, database CAS, aggregate reporting, and CLI fail-closed behavior.
  - Report exact P0-P3 findings with implementation evidence and required remediation ownership.
  - Do not edit implementation or mutate source files, database, Qdrant, services, staging, or production.
selected_docs:
  - docs/superpowers/specs/2026-07-11-document-evidence-design.md
  - docs/superpowers/plans/2026-07-11-document-evidence.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow.md
selected_skills:
  - code-review
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review and verification skills cover this bounded workflow review
parallel_group: Q12-source-recovery-workflow
depends_on_streams:
  - mc2-jz6y0.13-source-recovery
  - mc2-jz6y0.13.4.1-workflow
parallel_decision: sequential
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks were removed before commit; review worktree and branch remain for orchestrator integration and cleanup
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: this review changes no durable product or operations behavior; implementation remediation must reassess source-recovery runbook and artifact truth
graph_reviewed: no-change-needed
graph_review_notes: the stage graph report was already available for architecture context; this read-only review introduces no code, documentation, architecture, or durable workflow change requiring refresh
verification:
  - Exact implementation range cfce2c1c..f4a23c59 reviewed line by line against the approved source-recovery design and plan.
  - Focused source-recovery Vitest passed 30/30 across four files with synthetic local Supabase placeholders.
  - Course-gen-platform type-check passed.
  - Adversarial local probe proved symlink manifest/journal acceptance and acceptance of extra unreviewed journal copy/disposition identities.
  - Review artifact schema validation, process verification, and git diff whitespace validation passed before delivery.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow-review.md
explicit_defers:
  - No finding is deferred; all three P1 findings block acceptance and require implementation correction plus independent re-review.
---

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 3, P2: 0, P3: 0.** The database compare-and-set
contract, exact aggregate totals, bounded database reads, paired Career source
and catalog updates, six fail-closed modes, rollback phase guard, and redacted
aggregate CLI output are sound in the reviewed range. Acceptance is blocked by
three recovery-boundary defects: a loaded journal is not bound to the exact
manifest entry identities, owner-only file validation follows symlinks and
omits ownership, and planning does not preflight all 42 copy sources and targets
before any publication can begin.

| ID      | Severity | Confidence | Finding                                                                                       |
| ------- | -------- | ---------- | --------------------------------------------------------------------------------------------- |
| Q12-WR1 | P1       | high       | Loaded journal keys and disposition kinds are not bound to the reviewed manifest.             |
| Q12-WR2 | P1       | high       | Owner-only manifest, journal, and protected-plan validation accepts symlinks and foreign UID. |
| Q12-WR3 | P1       | high       | `plan` omits the all-copy filesystem preflight required before irreversible publication.      |

## Q12-WR1 — P1 — journal identity is self-consistent but not manifest-bound

- **Repository evidence:**
  `packages/course-gen-platform/tools/qdrant/source-recovery.ts:251-258`
  validates a synthetic self-transition of the loaded journal. Lines 268-291
  then bind only `run_id` and `manifest_sha256`; they do not require journal
  `copy_states` keys to equal manifest copy IDs, disposition state/kind keys to
  equal manifest disposition IDs, or disposition kind values to equal the
  reviewed manifest. The core transition validator at
  `source-recovery-manifest.ts:441-449` and `:515-520` proves only that keys and
  kinds do not change relative to that same journal.
- **Reproduction:** a local adversarial probe added
  `unreviewed-extra-copy` plus an extra disposition kind/state to a canonical
  journal. `loadReviewedRecoveryState` accepted it and reported the injected
  states. The same probe made no source, database, Qdrant, service, or remote
  mutation.
- **Impact:** a corrupt or substituted journal can introduce work identities
  that were never approved by the immutable manifest while still passing state
  load. Later phase-coherent values can make those identities survive the
  workflow, defeating the manifest-as-reviewed-authority invariant.
- **Required fix:** on every load, derive the expected maps from
  `createInitialProgressJournal(manifest, manifestSha256)` or an equivalent
  dedicated validator. Require exact sorted key sets for copies and both
  disposition maps, and require each disposition kind to equal its manifest
  entry before validating journal phase/state transitions. Add negative tests
  for extra, missing, and swapped IDs and altered kinds.

## Q12-WR2 — P1 — protected state follows symlinks and does not require owner UID

- **Repository evidence:** `source-recovery.ts:261-266` uses `stat`, checks only
  regular-file type after dereference and mode `0600`, and never compares
  `metadata.uid` with `process.getuid()`. This helper protects manifest and
  journal paths at lines 272-275 and the protected plan input at lines 725-730.
  The accepted core state-directory boundary is stricter:
  `source-recovery-manifest.ts:298-313` uses `lstat`, rejects symlinks, requires
  mode `0700`, and checks current UID.
- **Reproduction:** the same local probe supplied symlink paths for canonical
  mode-0600 manifest and journal files; both were accepted by
  `loadReviewedRecoveryState`.
- **Impact:** reviewed input/state paths can resolve to substituted files
  outside the intended owner-only path and ownership boundary. This weakens the
  security contract immediately before filesystem publication and audited
  database dispositions.
- **Required fix:** use `lstat`; reject symbolic links; require a regular file,
  exact mode `0600`, and current UID when available. Apply the same boundary to
  protected plan input, manifest, and journal and add negative symlink and
  foreign-owner tests. Validate the real parent state directory where the
  workflow accepts a caller-supplied state path.

## Q12-WR3 — P1 — planning does not prove all filesystem publication predicates

- **Approved contract:** the source-recovery design requires the planner to
  prove every development source is a readable regular non-symlink file with
  exact size/hash, every production target is absent, and required target
  filesystem publication/fsync semantics are available before the immutable
  plan is written. Source/path/hash/target drift must abort before publication.
- **Repository evidence:** `source-recovery.ts:419-433` implements `plan` as
  `createPlan`, aggregate `readSourceCounts`, and `writePlan`. The default
  `createPlan` at lines 725-733 validates the protected manifest and database
  disposition predicates only. `readSourceCounts` at lines 751-766 probes the
  general production reindex inventory; it does not verify each of the 42
  development copy sources against manifest size/hash, require each target to
  be absent, or establish target filesystem no-replace/fsync capability.
  Execute then publishes serially at lines 467-487, so a late source failure can
  occur after earlier targets were already published.
- **Crash ambiguity:** for a journal entry still in `planned`, the filesystem
  reconciler accepts an already-exact target as `published`. That behavior is
  valid after a crash between link and journal fsync, but without a reviewed
  plan-time absent-target baseline it also accepts a target that predated the
  first execution as if it were owned crash residue.
- **Impact:** the workflow can partially publish before discovering a late
  source drift, and cannot distinguish an exact pre-existing target from an
  owned interrupted publication. Service isolation and a host lock in the next
  integration stream stop concurrent writers but cannot reconstruct the
  missing plan-time filesystem truth.
- **Required fix:** add a read-only all-42 preflight before immutable plan write:
  verify source type/no-symlink/readability/size/hash, require target absence,
  and record the reviewed baseline. Prove target filesystem hard-link/no-replace
  and directory-fsync capability in a safe owned probe location, coordinated
  with the host-isolation stream where necessary. Accept an exact target for a
  `planned` entry only when durable progress proves execution began and crash
  residue is possible. Add tests proving a late invalid source or pre-existing
  exact target causes zero publication.

# Correctly Implemented Controls

- Database mutation uses exact prior predicates and verifies exact returned
  state (`source-recovery-database.ts:109-127`, `:199-209`), including
  already-applied reconciliation (`:265-306`).
- Database reads are bounded to batches of 1-200 (`:220-263`).
- Career source disposition is checkpointed before the paired catalog CAS
  (`:344-379`).
- Exact audited totals are enforced: `261/240/21`, `42/125`, and `6+18`
  (`source-recovery.ts:202-248`).
- Raw canonical manifest bytes and SHA-256 binding are checked
  (`source-recovery.ts:268-291`).
- The parser exposes exactly six modes, rejects unknown arguments including
  `--allow-gaps`, and the CLI emits aggregate/redacted output only
  (`source-recovery.ts:311-389`, `:810-824`).
- Database clients are lazy, so filesystem-only execute/rollback paths do not
  instantiate a database connection (`source-recovery.ts:698-704`).
- Rollback is forbidden at or after `reindex_started`
  (`source-recovery.ts:491-514`).

# Verification

1. Focused Vitest command with synthetic local Supabase placeholders passed
   four files and 30/30 tests: manifest, filesystem, database, and workflow.
2. `pnpm --filter @megacampus/course-gen-platform type-check` passed.
3. The adversarial `tsx` probe produced:
   `acceptedSymlinkManifest=true`, `acceptedSymlinkJournal=true`,
   `extraCopyState=planned`, `extraDispositionKind=eligible_unrecoverable`, and
   `extraDispositionState=disposition_planned`.
4. Review artifact schema validation, orchestration process verification, and
   `git diff --check` passed before commit.

# Delivery / Cleanup

Only this independent review artifact changes on the review branch. No
implementation, Beads record, source file, database row, Qdrant state, service,
secret, staging, or production environment was modified. Temporary dependency
symlinks used to execute local verification were removed before delivery.

# Risks / Follow-ups / Explicit Defers

The implementation commit is not accepted. All three P1 findings require
correction and a fresh independent review. No finding is delegated silently to
the later host-isolation stream: that stream may provide the safe filesystem
capability probe, but the workflow must still enforce and bind the plan-time
all-copy source/target truth before publication.
