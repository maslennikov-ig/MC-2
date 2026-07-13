---
schema_version: orchestration-artifact/v1
artifact_type: decision-evidence
task_id: mc2-jz6y0.13.16
stage_id: mc2-jz6y0
agent_type: senior-architect
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The corrected decision freezes cross-process authority, crash recovery, database terminal proof, and immutable writer evidence shared by W, H, and Root.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: f013743cd6003c744d0ba6f253f7931d2f83485f
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate-v4.md
success_criteria:
  - Close every P1/P2 finding from both independent D4 candidate reviews.
  - Freeze acyclic capability, resume, quiesce, database-proof, CAS, and recovery projections.
  - Give W, H, and Root one implementable fail-closed contract without remote authority.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-candidate-reviews.md
selected_skills:
  - senior-architect
  - senior-devops
  - superpowers:receiving-code-review
selected_agents:
  - correctness_reviewer
  - docs_reviewer
catalog_candidates:
  - none - repository truth and installed architecture, operations, and review assets cover the correction
parallel_group: q12-d4-correction
depends_on_streams:
  - q12-d4 resume/quiesce design
  - q12-d4 database design
parallel_decision: joined - independent read-only specialist designs are reconciled here
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Local documentation only; no server, database, container, registry, secret, or remote mutation.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: pending
docs_review_notes: Candidate v4 requires fresh independent correctness and docs rereviews before owner approval or normative incorporation.
graph_reviewed: used
graph_review_notes: Existing Graphify report and focused Q12 architecture evidence were used; refresh follows accepted durable-workflow integration.
verification:
  - base design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15
  - lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - addendum plan SHA-256 316c8b20812ae23f2c367282b742d25277acff3557fe38a7515d843360d719db
  - predecessor candidate SHA-256 3354379f4f3254c1b121c7e83143b7f2966c270569067d1d44d808baa968afcc returned by both reviews
  - candidate v2 SHA-256 90fcd3eebeb579ffc5e3a1e4c5fa9b01bcefb6f1a506ada753c1e2d247d323b7 returned by correctness P1=3 and docs P1=6 P2=1 rereviews
  - candidate v3 SHA-256 6ff751c8a1ff72ea6e39e008acd4d9e4568f89cef216ac5df7173f50b07a7beb passed docs P0-P3 zero and returned correctness P1=2
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.16-d4-decision-candidate-v4.md
explicit_defers:
  - Exact owner approval, normative addendum edits, W/H/Root implementation, and every remote/live effect remain pending.
---

# Summary

## Corrected D4 owner/reviewer candidate v4

This candidate selects both specialist Option A recommendations:

1. one immutable host-command capability file moves between lifecycle
   directories; no separate issued/claimed/completed manifest exists; and
2. the DB child owns the transaction and immutable terminal proof, while Root
   alone completes the host capability, deletes the DB capability, performs the
   sole receipt v1-to-v2 CAS, and accepts the phase.

The owner's earlier `Согласен с твоими рекомендациями` is directional approval
to continue this safe local design, not approval of these exact unseen bytes.
This candidate is non-normative until fresh independent reviews report
P0=P1=P2=P3=0 and the exact approval sentence below is accepted.

## Exact precedence delta

This candidate supersedes only:

1. base design section 11 where issue/claim/complete crash boundaries and old
   capability retirement are implicit;
2. base section 12 ambiguity about which checkpoint hash the generic launcher
   receives;
3. addendum section 4's single `resume_committing` statement;
4. addendum section 6's closed command sets, only by adding `writers.quiesce`
   and `barrier.rollback` with the exact literals below;
5. addendum command-reissue wording, only by defining `superseded/` and the
   recovery issuance sequence;
6. addendum fixed-file table and receipt projection, only by introducing the
   named immutable evidence and terminal database receipt v2;
7. addendum checkpoint projections for `resume_committing_*`, `quiesced`, and
   `guard_cleanup_complete`, only by adding the exact capability outcomes;
8. addendum acyclic-publication wording, only to insert capability checkpoints
   and the receipt v1-to-v2 CAS exception;
9. addendum's “exactly five” publication paragraph, only to clarify that the
   first four nonterminal schema families use same-phase pairs and terminal
   `writer-resume-state` remains the two-phase exception;
10. the exact forward/rollback graph repeated-phase prohibition, only for the
    explicitly enumerated lifecycle sequences below; and
11. base/current W quiesce wording that permits interim states to overwrite
    `writer-quiesce-<run-id>.json`.

Every other approved base-design and lifecycle-addendum invariant remains
unchanged. In particular, this does not change remote/live authority.

## Common canonical and publication rules

