# Q12 Exact Source Recovery and Audited Disposition Design

**Date:** 2026-07-12  
**Beads:** `mc2-jz6y0.13.4`, `mc2-jz6y0.13.4.1`  
**Status:** written specification approved for implementation
**Parent:** `2026-07-10-self-hosted-qdrant-platform-design.md`

## Purpose

Recover every exact source byte that still exists on the staging host, record a
durable and truthful failure for originals that no longer exist, and make the
source-driven Qdrant reindex gap explicit before any alias cutover.

This design implements the owner's 2026-07-12 decisions:

- publish the 42 exact copies that restore 125 Qdrant-eligible catalog rows;
- record the final six eligible rows as `failed` with reason
  `source_file_unrecoverable`;
- record the eighteen absent non-eligible Career Playbook originals as
  `failed` / `retained-derived-only` without counting them in the 240-document
  Qdrant denominator;
- preserve courses, catalog rows, derivatives, and audit provenance;
- never use parsed, markdown, processed, cached, or Qdrant-derived content as a
  replacement for the original bytes.

## Accepted Source Truth

The independently reviewed read-only audit is the starting invariant:

| Measure                                       | Required value |
| --------------------------------------------- | -------------: |
| `file_catalog` rows                           |            261 |
| Qdrant-eligible rows                          |            240 |
| `missing_course` rows                         |             21 |
| Current production-base recoverable           |            109 |
| Current missing source                        |            129 |
| Current invalid source path                   |              2 |
| Exact physical copies                         |             42 |
| Eligible rows restored by those copies        |            125 |
| Post-copy recoverable                         |            234 |
| Post-copy missing source                      |              4 |
| Post-copy invalid source path                 |              2 |
| Absent non-eligible Career Playbook originals |             18 |

Any changed count, identity, size, hash, path classification, or target
existence aborts the run before publication. No `--allow-gaps` mode exists.

## Architecture

Recovery uses the pinned release-SHA Qdrant operator image through three
separate least-privilege services. The ordinary Qdrant, recovery, application,
and worker services do not gain writable access to both upload roots.

### 1. Networked read-only planner and verifier

`qdrant-source-recovery-plan`:

- uses the existing operator image and the existing Supabase service
  credentials;
- mounts production and development upload roots read-only;
- mounts the owner-only recovery state directory read-write;
- reads the complete catalog/course/source ownership projection in bounded
  pages;
- reuses the real `buildReindexPlan()` classification contract;
- emits the complete crash-durable write-ahead manifest before execution;
- supports `plan` and `verify`, but cannot publish or delete source files.

The planner records sensitive IDs, paths, and hashes only in a mode-`0600`
server manifest under a mode-`0700` directory. Tracked artifacts contain only
aggregate counts and redacted evidence.

### 2. Networkless byte executor and rollback

`qdrant-source-recovery-execute`:

- has `network_mode: none` and receives no Supabase, Qdrant, Redis, registry, or
  application secret;
- mounts development uploads read-only;
- mounts production uploads read-write;
- mounts the selected reviewed manifest read-only and a separate owner-only
  progress-journal directory read-write;
- supports `execute` and `rollback` with an exact `--confirm-run-id`;
- refuses an absent, changed, unreviewed, non-write-ahead, or already terminal
  manifest.

This separation prevents a database credential from sharing a process with the
writable production upload mount.

### 3. Networked disposition applier

`qdrant-source-recovery-disposition`:

- uses the pinned operator image and Supabase service credentials;
- receives the reviewed manifest read-only;
- mounts neither upload root writable;
- writes CAS progress only to the separate owner-only progress journal;
- supports `apply-dispositions` and `verify-dispositions`;
- updates only the exact rows named by the reviewed manifest using compare-and-
  set predicates over ID, organization/course ownership, source hash, storage
  path, and prior status;
- never deletes a catalog row, course, Career Playbook source, derivative, or
  Qdrant point.

No new database migration is required. Existing durable fields are used:

- six eligible `file_catalog` rows: `vector_status='failed'` and
  `error_message='source_file_unrecoverable; recovery_run=<run-id>'`;
- eighteen absent Career Playbook rows: both the linked
  `career_playbook_sources` row and `file_catalog` row become `failed`, with a
  bounded `retained-derived-only; recovery_run=<run-id>` reason;
- the three non-eligible Career Playbook rows whose exact files exist are not
  failed by this decision.

The applier is resumable. Each CAS result is persisted to the progress journal
before advancing. A mismatched or unexpectedly changed row is a hard stop, not
an overwrite.

## Manifest Contract

The manifest schema includes:

