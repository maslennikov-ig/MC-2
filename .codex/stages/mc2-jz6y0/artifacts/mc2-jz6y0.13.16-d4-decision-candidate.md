---
schema_version: orchestration-artifact/v1
artifact_type: decision-evidence
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: senior-architect
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The decision freezes crash recovery, capability consumption, database terminal proof, and immutable writer evidence shared by W and Root.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 9d3f3a1cbe74e0579c74a914fb797eeb0d42e40e
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate.md
success_criteria:
  - Freeze an acyclic writer-resume capability and recovery-epoch projection.
  - Freeze recoverable cleanup and rollback COMMIT-to-receipt publication.
  - Freeze immutable quiesce and source-recovery evidence without silent replacement.
  - Give W and Root one exact fail-closed validation model without authorizing remote mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
selected_skills:
  - senior-architect
  - senior-devops
  - superpowers:receiving-code-review
selected_agents:
  - correctness_reviewer
  - docs_reviewer
catalog_candidates:
  - none - installed architecture, operations, and review assets cover this bounded decision
parallel_group: q12-d4-contract-gate
depends_on_streams:
  - mc2-jz6y0.13.10 independent NO-GO review
parallel_decision: sequential - W and Root cannot implement different recovery graphs
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Read-only design analysis and local documentation only; no server, database, container, registry, or remote mutation.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: pending
docs_review_notes: This candidate must pass two independent P0-P3-zero reviews before it becomes a normative addendum.
graph_reviewed: used
graph_review_notes: The existing Graphify report and prior focused Q12 queries were used; the local graph will be refreshed after accepted durable workflow changes are integrated.
verification:
  - base Q12 correction design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15 remains authoritative
  - lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27 remains authoritative until this decision is approved and incorporated
  - W candidate 5390a2f6 independent review found P0=0 P1=4 P2=3 P3=0
  - current safe W correction retains eight journal-graph and one immutable-publication RED tests pending this decision
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate.md
explicit_defers:
  - GHCR, server, Supabase, Qdrant, service, secret, schema, writer, scheduler, staging, production, and deployment mutations remain under the separate Q12 remote gate.
---

# Summary

## Q12-D4 crash recovery and durable publication candidate

## Status and precedence

This is a proposed narrow clarification of the approved Q12 correction design
and recoverable-lifecycle addendum. It exists because independent W review
proved that the current documents do not define one implementable projection
for a recovery lease epoch, a claimed host capability, a terminal child
receipt, database cleanup/rollback after COMMIT, and immutable quiesce evidence.

The owner's statement `Согласен с твоими рекомендациями` is recorded as
directional approval to continue the recommended safe local design. It is not
treated as approval of unseen exact fields. This candidate becomes normative
only after the exact approval sentence at the end is accepted and two
independent reviews report P0=P1=P2=P3=0.

The clarification authorizes only local documentation, implementation, tests,
review, commit, and push. It does not authorize a remote or live effect.

## 1. Common publication rules

Every new file below is below the canonical run root
`/opt/megacampus/backups/q12/<run-id>`, is a non-symlink regular file owned by
`1000:1000`, and is mode `0400`, except journal/checkpoint files and immutable
checkpoint copies, which are mode `0600`. Readers use `O_NOFOLLOW`, reject
duplicate JSON keys, require the exact schema and key set, and recheck
device/inode/owner/mode/size/hash after use.

An immutable object is published by same-directory deterministic temporary,
file fsync, no-replace rename, and parent-directory fsync. An already-present
object is accepted only when its complete canonical bytes are identical. A
different existing file or any unknown temporary is an incident. No immutable
object below is replaced with `mv -f`.

The existing journal remains exact 19-key
`megacampus.q12.cutover-journal/v1`; the checkpoint remains exact 12-key
`megacampus.q12.cutover-checkpoint/v1`. The approved canonical JSON, hash,
device/inode, predecessor, accepted-object, and lease-epoch rules remain
unchanged. `resource_manifest_sha256`, `quiesce_manifest_sha256`, and
`capability_manifest_sha256` are three independent current-manifest domains;
none is overloaded with an accepted-object hash.