New evidence JSON uses the approved journal canonical encoding: recursively
Unicode-code-point-sorted object keys, preserved array order, compact UTF-8,
safe integers `0..9007199254740991`, the approved scalar/escape rules, and no
trailing LF unless a file rule below explicitly requires one. Duplicate keys,
unknown/extra keys, unsafe numbers, and noncanonical bytes are rejected.

New immutable files are regular non-symlinks, `1000:1000`, mode `0400`; immutable
checkpoint copies are mode `0600`. Publication is deterministic same-directory
temporary, file fsync, no-replace rename, parent fsync, then reopen and identity/
hash recheck. An existing file is accepted only when complete bytes are
identical. Unknown temporary residue or different existing bytes is an incident.

The approved exact 19-key journal and exact 12-key checkpoint remain unchanged.
`resource_manifest_sha256`, `quiesce_manifest_sha256`, and
`capability_manifest_sha256` remain independent domains and never substitute
for an accepted-object hash.

## 1. Single immutable host-command capability

### Paths and exact schema

Lifecycle directories below `<run-root>/capabilities/` are `issued`, `claimed`,
`completed`, and `superseded`; each is a non-symlink directory owned `1000:1000`
mode `0700`. The fixed basename is `<command-id>--<lease-epoch>.json` and never
changes during a move:

```text
capabilities/issued/<basename>
capabilities/claimed/<basename>
capabilities/completed/<basename>
capabilities/superseded/<basename>
```

The capability is `megacampus.q12.host-command-capability/v1`, mode `0400`, and
has exactly these 12 keys:

```text
schema_version
run_id
command_id
command_sha256
release_sha
operator_digest
resource_manifest_sha256
quiesce_manifest_sha256
resume_authority_sha256
capability_input_checkpoint_sha256
lease_epoch
supersedes_capability_sha256
```

`resume_authority_sha256` is exact 64-hex only for `writers.resume.forward` or
`writers.resume.rollback`, otherwise null. `supersedes_capability_sha256` is
null only when no earlier lifecycle file exists for this command/run. On every
explicit recovery reissue it is the hash of the immediately preceding lifecycle
file that Root just moved to `superseded/`, whether that file was current
authority or an orphan that never became current. Consecutive reissues therefore
form one exact hash chain back to the last journal-current capability; an
unreferenced issued/claimed/superseded file is an incident. All other hash
fields are lower-case 64-hex. For
`writers.quiesce`, `quiesce_manifest_sha256` is the predecessor journal value;
before the first accepted quiesce manifest that value is 64 zeroes.

The file is the approved canonical complete object followed by exactly one LF;
`capability_manifest_sha256` is SHA-256 over those complete bytes including the
LF. No path, lifecycle state, time, result, nonce, or self-hash is embedded.
Claim/completion/supersession only moves identical bytes with
`renameat2(RENAME_NOREPLACE)` and fsyncs both directories; the hash is unchanged.

### Authority and launcher binding

A capability is current authority only when its hash equals the current journal
head's `capability_manifest_sha256`, its directory matches the head outcome,
the fixed checkpoint accepts that head, every command/run/release/operator/
resource/quiesce/authority/epoch binding matches, and FD 9 proves the held
canonical lock. An orphan file is never authority.

This D4 capability-checkpoint delta applies only to `writers.quiesce`,
`writers.resume.forward`, `writers.resume.rollback`, `barrier.cleanup`, and
new `barrier.rollback`. Every other frozen host command retains its already
approved launcher/checkpoint contract unchanged.

For those five commands, the generic launcher's `--checkpoint <hash>` and the capability field
`capability_input_checkpoint_sha256` both equal SHA-256 of the immutable
capability-checkpoint copy. The launcher additionally validates the current
fixed checkpoint required by the lifecycle row before it claims. The child
does not receive the capability path/hash/FD.

The capability's `lease_epoch` is its immutable issuance/execution epoch. If an
existing exact result is completed after lock reacquisition, the completion and
acceptance journal/checkpoints may use the new recovery epoch; the capability
and result retain the original execution epoch. This mismatch is allowed only
for the exact existing-result continuation below.

Across all five commands, a crash after the no-replace `issued -> claimed` move
but before the claim journal has exactly two cases. While the same original
lease remains continuously held, Root may prove the move and append/checkpoint
`capability_claimed`. After any lock loss, the claimed orphan is moved to
`superseded/`; a new recovery capability references its hash and only
`recovery_reacquired` may begin the new epoch. The old-epoch claim record is
never appended after reacquisition.

## 2. Writer resume

### Two unambiguous checkpoints and hash DAG

Fixed no-replace byte-exact copies are:

```text
writer-resume-capability-checkpoint-<mode>-<lease-epoch>.json
writer-resume-input-checkpoint-<mode>-<lease-epoch>.json
```