- schema version and immutable run ID;
- generation time, release SHA, operator digest, and source audit version;
- exact pre-plan and expected post-plan aggregate counts;
- one sorted entry per physical target with source/target containment roots,
  expected size/hash, affected row count, and state;
- one sorted disposition entry per absent original with exact expected database
  predicates, selected outcome/reason, and state;
- an immutable reviewed plan whose entries do not contain source text or
  credentials.

The manifest is never modified after review. Its SHA-256 is the execution
identity. Mutable phase and per-entry states live in a separate mode-`0600`
progress journal bound to `run_id + manifest_sha256`. The planner initializes
that journal before execution; executor, disposition, verifier, and rollback
refuse a missing or differently bound journal.

The run phase is one of:

`planned -> copying -> copied -> dispositions_applied -> verified -> reindex_started -> complete`

Rollback is rejected at or after `reindex_started`. Every phase transition is
persisted through the same crash-durable manifest replacement protocol.

Before the first copy, the full `planned` manifest and initial progress journal
are each written to a same-directory temporary file and their inodes are
`fsync`ed. Immutable manifest creation uses an atomic no-replace hard link,
followed by parent-directory `fsync`, temporary-link removal, and another
parent `fsync`; it can never replace a raced or pre-existing manifest. The
initial and every later journal transition use
temp/`fsync`/atomic-rename/parent-`fsync`. The state directory must be a real,
current-executor-owned mode-`0700` directory. The manifest is then reviewed and
mounted read-only.

Allowed copy states:

`planned -> published`

Allowed rollback states:

`published -> rollback_planned -> rolled_back`

Allowed disposition states:

Eligible source:

`disposition_planned -> disposition_applied -> disposition_verified`

Career Playbook source:

`disposition_planned -> career_playbook_source_applied -> disposition_applied -> disposition_verified`

The immutable manifest records exact prior file status/error for every
disposition and exact Career Playbook ownership/status/error predicates when
applicable. Duplicate catalog or Career Playbook source identities fail closed.

Unknown states, skipped transitions, duplicate targets, or mixed run IDs fail
closed.

## Atomic Copy Algorithm

For each of the 42 sorted physical targets:

1. Re-resolve both roots and require containment.
2. Require a regular readable non-symlink development source.
3. Require the production target to be absent.
4. Verify every catalog row sharing the target agrees on expected size/hash.
5. Copy to an owner-only same-directory temporary file.
6. Run the executor as UID/GID `1001:1001`, create the temporary file with that
   ownership, apply mode `0644`, then `fsync` and re-hash it. The executor never
   runs Node as root and never performs an arbitrary `chown`.
7. Publish with an atomic no-replace hard link; `EEXIST` is a hard stop.
8. `fsync` the published file and target directory before durably transitioning
   the journal entry to `published`.
9. Remove the temporary link and `fsync` the directory again.

The source and target must be on filesystems that support the required link and
`fsync` semantics. The planner proves this before execution.

### Restart reconciliation

For a `planned` entry:

- absent target: safe to execute;
- exact expected target: reconcile to `published` after `fsync`;
- any other target: hard stop.

For a `published` entry:

- exact expected target: already complete;
- absent or mismatched target: hard stop and operator investigation.

## Rollback

Rollback is allowed only before Qdrant reindex execution begins.

- Persist `rollback_planned` in the journal before unlinking.
- Re-hash the target and require the manifest's expected hash.
- Never remove a pre-existing, changed, mismatched, or untracked file.
- Unlink, `fsync` the parent directory, and then persist `rolled_back`.
- Database dispositions are not silently rolled back. Reversal requires a new
  owner-approved manifest and exact CAS predicates.

## Evidence Coverage Integration

The six eligible rows remain first-class course documents with a truthful failed
source outcome. Stage 4 evidence preflight must recognize the structured
`source_file_unrecoverable` file status and materialize exactly one failed
coverage card using `createFailedEvidenceCard()` with:

- `coverage_status='failed'`;
- `coverage_reason='source_file_unrecoverable'`;
- zero claims, terminology, constraints, and token allocation;
- the existing document ID/name/priority and no derived-source substitution.

This preserves exact coverage accounting while baseline curriculum generation
continues. Stage 5 remains baseline-first; Stage 6 receives no evidence refs for
the failed document.

Career Playbook retained derivatives remain visible only as audited historical
state. They are not original-source evidence and are not included in the course
evidence or Qdrant denominator.

## Reindex Integration

An owner-approved failed disposition resolves a source-truth gap; it does not
pretend that the source became recoverable. `buildReindexPlan()` and the reindex
artifact therefore gain an explicit `audited_failed` classification bound to the
reviewed recovery run ID.

