---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source recovery and rollback correctness require independent protected-evidence verification
repo: mc2
branch: codex/q12-source-recovery-review
base_branch: codex/q12-source-recovery
base_commit: 89f9a677161134722bfd2d62b980899ad6824f5d
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery-review.md
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: review worktree and branch may be removed after the review artifact is integrated
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only review of an operational audit; stable documentation must wait for the owner disposition and an executable copy procedure
graph_reviewed: no-change-needed
graph_review_notes: the orchestrator supplied the existing focused Graphify evidence; this review changes no code, architecture, or durable workflow
verification:
  - source artifact schema validation: passed
  - source artifact diff check: passed
  - sensitive identifier/hash/email pattern scan: passed
  - fresh read-only REST counts: file_catalog 261 and courses 126
  - protected aggregate classification: 261 total, 240 eligible, 21 non-eligible
  - exact repository buildReindexPlan replay: current 240/109/129/2/21 and after-copy 240/234/4/2/21
  - protected source-root SHA-256 replay: 179/179 matching rows and zero mismatches
  - remote read-only copy-candidate verification: 54/54 sources valid, 42/42 targets safe and absent
  - unresolved exact-byte comparison: zero matches among 11 eligible and 1412 non-eligible whole-host size candidates
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery-review.md
explicit_defers:
  - do not execute the proposed copies until the crash-consistent manifest requirement below is incorporated into the executable procedure
  - the six unresolved eligible rows and eighteen absent non-eligible rows retain the owner decisions recorded by the source audit
---

# Summary

**Decision: fix before mutation.** There are zero P0, zero P1, one P2, and zero
P3 findings. The inventory, arithmetic, exact-byte provenance, containment,
deduplication, no-surrogate rule, no-replace target rule, and owner-facing defers
are otherwise supported by independent read-only evidence.

# Findings

## P2 — Make the publication manifest write-ahead and crash-consistent

- **File:**
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-recovery.md:240`
- **Evidence:** the contract says to persist a manifest containing the publication
  result and later permits rollback only for manifest-created targets. It does
  not require the target intent to be durably recorded before publication, nor
  require the manifest and target parent directories to be `fsync`ed. A process
  or host failure after atomic no-replace publication but before the result is
  durably recorded can therefore leave a correct new target that the declared
  rollback contract cannot identify as manifest-created. The next full run then
  aborts because one of the 42 targets is no longer absent.
- **Impact:** this does not corrupt an existing source and does not invalidate
  the recovery counts, but it makes an interrupted batch require manual
  reconciliation and prevents the promised deterministic rollback/resume path.
- **Required fix before copying:** write and `fsync` a complete owner-only
  `planned` manifest before the first publication; for each target, use a
  crash-safe no-replace primitive, `fsync` the target directory, transition the
  manifest entry to `published`, and durably replace plus `fsync` the manifest
  and its directory. On restart, reconcile every `planned` entry by contained
  path and expected hash: accept a matching target as published, otherwise stop
  without deleting it. Rollback may delete only reconciled `published` entries
  whose current bytes still match the manifest.

# Independently verified evidence

The protected audit directory was mode `0700`; all evidence files were mode
`0600`. Aggregate-only commands exposed no file, course, organization, owner, or
hash identity.

- Fresh server REST HEAD requests still returned 261 catalog rows and 126
  courses. No database, server filesystem, queue, Qdrant, service, or secret was
  mutated by this review.
- The protected classification contains exactly 240 eligible and 21
  `missing_course` rows. Eligible classes are 109 canonical, 67 alternate-root,
  58 content-provenance, 4 exact-byte-absent, and 2 invalid-path/exact-byte-absent.
- The real repository `buildReindexPlan()` returned
  `240/109/129/2/21` for the current production root and
  `240/234/4/2/21` after the proposed copies, with expected point totals 7,294
  and 12,114 respectively.
- The 179 rows already backed by either active root produced 179 matching
  SHA-256 values and zero mismatches.
- Set A reduces to 39 targets restoring 67 rows. Set B reduces to three targets
  restoring 58 rows, with five exact development candidates for each of the
  three contents. Together, 42 copies restore 125 rows and raise recoverability
  from 109 to 234.
- A fresh remote, aggregate-only check found all 54 distinct proposed source
  files readable, regular, non-symlink, contained under the development root,
  and matching expected size/SHA-256. All 42 targets were contained under the
  production root and absent. Existing source files consistently use mode
  `0644` and owner/group `1001:1001`.
- The six unresolved eligible rows represent four distinct contents. Eleven
  whole-host exact-size candidates produced zero expected SHA-256 matches. The
  eighteen unresolved non-eligible rows likewise produced zero expected matches
  among 1,412 exact-size candidates. Derived text remains evidence only and is
  not accepted as an original source.
- The two invalid paths are relative, traversal-free, three-segment paths that
  lack the `uploads/` prefix; correcting the syntax alone cannot recover their
  absent bytes.

# Positive controls

- `buildReindexPlan()` classifies `missing_course` before probing source paths,
  so the 21 non-eligible rows are correctly excluded from the 240-document
  course reindex denominator.
- Stage 1 deduplication stores the original record's `storage_path` on duplicate
  catalog rows, which supports the three-target/58-row provenance model.
- The proposed operation forbids database updates and overwrites, revalidates
  every row sharing a target, and keeps the final six eligible gaps explicit.
- The tracked artifact contains no UUID, SHA-256 value, email address, filename,
  source text, or full tenant/course/source identifier.

# Verification commands

- `python3 scripts/orchestration/validate_artifact.py <source-artifact>`
- `git diff --check 52269005...89f9a677`
- aggregate-only protected classification and source-root hash replays
- exact `buildReindexPlan()` replay through the repository TypeScript module
- fresh read-only Supabase REST HEAD counts from the active API container
- aggregate-only remote `lstat`, containment, readability, size, and SHA-256
  verification for the proposed 54 sources and 42 targets

# Risks / Follow-ups

The sole review risk is the crash window described in the P2 finding. The source
copies remain unexecuted, so no recovery data must be rolled back now. The owner
decisions for the exact-byte gaps remain explicit and unchanged.

# Cleanup recommendation

After the orchestrator integrates this review, remove the review worktree and
local review branch. Keep the owner-only protected audit directory only until
the corrected executable manifest is generated and independently accepted;
then remove it using the stage cleanup contract.
