# Q12 Joined Retained-Barrier Fixture Design

| Field                         | Value                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Date                          | 2026-07-15                                                                   |
| Beads                         | `mc2-jz6y0.13.21`, blocks `mc2-jz6y0.13.10`                                  |
| Status                        | architecture approved; exact written specification awaiting owner approval   |
| Base Q12 design               | `2026-07-13-q12-live-cutover-corrections-design.md`                          |
| Base Q12 design SHA-256       | `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`           |
| Normative D5 design           | `2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md`   |
| Normative D5 design SHA-256   | `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`           |
| Accepted D5 plan              | `2026-07-14-q12-retained-barrier-capability-provenance-addendum.md`          |
| Accepted D5 plan SHA-256      | `8278bce9f335bbef1204e60ff7c22383d15abc13237b80abfc53a6d2d285a0ed`           |
| Architecture evidence         | `.superpowers/sdd/q12-w-d5-composition-architecture.md` (ignored, read-only) |
| Architecture evidence SHA-256 | `8bf9786c1e97ce4a54bc455d37ec052a8658fa110524fbed1a5ab728b3fda379`           |

## Purpose and precedence

This narrow D5J addendum closes a local test-evidence composition gap. The
accepted Root D5 fixture currently emits retained-barrier chains around
synthetic `root.advance/accepted` anchors. W must instead validate one complete
canonical run containing the real source, backup, restore, migration, reindex,
retained-barrier, final-writer-manifest, and resume chronology before any
Docker, database, or writer mutation.

D5J adds one Root-owned, test-only, closed joined-fixture composer. It emits one
run root, one canonical `phase.jsonl`, one fixed checkpoint lineage, and the
existing immutable objects and capabilities in their normative chronological
positions. It does not weaken or replace any base, lifecycle, D4, D5, D5W, W,
recovery, isolation, or strict-mode invariant.

The base Q12 design and D5 remain normative for every individual row, hash
preimage, checkpoint projection, retained copy, capability, result, crash
continuation, and final-writer-manifest object. This addendum governs only how
those already-approved projections are composed into a single positive local
fixture graph. If a row or object cannot be derived from those accepted
contracts, the composer fails as a product-truth gap; it never invents a
projection from the current W test helper.

Nothing here authorizes GHCR publication, Supabase access, Qdrant access,
server or service changes, secret installation, container mutation, deploy,
live reindex, staging, production, credential rotation, Qdrant Cloud recovery,
or external S3. D6 activation-truth inspection is a separate dependency and is
not implemented or simulated by D5J.

## Selected architecture

The selected architecture is a Root-owned internal composer over the same
production lifecycle serializer and object-publication primitives used by the
Q12 supervisor. A test runner may select one closed profile and fault/scenario
dimensions already approved by D5, but it never constructs authoritative JSON,
rows, hashes, checkpoints, capabilities, or objects itself.

The composer has exactly two profile families:

1. `forward`: all five retained commands complete in order, with the complete
   non-D5 forward chronology and the real `prepared_quiesced`
   final-writer-manifest boundary before activation;
2. `rollback`: completed D5 prefix length `1..4`, with either no frontier or
   exactly the next D5 command as the optional abandoned frontier, followed by
   the normative rollback final-writer-manifest boundary.

The public TypeScript fixture contract may expose descriptive closed enums for
those profiles and the existing approved D5 chain/frontier scenario enums. The
Python test runner passes only that validated closed request to an internal
core function. The deployed `q12-live-cutover.sh`,
`q12-capability-run.sh`, production Python CLI parser, command manifest, argv,
environment, and child interface gain no test/profile/fixture flag, hidden
environment switch, alternate manifest, serializer callback, arbitrary
executor selection, or caller-supplied phase input.

Task 9 retains ownership of the real `plan|live|recover` controller. It must
reuse the same production serializer/composer primitives or prove byte- and
order-parity against D5J before live activation can be considered. D5J is not
a substitute production controller.

