# Q12 D5J Amendment: Canonical Ordinary Command Bindings and Dual FWM Authority

| Field                      | Value                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                       | 2026-07-15                                                                                                                                                                                                                                                     |
| Beads                      | decision `mc2-jz6y0.13.22`, blocks `mc2-jz6y0.13.21`                                                                                                                                                                                                           |
| Status                     | drafted under the 2026-07-15 owner delegation; normative after independent correctness and documentation reviews report P0=P1=0                                                                                                                                |
| Amends                     | `2026-07-15-q12-joined-retained-barrier-fixture-design.md` (D5J)                                                                                                                                                                                               |
| D5J SHA-256                | `d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`                                                                                                                                                                                             |
| Base Q12 design            | `2026-07-13-q12-live-cutover-corrections-design.md`                                                                                                                                                                                                            |
| Base Q12 design SHA-256    | `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`                                                                                                                                                                                             |
| Lifecycle addendum         | `2026-07-13-q12-recoverable-lifecycle-addendum-design.md`                                                                                                                                                                                                      |
| Lifecycle addendum SHA-256 | `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`                                                                                                                                                                                             |
| D4 addendum                | `2026-07-14-q12-durable-recovery-projections-addendum-design.md`                                                                                                                                                                                               |
| D4 SHA-256                 | `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`                                                                                                                                                                                             |
| D5 design                  | `2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md`                                                                                                                                                                                     |
| D5 SHA-256                 | `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`                                                                                                                                                                                             |
| Audit evidence (ignored)   | `.superpowers/sdd/q12-d5j-command-binding-audit.md` SHA-256 `17f61bc5681a8d19f0a237c6e72aca7a4ed89fbbbe02c28712190a64cbd1148e`; `.superpowers/sdd/q12-d5j-plan-architecture-map.md` SHA-256 `942b3423eea39c0fb08606eeb7ddbd32c2e4db11934b4d819f1c9b4898328469` |

## 1. Purpose and precedence

This amendment closes the two independently confirmed product-truth gaps that
block the D5J implementation plan:

1. the accepted sources froze the ordinary forward/rollback phase order but not
   the exact per-row `command_id`/`command_sha256`/outcome bindings, literal
   argv, and runtime substitutions for ordinary journal rows; and
2. the activation-frontier rollback profile requires distinct forward and
   rollback final-writer manifests in one run while the accepted contract fixed
   one immutable path and named no authoritative Root inventory source.

It amends the D5J design, the lifecycle addendum, and D5 only as far as those
two gaps require, and nothing else. The base design, lifecycle addendum, D4,
D5, D5W, W, recovery, isolation, and strict-mode invariants otherwise remain
normative and unweakened. One canonical journal, Root-only production of
authority bytes, W read-only validation, no caller command rows/hashes, no
`root.advance` or zero/fabricated hashes in a joined positive, and no deployed
CLI fixture flag all remain mandatory. Nothing here authorizes any remote or
live action.

Where this amendment and an earlier document disagree on exactly the items
listed in sections 2-7, this amendment controls; every earlier rule that it
does not name is unchanged.

## 2. One canonical command authority

`deploy/qdrant/q12-command-manifest.json` remains the single command authority
consumed through the existing production `load_manifest()` and
`resolved_command()` primitives. No second resolver, alternate manifest,
fixture-side command table, environment switch, or caller-supplied command
row/hash may exist.

The manifest is expanded now with exactly the enumerated ordinary commands
required by the closed D5J profiles, moved forward from the Task 9 scope of the
accepted D5 plan. Task 9 later extends the same file and the same resolver with
the remaining commands and must prove byte- and order-parity against every
entry frozen here; it may not replace, reorder, rehash, or duplicate them.

The frozen complete key order of `commands` becomes:

1. `barrier.install`
2. `barrier.verify-after-base`
3. `barrier.verify-after-observability`
4. `barrier.prepare-recovery`
5. `barrier.activate`
6. `operator.self-check`
7. `writers.quiesce`
8. `pg.backup`
9. `pg.restore`
10. `migration.base.apply`
11. `migration.observability.apply`
12. `source.forward`
13. `reindex.plan`
14. `reindex.worker.create`
15. `reindex.execute`
16. `reindex.verify`
17. `deploy.prepare`
18. `deploy.commit`
19. `writers.resume.forward`
20. `writers.resume.rollback`