The capability copy is `C-intent` for uninterrupted execution and the last
accepted predecessor `P` before `recovery_reacquired` for recovery. The receipt
input copy is always `C-claimed`, the fixed head under which W executes.
`writer-resume-state.input_checkpoint_sha256` equals only the receipt-input
copy; the capability and launcher bind only the capability copy.

The dependency DAG is exactly:

```text
P -> capability-checkpoint copy -> capability file -> issuance journal
  -> C-issued -> claim move/journal -> C-claimed -> receipt-input copy
  -> terminal inventory/receipt -> completion move/journal -> C-completed
  -> writers_resumed accepted journal -> terminal checkpoint
```

No predecessor node contains a future hash.

### Uninterrupted sequence

| Order | Phase                      | Outcome                                  | Capability location      | Checkpoint/object            |
| ----: | -------------------------- | ---------------------------------------- | ------------------------ | ---------------------------- |
|     1 | `resume_committing_<mode>` | `intent`                                 | none/predecessor         | `C-intent`, none/null        |
|     2 | no journal                 | publish capability copy/file             | `issued/`, not authority | none                         |
|     3 | `resume_committing_<mode>` | `capability_issued`                      | `issued/`                | `C-issued`, none/null        |
|     4 | no journal                 | claim move                               | `claimed/`               | none                         |
|     5 | `resume_committing_<mode>` | `capability_claimed`                     | `claimed/`               | `C-claimed`, none/null       |
|     6 | no journal                 | publish receipt-input copy; W result     | `claimed/`               | immutable receipt            |
|     7 | no journal                 | completion move after exact result proof | `completed/`             | none                         |
|     8 | `resume_committing_<mode>` | `capability_completed`                   | `completed/`             | `C-completed`, none/null     |
|     9 | `writers_resumed_<mode>`   | `accepted`                               | `completed/`             | accept `writer_resume_state` |

Before Docker, W requires the complete canonical chain, current
`capability_claimed` head/checkpoint, immutable capability and receipt-input
copies, current capability file in `claimed/`, authority/barrier bindings,
absent DB capability, and exact final/held inventory.

### Recovery without receipt

Root validates the full chain/lock/live inventory and publishes a new capability
bound to predecessor `P`; it is not authority. Root moves the exact old issued
or claimed capability to `superseded/` and fsyncs both directories, creating a
fail-closed zero-authority interval. It then appends
`resume_committing_<mode>/recovery_reacquired` in the next recovery epoch. That
record is the sole issuance record, switches `capability_manifest_sha256` to the
new file, and is checkpointed. Root claims/checkpoints it normally and publishes
the new receipt-input copy.

If exact terminal inventory already holds, W publishes the missing receipt
without Docker mutation. If exact stopped/no holds, W performs resume. A partial
state is compensated to exact stopped/no and emits no success receipt; another
attempt requires another explicit epoch. The old file remains immutable in
`superseded/` and is never replayed, completed, deleted, or restored.

### Recovery with receipt and durable boundaries

No overlay or new capability is issued. Receipt plus exact claimed capability
continues by result proof, move to `completed/`, `capability_completed`, and
terminal acceptance; completion may start the recovery epoch. Receipt plus a
capability in `issued/`, missing, duplicated, superseded, or hash-inconsistent
is an incident.

| Last durable evidence                      | Sole continuation after full validation                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| intent journal, checkpoint absent          | reconstruct only `C-intent`                                                                                                                                                 |
| `C-intent`, capability copy absent         | publish the byte-exact copy                                                                                                                                                 |
| file in `issued/`, issuance journal absent | same held lease: append issuance; after lock loss: supersede orphan and recovery-reissue                                                                                    |
| issuance journal, `C-issued` absent        | reconstruct only `C-issued`                                                                                                                                                 |
| `C-issued`                                 | claim; after lock loss use recovery-supersede                                                                                                                               |
| claim move, claim journal absent           | same continuously held lease: prove move and append claim; after lock loss: supersede claimed orphan and use only recovery-reissue; child could not run without `C-claimed` |
| claim journal, `C-claimed` absent          | reconstruct only `C-claimed`                                                                                                                                                |
| `C-claimed`, receipt-input copy absent     | publish byte-exact copy before W                                                                                                                                            |
| stopped/no, no receipt                     | recovery capability may resume                                                                                                                                              |
| partial, no receipt                        | compensate stopped/no; no result; later epoch required                                                                                                                      |
| terminal exact, no receipt                 | recovery W publishes result read-only                                                                                                                                       |
| receipt plus `claimed/`                    | complete old capability; no overlay                                                                                                                                         |
| completion move, journal absent            | append exact completion from move/result proof                                                                                                                              |
| completion journal, checkpoint absent      | reconstruct only `C-completed`                                                                                                                                              |
| `C-completed`, acceptance absent           | append terminal acceptance                                                                                                                                                  |
| acceptance journal, checkpoint absent      | reconstruct only terminal checkpoint                                                                                                                                        |
| terminal checkpoint                        | idempotent terminal truth                                                                                                                                                   |

