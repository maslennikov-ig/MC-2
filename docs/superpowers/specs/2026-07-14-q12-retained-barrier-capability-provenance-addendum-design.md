# Q12 Retained Barrier Capability Provenance Addendum Design

| Field                      | Value                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| Date                       | 2026-07-14                                                                        |
| Beads                      | `mc2-jz6y0.13.17`, `mc2-jz6y0.13.10`, `mc2-jz6y0.13.13`                           |
| Status                     | one-copy direction confirmed; exact written specification not yet owner-approved  |
| Base design                | `2026-07-13-q12-live-cutover-corrections-design.md`                               |
| Base design SHA-256        | `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`                |
| Lifecycle addendum         | `2026-07-13-q12-recoverable-lifecycle-addendum-design.md`                         |
| Lifecycle addendum SHA-256 | `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`                |
| D4 addendum                | `2026-07-14-q12-durable-recovery-projections-addendum-design.md`                  |
| D4 addendum SHA-256        | `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`                |
| Tracked D5 gap evidence    | `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.17-q12-d5-provenance-decision.md` |
| Tracked evidence SHA-256   | `3a3c5f0161f68fbe2018977d0127a154c00865a4dfcfd5b5c97f6e1c481e681d`                |

## Purpose and precedence

This is the candidate narrow normative D5 addendum to the approved Q12 base,
recoverable-lifecycle, and D4 designs. It closes one provenance gap for the retained host
commands `barrier.install`, `barrier.verify-after-base`,
`barrier.verify-after-observability`, `barrier.prepare-recovery`, and
`barrier.activate`: a recovery chain must prove that its root and every reissue
were issued by the Root supervisor from the exact durable checkpoint supplied
to the generic launcher. A digest-linked capability chain without that proof is
not authority.

This candidate becomes normative only after independent correctness and
documentation reviews report P0=P1=0 and the owner explicitly approves the
complete corrected file SHA-256. Until then it authorizes only local drafting
and review.

## Exact precedence delta

D5 narrowly extends or supersedes only:

1. base design section 11's implicit retained-command issuance, claim,
   completion, publication-window orphan, direct-supersession, and exact-result
   recovery boundaries, by freezing their exact rows, rollback-frontier
   disposition, and ordering below;
2. base section 12's retained generic-launcher checkpoint input, by retaining
   one immutable command/epoch-qualified byte-exact copy and binding the
   existing `--checkpoint` value to that copy;
3. the lifecycle addendum's repeated-phase rule, only for the exact retained
   `intent`, `capability_issued`, `capability_claimed`,
   `recovery_reacquired`, `completed`, and
   `rollback_preparing/retained_attempt_abandoning` sequences below;
4. the lifecycle addendum's recovery-epoch wording, only by distinguishing a
   new capability execution epoch from the predecessor epoch contained in its
   byte-exact retained checkpoint copy and by freezing completion-only epochs;
5. the lifecycle checkpoint publication ownership, only by delegating the
   claim row and its matching fixed checkpoint to the generic launcher under
   the same inherited lock and journal descriptor;
6. D4 section 1's explicit capability-checkpoint scope, only by adding the
   distinct single-copy D5 path family for the five retained commands;
7. D4's direct-supersession orphan rule, only by defining a finite consecutive
   suffix of identically bounded retained publication-window orphans;
8. the lifecycle addendum's pre-activation rollback entry, only by inserting
   the one checkpointed non-authority `retained_attempt_abandoning` row before
   retirement of an optional rollback-reachable pending retained-command
   frontier and before the existing rollback final-writer-manifest
   `intent -> object -> accepted` protocol; and
9. the Root/W plan boundary, only by making Root/launcher the producers and W
   the read-only required-coverage validator for this retained evidence.

D5 does not import D4's two-checkpoint child/result pattern or D4's
`database-barrier-capability-checkpoint-*` and
`database-barrier-input-checkpoint-*` path family. Every unrelated approved
base, lifecycle, and D4 invariant remains in force.

D5 adds no abandonment object, schema, accepted-object kind, retained-copy
variant, child argument, or result binding. The existing rollback
`final-writer-manifest` object protocol is the post-retirement durable anchor.

External S3 and Qdrant Cloud remain out of scope. Nothing in this document
authorizes GHCR publication, server or service changes, secret installation,
Supabase or Qdrant mutation, deployment, live reindex, alias cutover,
credential rotation, staging, production, or any other remote/live action.

## Selected architecture and exclusions

The selected architecture retains exactly one immutable, byte-exact copy of
the existing pre-D4 launcher checkpoint per retained command execution epoch.
Root publishes that copy before the capability. The capability field
`capability_input_checkpoint_sha256` and the launcher's existing
`--checkpoint` argument equal SHA-256 of the copy's complete bytes. The
subsequent canonical journal proves issuance, claim-before-execution, durable
result, completion, recovery reacquisition, and direct supersession.

For a successfully accepted retained command, this is the minimum complete
proof graph:

```text
exact current selector P
  -> immutable retained launcher-checkpoint copy
  -> immutable capability bytes/hash
  -> durable issuance row + fixed checkpoint
  -> no-replace issued-to-claimed move
  -> durable claimed row + fixed checkpoint
  -> command-specific result
  -> completed move + durable completion row/checkpoint
```

For recovery, the next execution epoch adds the exact direct predecessor
capability digest, a consecutive `cutover-recovery-N` epoch, and that epoch's
own retained launcher-checkpoint copy. The chain has one root and one completed
tip.

The sole rollback exception is not accepted success: one exact next rollback-
reachable pending frontier may terminate as immutable non-authority evidence through the
checkpointed rollback choice, complete `superseded/` retirement, and the
existing rollback final-writer-manifest protocol defined below. It has no
completed tip and cannot execute after the rollback choice.

D5 explicitly does not approve:

- a second D5 claimed-input checkpoint copy;
- a new child argv, child receipt field, or result binding;
- publication of reconstructed historical authority;
- treating a canonical capability or 64-hex checkpoint value as provenance;
- accepting only the completed tip's journal row;
- replaying an old claimed capability after lock loss;
- disabling the already-approved phase-proven recovery path; or
- allowing W to publish, repair, replace, delete, or bless Root evidence.

The existing install child-input/baseline boundary remains unchanged. Its
claimed-checkpoint hash is result evidence, not a second D5 launcher authority.
No equivalent child-input file is added for the other four commands.

## Exact command scope and context

The operation token, command ID, target phase, exact initial checkpoint head,
and quiesce binding are:

| Operation token              | Command ID                           | Target phase                      | Exact initial checkpoint head                                                         | `quiesce_manifest_sha256`                |
| ---------------------------- | ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `install`                    | `barrier.install`                    | `maintenance_guarded`             | new `maintenance_guarded/intent` for `barrier.install`                                | 64 zeroes                                |
| `verify-after-base`          | `barrier.verify-after-base`          | `base_migration_guarded`          | new `base_migration_guarded/intent` for `barrier.verify-after-base`                   | accepted writer-quiesce manifest SHA-256 |
| `verify-after-observability` | `barrier.verify-after-observability` | `observability_migration_guarded` | new `observability_migration_guarded/intent` for `barrier.verify-after-observability` | accepted writer-quiesce manifest SHA-256 |
| `prepare-recovery`           | `barrier.prepare-recovery`           | `recovery_ready_guarded`          | new `recovery_ready_guarded/intent` for `barrier.prepare-recovery`                    | accepted writer-quiesce manifest SHA-256 |
| `activate`                   | `barrier.activate`                   | `activated`                       | exact `activation_committing/intent` for `barrier.activate`                           | accepted writer-quiesce manifest SHA-256 |