## 2. Acyclic writer resume lifecycle

### Uninterrupted execution

For mode `forward` or `rollback`, Root uses target phase
`resume_committing_<mode>` and command ID `writers.resume.<mode>` in this exact
order:

| Order | Phase                                                         | Outcome                | Capability manifest                 | Checkpoint          |
| ----: | ------------------------------------------------------------- | ---------------------- | ----------------------------------- | ------------------- |
|     1 | `resume_committing_<mode>`                                    | `intent`               | unchanged predecessor manifest      | `C-intent`          |
|     2 | `resume_committing_<mode>`                                    | `capability_issued`    | exact issued-capability manifest    | `C-issued`          |
|     3 | `resume_committing_<mode>`                                    | `capability_claimed`   | exact claimed-capability manifest   | `C-claimed`         |
|     4 | child publishes immutable `writer-resume-state-<run-id>.json` | no journal append      | claimed manifest                    | none                |
|     5 | `resume_committing_<mode>`                                    | `capability_completed` | exact completed-capability manifest | `C-completed`       |
|     6 | `writers_resumed_<mode>`                                      | `accepted`             | same completed manifest             | terminal checkpoint |

Every row with a journal record publishes its checkpoint. Rows one through five
use `accepted_object_kind=none` and null accepted-object hash. Row six accepts
`writer_resume_state` and its exact SHA-256. Every row retains the accepted
resume-authority hash, current resource manifest, and immutable original
quiesce-manifest hash. Only the capability-manifest field changes at the three
capability state transitions.

After `C-intent` and before issuing the capability, Root no-replace publishes a
byte-exact copy of `C-intent` at:

```text
writer-resume-input-checkpoint-<mode>-<lease-epoch>.json
```

The issued capability binds that copy's SHA-256 and therefore depends only on
durable predecessor evidence. Root publishes the capability in `issued/`, then
journals `capability_issued`. The host wrapper atomically moves it
`issued -> claimed`, fsyncs both directories, publishes the claimed capability
manifest, journals `capability_claimed`, and publishes `C-claimed` before the
child runs. The W child sees and validates:

- the immutable input-checkpoint copy equal to `C-intent`;
- fixed `phase-checkpoint.json` equal to `C-claimed`;
- journal head `resume_committing_<mode>/capability_claimed`;
- the current exact claimed-capability manifest and the full
  `intent -> capability_issued -> capability_claimed` slice; and
- the original intent, resume authority, canonical journal chain, and exact
  current resource/quiesce manifest chronology.

The child never receives or opens a host-capability path or descriptor. It
publishes only the immutable terminal receipt. Root validates that receipt,
moves the claim to `completed/`, journals/checkpoints completion, and only then
accepts the receipt at `writers_resumed_<mode>`.

### Recovery with no terminal receipt

After explicit confirmed recovery and canonical lock reacquisition, Root first
validates the complete durable chain and live exact inventory. It publishes one
new capability bound to the current predecessor checkpoint, then appends
`resume_committing_<mode>/recovery_reacquired` under the next monotonic
`cutover-recovery-N` epoch. That record contains the new issued-capability
manifest and is the required durable issuance record; a second
`capability_issued` record is forbidden.

Root publishes its checkpoint and a byte-exact immutable copy at
`writer-resume-input-checkpoint-<mode>-<recovery-epoch>.json`. The wrapper then
claims the new capability and publishes
`resume_committing_<mode>/capability_claimed` plus its checkpoint. W sees that
claimed head and recovery input checkpoint. The terminal receipt keeps
`resume_intent_journal_entry_hash` bound to the original immutable intent, but
its `input_checkpoint_sha256` and `lease_epoch` name the effective recovery
overlay checkpoint and epoch. Completion and acceptance then follow the normal
order.

### Recovery with an existing terminal receipt

The receipt is never republished and no recovery overlay or new capability is
issued.