Every missing checkpoint reconstruction uses the exact journal head, accepted
object, predecessor CAS, and journal device/inode tuple; it never appends a
duplicate record.

## 3. Exact immutable quiesce

### Command surface

Add command ID `writers.quiesce` with literal argv:

```text
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation quiesce-writers-only --run-id <run-id>
```

It accepts no other argv/path/override. Exact environment is
`PATH=/usr/sbin:/usr/bin:/sbin:/bin`, `LC_ALL=C`, `LANG=C`, `HOME=/root`, and
`Q12_EXTERNAL_QUIESCE_LEASE_FD=9`. Exact descriptors are `0=/dev/null`, `1/2`
supervisor audit streams, and `9` the held canonical cutover lock; no others.
FD 9 must match path/device/inode, owner `1000:1000`, mode `0600`, and lock
contention.

Per epoch, fixed copies are
`writer-quiesce-capability-checkpoint-<run-id>-<lease-epoch>.json` and
`writer-quiesce-input-checkpoint-<run-id>-<lease-epoch>.json`; they copy
`quiesced/intent` (or predecessor `P` for recovery) and
`quiesced/capability_claimed`, respectively.

### Exact inventory

`writer-quiesce-inventory-<run-id>.json` has schema
`megacampus.q12.writer-quiesce-inventory/v1` and exactly:

```text
schema_version, run_id, command_id, lease_epoch, capability_sha256,
capability_input_checkpoint_sha256, input_checkpoint_sha256,
database_barrier_receipt_sha256, writers
```

`command_id=writers.quiesce`; hashes are 64-hex. `writers` is sorted by project,
service, then id and contains exact class counts 1/1/3 production API/Web/
workers plus 1/1/3 development API/Web/workers. Each writer has exactly:

```text
class, id, name, project, service, config_files, working_dir, image_id,
image_ref, prior_running, prior_status, healthcheck_present,
prior_health_status, prior_restart_policy, temporary_restart_policy
```

Both policy objects are exactly `{name,maximum_retry_count}`; temporary is
`{name:"no",maximum_retry_count:0}`. `prior_status=running` iff prior-running is
true, otherwise `created|exited`. `prior_health_status=healthy` iff a healthcheck
exists, otherwise null. `config_files` is one nonempty string equal byte-for-byte
to the Docker Compose `com.docker.compose.project.config_files` label; it is not
parsed as an array, reordered, deduplicated, path-normalized, or comma-split.
`working_dir` is likewise the exact nonempty label string. Inventory is
published before the first policy mutation.
Its file hash includes its sole LF. A writer-array hash, where required, uses
the no-LF UTF-8 result of `jq -S -c 'sort_by(.project,.service,.id)'`.

### Immutable transitions and final object

The three files use `megacampus.q12.writer-quiesce-transition/v1` and exact keys
`schema_version,run_id,state,inventory_sha256,previous_transition_sha256,
input_checkpoint_sha256,database_barrier_receipt_sha256,
writer_quiesce_manifest_sha256`:

| File                                                 | State                   | Previous       | Final manifest hash |
| ---------------------------------------------------- | ----------------------- | -------------- | ------------------- |
| `writer-quiesce-policy-change-planned-<run-id>.json` | `policy_change_planned` | null           | null                |
| `writer-quiesce-policy-no-verified-<run-id>.json`    | `policy_no_verified`    | planned hash   | null                |
| `writer-quiesce-quiesced-<run-id>.json`              | `quiesced`              | policy-no hash | exact final hash    |

The final `writer-quiesce-<run-id>.json` retains the exact five-key
`megacampus.q12.writer-quiesce/v1` and only `status=quiesced`. Exact order is:
inventory, planned, policies=`no`, policy-no proof, stop API/Web, closed inbound
probe, stop workers, exact stopped/no proof, final manifest, terminal transition,
host-capability completion, Root acceptance. W validates the full chain; H
requires final plus terminal transition; only Root acceptance switches the
journal quiesce-manifest hash.

Journal rows for uninterrupted quiesce are all phase `quiesced` with outcomes
`intent -> capability_issued -> capability_claimed -> capability_completed ->
accepted`; every row has a checkpoint. Only the final row accepts
`writer_quiesce_manifest`; earlier rows use none/null.