## Trust and ownership boundary

Root is the sole producer of:

- the canonical journal and current fixed checkpoint;
- all ordinary phase rows used by the closed profile;
- every D5 selector, retained copy, capability, lifecycle row, result, recovery
  chain, completion, `R`, and frontier retirement;
- every final-writer-manifest intent, object, accepted row, and checkpoint; and
- the materialized positive-fixture result returned to W.

W owns only the pre-existing immutable
`megacampus.q12.writer-quiesce/v1` byte preimage and its already-approved
mode-specific terminal writer state/resume suffix. W imports the Root result
read-only and validates the complete graph. W never copies, inserts, reorders,
rehashes, renames, repairs, deletes, reconstructs, canonicalizes, or blesses a
Root authority byte. Its negative-only mutation helper remains incapable of
producing an accepted positive.

There is no side bundle and no second authority source. An isolated D5-only
journal may remain useful as focused D5 test coverage, but it cannot satisfy a
joined W positive.

## Closed input contract

The joined materializer accepts only:

- a normalized owner-only fixture `runRoot` below `/tmp`;
- profile `forward` or `rollback`;
- for rollback, `completedPrefixLength` exactly `1`, `2`, `3`, or `4`;
- for rollback, `frontier` either absent or the exact next operation from the
  table below;
- the already-approved closed D5 chain/frontier history, stop, lease, recovery,
  and fault dimensions;
- the absolute normalized path to the already-existing W-owned quiesce
  manifest for every accepted joined `forward` or `rollback` profile; and
- test-driver-only fault selectors already proven never to reach the
  production request.

| Completed prefix length | Exact completed D5 operations                                                    | Sole optional frontier       |
| ----------------------: | -------------------------------------------------------------------------------- | ---------------------------- |
|                       1 | `install`                                                                        | `verify-after-base`          |
|                       2 | `install`, `verify-after-base`                                                   | `verify-after-observability` |
|                       3 | `install`, `verify-after-base`, `verify-after-observability`                     | `prepare-recovery`           |
|                       4 | `install`, `verify-after-base`, `verify-after-observability`, `prepare-recovery` | `activate`                   |

The caller cannot supply or override a run ID, quiesce digest, phase array,
journal entry, outcome, sequence, command ID/hash, lease epoch, object bytes,
object digest, checkpoint bytes/hash, capability bytes/hash, result bytes/hash,
accepted-object binding, device, inode, uid, gid, mode, link count, timestamp,
release/operator/resource/catalog digest, or final-writer-manifest ancestry.
Unknown keys and invalid profile combinations fail before creation of
`phase.jsonl`, a checkpoint, capability directory, temporary publication file,
or other producer state.

The run ID remains UUIDv5-derived from the normalized safe run-root path. The
joined quiesce digest remains SHA-256 over the exact already-open W-owned file
bytes after the accepted D5W path, owner, mode `0400`, link-count-one, size,
stable-identity, and TOCTOU checks. `install` itself remains bound to 64 zeroes;
every later-four D5 chain, every final-writer-manifest, and the W suffix bind
the computed real digest. The caller never supplies either digest. A missing
manifest path fails even for clean rollback prefix 1, before producer state.

## One canonical journal and immutable append rule

The joined graph uses exactly one `<runRoot>/phase.jsonl`. The production core
opens, validates, and appends it using the accepted owner/mode,
`O_NOFOLLOW|O_APPEND|O_DSYNC`, canonical 19-key row, complete hash-chain,
fsync, device/inode, and predecessor-CAS rules. Every fixed checkpoint and D5
retained copy names that same journal device and inode. No accepted profile may
open, import, merge, or validate a second journal.

Composition is append-only. Once Root has emitted a row or object, later
profile steps may only append through the production serializer and publish
new immutable objects through their existing no-replace protocols. No prior
byte, hash, checkpoint, retained copy, capability, result, or accepted object
is rewritten after a later step is known.