For `install`, both verifier commands, and `prepare-recovery`, Root first appends
and checkpoints exactly one same-target-phase `intent` row in `cutover`. Let
`H` be the current accepted prior-phase journal head and fixed checkpoint. The
new intent row has `seq=H.seq+1`, `previous_hash=H.entry_hash`, the exact command
ID/hash and stable run/release/operator/resource/quiesce context,
`capability_manifest_sha256=H.capability_manifest_sha256`,
`accepted_object_kind=none`, `accepted_object_sha256=null`, and
`lease_epoch=cutover`. Its matching checkpoint projects the new row, preserves
the open journal device/inode, and has accepted-object kind `none`, both object/
resume-authority hashes null. The future capability hash is forbidden. Schema,
timestamp, entry hash, rotation flag, and canonical bytes use the unchanged
journal rules; `rotation_required` equals the exact value carried by `H`.

The required `H` phases for those four new intents are respectively
`preflight`, `restore_verified`, `base_migration_guarded`, and
`migrations_applied`. The predecessor row's outcome and command fields are not
D5 authority; the new exact intent head is. In particular,
`migration.observability.apply` runs between the verifier commands, but the
frozen sources do not define its exact terminal row/checkpoint. D5 therefore
does not guess a migration outcome or reuse the now-noncurrent
`barrier.verify-after-base/completed` row; the new observability intent is the
sole exact selector.

For `activate`, D5 reuses and makes exact the already-approved
`activation_committing/intent` row. Let `H` be the exact current accepted
`activation_ready` journal head and fixed checkpoint. The intent `I` has
`seq=H.seq+1`, `previous_hash=H.entry_hash`, the exact `barrier.activate`
command ID/hash and stable run/release/operator/resource/quiesce context,
`capability_manifest_sha256=H.capability_manifest_sha256`,
`accepted_object_kind=none`, `accepted_object_sha256=null`,
`lease_epoch=cutover`, and `rotation_required=H.rotation_required`; the future
activation capability digest is forbidden. Its `entry_hash` is recomputed from
the exact canonical 19-key preimage and its durable JSONL bytes use the
unchanged journal rule.

The matching fixed checkpoint has exactly the approved 12 keys and values:
the unchanged schema version and run ID, `seq=I.seq`,
`phase=activation_committing`, `journal_entry_hash=I.entry_hash`,
`previous_journal_entry_hash=H.entry_hash`, the device and inode of the same
open journal descriptor, `accepted_object_kind=none`,
`accepted_object_sha256=null`, `resume_authority_sha256=null`, and
`lease_epoch=cutover`. Publication uses the unchanged two-state predecessor
CAS: before append, `H` is both the exact current fixed checkpoint and journal
head; Root appends/fsyncs `I`; after append, `I` must remain the exact journal
head while the on-disk fixed checkpoint still byte-matches `H`; only then does
Root publish, reopen, and revalidate the exact `I` checkpoint. D5 does not add
`activated/intent`. Only terminal `completed`, not an intent or intermediate
capability row, completes a target phase.

The retained copy is the current fixed `phase-checkpoint.json` for that exact
intent immediately before retained-copy and capability publication. Its
`journal_entry_hash` resolves to the unique canonical 19-key intent row, and
its 12 fields equal that head and open journal identity. There may be no
intervening journal row, phase, capability, object acceptance, or checkpoint.
An outcome wildcard, a nonlisted intent, an earlier/later same-phase row, a row
for another command, or a reconstructed intent is forbidden. Recovery
predecessor rules are defined separately below.

Every capability in one command chain has identical `run_id`, `command_id`,
`command_sha256`, `release_sha`, `operator_digest`,
`resource_manifest_sha256`, `quiesce_manifest_sha256`, and null
`resume_authority_sha256`. Only `capability_input_checkpoint_sha256`,
`lease_epoch`, and `supersedes_capability_sha256` may change as defined here.
The frozen literal argv and command hash are unchanged.

## Immutable retained launcher-checkpoint copy

### Fixed path and identity

For every retained command execution epoch, the exact fixed path below the run
root is:

```text
retained-barrier-capability-checkpoint-<operation>-<lease-epoch>.json
```

`<operation>` is exactly one token from the command table. `<lease-epoch>` is
exactly `cutover` or `cutover-recovery-<positive-decimal>` matching
`^(?:cutover|cutover-recovery-[1-9][0-9]*)$`. The run root already binds the
UUID, so the filename contains no second run identifier. Operation plus epoch
is unique; an alternative spelling, alias, duplicate path, hard link, symlink,
or second file for the same command/epoch is an incident.

The path epoch and the capability's `lease_epoch` name the intended new
execution epoch. The 12 copied checkpoint fields always remain the exact
predecessor `P`; on recovery its internal `lease_epoch` therefore normally
names the prior journal epoch and may differ from the path/capability epoch.
Root and W require this two-domain mapping and must not rewrite the copied
field. Different epoch paths may have equal complete-byte hashes only when they
are distinct regular files copied from the exact same still-current `P` during
separate permitted attempts. Equal content alone is not a duplicate; a second
path for the same command/epoch, shared inode, wrong predecessor, or content
equality without the exact per-path publication/lifecycle proof is an incident.

The file is a regular non-symlink owned `1000:1000`, mode `0600`, with the
approved exact `megacampus.q12.cutover-checkpoint/v1` 12-key schema. It is a
byte-for-byte copy of the complete accepted fixed `phase-checkpoint.json` as
opened. D5 adds, removes, or canonicalizes no byte and does not supersede the
source checkpoint's existing file-termination rule. Its SHA-256 is over exactly
the complete bytes read from that source. It is not a new projection and gains
no D5 key, wrapper, timestamp, signature, capability hash, or filename metadata.

Source, temporary, and final paths must each pass stable `lstat`/`fstat`/
reopen identity checks. The retained temporary/final file has `st_nlink=1`;
the final inode is distinct from the source checkpoint inode and stable across
publication/reopen; source and final are on the run-root filesystem. A hard
link, reflink whose complete bytes/identity cannot be independently verified,
changed inode, link count other than one, or path alias is an incident.

The copied checkpoint's `journal_device` and `journal_inode` identify the same
open `phase.jsonl` descriptor whose complete canonical chain contains its
`journal_entry_hash`. Its `seq`, phase, current and previous journal hashes,
accepted-object fields, resume-authority field, and lease epoch must equal that
exact journal head. An arbitrary canonical 12-key object, a later checkpoint,
or a recomputed object without the durable source file is not acceptable.

### Publication protocol

Root is the sole publisher. While continuously holding and validating the
canonical cutover lock, Root must:

1. open the current fixed checkpoint and journal with `O_NOFOLLOW`, validate
   their exact owner/mode/regular-file identity, complete bytes, journal device/
   inode, full hash chain, current head, predecessor checkpoint hash, phase,
   context, and lease epoch;