The five `barrier.*` entries keep their exact current bytes. Every other entry
uses the literal argv frozen by the base design command table as extended by
the lifecycle addendum (`--database-barrier-receipt` pair for `source.forward`;
the two receipt mount/env element groups for every `reindex.*` operator
command; the fixed DB-capability mount elements for `reindex.*`), stored as
separate argv elements with no prose, unresolved reference, or inherited
environment key. Compact references (`operator prefix`, `worker prefix`,
`SOURCE_RESUME`, `RECOVERY_BINDING`, `EXPECTED_CATALOG`) are expanded exactly
as the base design requires before hashing.

Command environment is per-entry and frozen:

- every entry carries `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, `LC_ALL=C`,
  `LANG=C`, `HOME=/root`. For the five `barrier.*` entries these are the
  current manifest bytes; for `writers.quiesce` and the two resume commands
  they are the D4/lifecycle-addendum frozen bytes; for the remaining entries
  this amendment newly freezes the same minimal fixed base that the base design
  requires to be "rebuilt from a minimal fixed base, not inherited";
- `writers.quiesce`, `writers.resume.forward`, and `writers.resume.rollback`
  additionally carry exactly `Q12_EXTERNAL_QUIESCE_LEASE_FD=9` as frozen by D4
  and the lifecycle addendum.

`load_manifest()` is amended to require exactly this twenty-key set and order,
the per-entry frozen environment above, and the existing `argv_sha256` equality
over canonical argv bytes. Any other set, order, entry shape, or environment
fails closed.

## 3. Runtime substitutions and their sole authorities

`resolved_command()` remains the only place canonical run-specific command
hashes are produced: SHA-256 over the canonical JSON bytes of the fully
substituted argv array. The substitution domain is expanded from two to exactly
these typed placeholders, each with a single frozen authority. An unresolved or
unknown placeholder, or a substitution offered by a caller, fails closed.

In every preimage and UUIDv5 name below, `<run-id>` denotes the canonical
lowercase hyphenated textual UUID rendering.

| Placeholder                                | Production authority (base:1063-1066 typed-value rule)                         | Closed-fixture derivation (Root-only)                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<run-id>`                                 | already-hashed run input                                                       | existing UUIDv5 of the normalized safe run-root path (unchanged)                                                                                                                                       |
| `<expected-post-migration-catalog-sha256>` | already-hashed run input                                                       | existing fixture catalog digest rule (unchanged)                                                                                                                                                       |
| `<release-sha>`                            | already-hashed run input                                                       | the existing fixture literal `0123456789abcdef0123456789abcdef01234567`                                                                                                                                |
| `<quiesce-manifest>`                       | the accepted external quiesce manifest path bound to the run input             | the validated absolute normalized path of the already-existing W-owned quiesce manifest                                                                                                                |
| `<exported-id>`                            | prior fsynced checkpoint-bound resource manifest (recorded at snapshot export) | with `H` = SHA-256 hex of UTF-8 `q12:snapshot-export:<run-id>`: `H[0:8]-H[8:16]-1`, matching the deployed backup wrapper's frozen `^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$` snapshot-identifier grammar |
| `<immutable-generation>`                   | prior fsynced checkpoint-bound resource manifest (accepted backup generation)  | `q12fixture-generation-` + first 16 hex of SHA-256 of UTF-8 `q12:backup-generation:<run-id>`                                                                                                           |
| `<recovery-run-id>`                        | prior fsynced checkpoint-bound resource manifest (accepted recovery run)       | UUIDv5 with namespace `<run-id>` and name `q12-source-recovery`                                                                                                                                        |
| `<accepted-recovery-manifest-sha256>`      | prior fsynced checkpoint-bound resource manifest                               | SHA-256 of UTF-8 `q12:recovery-manifest:<run-id>`                                                                                                                                                      |
| `<accepted-coverage-fingerprint>`          | prior fsynced checkpoint-bound resource manifest                               | SHA-256 of UTF-8 `q12:coverage-fingerprint:<run-id>`                                                                                                                                                   |
| `--accepted-coverage-run` list             | the accepted run input's frozen nonempty sorted list                           | exactly one entry `<org>:<course>:<coverage-run>`, each UUIDv5 with namespace `<run-id>` and names `q12-coverage-org`, `q12-coverage-course`, `q12-coverage-run`                                       |