After lock loss with no final manifest, Root validates exact identities and the
longest byte-exact immutable prefix. If inventory is absent, no policy mutation
was permitted; Root may recovery-reissue and the new attempt publishes the sole
fixed inventory using its new execution context. If inventory exists, it and
every existing transition remain forever bound to their original capability,
epoch, capability-input checkpoint, and claimed input checkpoint. They are
never rewritten to mention recovery.

For that existing-prefix case, after publishing the new capability, superseding
the old file, and checkpointing `quiesced/recovery_reacquired`, Root publishes:

```text
writer-quiesce-recovery-overlay-<run-id>-<recovery-epoch>.json
```

The overlay is `megacampus.q12.writer-quiesce-recovery-overlay/v1`, exact 13
keys:

```text
schema_version, run_id, lease_epoch, prior_capability_sha256,
new_capability_sha256, recovery_checkpoint_sha256, inventory_sha256,
initial_capability_input_checkpoint_sha256, initial_input_checkpoint_sha256,
last_transition_state, last_transition_sha256, previous_overlay_sha256,
continuation
```

Hashes are 64-hex. `last_transition_state` is exactly `inventory_only`,
`policy_change_planned`, or `policy_no_verified`; its hash is null only for
`inventory_only`. `continuation=monotonic_quiesce_only`. The initial hashes must
equal the immutable inventory/prefix; recovery checkpoint is the exact
`recovery_reacquired` checkpoint; old/new capability hashes must match the
supersession chain. `previous_overlay_sha256` is null for the first overlay and
otherwise equals the immediately preceding durable overlay for this run,
whether that predecessor was accepted or abandoned after lock loss. The overlay
contains no future claimed checkpoint or final manifest hash and therefore is
acyclic.

Root appends `quiesced/recovery_prefix_accepted`, accepts object kind
`writer_quiesce_recovery_overlay` and the overlay hash, then checkpoints it.
This candidate adds that one kind to the otherwise closed accepted-object enum.
At this head the current `capability_manifest_sha256` remains the new capability
hash and the capability must exist in `issued/`; this outcome maps to `issued/`
exactly. It accepts only the overlay kind/hash and authorizes only the next
no-replace move of that same file to `claimed/`. Only after that checkpoint may
the wrapper claim the new capability and publish
`capability_claimed`; W sees the claimed head and new input-checkpoint copy,
validates the accepted overlay, and continues only missing monotonic quiesce
steps. New remaining transition files continue to reference the original
inventory and original `input_checkpoint_sha256`; the accepted overlay is the
sole binding from the recovery capability/checkpoint to that prefix. W never
starts a writer. A changed, missing, extra, ambiguous, or non-prefix state is an
incident.

If the overlay file is durable but its acceptance journal/checkpoint is absent,
the same continuously held lease may revalidate its exact bytes against the
current `recovery_reacquired` checkpoint and append/checkpoint the one missing
acceptance. After any lock loss, that epoch-qualified overlay is immutable
abandoned audit residue: it is never accepted late, replaced, deleted, or used
as child authority. Root supersedes the associated issued capability, starts a
new recovery epoch/capability, and publishes a new overlay whose
`previous_overlay_sha256` equals the abandoned overlay hash. A missing, forked,
reordered, or unlinked overlay chain is an incident. This is the sole recovery
continuation for the publication-to-acceptance crash boundary.

If final manifest exists but terminal transition is absent, Root reconstructs
only that exact transition from final plus policy-no predecessor. If the exact
final result then exists while the old capability remains claimed, Root does no
overlay or new execution: it completes the old capability and accepts the
result under the new recovery journal epoch. Existing-result recovery is exactly
`capability_completed -> accepted`; the capability/result retain their original
execution epoch. Ordinary prefix recovery without inventory is
`recovery_reacquired -> capability_claimed -> capability_completed -> accepted`;
with an existing prefix it is `recovery_reacquired -> recovery_prefix_accepted
-> capability_claimed -> capability_completed -> accepted`, one outcome per
epoch.

The existing seven-key `writer-recovery-state-<run-id>.json` remains exact
`megacampus.q12.writer-recovery-state/v1`; it and all quiesce evidence use the
same no-replace/exact-existing rules and are never overwritten on retry.

## 4. Recoverable database cleanup and rollback

### Ownership and fixed paths

W/barrier-child owns only the DB transaction, reconnect verification, and
immutable terminal proof. Root owns host-capability completion, exact DB-
capability deletion, receipt CAS, journal acceptance, and checkpoint. Fixed new
paths below the run root are:

```text
database-barrier-baseline.json
database-barrier-rollback-intent.json
database-barrier-receipt-v1-before-cleanup.json
database-barrier-receipt-v1-before-rollback.json
database-barrier-cleanup-terminal-proof.json
database-barrier-rollback-terminal-proof.json
database-barrier-capability-checkpoint-<operation>-<lease-epoch>.json
database-barrier-input-checkpoint-<operation>-<lease-epoch>.json
database-barrier-receipt.json
```