2. retain the opened fixed checkpoint identity and complete bytes;
3. create the sole temporary `<final-path>.publishing` with
   `O_CREAT|O_EXCL|O_NOFOLLOW`, owner `1000:1000`, mode `0600`, and link count
   one; write the exact source bytes, fsync the file, and verify its distinct
   inode, owner, mode, link count, bytes, and hash;
4. publish to the fixed D5 path with no-replace semantics, fsync the run-root
   directory, reopen the final path with `O_NOFOLLOW`, and recheck identity,
   bytes, hash, and source equality; and
5. revalidate that the fixed checkpoint path and journal head are still the
   source predecessor before publishing the capability.

An already-present fixed D5 file is idempotently acceptable only when its
complete bytes equal the currently required source checkpoint and every
identity and context check passes. Different existing bytes, an unexplained
temporary, a path collision, a changed source head, or a file published after
the corresponding capability is an incident. Root never overwrites or repairs
a different retained copy.

A crash with only the exact `.publishing` path may finish the no-replace rename
only while the original lease remains continuously held and the opened source
checkpoint is still the exact current head. The final path and capability must
both still be absent. After lock loss, source-head change, ambiguous identity,
or any capability/journal reference, the temporary is retained as incident
evidence and automated continuation is forbidden; it is never deleted, reused,
or promoted. Any other temporary basename is an incident.

The capability is then published under the already-approved fixed basename
`<command-id>--<lease-epoch>.json`, schema, canonical bytes, mode `0400`, and
lifecycle directories. Its complete-byte hash remains unchanged through
no-replace moves. The retained copy exists first; therefore no predecessor node
contains a future capability hash.

### Retention

Every D5 copy remains immutable and present through at least the accepted
`q12_terminal` checkpoint and all local Q12 acceptance/closeout validation. D5
defines no automatic deletion, rotation, compaction, archival replacement, or
historical reconstruction path. Any later retention-policy change requires a
separate owner-approved design and cannot weaken the evidence needed to audit
the completed run.

## Exact journal and checkpoint lifecycle

The approved exact 19-key journal, exact hash preimage/JSONL bytes, and exact
12-key fixed checkpoint remain unchanged. Selector `intent` rows are governed
only by the exact per-command `H -> I -> checkpoint` projections above. They
precede capability publication, are not capability authority, and therefore
carry exactly `H.capability_manifest_sha256`, never a future capability digest.
The four normalizing selectors use their target phase; the activation selector
uses `activation_committing`, not target phase `activated`.

Only the capability lifecycle outcomes `capability_issued`,
`capability_claimed`, `recovery_reacquired`, and `completed` have all of:

- the command's exact target phase from the table;
- the exact command ID/hash and stable run/release/operator/resource/quiesce
  context from the current capability;
- that current capability's complete-byte SHA-256 in
  `capability_manifest_sha256`;
- `accepted_object_kind=none` and `accepted_object_sha256=null`;
- the exact execution or completion lease epoch defined below; and
- one fixed checkpoint published by the existing append/fsync/hash-chain/CAS
  protocol before the next lifecycle action.

The sole additional D5 row is
`rollback_preparing/retained_attempt_abandoning`. It is neither a selector nor
a capability lifecycle outcome and is governed only by the exact rollback-
frontier projection below. It never creates execution or completion authority.

Each listed outcome occurs at most once per command and epoch. Missing-
checkpoint recovery never appends a duplicate row. Any unlisted outcome,
duplicate, gap, intervening row for the same command lifecycle, changed
binding, wrong directory, or checkpoint/head disagreement is an incident.

### Uninterrupted initial execution

The initial capability uses `lease_epoch=cutover` and
`supersedes_capability_sha256=null`. Its exact order is:

| Order | Durable action or row                                                           | Capability location | Authority result                                    |
| ----: | ------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------- |
|     1 | For the four normalized selectors only, append/checkpoint exact `intent`        | none                | no capability authority                             |
|     2 | Validate the exact selector; publish retained D5 copy                           | none                | no capability authority                             |
|     3 | Publish immutable capability                                                    | `issued/`           | not authority until journal/checkpoint              |
|     4 | Append/checkpoint `capability_issued`                                           | `issued/`           | current authority for claim only                    |
|     5 | Launcher no-replace moves identical file and fsyncs both directories            | `claimed/`          | zero execution authority until claim row/checkpoint |
|     6 | Launcher appends/checkpoints `capability_claimed`                               | `claimed/`          | child execution may begin                           |
|     7 | Child produces and fsyncs exact command-specific result/evidence                | `claimed/`          | no completion yet                                   |
|     8 | Root validates result, no-replace moves identical file, fsyncs both directories | `completed/`        | pending completion row/checkpoint                   |
|     9 | Root appends/checkpoints terminal `completed`                                   | `completed/`        | one completed tip                                   |

D5 adds initial `intent` only for `install`, both verifier commands, and
`prepare-recovery`; an `activated/intent` is an incident. There is no D5
`accepted` or `capability_completed` outcome. The
already-frozen retained terminal outcome is exactly `completed`. Intent,
issuance, claim, and completion rows use `lease_epoch=cutover` on uninterrupted
execution.

Before the claim move, the generic launcher validates the D5 retained copy hash
against both `--checkpoint` and the capability field, validates the complete
copy against its journal head, and validates the current fixed checkpoint as
the same capability's `capability_issued` row. After the no-replace move it
must append and checkpoint `capability_claimed` before invoking the child. This
adds no argv or second child checkpoint.

### Selector/copy exists but no capability

For any of the five retained commands, a crash after its exact selector
checkpoint but before capability publication has two continuous-lease
forward continuations: publish the missing exact retained copy, or, if that
copy is already final and exact, publish the one deterministic capability. For
the four rollback-reachable commands, an explicit phase-proven pre-activation
rollback instead uses the frontier rule below and creates neither a missing
copy nor a capability. A pending install follows the separate pre-maintenance
boundary below. No second selector is appended; `activate` uses the existing
exact `activation_committing/intent` selector under the same rule.

After lock loss, exactly one of two cutover prefixes is permitted while that
same selector checkpoint remains the unique current journal head:

1. the cutover D5 copy is absent, and there is no cutover capability,
   capability reference, claim, result, or copy-only residue; or
2. exactly one valid cutover D5 copy exists, and there is no cutover capability,
   capability reference, claim, result, or other copy-only residue.

Root never synthesizes the absent cutover copy after loss and never changes or
deletes an existing exact cutover copy. When the phase-proven continuation is
forward, either prefix selects `cutover-recovery-1`, publishes or idempotently
validates that epoch's copy of the still-current selector checkpoint, and
publishes the first capability with `supersedes_capability_sha256=null`.
`recovery_reacquired` is its sole issuance row. For a rollback-reachable
command whose phase-proven continuation is rollback, Root preserves the
applicable absent/sole-copy state or, after a recovery-1 copy publication
crash, the exact pre-capability copy set defined below, and appends the exact
frontier `R` instead. The optional abandoned copies are never capability
authority or substituted for a recovery copy.

W accepts exactly the applicable absence/presence variant and rejects a
missing selector, more than one cutover copy, a mismatching cutover copy, or
any cutover capability/reference/claim/result. If recovery crashes before the
recovery capability is published, Root idempotently reuses the same
`cutover-recovery-1` path and epoch because no durable capability or row
consumed it; it does not create another copy-only prefix.