`reindex.worker.stop`, `reindex.worker.remove`, and therefore
`<accepted-worker-container-id>` are not part of any closed D5J profile and are
not moved forward; they remain Task 9 scope.

The production rule is unchanged: every substitution value comes only from the
already-hashed run input or a prior fsynced resource manifest bound to the
current checkpoint; it is never a fresh live lookup and never caller-supplied.
In the closed fixture, Root records each derived value in the same
checkpoint-bound resource-manifest evidence before the row that consumes it, so
a validator can recompute every `command_sha256` without any external input.

## 4. Journal row model for ordinary commands

The following uniform model is frozen. It preserves every already-accepted D5
and D4 row shape and makes the ordinary rows derivable.

1. Every journal row carries the phase the run occupies when the row is
   appended. A phase transition happens exactly at its phase-opening row.
2. A phase-establishing command opens its phase with its `intent` row and its
   remaining lifecycle rows carry the same phase. This is the accepted shape of
   the five `barrier.*` groups (with `activate` opening `activation_committing`
   as its selector) and of the D4 `writers.quiesce` group.
3. A phase-internal command executes without changing the phase: all of its
   lifecycle rows carry the current phase. This is how the two migration
   commands preserve the D5-frozen predecessor heads.
4. Exactly one command uses a split selector/target lifecycle: `pg.backup`'s
   `intent` row opens `snapshot_exported` as its selector phase, and its
   `capability_issued -> capability_claimed -> completed` rows carry the target
   phase `backup_committed`, which therefore opens at the `capability_issued`
   row. This mirrors the accepted `barrier.activate` selector/target split and
   is the sole ordinary instance; no other command may split phases and no
   separate `backup_committed` intent or milestone row exists.
5. Ordinary child commands use the outcome sequence
   `intent -> capability_issued -> capability_claimed -> completed`, the same
   four-outcome shape as the retained `barrier.*` commands, with a single-use
   host capability published in `capabilities/issued/`, atomically claimed to
   `capabilities/claimed/`, and completed to `capabilities/completed/` with a
   durable result hash, in the same capability-lifecycle shape that base design
   section 11 defines for mutating children; applying that shape to the
   read-only genesis proof is an authorized `.13.22` extension.
   `writers.quiesce` keeps its D4-frozen five-outcome sequence ending in
   `accepted` with the writer-quiesce manifest.
6. Controller-only milestone rows exist only where this amendment names them.
   A controller milestone is one `completed` row appended by Root. Its
   `command_id` and `command_sha256` are the Root-recomputed manifest binding of
   its named witness command, whose own complete lifecycle already appears
   earlier in the same run. A milestone may never substitute for a missing
   lifecycle, and a witness binding is valid only when the witness's
   `completed` (or `accepted`) row is durable in the same journal. The
   milestone row's `capability_manifest_sha256` carries the same value as its
   witness's `completed` row, so the next barrier intent inherits it unchanged
   as `H.capability_manifest_sha256`.
7. Every row keeps the unchanged canonical 19-key schema, hash chain,
   `O_NOFOLLOW|O_APPEND|O_DSYNC` append, fsync, device/inode, checkpoint, and
   predecessor-CAS rules. Checkpoint publication per row follows the existing
   D4/D5 rules unchanged.
8. The journal `quiesce_manifest_sha256` binding is segment-bound exactly as D4
   and D5J already freeze it: every row through
   `quiesced/capability_completed` binds 64 zeroes; the `quiesced/accepted` row
   and every later row bind the computed real W quiesce digest. Root acceptance
   is the sole switch. The current core's request-global stable-binding check
   for this one field is superseded by this two-segment rule. Run ID, release
   SHA, operator digest, and rotation flag remain request-global and
   unchanged. `resource_manifest_sha256` binds the current accepted
   resource-manifest bytes as of the row: it changes exactly when Root durably
   records a new derived value (the `<exported-id>` before group 4's intent and
   the five captured target identities before group 13's `deploy.prepare`
   completion) and is otherwise carried unchanged.