The operation-specific v1 archive is a byte-exact immutable copy of the current
canonical receipt, including its existing LF. It is published before intent and
never replaced/deleted.

For operation `cleanup|rollback`, the capability-checkpoint copy is the exact
`guard_cleanup_complete/intent` checkpoint on uninterrupted execution and the
last accepted predecessor `P` before `recovery_reacquired` on recovery. The
launcher/capability bind its SHA. The input-checkpoint copy is exact
`guard_cleanup_complete/capability_claimed`; the terminal proof binds its SHA.
The rollback intent's `input_checkpoint_sha256` binds the earlier capability-
checkpoint copy because it is published before issuance. These scopes apply
only to the two DB terminal commands and do not change other barrier commands.

### Sole receipt CAS exception

The sole allowed immutable-path replacement is exact journal-bound v1 to exact
terminal v2 at `database-barrier-receipt.json`. Root opens and proves expected
v1 bytes/inode/hash, publishes/rechecks its exact archive, later prepares/fsyncs
v2, rechecks the canonical v1 inode/hash under the cutover lock, atomic
rename-replaces it, fsyncs the parent, and reopens/rechecks v2. Existing exact
v2 is idempotent; missing canonical path or third bytes are incidents. No other
v1-to-v1 or v2-to-different-v2 transition is allowed.

Cleanup predecessor v1 is exact existing `activated` projection. Rollback
predecessor v1 is the exact phase-aligned existing projection in
`maintenance_guarded`, `20260711140000_guard_verified`,
`20260711151000_guard_verified`, or `recovery_ready_guarded`; `activated` is
forbidden on rollback. Existing v1 discriminated probe/nullability rules remain
unchanged.

### Baseline and nested hash projections

`database-barrier-baseline.json` is
`megacampus.q12.database-barrier-baseline/v1`, exact 11 keys:

```text
schema_version, run_id, state, source_baseline_sha256, baseline_sha256,
predecessor_checkpoint_sha256, predecessor_journal_entry_hash,
resource_manifest_sha256, expected_post_migration_catalog_sha256,
database_capability_sha256, baseline
```

`state=maintenance_guarded_baseline`. `baseline` is exact five keys:

```text
baseline_structural_catalog_sha256, database_default_sha256,
cron_jobs_sha256, guarded_relations_sha256, pg_net_queue_count
```

Queue count is integer zero; hashes are 64-hex;
`baseline_sha256=SHA256(canonical(baseline))`.
`source_baseline_sha256` equals `q12_guard.baseline.baseline_sha256`.
`guarded_relations_sha256` hashes the canonical no-LF `guarded_relations` array
from the exact accepted expected-catalog file, preserving its SQL-defined order
and exact element key sets. Raw restoration values remain only in the protected
DB-internal baseline, never in evidence.

The W barrier child publishes this baseline after the `barrier.install` DB
transaction and exact reconnect verification, but before the first v1 barrier
receipt. Its predecessor fields equal the fixed checkpoint SHA and journal head
for the existing `maintenance_guarded/capability_claimed` child-input boundary;
its resource/capability/catalog hashes equal that head and exact install inputs.
Root validates the no-replace baseline before accepting the v1 receipt at
`maintenance_guarded`. A crash after install COMMIT but before baseline/receipt
may reconstruct only this file from the immutable DB-internal
`q12_guard.baseline` plus the same claimed checkpoint; it never repeats the
install transaction or invents a later anchor.

The ephemeral database-default hash projection is exact keys
`schema_version,database,role,row_present,settings`, schema
`megacampus.q12.database-default/v1`; database=`postgres`, role=null,
row-present boolean, settings exact bytewise-sorted unique `name=value` strings.
Absent row means false/empty array.

The cron hash preimage is an array of exactly eight unique-jobid objects sorted
ascending by jobid, each exact keys `jobid,jobname,schedule,command_sha256,
nodename,nodeport,database,username,active`. Only jobname is nullable; command
hashes exact UTF-8 command bytes; raw commands are not evidence.

Structural catalog hash is the no-LF UTF-8 `payload::text` from the tracked W
file `deploy/qdrant/q12-structural-catalog.sql` at exact SHA-256
`0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e` on
PostgreSQL 17. That exact 1,254-line file exists in the preserved W worktree and
must be integrated byte-for-byte before D4/W acceptance; a missing or different
file is a hard gate. The payload schema
`megacampus.q12.structural-catalog-payload/v1` has exact top-level keys:

```text
schema_version, database, schemas, relations, columns, sequences, extensions,
types, access_methods, casts, collations, conversions, foreign_data_wrappers,
foreign_servers, foreign_tables, user_mappings, indexes, constraints,
functions, languages, operators, operator_families, operator_classes,
triggers, event_triggers, rules, aggregates, policies, extended_statistics,
text_search_parsers, text_search_templates, text_search_dictionaries,
text_search_configurations, transforms, publications, subscriptions,
default_acls, parameter_acls, comments, security_labels, migration_history
```

Nested keys/nullability/order are the exact SQL-defined contract of those
normative bytes, not an implementation-selected projection. Cleanup must
equal expected-post-migration hash; rollback must equal baseline structural hash.

Required rollback receipts are sorted bytewise by phase, unique, exact objects
`{phase,receipt_sha256}`, with phase limited to:
`handoff_rollback_verified`, `qdrant_rollback_verified`,
`source_rollback_verified`, `observability_migration_rollback_guarded`, and
`base_migration_rollback_guarded`. Exact started forward phases determine the
required set; missing/extra/unknown is an incident. The hash is over canonical
sorted array without LF.

### Rollback intent, residue, proof, and receipt

`database-barrier-rollback-intent.json` is exact ten-key
`megacampus.q12.database-barrier-rollback-intent/v1`:

```text
schema_version, run_id, state, expected_post_migration_catalog_sha256,
database_barrier_baseline_sha256, predecessor_receipt_sha256,
input_checkpoint_sha256, intent_journal_entry_hash,
required_phase_receipts, required_phase_receipts_sha256
```

State is `rollback_intent`; it is published after the durable
`guard_cleanup_complete/intent` checkpoint and before host-capability issuance.

Terminal `guard_residue` is exact seven integer-zero keys:

```text
q12_guard_schema_count, q12_guard_relation_count, q12_guard_function_count,
q12_guard_type_count, q12_guard_trigger_count,
q12_guard_event_trigger_count, barrier_era_session_count
```

The separate cleanup/rollback proof files use exact 18-key
`megacampus.q12.database-barrier-terminal-proof/v1`:

```text
schema_version, run_id, operation, state,
expected_post_migration_catalog_sha256,
database_barrier_baseline_sha256, predecessor_receipt_sha256,
predecessor_receipt_archive_sha256,
database_barrier_rollback_intent_sha256,
input_checkpoint_sha256, intent_journal_entry_hash,
structural_catalog_sha256, database_default_sha256, cron_jobs_sha256,
guard_residue, required_phase_receipts_sha256,
database_capability_sha256, completed_at
```

Operation is cleanup/rollback; state is `guard_cleanup_complete`; completed-at
is UTC RFC3339 milliseconds. Cleanup has null rollback-intent/required-receipt
hashes; rollback has both non-null. All other hashes are non-null. Proof binds
the claimed input-checkpoint copy, exact v1/archive, baseline, DB capability, and terminal
catalog/default/cron/zero-residue truth.

The canonical path transitions to exact ten-key
`megacampus.q12.database-barrier-receipt/v2`:

```text
schema_version, run_id, state, expected_catalog_sha256, zero_guard_residue,
last_command, rollback_probes_verified, probe_receipt_sha256,
terminal_proof_sha256, database_capability_deleted
```

State is `guard_cleanup_complete`, zero-residue and capability-deleted are true.
Cleanup uses last-command cleanup, probes true, non-null probe hash; rollback
uses rollback, probes false, null probe hash.

### Exact DB journal and crash recovery

Command ID `barrier.cleanup` retains its frozen literal argv. Add
`barrier.rollback` with exactly:

```text
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh rollback
--run-id <run-id>
--db-url-file /opt/megacampus/secrets/supabase_db_url
--ca-file /opt/megacampus/secrets/prod-ca-2021.crt
--q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability
--expected-post-migration-catalog /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json
--expected-post-migration-catalog-sha256 <expected-post-migration-catalog-sha256>
```

Those lines are separate literal argv elements, not shell text or a macro. Both use
target phase `guard_cleanup_complete` and exact outcomes:
`intent -> capability_issued -> capability_claimed -> capability_completed ->
accepted`, each checkpointed. Only accepted names v2 as
`database_barrier_receipt`; earlier records use none/null.

Order: validate predecessor/archive inputs; append/checkpoint intent and publish
the capability-checkpoint copy; publish rollback intent if applicable; issue/
claim host capability and publish the claimed input-checkpoint copy; DB child COMMITs;
child reconnects read-only and publishes proof; Root validates proof and moves/
checkpoints host capability completed; Root unlinks only the exact opened DB
capability, fsyncs its parent and proves absence; Root performs sole receipt CAS;
Root accepts/checkpoints v2.