| Durable state                                                                           | Sole permitted continuation                                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| receipt exists and original capability is `claimed`                                     | exact read-only receipt/inventory proof, then `claimed -> completed`; `capability_completed` starts the new recovery epoch |
| completion journal exists but its checkpoint is absent                                  | reconstruct only the exact missing checkpoint after full chain/object revalidation                                         |
| completed state/checkpoint exists and acceptance is absent                              | `writers_resumed_<mode>/accepted` starts the new recovery epoch                                                            |
| acceptance journal exists but terminal checkpoint is absent                             | reconstruct only the exact terminal checkpoint                                                                             |
| receipt exists while capability is still `issued`, missing, duplicated, or inconsistent | incident; no automated start or publication                                                                                |

The receipt remains bound to the checkpoint under which the child actually
executed. Recovery never rewrites that binding merely to use the new lease
epoch.

### Sole repeated-phase exceptions

The generic repeated-phase prohibition is narrowed only for these exact,
ordered resume records:

- uninterrupted: `intent -> capability_issued -> capability_claimed -> capability_completed`;
- recovery without receipt: one `recovery_reacquired -> capability_claimed -> capability_completed` suffix in one new epoch; and
- recovery with receipt: only the missing `capability_completed` record or
  terminal acceptance may start the new epoch as specified above.

Each outcome occurs at most once in its permitted epoch. Missing, duplicate,
out-of-order, cross-mode, changed-command, changed-authority, intervening, or
second recovery-overlay records are incidents. The existing paired
`intent -> accepted` exception for the approved five controller-owned object
schemas remains unchanged. No resume-authority publication pair is repeated.

## 3. W and Root validation responsibility

Root is the sole owner of the complete forward/rollback phase graph, recovery
epoch selection, command-capability issuance/claim/completion, current-manifest
chronology, conditional rollback receipt set, and journal/checkpoint repair.
Before issuing or claiming a resume capability, Root validates the entire graph
from genesis through the current head and rejects every unknown phase or
outcome.

W independently validates the complete canonical journal bytes/hash chain and
checkpoint CAS projection, every object it consumes and its publication pair,
the exact mode-specific prefix order, the entire resume slice through the
claimed head, the current three manifest domains, the input-checkpoint copy,
authority, barrier/capability absence, and exact final/held live inventory. W
does not repair a journal/checkpoint, issue/claim/complete a host capability, or
accept a terminal object. A valid Root graph is therefore required but not
sufficient for W; a valid W input cannot make an invalid Root graph acceptable.

For journal outcomes, the shared rule is:

- `intent` and `accepted` only for already approved object-publication pairs;
- `completed` for an ordinary no-object terminal phase transition;
- `capability_issued`, `capability_claimed`, and `capability_completed` only at
  a frozen host-command capability lifecycle point; and
- `recovery_reacquired` only as the resume recovery issuance record above.

An existing controller-specific accepted object uses `accepted` and names its
exact kind/hash. A no-object ordinary transition uses `completed`, `none`, and
null. No implementation may invent `success`, `done`, or another equivalent
outcome.

## 4. Recoverable database cleanup and rollback publication

### Fixed durable inputs

At successful barrier install, the controller no-replace publishes
`database-barrier-baseline.json`, schema
`megacampus.q12.database-barrier-baseline/v1`, with exactly:

```text
schema_version
run_id
state
source_baseline_sha256
baseline_sha256
predecessor_checkpoint_sha256
predecessor_journal_entry_hash
resource_manifest_sha256
expected_post_migration_catalog_sha256
database_capability_sha256
baseline
```

`state=maintenance_guarded_baseline`. `baseline` is the exact existing
non-secret database-default/cron/catalog restoration projection; it contains no
URL, password, capability value, row value, or token. Its canonical bytes hash
to `baseline_sha256`. `source_baseline_sha256` binds the exact database
`q12_guard.baseline` projection from which it was derived. The capability field
contains only the SHA-256 of the fixed owner-only capability file.

Before rollback can mutate the database, Root no-replace publishes
`database-barrier-rollback-intent.json`, schema
`megacampus.q12.database-barrier-rollback-intent/v1`, with exactly:

```text
schema_version
run_id
state
expected_post_migration_catalog_sha256
database_barrier_baseline_sha256
input_checkpoint_sha256
intent_journal_entry_hash
required_phase_receipts
required_phase_receipts_sha256
resource_manifest_sha256
```

`state=rollback_intent`. The sorted exact required receipt array and its hash
are frozen before COMMIT and cannot be reconstructed from later live state.
Forward cleanup uses the exact accepted activation receipt plus the immutable
baseline and therefore has no rollback-intent file.

### Terminal proof and receipt v2

Cleanup and rollback publish separate fixed files
`database-barrier-cleanup-terminal-proof.json` and
`database-barrier-rollback-terminal-proof.json`. Both use schema
`megacampus.q12.database-barrier-terminal-proof/v1` and exactly:

```text
schema_version
run_id
operation
state
expected_post_migration_catalog_sha256
database_barrier_baseline_sha256
database_barrier_rollback_intent_sha256
input_checkpoint_sha256
intent_journal_entry_hash
structural_catalog_sha256
database_default_sha256
cron_jobs_sha256
guard_residue
required_phase_receipts_sha256
completed_at
```

`operation` is `cleanup` or `rollback`; `state=guard_cleanup_complete`.
Cleanup has null rollback-intent and required-receipt hashes. Rollback has both
non-null and exact. `guard_residue` is the exact all-zero guard/schema/session
projection. The catalog/default/cron hashes are calculated from canonical live
post-COMMIT verification and must equal the immutable baseline and expected
catalog rules for the chosen operation. `completed_at` is UTC RFC 3339 with
millisecond precision.

The terminal `database-barrier-receipt.json` uses
`megacampus.q12.database-barrier-receipt/v2` and exactly the existing eight
fields plus two:

```text
schema_version
run_id
state
expected_catalog_sha256
zero_guard_residue
last_command
rollback_probes_verified
probe_receipt_sha256
terminal_proof_sha256
database_capability_deleted
```

For cleanup, `last_command=cleanup`, rollback probes and probe hash retain the
approved forward values. For rollback, `last_command=rollback`, probes are
false and probe hash is null. Both require `zero_guard_residue=true`, the exact
terminal-proof hash, and `database_capability_deleted=true`.

### Exact order and crash recovery

The only terminal order is:

1. validate the predecessor checkpoint, prior barrier receipt, immutable
   baseline, and for rollback the immutable rollback intent/receipt set;
2. execute the single database terminal transaction and COMMIT;
3. reconnect and verify the exact canonical terminal catalog/default/cron/
   zero-residue projection;
4. no-replace publish and re-open/re-hash the operation-specific terminal
   proof;
5. unlink only the exact already-open database capability, fsync its parent
   directory, and prove it is absent;
6. CAS-replace the prior barrier receipt with exact receipt v2, fsync the file
   and parent, then let Root journal/accept it.

Recovery rules are exact:

- before COMMIT, the unchanged prior receipt and capability remain authoritative;
- after COMMIT but before proof, the still-present capability permits only the
  same operation's read-only terminal verification and proof publication;
- after proof but before capability deletion, recovery revalidates the proof
  and deletes only the exact bound capability;
- after capability deletion but before receipt v2, recovery uses the exact
  immutable proof plus proved capability absence to publish receipt v2 without
  a database connection;
- after receipt v2, the exact receipt/proof pair and capability absence are
  idempotent terminal truth;
- capability absent with no exact proof, receipt/proof mismatch, wrong prior
  receipt, wrong rollback intent, or any live-state ambiguity is an incident.

Receipt publication is a CAS transition from the exact predecessor receipt,
not an unguarded overwrite. No receipt is published before capability deletion.
Every writer/Docker mutation remains forbidden while the database capability
path exists.

## 5. Immutable writer quiesce and recovery evidence

Add fixed command ID `writers.quiesce` with literal argv:

```text
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation quiesce-writers-only \
  --run-id <run-id>
```