After dispositions:

- `eligible=240`;
- `recoverable=234`;
- `audited_failed=6`;
- `unresolved_missing=0`;
- `unresolved_invalid=0`;
- raw diagnostics remain `missing_source=4` and `invalid_source_path=2`;
- expected indexed documents are exactly 234.

Only an exact manifest entry with the recorded owner decision, expected
identity/hash/path predicates, applied CAS evidence, and verified failed coverage
may move a raw missing/invalid row into `audited_failed`. A generic
`vector_status='failed'`, arbitrary error text, or `--allow-gaps` cannot do so.
Reindex execution persists the recovery run ID and refuses a plan whose audited
disposition verification is stale or incomplete.

## Verification Gates

### TDD and static contracts

- RED/GREEN pure tests for containment, manifest validation, deterministic
  sorting, state transitions, restart reconciliation, no-replace publication,
  hash-guarded rollback, and CAS disposition planning;
- rendered Compose proves planner roots are read-only, executor is networkless
  with exactly one writable upload root, and disposition service has no writable
  upload mount;
- secret/leak tests prove manifests and logs do not expose credentials, source
  text, filenames, full IDs, or hashes in tracked artifacts.

### Disposable filesystem and database tests

- exact 42-target synthetic fixture with shared deduplicated paths;
- crash injection before/after link, file `fsync`, directory `fsync`, manifest
  transition, disposition CAS, and Career Playbook paired update;
- retry/restart proves no overwrite, duplication, silent partial success, or
  deletion of changed data;
- PostgreSQL/Supabase contract fixture proves exact eligible and non-eligible
  dispositions, tenant isolation, and unrelated-row immutability;
- Stage 4 proves exactly one failed coverage card for each unrecoverable eligible
  document and unchanged no-document-course behavior.

### Staging execution gates

1. Pause new uploads and hold a host-level `flock` across the complete
   plan/review/execute/disposition/verify window. The existing container-local
   Qdrant recovery lock is insufficient because it does not block application
   uploads or span separate one-shot containers.
2. Reproduce `261/240/109/129/2/21` before publication.
3. Execute exactly 42 physical no-replace copies.
4. Re-hash all targets and require 125 affected eligible rows.
5. Reproduce `240/234/4/2/21` after publication.
6. Apply and verify six eligible plus eighteen Career Playbook dispositions.
7. Require reindex truth `240 eligible = 234 recoverable + 6 audited_failed`,
   with zero unresolved missing/invalid rows.
8. Require exact coverage/card truth and zero tenant/isolation violations.
9. Persist `reindex_started` and only then start the guarded Qdrant reindex;
   rollback is unavailable from that phase onward.

## Failure and Stop Rules

Stop without partial activation on:

- any aggregate, identity, path, status, size, or hash drift;
- target pre-existence or mismatch;
- unsupported filesystem durability/no-replace semantics;
- manifest corruption, missing `fsync`, or ambiguous crash state;
- partial database disposition that cannot reconcile through exact CAS;
- a failed accepted-coverage invariant (since the 2026-07-25 amendment: any recovered `file_catalog`
  row that is not the exact post-disposition state, a coverage-fingerprint mismatch, or a coverage
  authority token that is not `catalog:<recovery-run-id>` for this run);
- current Session pooler credentials still unavailable;
- any required P0/P1 review finding.

## Non-Goals

- Reconstructing original bytes from derivatives.
- Deleting catalog rows, courses, Career Playbooks, or derivatives.
- Mutating Qdrant Cloud.
- Running Qdrant reindex, deploy, alias cutover, or staging activation before all
  recovery/disposition gates pass.
- Claiming local snapshots provide host/disk/off-host disaster recovery.

## Delivery

Implementation runs in an isolated `codex/` worktree under
`mc2-jz6y0.13.4.1`, follows TDD, receives an independent correctness/security
review, and is integrated only with P0/P1 zero. All accepted commits and the
integration result are pushed. Graphify is refreshed locally after durable code
and operations documentation changes, without external model/API modes or Git
hooks.

## Amendment 2026-07-24: file_catalog-only Career Playbook dispositions

Owner-approved amendment. Live investigation (pg_stat_user_tables:
`career_playbook_sources` n_tup_ins=21, n_tup_del=21, n_live_tup=0;
`career_playbooks` 79 created / 68 deleted) established that every reviewed
`career_playbook_sources` row was legally cascade-deleted with its parent
playbook (`playbook_id ... ON DELETE CASCADE`) during normal product use after
the 2026-06-09 uploads. The 18-row live-predicate requirement in the original
disposition contract is therefore permanently unsatisfiable and was removed:

- `career_playbook_retained_derived` dispositions are file_catalog-only
  bookkeeping; the manifest schema **rejects** `career_playbook_source_id` and
  `expected_career_playbook` fields;
- the `career_playbook_source_applied` journal checkpoint no longer exists;
  both disposition kinds go `disposition_planned -> disposition_applied` via
  the single `file_catalog` CAS;
- planner/verify read exactly 24 `file_catalog` rows (6+18 by kind); the
  recovery database layer no longer reads or writes `career_playbook_sources`;
- all exact totals (42 copies / 125 rows / 6+18 dispositions, 261-row counts)
  are unchanged.

## Amendment 2026-07-25: file_catalog-only accepted coverage

Owner-approved amendment (decision recorded 2026-07-25, variant A of the three
options put to the owner on `mc2-gyde8`). The original acceptance contract keyed
the `source.forward` acceptance authority to the **document-evidence coverage
ledgers** (`document_evidence_runs.status='accepted'` plus
`document_evidence_items` zero-evidence failed cards). Live read-only
verification established that this is unsatisfiable inside the window, for two
independent reasons:

1. **The ledgers do not exist pre-window.** `information_schema` on the pinned
   project (`diqooqbuchsliypgwksu`; `file_catalog`=261 rows confirms the audited
   database) has no `document_evidence_runs`/`document_evidence_items` tables at
   all. They are created **empty** by the C4 migration
   `20260711120000_document_evidence.sql`, and the failed-coverage cards are
   minted only by **post-window** Stage-4 runs (`source-failure.ts` marker
   `source_file_unrecoverable; recovery_run=<run>`). `getAcceptedRun()` can
   therefore never succeed at C5/C6.
2. **Scope contradiction.** The 6 accepted `eligible_unrecoverable` dispositions
   span **six** `organization:course` scopes across **three** organizations,
   while the frozen command manifest binds exactly **one**
   `<accepted-coverage-run>` argv slot (`aaec6fc2…` must not change) and the
   emit entrypoint enforced exactly one accepted coverage run.

The accepted contract is therefore:

- **Acceptance is `file_catalog` truth.** The binding is built from the reviewed
  (sha-bound) manifest's 6 eligible dispositions cross-checked against the live
  `file_catalog` rows in exactly the post-recovery state `applyDispositionEntry`
  writes: `vector_status='failed'` and
  `error_message='source_file_unrecoverable; recovery_run=<recovery-run-id>'`,
  with `organization_id`, `course_id`, `storage_path` and `hash` equal to the
  disposition predicates. Nothing is invented and no ledger is consulted.
- **Binding shape.** `AcceptedFailedCoverageBinding` carries
  `source: 'file_catalog'` and `scopes` (one entry per recovered
  `organization:course`, each listing its `file_catalog` entries) instead of
  `ledgers`. `calculateAcceptedFailedCoverageFingerprint` covers the whole
  binding, so any drift in row truth changes `<accepted-coverage-fingerprint>`.
- **The frozen manifest is unchanged.** `<accepted-coverage-run>` keeps its
  position and token; its VALUE is now the self-describing authority token
  `catalog:<recovery-run-id>`, validated by the controller
  (`COVERAGE_RUN_RE`), the wrapper forward tail (which additionally requires it
  to name the run's own `--recovery-run-id`), the emit CLI and the reindex CLI.
  The six course scopes come from the manifest, so argv need not repeat them.
- **Reindex plan/artifact.** `acceptedCoverageLedgerIds` (ledger UUIDs) becomes
  `acceptedCoverageScopes` (sorted unique `organization:course` pairs), bound
  into the verification fingerprint and the durable execute artifact.

**What is deliberately dropped, and where it is tracked.** The downstream
product statement — that Stage-4 evidence for these six sources is accepted as
zero-evidence failed — is real but only becomes verifiable **after** the window.
It is not silently discarded: `mc2-8m90f` re-verifies it read-only against the
live ledgers once the first post-window Stage-4 generation has minted the cards.
The Stage-4 side of that contract stays covered by
`tests/unit/tools/qdrant/source-recovery-acceptance.test.ts`
(`proveStage4AcceptsAuditedFailedSources`), which asserts an audited
unrecoverable source is accepted as a zero-evidence failed card without
invoking generation.

Redeploy consequence: the controller, the wrapper and the emit runtime closure
change, so the window needs a redeploy plus one fresh pre-window `plan` run. The
plan's structural sha legitimately changes (the fixture `<accepted-coverage-run>`
derivation is now the catalog token); the frozen manifest sha must not.