9. The cutover-journal phase `reindex_started` is unrelated to the
   source-recovery child's internal recovery-journal state of the same name;
   only the cutover rows frozen here represent the cutover phase.

## 5. Exact frozen forward bindings

The D5J forward chronology keeps its accepted group order. Group contents are
frozen as follows; D5 groups are entirely unchanged.

| #   | Group (D5J order)                 | Exact rows: phase / outcome <- command                                                                                                                                                                                                                                               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `preflight`                       | `operator.self-check` lifecycle: `preflight/intent` (genesis row, seq=1) -> `preflight/capability_issued` -> `preflight/capability_claimed` -> `preflight/completed`                                                                                                                 |
| 2   | D5 `install`                      | unchanged D5 group; selector predecessor `preflight` = row 1's `completed` head                                                                                                                                                                                                      |
| 3   | `quiesced`                        | `writers.quiesce` D4 lifecycle: `quiesced/intent -> capability_issued -> capability_claimed -> capability_completed -> accepted` (accepts `writer_quiesce_manifest`)                                                                                                                 |
| 4   | `snapshot_exported`               | `pg.backup` selector: `snapshot_exported/intent`; the row's checkpoint-bound resource manifest records `<exported-id>`                                                                                                                                                               |
| 5   | `backup_committed`                | `pg.backup` target rows: `backup_committed/capability_issued -> capability_claimed -> completed`                                                                                                                                                                                     |
| 6   | `restore_verified`                | `pg.restore` lifecycle: `restore_verified/intent -> capability_issued -> capability_claimed -> completed`; then phase-internal `migration.base.apply` lifecycle: `restore_verified/intent -> capability_issued -> capability_claimed -> completed`                                   |
| 7   | D5 `verify-after-base`            | unchanged; its intent's predecessor head is the `migration.base.apply` `completed` row, whose phase is `restore_verified` exactly as D5 requires                                                                                                                                     |
| —   | (inside `base_migration_guarded`) | phase-internal `migration.observability.apply` lifecycle: `base_migration_guarded/intent -> capability_issued -> capability_claimed -> completed`                                                                                                                                    |
| 8   | D5 `verify-after-observability`   | unchanged; its intent's predecessor head is the `migration.observability.apply` `completed` row, phase `base_migration_guarded` exactly as D5 requires                                                                                                                               |
| 9   | `migrations_applied`              | controller milestone: `migrations_applied/completed`, witness `migration.observability.apply` (Root-recomputed manifest hash)                                                                                                                                                        |
| 10  | D5 `prepare-recovery`             | unchanged; predecessor head phase `migrations_applied`                                                                                                                                                                                                                               |
| 11  | `source_recovered`                | `source.forward` lifecycle: `source_recovered/intent -> capability_issued -> capability_claimed -> completed`                                                                                                                                                                        |
| 12  | `reindex_started`                 | three consecutive lifecycles at phase `reindex_started`, in this order: `reindex.plan`, `reindex.worker.create`, `reindex.execute`; each `intent -> capability_issued -> capability_claimed -> completed`; the phase opens at `reindex.plan/intent`                                  |
| 13  | `qdrant_verified`                 | `reindex.verify` lifecycle at `qdrant_verified`; then phase-internal `deploy.prepare` lifecycle: `qdrant_verified/intent -> capability_issued -> capability_claimed -> completed`; `deploy.prepare`'s checkpoint-bound resource manifest records the five captured target identities |
| 14  | `prepared_quiesced` FWM           | unchanged object protocol: `prepared_quiesced/intent -> forward final-writer manifest -> prepared_quiesced/accepted`; both rows bind `writers.resume.forward` with its real resolved manifest hash                                                                                   |
| 15  | `activation_ready`                | `deploy.commit` lifecycle: `activation_ready/intent -> capability_issued -> capability_claimed -> completed`; its `completed` row records `activation_ready` exactly as the base design states                                                                                       |
| 16  | D5 `activate`                     | unchanged: exact `activation_committing/intent` selector, then the `activated` capability lifecycle through `completed`                                                                                                                                                              |