It accepts no path, checkpoint, capability, Docker override, or extra argv.
Before capability issuance Root no-replace publishes the exact accepted
predecessor checkpoint at `writer-quiesce-input-checkpoint-<run-id>.json`.
The capability and inventory bind its SHA-256. Before the first Docker action,
W validates the fixed checkpoint/journal head for command `writers.quiesce` in
capability state `claimed`, the immutable input copy, and the current claimed
capability manifest.

The immutable inventory path is
`writer-quiesce-inventory-<run-id>.json`, schema
`megacampus.q12.writer-quiesce-inventory/v1`, exact keys:

```text
schema_version
run_id
database_barrier_receipt_sha256
input_checkpoint_sha256
writers
```

`writers` is the existing exact ten-writer projection. Inventory is published
before the first restart-policy mutation.

The three immutable transitions use schema
`megacampus.q12.writer-quiesce-transition/v1` and exact eight keys:

```text
schema_version
run_id
state
inventory_sha256
previous_transition_sha256
input_checkpoint_sha256
database_barrier_receipt_sha256
writer_quiesce_manifest_sha256
```

| Fixed path                                           | State                   | Previous transition | Final manifest hash |
| ---------------------------------------------------- | ----------------------- | ------------------- | ------------------- |
| `writer-quiesce-policy-change-planned-<run-id>.json` | `policy_change_planned` | null                | null                |
| `writer-quiesce-policy-no-verified-<run-id>.json`    | `policy_no_verified`    | planned hash        | null                |
| `writer-quiesce-quiesced-<run-id>.json`              | `quiesced`              | policy-no hash      | exact final hash    |

The final `writer-quiesce-<run-id>.json` retains
`megacampus.q12.writer-quiesce/v1` and exactly:

```text
schema_version
run_id
status
barrier
writers
```

Its sole status is `quiesced`; interim states are never written to this path.
The exact order is inventory, planned transition, restart=`no`, policy-no
verification, stop/probe/exact stopped-no, final manifest, terminal transition,
capability completion, then Root object acceptance. A pre-final object never
contains or predicts the future final-manifest hash.

W validates the entire immutable chain. H accepts only the final manifest plus
the terminal transition whose final-hash field equals the manifest hash. Root
validates the full chain before accepting the final manifest as
`writer_quiesce_manifest`; from that acceptance onward the journal's
`quiesce_manifest_sha256` equals that exact hash and never changes.

The existing seven-key
`writer-recovery-state-<run-id>.json` remains schema
`megacampus.q12.writer-recovery-state/v1` with exact state
`recovery_complete_writers_quiesced`. It is also published no-replace with
exact-existing byte acceptance. Crash residue follows the same deterministic
temporary and parent-fsync rules; it is never replaced on retry.

# Verification

The candidate must be compared against both authoritative designs and plans,
reviewed findings-first by independent correctness and documentation reviewers,
and incorporated into a normative addendum only after both report
P0=P1=P2=P3=0. W must then turn all nine preserved RED cases GREEN and pass its
complete runtime, PostgreSQL 17, type-check, syntax, style, and cleanup gates.

## Approval sentence

The exact owner approval requested after independent review is:

> Подтверждаю corrected D4: capability lifecycle выполняется как intent/issued/claimed/receipt/completed/accepted с immutable input checkpoint и без hash-cycle; recovery overlay является issuance-записью только при отсутствии terminal receipt, а существующий receipt принимается без overlay и перепубликации; database cleanup/rollback восстанавливаются через immutable baseline/rollback intent/terminal proof, удаление capability до receipt v2 и CAS; quiesce выполняется командой writers.quiesce через immutable inventory, nullable pre-final transitions, отдельный final manifest и terminal transition с exact final hash; W и Root используют один fail-closed journal/receipt/publication contract; remote/live gate не меняется.

# Risks / Follow-ups

Until exact owner approval, two independent P0-P3-zero reviews, and normative
document incorporation, D4 remains open and W/Root must not implement a guessed
journal or publication graph. All remote and live effects remain separately
gated.
