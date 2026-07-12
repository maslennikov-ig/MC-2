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
are each written to a same-directory temporary file, their inodes are
`fsync`ed, they are atomically renamed, and each parent directory is `fsync`ed.
The manifest is then reviewed and mounted read-only. Every later journal
transition uses the same temp/`fsync`/atomic-replace/parent-`fsync` sequence.

Allowed copy states:

`planned -> published`

Allowed rollback states:

`published -> rollback_planned -> rolled_back`

Allowed disposition states:

`disposition_planned -> disposition_applied -> disposition_verified`

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
- a failed coverage ledger invariant;
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