Group 13 deliberately places the `deploy.prepare` lifecycle at
`qdrant_verified` even though base section 6 says prepare-quiesced "records
`prepared_quiesced`": the lifecycle addendum makes the final-writer-manifest
intent/accepted pair the sole owner of the `prepared_quiesced` phase
transition, and the repeated-phase prohibition rejects any second pair or
checkpoint there, so the command lifecycle must complete phase-internally
before the object protocol opens the phase. That narrow base-section-6
supersession is explicit here.

The two migration terminal `completed` rows and the `migrations_applied`
milestone binding above deliberately fill the gap that D5 explicitly left open
("the frozen sources do not define its exact terminal row/checkpoint"; D5 lines
156-164): those bytes are now frozen here and supersede that stated absence,
while every D5 selector/H rule stays satisfied byte-for-byte.

There is still exactly one completed D5 tip per retained command, no abandoned
frontier, and no rollback FWM artifact in a forward positive. After the Root
prefix, W's already-approved suffix protocols (writer-handoff or
writer-rollback state, database lifecycle evidence, resume authority, claimed
resume lifecycle) are structurally unchanged, and their command bindings are
now frozen: the `writer-handoff-state`, `writer-rollback-state`,
`writer-resume-authority` intent/accepted pairs, the
`resume_committing_<mode>` intent and capability rows, and the
`writers_resumed_<mode>` acceptance all bind the mode-bound
`writers.resume.forward` or `writers.resume.rollback` command with its real
resolved manifest hash. Every current W test default of
`barrier.prepare-recovery` with `9*64` for these rows is nonnormative and must
be replaced during W `.13.10`; W's negative-only helpers remain negative-only.
W's database host-capability lifecycle keeps its own already-reviewed W
contract and is not redefined here.

The genesis binding in row 1 is frozen new product truth under the delegated
`.13.22` authority: the run's first journaled act is the read-only
`operator.self-check` claim, which proves the operator identity that every
subsequent row's `operator_digest` context asserts. Applying the single-use
host-capability lifecycle to this read-only command follows the accepted
precedent of the two read-only `barrier.verify-*` host commands, which the base
design already claims through capabilities; one uniform
claim-per-enumerated-command rule keeps the audit surface closed. The genesis checkpoint
keeps its lifecycle-addendum exception bytes (`seq=1`, `phase=preflight`,
previous hash 64 zeroes, accepted kind `none`); 64 zeroes remains chain-origin
notation only and is never a command hash.

## 6. Exact frozen rollback bindings and the dual-FWM rule

Rollback profiles reuse the forward bindings above for every reached prefix
row, unchanged. The D5-owned frontier forms, exact `R`
(`rollback_preparing/retained_attempt_abandoning`), and complete retirement
rules are unchanged. Wherever the D5J design's chronology tables use the
shorthand labels `preflight/completed`, `quiesced/completed`,
`snapshot_exported/completed`, and the other single-row ordinary labels, they
now denote exactly the frozen groups of section 5; the group order is
unchanged. In particular, the `snapshot_exported` shorthand denotes only the
`pg.backup` selector intent, whose completion lands in `backup_committed`.

The final-writer-manifest contract is corrected as follows:

1. **Distinct immutable paths.** The single fixed path is superseded by exactly
   two mode-bound fixed paths below the run root, both controller-owned mode
   `0400`, both published through the unchanged no-replace
   `immutable_publish()` protocol:
   - forward: `final-writer-manifest-forward-<run-id>.json`
   - rollback: `final-writer-manifest-rollback-<run-id>.json`
     An activation-frontier rollback run therefore durably retains both objects;
     neither may overwrite, alias, link to, or share bytes with the other. Every
     consumer (H validation, W import, resume authority ancestry, checkpoints)
     addresses the object by its mode-bound path plus recorded hash. A rollback
     publication targeting the forward path, or the reverse, fails closed.