### Recovery reissue without an exact durable result

After lock loss, the old capability never authorizes new child execution. Root
may reissue only after explicit confirmed recovery proves the one permitted
phase continuation, validates the complete current journal/fixed checkpoint,
retained copies, capability chain, immutable result/ledger/resource evidence,
and live isolation, and selects the next consecutive epoch.
If that exact classifier instead selects an allowed pre-activation rollback,
Root publishes no successor and uses only the pending-frontier disposition
below.

If the highest existing capability execution epoch is `cutover`, the next is
`cutover-recovery-1`; if it is `cutover-recovery-N`, the next is exactly
`cutover-recovery-(N+1)`. The selector includes every immutable lifecycle file,
including a proven journal-less publication-window orphan. Epochs never skip,
repeat, fork, or revert in the capability chain.

For the next epoch Root:

1. treats the current fixed checkpoint immediately before
   `recovery_reacquired` as predecessor `P` and publishes that epoch's exact D5
   retained copy before the new capability;
2. publishes one new immutable capability in `issued/` with the stable command
   context, new copy hash, new epoch, and
   `supersedes_capability_sha256` equal to the complete-byte hash of the direct
   old capability;
3. recomputes and validates the complete unique predecessor chain from the
   null-supersedes root through the new direct successor, including every
   publication-window orphan and directory location;
4. in deterministic oldest-to-newest order, no-replace moves every predecessor
   capability still in `issued/` or `claimed/` to `superseded/` with
   `renameat2(RENAME_NOREPLACE)`, fsyncing the source and `superseded/`
   directories after each move; an ancestor already in `superseded/` is
   idempotently accepted only when its exact immutable bytes, digest, chain
   position, and sole path revalidate;
5. revalidates that every predecessor is now in `superseded/`, no predecessor
   remains in `issued/` or `claimed/`, the new recovery capability is the sole
   `issued/` member of this command chain, and every copy, digest, link, path,
   directory, journal head, and lock identity is unchanged;
6. appends/checkpoints `recovery_reacquired` in the new epoch; this is the sole
   issuance row for the new capability and switches journal authority to its
   digest; and
7. continues only `capability_claimed -> completed` under the same claim,
   result, move, and checkpoint ordering as initial execution.

There is no `capability_issued` row in a recovery epoch whose issuance is
represented by `recovery_reacquired`. Every predecessor file remains immutable
in `superseded/` and is never restored, replayed, completed, deleted, or moved
back. Root and the launcher execute no child while predecessor retirement is
in progress. Moving the journal-current predecessor creates a deliberate
zero-execution-authority interval; the journal may temporarily name a now-
superseded ancestor, while the new `issued/` file is not current authority
until its `recovery_reacquired` checkpoint is durable.

A crash after publication of the new capability or after any individual
predecessor move does not authorize a late row or partial execution. After
lock loss, that published capability is another exact publication-window
orphan. The next attempt publishes its consecutive direct successor and then
repeats complete oldest-to-newest backlog retirement. It appends the new
successor's `recovery_reacquired` row only after every older chain member is in
`superseded/` and the complete chain and directory absence predicates recheck.

The recovery predecessor `P` must be the unique current accepted fixed
checkpoint immediately before reissue. It must either bind the exact old
journal-current capability at `capability_issued` or `capability_claimed`, or
be the unchanged phase-proven predecessor for the sole pre-issuance orphan
case below. A later phase, another command's head, a synthetic historical
checkpoint, or an earlier noncurrent row is forbidden.

### Sole pre-issuance orphan type and repeated crashes

The only retained capability allowed to lack an issuance/recovery lifecycle row
is an exact file published after its D5 copy and before its initial
`capability_issued` or recovery `recovery_reacquired` row. It never became
authority and therefore could not be claimed or executed. Each such file is
one instance of the sole publication-window orphan type; repeated crashes may
create a finite consecutive suffix of that same type, not a broader orphan
class.

W accepts the suffix only when every orphan:

- has its D5 copy at the exact command/execution-epoch path, byte-matching the
  exact predecessor `P` that was current for that attempt; the copy's internal
  epoch remains `P.lease_epoch` even when multiple copy paths have equal bytes;
- has exact canonical capability bytes, basename, copy hash, stable context,
  consecutive epoch, and direct predecessor digest;
- has no `capability_issued`, `capability_claimed`, `recovery_reacquired`,
  `completed`, accepted-success, or other execution-authority/result row
  referencing its digest, and no claim, result, receipt, completed move,
  duplicate, or independent live authority; and
- before optional rollback classification, has no journal reference at all.

In forward recovery, every orphan is moved to `superseded/` once its next
consecutive direct successor exists, and the first later journal-current
successor is the sole `recovery_reacquired` authority for its own epoch. In an
abandoned rollback frontier, every older orphan retains those direct links,
while the newest journal-less tip `T` has no successor capability. Exactly one
later `rollback_preparing/retained_attempt_abandoning` row `R` may reference
only `T`'s digest after the complete pre-`R` classifier passes. That reference
is terminal non-authority evidence: `R` is the sole direct journal reference
to `T`, all frontier members are retired to `superseded/`, and no prior,
second, post-`R`, authority, result, or other orphan-digest journal reference
is permitted. The mandatory post-retirement intent and accepted row carry the
pre-disposition head `F`'s capability value, not `T`'s digest, as frozen below.

Thus a final `cutover-recovery-K/recovery_reacquired` row may follow the prior
journal head even when `cutover-recovery-(N+1)..(K-1)` have no journal rows,
but only when every otherwise skipped integer is occupied by exactly one proven
directly linked publication-window orphan. There is no unexplained epoch gap.
The complete chain still has one root, no fork/cycle/unreferenced file, and one
completed tip.

For the rollback alternative, the complete chain instead ends at the exact
superseded `T` referenced by `R`, has no completed tip, and is accepted only by
the separate frontier/final-writer-manifest grammar below.

Backlog retirement is part of that acceptance, not cleanup after acceptance.
For the journal-current successor to be accepted, every older capability must
already be in `superseded/`, the successor must have been the sole `issued/`
file when its `recovery_reacquired` row was appended, and no older
`issued/claimed` residue may remain. A crash after any publication or any
oldest-to-newest predecessor move is handled only by the next consecutive
direct-successor attempt and a fresh full-chain retirement pass.

While the original lease remains continuously held, Root may instead append
the one missing issuance row after proving the exact publication window. After
any lock loss it may never journal that old issuance late; it must use the
direct-supersession recovery sequence. A missing D5 copy, a journal-less claimed
file, an orphan left in `issued/` at acceptance, or any other journal-less
predecessor is an incident.

### Exact-result completion without replay

If the exact command-specific durable result already exists under the claimed
capability, Root issues no new capability and performs no child execution. After
explicit reacquisition it validates the complete historical copy/capability/
claim/result/context graph, moves the unchanged claimed file to `completed/`,
and appends/checkpoints the one missing terminal `completed` row.

The capability and result retain their original execution epoch. The terminal
row uses exactly the next consecutive recovery epoch. This is the sole legal
execution/completion epoch mismatch and may apply to an initial or already-
reissued capability. There is no `recovery_reacquired`, `capability_issued`, or
second `capability_claimed` row in that completion-only epoch. A partial,
ambiguous, changed, or unbound result forbids this path and also forbids replay.