| Durable boundary                                                      | Sole continuation                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| pre-COMMIT, exact guards/v1/DB capability, no proof                   | recovery epoch supersedes old host capability and may retry same operation                      |
| COMMIT, no proof, DB capability present                               | recovery capability performs only terminal read-only verification/proof, never repeats mutation |
| proof, host capability claimed                                        | validate result; complete host capability                                                       |
| proof, DB capability present                                          | exact inode/hash unlink, parent fsync, absence proof                                            |
| proof exact, DB capability absent, canonical receipt v1               | build deterministic v2 without DB connection and perform sole CAS                               |
| v2 present, acceptance absent                                         | revalidate v2/proof/archive/absence; append accepted                                            |
| any journal record with checkpoint absent                             | reconstruct only its exact checkpoint                                                           |
| DB capability absent without exact proof                              | incident                                                                                        |
| missing/third receipt bytes or any archive/proof/intent/hash mismatch | incident                                                                                        |
| live DB state ambiguous or wrong expected hash                        | incident                                                                                        |
| v2 with reappeared DB capability                                      | incident                                                                                        |

No post-delete recovery needs URI, password, raw capability, or DB connection.
Docker/writer mutation remains forbidden until v2 is accepted and the DB
capability path is proved absent.

## 5. Shared validation and repeated-phase rules

Root owns the complete phase graph, recovery epoch, host capability lifecycle,
receipt CAS, accepted objects, and checkpoint repair. W validates the complete
canonical hash chain/CAS, every consumed object's exact publication, its full
mode-specific prefix and current capability slice, checkpoints, immutable
inputs, and live inventories; it never repairs Root state. H consumes only the
accepted final quiesce manifest plus exact terminal transition.

The first four new nonterminal schemas — final-writer-manifest,
writer-handoff-state, writer-rollback-state, and writer-resume-authority — retain
adjacent same-phase `intent -> accepted`; terminal writer-resume-state remains
the two-phase `resume_committing_<mode>` to `writers_resumed_<mode>` exception.

Additional sole same-phase lifecycle sequences are:

- resume uninterrupted: `intent -> capability_issued -> capability_claimed ->
capability_completed`, then terminal acceptance;
- resume recovery without receipt: `recovery_reacquired -> capability_claimed
-> capability_completed`, then terminal acceptance;
- resume existing receipt: only missing `capability_completed`, then acceptance;
- quiesce uninterrupted: `intent -> capability_issued -> capability_claimed ->
capability_completed -> accepted`;
- quiesce recovery before inventory: `recovery_reacquired ->
capability_claimed -> capability_completed -> accepted`;
- quiesce recovery with immutable prefix: `recovery_reacquired ->
recovery_prefix_accepted -> capability_claimed -> capability_completed ->
accepted`;
- quiesce existing final result: only missing `capability_completed ->
accepted`; no overlay or new child execution;
- DB cleanup/rollback uninterrupted: `intent -> capability_issued ->
capability_claimed -> capability_completed -> accepted`;
- DB recovery before proof: `recovery_reacquired -> capability_claimed ->
capability_completed -> accepted`;
- DB cleanup/rollback existing exact proof: only missing
  `capability_completed -> accepted`; capability/proof retain execution epoch
  while those journal/checkpoints use the new recovery epoch.

Each outcome occurs at most once per epoch. Missing-checkpoint reconstruction is
not a new journal outcome. Any gap, duplicate, changed command/authority/hash,
cross-mode row, intervening record, or unlisted sequence is an incident.

# Verification

Candidate v4 must receive fresh independent correctness and documentation
rereviews with P0=P1=P2=P3=0. After owner approval and normative incorporation,
W must turn its nine preserved RED tests GREEN and pass the complete W runtime,
PostgreSQL 17, type-check, syntax, style, isolation, crash, and cleanup gates.

## Exact owner approval sentence

> Подтверждаю corrected D4 v4 и оба рекомендованных варианта A: host-command capability является одним immutable файлом, перемещаемым issued/claimed/completed/superseded, с отдельными exact capability и child-input checkpoints; после потери lock старая capability никогда не используется для нового child execution, но может быть завершена без replay при уже существующем exact результате; recovery не создаёт две authority; writers.quiesce использует exact capability/journal/checkpoint, цепочку accepted либо abandoned recovery-prefix overlays и immutable inventory/transition/final evidence; DB-child публикует только terminal proof, а Root завершает host capability, удаляет DB-capability, выполняет единственный CAS receipt v1→v2 и принимает фазу; W, H и Root используют один fail-closed contract; remote/live gate не меняется.

# Risks / Follow-ups

Until both independent rereviews pass and the owner accepts the exact sentence,
this is not normative and no disputed W/H/Root graph may be integrated. GHCR,
server, Supabase, Qdrant, service, secret, schema, writer, scheduler, staging,
production, and deployment mutations remain outside this candidate.