The existing synthetic `root.advance/accepted` helper remains available only
to isolated D5 unit cases. It is forbidden in every joined positive. Generic W
helpers such as `appendJournalEntry`,
`appendResumeCommonPrefix`, and
`rehashJournalAndCheckpointsAfterMutation` cannot contribute any byte to a
joined positive.

## Exact joined forward chronology

For `forward`, the core emits the following groups in this exact order. A D5
group means the complete normative selector/copy/capability/claim/result/
completion graph for that operation, including any selected legal recovery
history, with no unrelated row inside the group.

| Order | Required Root-emitted group                                                                                                 |
| ----: | --------------------------------------------------------------------------------------------------------------------------- |
|     1 | `preflight/completed`                                                                                                       |
|     2 | D5 `install`, selector predecessor `preflight`, target `maintenance_guarded`                                                |
|     3 | `quiesced/completed`                                                                                                        |
|     4 | `snapshot_exported/completed`                                                                                               |
|     5 | `backup_committed/completed`                                                                                                |
|     6 | `restore_verified/completed`                                                                                                |
|     7 | D5 `verify-after-base`, selector predecessor `restore_verified`, target `base_migration_guarded`                            |
|     8 | D5 `verify-after-observability`, selector predecessor `base_migration_guarded`, target `observability_migration_guarded`    |
|     9 | `migrations_applied/completed`                                                                                              |
|    10 | D5 `prepare-recovery`, selector predecessor `migrations_applied`, target `recovery_ready_guarded`                           |
|    11 | `source_recovered/completed`                                                                                                |
|    12 | `reindex_started/completed`                                                                                                 |
|    13 | `qdrant_verified/completed`                                                                                                 |
|    14 | `prepared_quiesced/intent -> final-writer-manifest -> prepared_quiesced/accepted`                                           |
|    15 | `activation_ready/completed`                                                                                                |
|    16 | D5 `activate`: exact `activation_committing/intent` selector, then the `activated` capability lifecycle through `completed` |

There is no generic `maintenance_guarded`, `base_migration_guarded`,
`observability_migration_guarded`, `recovery_ready_guarded`,
`activation_committing`, or `activated` completion row in addition to its D5
completion. There is exactly one completed D5 tip for each command, no
abandoned frontier, and no rollback FWM artifact. The
`prepared_quiesced` object uses the unchanged production object protocol and
the exact W-owned quiesce digest.

After Root returns the immutable joined prefix, W may append only its existing
forward writer-handoff state, database-lifecycle evidence, resume-authority
object, and claimed resume lifecycle through their approved production
protocols. W first validates the complete Root prefix and rechecks every opened
identity immediately before its first mutation.

## Exact joined rollback chronology

Every rollback profile begins with `preflight/completed`, the complete D5
`install` group, and durable `quiesced/completed`; accepted install and the real
writer-quiesce manifest are mandatory. It then advances only far enough to
complete the requested prefix and, when present, reach the exact selector for
the next frontier:

| Prefix/frontier boundary                         | Additional exact Root chronology before rollback disposition                                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prefix 1, clean                                  | none after `quiesced/completed`                                                                                                                                                                                                                                            |
| prefix 1 + `verify-after-base` frontier          | `snapshot_exported/completed -> backup_committed/completed -> restore_verified/completed`, then the exact frontier form                                                                                                                                                    |
| prefix 2, clean                                  | the same snapshot/backup/restore rows, then completed D5 `verify-after-base`                                                                                                                                                                                               |
| prefix 2 + `verify-after-observability` frontier | prefix 2 chronology, then the exact frontier form                                                                                                                                                                                                                          |
| prefix 3, clean                                  | prefix 2 chronology, then completed D5 `verify-after-observability`                                                                                                                                                                                                        |
| prefix 3 + `prepare-recovery` frontier           | prefix 3 chronology, then `migrations_applied/completed`, then the exact frontier form                                                                                                                                                                                     |
| prefix 4, clean                                  | prefix 3 chronology, then `migrations_applied/completed`, then completed D5 `prepare-recovery`                                                                                                                                                                             |
| prefix 4 + `activate` frontier                   | prefix 4 chronology, then `source_recovered/completed -> reindex_started/completed -> qdrant_verified/completed -> prepared_quiesced/intent -> final-writer-manifest -> prepared_quiesced/accepted -> activation_ready/completed`, then the exact activation frontier form |