If Root already moved the exact file to `completed/` but crashed before the row,
completion-row epoch is determined solely by lock continuity. While the
original lease remains continuously held, Root appends the execution-epoch
`completed` row.
After any lock loss, Root may append only the next consecutive recovery-epoch
`completed` row after revalidating the completed location, exact result, claim,
retained copy, journal head, and absence of a competing capability. It never
appends an old-epoch completion late. A completed file without that complete
proof is an incident.

## Pre-activation rollback disposition for one pending frontier

The frozen rollback/finish-forward product boundary remains unchanged. After
exact accepted `barrier.install` and durable writer quiescence, an explicit
phase-proven rollback may abandon at most one pending retained-command frontier
before accepted success. It may not erase that frontier, pretend that its
target phase completed, or leave forward execution authority. At or after the
atomic activation database commit, rollback abandonment is forbidden and
recovery is finish-forward.

The rollback-frontier command order is exactly:

```text
verify-after-base -> verify-after-observability -> prepare-recovery -> activate
```

`barrier.install` is not an abandoned rollback frontier. Before its accepted
maintenance-guarded baseline/v1 receipt there is no durable writer-quiesce
manifest, no final/held writer inventory, and no valid database-rollback
predecessor, so the existing rollback final-writer-manifest protocol cannot be
constructed. A pre-COMMIT install selector/copy/capability state may only
continue through the exact forward recovery rules above or remain an explicit
pre-maintenance incident with all evidence retained and no database rollback,
writer-resume authority, `R`, capability move, or automated mutation. If the
install transaction committed, D4's exact baseline/receipt reconstruction and
D5 exact-result completion finish the unchanged capability without replay;
only after accepted install plus writer quiescence may the normal rollback
chain and W validation begin. Ambiguous install commit state is incident, not
permission to abandon, reexecute, or synthesize missing quiesce evidence.

Let `F` be the exact current canonical journal head and fixed checkpoint and
let `T` be the newest capability in the pending command's unique direct chain,
when one exists. Before any rollback-disposition row, move, Docker/database
rollback, writer action, or child execution, Root must hold or explicitly
reacquire the canonical lock and prove the complete journal/checkpoint/copy/
capability graph, the phase-required rollback choice, and that the launcher,
child, and command-specific database sessions are absent. For one of the four
rollback-frontier commands, exactly one of these inputs is permitted:

| Input                            | Exact current `F`                                                  | Files before disposition                                                              |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| selector-only                    | exact command selector checkpoint                                  | no D5 copy and no capability                                                          |
| copy-prefix                      | exact command selector checkpoint                                  | one or two exact allowed pre-capability copies below and no capability                |
| journal-less published           | exact predecessor named by the copy/capability; no row names `T`   | exact copy and `T` in `issued/`; every older direct ancestor is exact                 |
| issued                           | `capability_issued` or `recovery_reacquired` checkpoint naming `T` | `T` in `issued/`                                                                      |
| claim-moved                      | same issuance checkpoint; no claim row                             | `T` in `claimed/`; launcher is proven stopped before child invocation                 |
| claimed without accepted success | `capability_claimed` checkpoint naming `T`                         | `T` in `claimed/`; child/sessions stopped and no exact accepted-success result exists |

The pre-capability copy set is exact. Under the original continuously held
lease it is either empty or the sole `cutover` copy. After lock loss and before
any capability or capability row, it is exactly one of: empty; sole `cutover`;
sole `cutover-recovery-1`; or both `cutover` and
`cutover-recovery-1`. The recovery-1 path may exist only because phase-proven
forward recovery published its byte-exact copy and crashed before capability
publication. Both files, when present, independently satisfy the fixed
identity/source-selector rules, have distinct inodes/link count one, and bind
the same still-current selector bytes; neither is authority. No recovery-2
copy is possible because a copy without capability/row does not consume
recovery-1 and must reuse that path idempotently. A third path, wrong epoch,
wrong source, alias/shared inode, capability/reference, or unknown temporary is
an incident.

The table applies to an initial attempt or a finite exact recovery chain.
Ancestors already in `superseded/` remain there. An exact durable accepted-
success result is not abandonable: Root completes the unchanged capability
without replay, then recomputes rollback from the enlarged completed prefix.
A partial, ambiguous, changed, or unbound result or live state is an incident,
not abandonment permission.

### Durable rollback choice

After validating one table row and before moving any capability, Root appends
and checkpoints exactly one row `R` with:

- `phase=rollback_preparing` and
  `outcome=retained_attempt_abandoning`;
- `seq=F.seq+1`, `previous_hash=F.entry_hash`, and the exact canonical
  recomputed 19-key `entry_hash`;
- the pending retained command's exact command ID/hash and stable
  run/release/operator/resource/quiesce context;
- `capability_manifest_sha256` equal to `T`'s complete-byte SHA-256 when a
  frontier capability exists, including a journal-less `T`, and otherwise
  equal to the value carried by `F`;
- `accepted_object_kind=none`, `accepted_object_sha256=null`,
  `rotation_required=true`; and
- the exact decision epoch below.

The matching exact 12-key fixed checkpoint projects `R`: unchanged schema/run,
`seq=R.seq`, `phase=rollback_preparing`,
`journal_entry_hash=R.entry_hash`,
`previous_journal_entry_hash=F.entry_hash`, the same open journal device/inode,
accepted-object kind `none`, accepted-object and resume-authority hashes null,
and `lease_epoch=R.lease_epoch`. Publication uses the frozen two-state CAS:
`F` is fixed checkpoint and journal head before append; after append `R` is the
journal head while the fixed path still byte-matches `F`; then Root publishes,
reopens, and revalidates the exact `R` checkpoint. No capability move precedes
that durable checkpoint.

`retained_attempt_abandoning` is a non-authority outcome. Even when its
capability field names `T`, it is not issuance, claim, completion, accepted
success, or a new chain link, and no launcher or recovery path may execute the
command after `R` is durable. For a journal-less published `T`, this `R` is the
sole permitted direct journal reference to its digest; the exact orphan rules
forbid every other reference before or after it. In that case the later
rollback intent and accepted row use `F.capability_manifest_sha256`; they do not
repeat, carry forward, or otherwise directly reference `T`.

With the original lease continuously held, `R` uses the current selector or
execution epoch. After lock loss it uses the next consecutive recovery epoch.
For a pre-capability frontier, recovery-1 is that decision epoch whether its
copy is absent or already present; the copy alone consumed no row/capability and
the epoch is reused idempotently. A journal-less capability does consume its
path epoch, so `R` uses its consecutive successor. Moving capabilities never
rewrites their execution epochs. If lock is lost after `R`, the next journal
row uses the next permitted recovery epoch and no old-epoch post-state row is
appended late.

### Retirement and existing post-state anchor

After the exact `R` checkpoint, Root alone:

1. revalidates `R`, the rollback choice, stopped launcher/child/sessions, live
   state, copies, and the complete unique frontier chain;
2. moves every frontier capability still in `issued/` or `claimed/`, oldest to
   newest, to `superseded/` with `renameat2(RENAME_NOREPLACE)`, fsyncing each
   source directory and `superseded/` after every move; an already-superseded
   ancestor is idempotent only when its exact bytes, digest, chain position,
   identity, and sole path revalidate;