2. **Row command bindings.** Forward FWM `intent`/`accepted` rows bind
   `writers.resume.forward`; rollback FWM `intent`/`accepted` rows bind
   `writers.resume.rollback`. Both use the real resolved manifest hash. The
   current core's zero-hash special case for `writers.resume.rollback` is
   superseded; existing tests pinning the zero hash are updated to the real
   resolved hash, which strengthens rather than weakens them. The eleven-key
   `megacampus.q12.final-writer-manifest/v1` schema, writer entry shape, sort
   order, and array hashing rules are unchanged.
3. **Root-owned deterministic inventory.** The writer inventories are produced
   only by Root, from exactly two authorities:
   - the ten original writers (five production, five development) are parsed
     read-only from the already-validated W-owned
     `megacampus.q12.writer-quiesce/v1` manifest bytes after the accepted D5W
     path/owner/mode/link/identity/TOCTOU checks; W supplies only that file;
   - the five target identities exist only when `deploy.prepare` completed in
     the run, and are the Root-deterministic fixture values recorded in
     `deploy.prepare`'s checkpoint-bound resource manifest. For service
     `<svc>` in the frozen order `api`, `web`, `worker`, `worker-stage6`,
     `worker-stage7`: `id` = SHA-256 of UTF-8 `q12:fixture-target:<run-id>:<svc>`;
     `image_id` = `sha256:` + SHA-256 of UTF-8
     `q12:fixture-target-image:<run-id>:<svc>`; `image_ref` =
     `q12fixture.invalid/megacampus-<svc>@` + that `image_id`; `name` =
     `megacampus-<svc>-q12fixture`; `class`/`project`/`service`/`config_files`/
     `working_dir` copy the corresponding production writer's values from the
     quiesce manifest; `healthcheck_present` copies the corresponding original;
     `intended_running=true`;
     `intended_restart_policy={name:"unless-stopped",maximum_retry_count:0}`,
     the frozen fixture value of the lifecycle addendum's "new release's
     reviewed policy for production", equal to the repository's production
     Compose `restart: unless-stopped`; and
     `temporary_restart_policy={name:"no",maximum_retry_count:0}`. This fills
     all thirteen writer-entry keys, so both manifests' writer arrays are exact
     recomputable bytes.
     The mode-specific composition is a closed-fixture specialization of the
     lifecycle addendum's frozen cardinalities (forward ten/five; rollback held
     `0..5` narrows to exactly `{0, 5}` because the closed profiles either never
     run `deploy.prepare` or run it to completion):
   - forward: final = five targets plus five development originals; held = five
     production originals;
   - rollback for prefixes 1-4 (clean or non-activation frontier): final = the
     ten originals; held = empty (no `deploy.prepare` completion exists);
   - rollback at the activation frontier: final = the ten originals; held = the
     exact five targets already durably recorded by `deploy.prepare`,
     byte-identical to the forward manifest's target entries.
     The caller can supply or override none of these bytes; a request carrying
     any writer identity, policy, or inventory field fails before producer state.

## 7. Authorized production-core and grammar deltas

Only these executable deltas are authorized by this amendment, inside the
existing D5J write zone:

1. `q12-command-manifest.json`: the enumerated expansion of section 2.
2. `load_manifest()`: the twenty-key exact set/order and per-entry frozen
   environment checks of section 2.
3. `resolved_command()`: the typed substitution domain of section 3 with its
   single-authority sourcing rule.
4. The reload stable-binding validation: the two-segment
   `quiesce_manifest_sha256` rule of section 4 item 8, and the
   evidence-stepped `resource_manifest_sha256` rule of the same item, for
   those two fields only; the serializer may set the per-row
   resource-manifest hash exactly at the two recorded derived-value steps.
5. `validate_journal_entry_grammar()`: a closed ordinary-row table implementing
   sections 4-6 — for each enumerated ordinary command, its exact allowed
   phase(s) per outcome; the D4 `writers.quiesce` five-outcome lifecycle with
   its `writer_quiesce_manifest` accepted-object pairing, which the lifecycle
   addendum's checkpoint enum already names normatively; the two FWM row
   bindings with real hashes and their `final_writer_manifest` pairing; the
   controller-milestone rule for `migrations_applied`; and removal of the
   `writers.resume.rollback` zero-hash special case. The `root.advance` grammar
   remains available exactly as today for isolated D5 unit fixtures and remains
   forbidden in every joined positive.