A clean rollback adds no `R`. It appends only the unchanged
`rollback_preparing/intent -> final-writer-manifest ->
rollback_preparing/accepted` object protocol from the current canonical head.

An abandoned frontier uses exactly the D5-approved selector-only, copy-prefix,
journal-less-published, issued, claim-moved, or claimed-without-accepted-success
form. Root emits the exact checkpointed
`rollback_preparing/retained_attempt_abandoning` row `R`, retires the complete
frontier or proves exact no-capability state, and immediately emits the
unchanged rollback FWM `intent -> object -> accepted` ancestry. No other row,
object, mutation, reissue, result, completed tip, second frontier, or forward
authority may appear between `R` and that accepted object.

For the activation frontier, the composer materializes only the already-frozen
pre-commit fixture truth needed by the existing D5 classifier test. It never
claims to implement D6 or a live database probe. Durable activated truth,
completed activation, or an activation result forces the accepted D5
finish-forward/incident behavior and makes the rollback profile fail.

After Root returns the rollback prefix and FWM, W may append only its existing
conditional reverse receipts that are actually required by the phases reached,
database cleanup evidence, rollback-ready writer state, resume-authority
object, and claimed rollback-resume lifecycle. W cannot synthesize a required
reverse receipt for a phase absent from the Root chronology.

## Production-core and fixture implementation boundary

The minimum permitted write zone is:

- `deploy/qdrant/q12-lifecycle-core.py`, only for internal closed composer and
  production serializer/object-protocol reuse;
- `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py`;
- `packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts`;
- a new focused
  `packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts`;
- the minimum necessary Root lifecycle test update; and
- the `.13.21` stage artifact and current orchestration records.

The implementation may extract a general production serializer primitive from
existing Root code, but it cannot add a new command, phase, outcome, schema,
manifest entry, child argument, result field, accepted-object kind, remote
probe, deployed CLI mode, or W-owned file edit. Any need outside this zone or
any new product projection stops for a design amendment.

## Fail-closed behavior

The composer fails before returning an accepted result for any of:

- two journals, a side D5 bundle, a copied journal, imported rows, or a
  post-hoc merge/rehash;
- a synthetic `root.advance` row in a joined positive;
- an unknown profile/key, prefix outside `1..4`, wrong/missing/second frontier,
  arbitrary phase/row/object input, or caller digest/identity override;
- a missing quiesce-manifest path for any joined profile, including clean
  rollback prefix 1;
- missing, replaced, aliased, linked, wrong-mode, wrong-owner, oversized, or
  changing W quiesce bytes;
- missing/extra/reordered D5 operation, wrong selector predecessor or target,
  missing retained copy, wrong journal inode, illegal recovery epoch, fork,
  cycle, replay, unfinished retirement, or multiple completed tips;
- missing/extra/reordered ordinary phase, skipped required predecessor, generic
  duplicate completion for a D5 target, or wrong FWM boundary;
- rollback without accepted install and durable quiesce, install as frontier,
  completed activation in rollback, `R` before exact classification, forward
  authority after `R`, or a reverse receipt for an unreached phase; and
- any attempt to make fixture-only behavior reachable through a deployed CLI,
  environment, PATH, manifest, or serializer override.

Failure retains incident evidence according to the existing D5 crash rules and
does not silently truncate, normalize, repair, or delete it. No fail-closed path
may call Docker, PostgreSQL, Supabase, Qdrant, systemd, a network endpoint, or a
real child process.