3. proves that every frontier capability is solely in `superseded/`, none is
   in `issued/claimed/completed`, or, for selector/copy-prefix, that no
   capability exists anywhere; preserves the exact allowed pre-capability copy
   set; and
4. proves there is no accepted success, replay, reissue, second frontier, or
   intervening journal row, then appends the already-frozen
   `rollback_preparing/intent` for the rollback final-writer-manifest.

That existing intent has `previous_hash=R.entry_hash` and carries exactly
`F.capability_manifest_sha256`; the existing `rollback_preparing/accepted` row
also carries that same exact `F.capability_manifest_sha256`, and every other
field remains under the frozen final-writer-manifest contract. This equals
`R.capability_manifest_sha256` for selector-only, copy-prefix, issued,
claim-moved, and claimed inputs. For a journal-less published `T`, it differs
by construction: `R` alone directly names `T`, while the intent and accepted
row retain `F`'s non-`T` value.

The intent is appended only after complete retirement and therefore is the
durable post-retirement boundary. Under the existing acyclic object protocol it
has no separate fixed checkpoint: the immutable final-writer-manifest
references this intent plus the exact `R` input-checkpoint hash, then the
existing `rollback_preparing/accepted` row names the object and publishes the
next fixed checkpoint. The object and accepted row still prove `T`'s retirement
transitively through `intent.previous_hash=R.entry_hash` and the exact `R`
input-checkpoint hash; neither may repeat `T`'s digest.

The sole added repeated-phase sequence is:

```text
rollback_preparing/retained_attempt_abandoning [fixed checkpoint]
  -> complete frontier retirement or exact no-capability proof
  -> rollback_preparing/intent [existing final-writer-manifest intent]
  -> final-writer-manifest
  -> rollback_preparing/accepted [existing fixed checkpoint]
```

No rollback resource mutation, reverse phase, object intent, new capability,
child execution, or other journal row may occur between `R` and complete
retirement. No row may intervene inside the existing intent/object/accepted
triple. A clean between-command rollback retains the original triple and adds
no `R`.

### Activation commit classifier

`activation_committing/intent`, `activated/capability_issued`, and
`activated/capability_claimed` are not the atomic database commit. Before `R`
for `barrier.activate`, one read-only recovery inspection on the exact run,
catalog, and database binding must prove all of:

- no launcher, activation child, barrier-era transaction, or session can still
  commit after classification;
- the run-bound `q12_guard.active_run` truth binds the exact run, database
  capability, and expected catalog and has `activated=false`;
- maintenance guards, guard ACLs/probes, database default, suspended cron/queue
  state, and prepared writers with restart policy `no` equal the exact
  pre-activation projection; and
- no exact activated database/file receipt or accepted activation success
  exists.

Only that exact pre-commit projection permits the activation frontier to reach
`R`. If the run-bound durable activated truth exists and the full post-commit
projection validates, Root must not append `R`: recovery finish-forwards,
completing exact success without replay or using only the phase-proven recovery
capability whose child takes the read-only activated-state result-verification
path. A mismatched or partial activated state is incident containment. If
activated truth appears after `R`, the classifier or isolation proof was false;
automatic rollback and forward execution both stop as an incident.

## Install claimed-boundary compatibility

`barrier.install` retains the D4-approved
`database-barrier-baseline.json` contract. After the install transaction and
exact reconnect verification, the child publishes the baseline before the
first barrier receipt. Its predecessor checkpoint hash and journal head bind
the exact `maintenance_guarded/capability_claimed` boundary, while the D5 copy
and capability bind the earlier launcher predecessor.

These are different facts, not two launcher authorities. D5 adds no second
claimed-input checkpoint copy. W requires the baseline's exact
`predecessor_journal_entry_hash` to select the unique
`maintenance_guarded/capability_claimed` row for the capability that actually
produced the install result. That row's `capability_manifest_sha256`, command/
context, and execution epoch must equal that exact chain member. W recomputes
the row's exact 12-key checkpoint projection in memory and requires its
complete-byte SHA-256 to equal `predecessor_checkpoint_sha256`; the baseline's
resource, expected-catalog, database-capability, source-baseline, and nested
baseline fields retain the exact D4 rules. An initial claim, another recovery
claim, or a later same-phase head cannot substitute. W may not publish or treat
the recomputed projection as recovered historical authority. The other four
commands gain no baseline or claimed-input result field.

## Producer and validator ownership

### Root supervisor

Root is the sole writer of retained copies, capabilities before launcher claim,
intent/issuance/recovery/completion journal rows and their fixed checkpoints,
the rollback-frontier row/checkpoint and retirement, direct supersession,
completion moves, the existing rollback object lifecycle, and allowed missing-
current-checkpoint repair outside the delegated claim transaction. It owns lock
acquisition/reacquisition, phase proof, result/live-state inspection, and
selection of the one legal continuation. It never reconstructs a missing
historical D5 copy after the corresponding capability publication.

### Generic launcher

The existing generic launcher remains the sole claim-before-exec enforcer. It
accepts the existing single `--checkpoint` hash, validates the exact D5 copy,
capability, current issuance checkpoint, command manifest, FD 9 lock, and all
stable bindings, then performs the no-replace claim move and durable claim row/
checkpoint before child execution. For that atomic claim transaction only, the
Root-controlled launcher is the sole delegated writer of
`capability_claimed` and its matching fixed checkpoint, using the inherited
already-open canonical journal descriptor and lock descriptor. Root waits and
performs no concurrent journal/checkpoint write. The launcher fsyncs the journal
and both capability directories, publishes/rechecks the fixed checkpoint under
the existing CAS rule, and only then invokes the child. It receives no second
checkpoint and the child receives no host capability path/hash/FD. Before a
rollback-frontier `R`, Root proves the launcher and child are stopped. After
`R`, the launcher has no role and may append no claim or execute any child.

### W validator

W is read-only and fail-closed. It derives coverage from the canonical journal,
phase graph, rollback intent, and required receipts rather than from files that
happen to be present. Forward writer resume requires exactly all five completed
D5 chains and accepts no abandoned frontier.

Rollback writer resume requires the exact completed prefix of the first four
nonactivation commands, of length one through four as constrained by the
accepted forward/rollback phase receipts; accepted `barrier.install` and the
durable writer-quiesce manifest are mandatory before W has any rollback-resume
role. It permits at most one abandoned frontier, exactly the next retained
command after that prefix; after a length-four prefix the frontier may be
`barrier.activate`. The frontier does not enlarge the completed prefix.
`barrier.activate` remains forbidden as a completed rollback member but is
permitted as the sole exact pre-commit abandoned frontier. A missing member of
the completed prefix, later/future command, gap, or second frontier is an
incident.

Before Docker, database continuation, writer start, or resume authority, W
validates every completed prefix member with the full existing D5 rules:

- exact command coverage, target phase, predecessor phase, and quiesce binding;
- every lifecycle directory, basename, owner, mode, canonical capability byte,
  digest, and stable context field;
- every exact D5 path, identity, complete byte, SHA-256, 12-key checkpoint
  projection, journal device/inode/head, and capability binding;
- the complete 19-key journal chain and exact initial, recovery, orphan, or
  completion-only outcome sequence for every epoch;