6. The internal Root joined composer and serializer-primitive extraction that
   D5J already authorizes, now able to emit the ordinary groups above through
   the same production serializer, capability, object, and checkpoint
   primitives.

No deployed wrapper, CLI parser, child interface, or W-owned file gains any
change or flag. No command beyond section 2 and no phase, outcome literal, or
accepted-object kind beyond those the accepted designs already freeze may be
introduced. Anything outside this list remains a design-amendment stop.

## 8. Fail-closed additions

In addition to every existing D5J fail-closed rule, the composer and W
validation fail before returning or accepting a positive for any of:

- an ordinary row whose command binding, outcome sequence, phase, or hash
  differs from sections 5-6, including any `root.advance`, zero, `9*64`,
  W-helper, or caller-derived value in a joined positive;
- a substitution value that does not match its frozen single authority, or an
  ordinary `command_sha256` that does not equal the Root-recomputed
  `resolved_command()` value;
- a controller milestone whose witness lifecycle is absent, incomplete, or
  later than the milestone;
- a missing, duplicated, reordered, or extra ordinary lifecycle row, including
  a second `intent` for an already-open FWM phase;
- an FWM published at the wrong mode path, both modes at one path, a forward
  object in a prefix 1-4 rollback, a rollback held set that is not exactly the
  frozen cardinality, or any writer entry not derived per section 6;
- a manifest whose key set/order/env/hash deviates from section 2.

## 9. TDD deltas for `.13.21`

The D5J TDD contract gains these RED-first cases; every existing required case
stays:

1. every ordinary row asserts its exact frozen command ID and an independently
   recomputed resolved-argv hash; removing one manifest entry makes composition
   fail before `phase.jsonl` exists;
2. the migration lifecycles carry exactly the D5-required predecessor phases so
   both verifier intents chain to heads with phases `restore_verified` and
   `base_migration_guarded`;
3. the activation-frontier rollback publishes both FWM objects at their two
   distinct frozen paths, byte-stable, with the forward object unmodified; a
   same-path second publication fails;
4. rollback prefixes 1-4 without `deploy.prepare` completion produce an empty
   held set; fabricating a held target without the recorded `deploy.prepare`
   evidence fails;
5. FWM rows with zero or fabricated hashes fail; `writers.resume.*` resolve
   real hashes from the one manifest;
6. the genesis row is the `operator.self-check` intent and a journal beginning
   with any other row fails;
7. a controller milestone without its witness lifecycle fails;
8. manifest set/order/env mutations fail `load_manifest()`.

## 10. What remains Task 9

Task 9 keeps: the real `plan|live|recover` controller; `barrier.cleanup`,
`reindex.worker.stop/remove`, all `smoke.*`, `qdrant.*`, `deploy.finalize`,
`deploy.retire-old`, `deploy.rollback`, `migration.*.rollback`,
`activation.verify`, `evidence.contain`, `operator.metrics-check`, and every
remaining substitution; post-activation phases; and live orchestration. The
local Qdrant snapshot/restore drill, notifications, and smoke belong to the
base design's Execution Order step alongside the handoff and are deliberately
outside the closed D5J profiles, exactly like `smoke.*`; when the Task 9
controller journals them, it extends the joined graph under its parity duty
rather than diverging from it. Task 9 must consume the manifest entries and
serializer/composer primitives frozen here with proven byte- and order-parity
and may not fork a second authority.

## 11. Approval record

On 2026-07-15 the owner approved the recommended `.13.22` correction direction
— one canonical command authority with only the enumerated D5J subset moved
forward from Task 9, a frozen exact phase/command/outcome/argv/substitution
table preserving real multi-command lifecycle evidence, a Root-owned
deterministic closed fixture inventory with W supplying only its immutable
quiesce bytes, distinct stable immutable forward/rollback FWM paths, and Task 9
byte/order parity — and delegated drafting, independent review, planning, TDD,
integration, and local verification to Fable without further intermediate
confirmations. Remote/live boundaries are unchanged and remain separately
gated.

This amendment becomes normative once independent correctness and
documentation reviews both report P0=P1=0; `.13.21` planning and code remain
blocked until then.