## TDD and acceptance contract

Implementation begins RED. Required focused coverage is:

1. a fabricated legacy W positive and any two-journal/side-bundle composition
   fail before Docker/database/writer mutation;
2. the forward closed profile emits one canonical journal, the exact ordinary
   phase order, all five Root-produced D5 graphs, the real W quiesce binding,
   one prepared FWM, and no rollback artifact;
3. rollback prefixes `1..4` pass both clean and exact-next-frontier forms, with
   the six D5 frontier states table-driven where D5 permits them, exact `R`,
   complete retirement, and immediate rollback FWM ancestry;
4. unknown/extra/missing/reordered profile inputs, each omitted D5 command,
   wrong frontier, wrong phase, duplicate completion, second journal,
   post-hoc rehash, wrong inode, quiesce replacement, extra copy, activated
   rollback truth, and post-`R` authority each fail with zero mutation;
5. a missing quiesce manifest fails before producer state for forward and every
   rollback prefix, with a dedicated clean-prefix-1 negative;
6. every positive traverses the production core and becomes impossible if the
   runner or TypeScript helper attempts to serialize authority independently;
7. both deployed wrappers and parser reject every fixture/profile/test switch;
8. ordinary file-parallel and fully serialized Root suites remain green; and
9. W imports the joined materializer for its forward and rollback positives,
   retains the old fabricated graph only as a mandatory negative, and proves
   immutable recheck immediately before its first mutation.

The precursor acceptance commands are:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-live-cutover.test.ts \
  tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts \
  tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts \
  tests/unit/ops/q12-command-manifest.test.ts

SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts --no-file-parallelism \
  tests/unit/ops/q12-live-cutover.test.ts \
  tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts \
  tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts \
  tests/unit/ops/q12-command-manifest.test.ts

bash -n deploy/qdrant/q12-live-cutover.sh deploy/qdrant/q12-capability-run.sh
python3 -m py_compile deploy/qdrant/q12-lifecycle-core.py \
  packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
jq -e . deploy/qdrant/q12-command-manifest.json
pnpm exec prettier --check \
  packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts \
  packages/course-gen-platform/tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts \
  packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
git diff --check
```

After D5J is independently accepted and integrated, W must run its complete
accepted focused runtime/database/isolation matrix, syntax/style checks,
`pnpm type-check`, synthetic `pnpm build`, and zero-residue cleanup. Task 9
later proves real controller parity. D5J closes only after independent
correctness and documentation reviews both report P0=P1=0, all accepted
commands pass, the artifact and Beads truth are current, and the branch is
committed, pushed, integrated, rerun, and safely cleaned.

## Alternatives rejected

### W copies or rehashes Root evidence

Rejected. It changes the run ID, journal sequence/hash/inode, checkpoint
projection, retained-copy source binding, and producer ownership. A
self-consistent rehash would make W the authority it is required to validate.

### Two independent positive journals

Rejected. They prove two different runs and cannot establish the one complete
chronology W resumes. No accepted schema joins them.

### Implement the full Task 9 controller before W

Rejected for this precursor. It expands scope into production orchestration,
creates a dependency cycle with W/M/H, and would require D6 and additional
live-controller product truth. D5J extracts only the closed serializer seam
needed to unblock W; Task 9 remains mandatory.

## Approval record

On 2026-07-15 the owner replied `да подтверждаю` to the proposed D5J Option A:
a Root-owned test-only closed forward/rollback joined composer, one canonical
journal, no W copying/rehashing/repair/blessing, and no deployed CLI test flag.
That reply authorized drafting and independent review of this written design;
it did not approve unseen bytes, an implementation plan, code, or any
remote/live action.

This file becomes normative only after independent correctness and
documentation reviews report P0=P1=0 and the owner explicitly approves its
complete corrected SHA-256. Planning and code remain blocked until that exact
written-spec approval.