- one null-supersedes root: normally `cutover`, or only
  `cutover-recovery-1` when the journal proves the exact selector was current
  at root creation and the optional cutover copy-only prefix was either absent
  or exactly one valid file, with no cutover capability ever having existed; W
  validates the applicable exact
  absence/presence variant and never synthesizes the absent copy, then requires
  consecutive direct supersession through every later capability epoch, no
  fork/cycle/unexplained gap/duplicate, complete predecessor backlog
  retirement, and one completed tip;
- exact old-result completion semantics and absence of replay;
- install baseline claimed-boundary consistency.

For the optional frontier W additionally requires:

- exactly one of the six allowed frontier inputs ending at `F`, followed by
  exactly one checkpointed `rollback_preparing/retained_attempt_abandoning`
  row `R` with its exact command/context/hash/epoch projection;
- for a journal-less published tip, no prior authority/result reference and
  exactly one direct journal reference to that tip: the non-authority `R`; no
  ancestor, second row, or post-`R` row may reference an orphan digest, and the
  post-`R` intent and accepted row both carry exactly
  `F.capability_manifest_sha256`, never `T`'s digest;
- selector-only or copy-prefix with no capability anywhere, preserving exactly
  the allowed empty/cutover/recovery-1/both copy set for the decision epoch, or
  one complete consecutive direct chain with the same exact null-root grammar
  as forward recovery and whose every capability is solely in `superseded/`;
- the existing rollback final-writer-manifest `intent -> object -> accepted`
  ancestry immediately after full retirement: intent previous hash equals
  `R.entry_hash`, object input checkpoint hash equals the exact `R` checkpoint,
  and the accepted row/checkpoint remains the frozen post-state projection;
- no accepted success/result, completed row/file, replay, reissue, post-`R`
  capability, second/later frontier, or intervening journal row; and
- for activation, the exact rollback database/phase receipts and current
  fail-closed state, with no durable activated truth or receipt.

Across completed members and the optional frontier, W rejects unknown
temporaries, aliases, extra copies beyond the exact permitted variants,
unknown barrier capability files, wrong lifecycle locations, unreferenced
residue, or any self-consistent recomputation that changes Root-published
history.

W never creates, repairs, renames, deletes, reconstructs, or blesses D5 state.
A self-consistent recomputation of local hashes does not cure a missing Root-
published copy, wrong journal head, wrong inode, wrong epoch, or missing
lifecycle row.

## Crash and fail-closed matrix

| Last durable boundary                                     | Sole legal continuation after complete validation                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| new selector row present, fixed checkpoint absent         | repair only that exact current checkpoint from verified journal head and predecessor CAS                         |
| exact selector checkpoint current, D5 copy absent         | forward may publish/recover; only a rollback-reachable command may append `R` while preserving copy absence      |
| exact `.publishing`, final absent                         | same continuously held lease/source may finish no-replace; after loss or drift retain as incident                |
| allowed D5 copy set present, capability absent            | forward may publish/recover; only reachable rollback retains the exact set and appends `R`                       |
| capability in `issued/`, issuance row absent              | same lease may issue; otherwise forward reissue or eligible `R` then retirement, never late execution            |
| issuance row present, fixed checkpoint absent             | repair only that exact current checkpoint from verified journal head and predecessor CAS                         |
| claim move present, claim row absent                      | same lease may claim; otherwise forward reissue or eligible `R` then retirement, never journal old claim         |
| claim row present, fixed checkpoint absent                | repair only that exact current checkpoint; no child before repair                                                |
| exact result absent after lock loss                       | classifier selects forward reissue or an eligible rollback `R`; old capability never executes                    |
| exact result present under claimed capability             | complete unchanged capability in next recovery epoch without replay                                              |
| completion move present, row absent, same lease           | append only execution-epoch `completed` after exact result/location/copy/claim/context validation                |
| completion move present, row absent, lock lost            | append only next-recovery-epoch `completed` after reacquisition and the same complete validation                 |
| completion row present, fixed checkpoint absent           | repair only that exact current checkpoint                                                                        |
| recovery capability published before backlog retirement   | after loss it becomes the next orphan; publish a direct successor and repeat full oldest-to-newest retirement    |
| crash after any predecessor retirement move               | after loss publish a direct successor; revalidate the chain and retire every remaining predecessor oldest-first  |
| consecutive publication-window orphans                    | direct next-epoch links plus complete backlog retirement before the sole later `recovery_reacquired`             |
| `R` journal row present, fixed checkpoint absent          | repair only exact `R` checkpoint from predecessor CAS; move no capability first                                  |
| exact `R` checkpoint, frontier not fully retired          | finish oldest-to-newest retirement; forward recovery/reissue is forbidden                                        |
| all frontier capabilities retired, rollback intent absent | append only existing rollback intent after exact absence/location revalidation                                   |
| rollback intent present, final manifest not accepted      | continue only the frozen object/accepted/checkpoint publication protocol                                         |
| exact accepted success discovered before `R`              | do not abandon; complete without replay, then recompute the rollback prefix                                      |
| pending `barrier.install` without accepted baseline/v1    | exact forward recovery/completion or pre-maintenance incident; no `R`, W resume, DB rollback, or capability move |
| exact activation commit before `R`                        | finish-forward only; `R` and rollback are forbidden                                                              |
| activated truth appears after `R`                         | incident containment; no automatic rollback or forward execution                                                 |
| D5 copy missing after capability publication              | incident; historical authority is not reconstructed                                                              |
| wrong head/inode/context, fork, gap, duplicate, ambiguity | incident; no Docker, database continuation, writer start, or automated mutation                                  |

`SIGKILL`, torn journal tail, SSH loss, controller death, Docker restart, and
host reboot do not widen these continuations. A torn or unknown state remains
incident evidence and is never silently truncated or normalized.

## TDD and acceptance contract

Root and W use shared canonical fixture builders for the exact D5 path, bytes,
checkpoint projection, journal lifecycle, capability graph, and epoch rules.
The first implementation step is RED coverage; producer and validator code may
not be accepted from hand-built positive fixtures alone.

Required positive coverage includes all five commands for:

- exact initial selector coverage: four normalized intents and the existing
  activation intent, followed by uninterrupted issuance, claim, result, and
  completion; activation coverage exercises the exact temporal CAS state
  `H checkpoint + I journal head` before publishing the `I` checkpoint;
- one and multiple consecutive recovery reissues;
- for each of all five commands, lock loss before any capability with the exact
  selector checkpoint current and (a) no cutover D5 copy or (b) exactly one
  valid cutover D5 copy, followed by a recovery-1 root capability with null
  supersedes and its own retained copy; also crash-before-publication
  idempotency at the same recovery-1 path;
- one and at least two consecutive proven pre-issuance orphans followed by one
  journal-current direct recovery successor, with fault injection after every
  successor publication and every oldest-to-newest predecessor move and proof
  that the complete backlog is retired before `recovery_reacquired`;
- exact-result completion without replay from both initial and recovery
  execution epochs, including completion-move/no-row under continuous lease and
  after reacquisition;
- recovery path/capability epoch differing from the byte-exact copied
  predecessor checkpoint epoch, including permitted equal copy hashes at
  distinct epoch paths;
- exact temp-create/temp-fsync/pre-rename crash handling; and
- install baseline binding to the actual initial or recovery execution
  capability's claimed row without a second D5 authority.

For the four rollback-frontier commands, rollback positives cover selector-
only, copy-prefix, journal-less published, issued, claim-moved, and claimed-
without-accepted-success frontiers under continuous lock and reacquisition,
including initial and multi-epoch chains. Copy-prefix positives cover empty,
sole cutover, sole recovery-1, and cutover-plus-recovery-1 sets, including the
sequence `cutover copy -> forward recovery-1 copy -> crash before capability ->
rollback R`. Every journal-less frontier positive proves that `R` is the sole
non-authority direct journal reference to newest tip `T`, that the later intent
and accepted row carry exactly `F.capability_manifest_sha256` instead, and that
no orphan ancestor is referenced. Fault injection covers `R` append, missing
`R` checkpoint, every retirement move, complete retirement, existing rollback
intent, final-writer-manifest publication, acceptance, and acceptance-checkpoint
repair. Exact success discovered before `R` completes without replay and
enlarges the completed prefix.

Install tests separately prove that selector/copy/published/issued/claim-moved/
claimed pre-COMMIT failures never create `R`, database rollback, a final-writer
manifest, W resume authority, or a capability move; exact forward recovery is
the only automated continuation. COMMIT-without-baseline/receipt reconstructs
and completes without replay under D4, while ambiguous commit state remains
incident with all evidence retained.

W has table-driven positive coverage for every clean legal rollback completed
prefix: `{install}`, `{install, verify-after-base}`,
`{install, verify-after-base, verify-after-observability}`, and
`{install, verify-after-base, verify-after-observability, prepare-recovery}`.
Every case includes the exact accepted install baseline/v1 receipt and durable
writer-quiesce manifest required before W. It separately covers every optional-
frontier pair: prefix length one through three plus its next abandoned verifier/
prepare command, and length four plus abandoned `activate`. Empty prefix plus
install frontier is a mandatory negative. Forward coverage still requires all
five completed chains and no frontier.

Required adversarial coverage mutates one invariant at a time and, where
applicable, recomputes every local JSON hash so validation cannot rely on an
accidental stale digest. It includes missing/changed/cross-command/cross-epoch
D5 copies, wrong source head, later-head substitution, changed journal device
or inode, fabricated canonical root, missing/duplicate/wrong intent, an
`activated/intent`, missing issuance or claim, journal-less claimed file,
inserted or nonconsecutive orphan epoch, indirect supersedes link, fork, cycle,
duplicate path/shared inode, unexplained equal-content copy, changed command
SHA/context/quiesce, unbound result, illegal replay, second completed authority,
unknown temp, symlink, owner/mode/link-count error, omitted required command
chain, unpermitted future/extra command chain, and a retained copy beyond the
exact forward or abandoned-frontier variants.

For each of the five selectors, separate adversarial fixtures put the future
capability digest into `intent` or replace the exact carried
`H.capability_manifest_sha256`, then recompute the complete journal/checkpoint
hash chain; both must fail. Activation-specific fixtures additionally mutate
each `H -> I -> checkpoint` binding: current `activation_ready` head,
sequence, previous hash, canonical entry hash, rotation flag, phase, journal
device/inode, accepted-object fields, resume authority, epoch, and the temporal
state in which `I` is journal head while `H` remains the predecessor fixed
checkpoint. Both
pre-capability absence/presence variants are tested with recomputed hashes for
missing, extra, or mismatching cutover copies. Backlog negatives cover a
predecessor left in `issued/claimed`, wrong-directory, missing, duplicate, or
forked ancestors, and a `recovery_reacquired` row appended before full
retirement.

Rollback-frontier negatives cover wrong/missing/duplicate `R`, a move before
the exact `R` checkpoint, wrong command/capability hash/prior head/epoch,
future digest, missing/extra/cross-epoch copy outside the exact allowed copy
set, third copy, wrong-source copy, alias/shared inode, a capability left in
`issued/claimed`, moved to `completed`, deleted, replayed, or reissued, an
indirect/forked/cyclic chain, second frontier, existing rollback intent before
full retirement, an intervening row, final-manifest input checkpoint not equal
to the `R` checkpoint, forward recovery after `R`, and live launcher/child/
session. Journal-less negatives add an issuance/claim/recovery/completion/
accepted-success reference, a prior/duplicate/post-`R` reference, `R` naming a
non-tip orphan or wrong digest, an intent or accepted row repeating `T` instead
of exact `F.capability_manifest_sha256`, any other wrong post-`R` capability
value, or a post-`R` capability row. Activation
negatives cover activated truth or receipt, run/catalog/guard/default/cron
drift, a commit between classification and `R`, completed activation on
rollback, and rollback evidence coexisting with activated truth.
Required-command negatives cover one missing completed-prefix member and every
extra/later frontier, including any abandoned install frontier. Every negative
recomputes local hashes where applicable and fails before child, Docker,
database, or writer mutation.

Acceptance requires:

1. Root producer RED/GREEN tests for publication order and every crash boundary;
2. W positive fixtures produced by the real shared Root contract, replacing the
   fabricated retained predecessor fixture;
3. W adversarial validation before Docker;
4. focused runtime, PostgreSQL 17 barrier, isolation, syntax/style, type-check,
   build, and cleanup gates required by the parent W/Root plans;
5. fresh independent correctness and documentation reviews with P0=P1=0 for
   the exact design, plan, implementation, and joined W/Root behavior; and
6. no W integration until the producer, validator, tests, reviews, artifacts,
   Beads state, and rerun evidence are accepted together.

## Compatibility and migration

No Root producer or accepted live Q12 run exists, so there is no deployed state
to migrate. D5 preserves the existing capability schema, generic launcher argv,
command IDs and hashes, child argv, result/receipt schemas, target phase graph,
strict isolation, one-authority rule, immutable direct-supersession chain,
consecutive recovery epochs, and no-replay behavior. Its four normalizing
intent rows are the only new initial row type and complete a target phase only
at terminal `completed`. Its sole new rollback outcome,
`retained_attempt_abandoning`, records a pre-commit rollback decision and never
completes a retained target phase or creates execution authority. The existing
rollback final-writer-manifest schema/path/object protocol is unchanged.
Pending install is intentionally excluded because its required quiesce/
baseline/v1 predecessors do not yet exist; its explicit forward-or-incident
boundary adds no rollback or writer-resume authority.

The terminal W branch remains unintegrated until D5 closes its P1. Its current
positive linked-recovery fixture, whose first predecessor has no real journal/
checkpoint provenance, must be replaced rather than grandfathered.

## Approval record

On 2026-07-14 the owner's reply `Подтверждаю` confirmed proceeding with the
recommended one-copy direction and authorized local drafting/review. It did not
approve unseen filenames, rows, crash semantics, this document's complete
bytes, implementation, or any remote/live action.

This candidate remains non-normative while `.13.17` is open. After corrected
bytes receive independent P0=P1=0 correctness and documentation reviews, the
orchestrator will present the complete file path and SHA-256 for explicit owner
approval. Only that later response may be recorded as approval of the exact D5
security contract in the tracked `.13.17` artifact, handoff, and stage summary.
Implementation planning begins after that durable update. The subsequent local
plan and implementation do not change the separate Q12 remote gate.
