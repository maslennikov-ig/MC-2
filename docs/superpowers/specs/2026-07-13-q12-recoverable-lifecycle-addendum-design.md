# Q12 Recoverable Lifecycle Addendum Design

| Field               | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Date                | 2026-07-13                                                                 |
| Beads               | `mc2-jz6y0.13.14`, `mc2-jz6y0.13.15`, `mc2-jz6y0.13.10`, `mc2-jz6y0.13.13` |
| Status              | owner approved on 2026-07-13                                               |
| Base design         | `2026-07-13-q12-live-cutover-corrections-design.md`                        |
| Base design SHA-256 | `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`         |

## Purpose and precedence

This is a narrow normative addendum to the approved Q12 correction design. It
supersedes only conflicting wording about the managed Supabase DDL boundary,
the readiness state before recovery, same-invocation writer restoration,
pre-activation target starts, final-writer manifest selection, and the ordering
of cleanup/resume/full observation. Every other base-design invariant remains
in force.

The owner accepted both decisions on 2026-07-13. This approval authorizes safe
local implementation, tests, review, commit, and push. It does not by itself
authorize GHCR publication, service or secret changes, server deployment,
Supabase mutation, Qdrant mutation, live reindex, alias cutover, or any other
staging/production mutation. Those remain inside the existing Q12 remote gate.

External S3 and Qdrant Cloud remain out of scope. The accepted Q12 backup path
uses persistent server-local disk and disposable local restore resources.

## 1. Managed Supabase trust boundary

The database barrier is complete for the tenant/client plane. Its exact event
trigger, relation locks, row/TRUNCATE guards, catalog hashes, session recycling,
and drift checks protect the operations that the tenant-controlled PostgreSQL
role can truthfully govern.

The Supabase internal superuser, reserved-role, and background-worker plane is
an accepted managed-provider trust boundary. During the controlled Q12 window
it is trusted not to perform structural DDL. Receipts and documentation MUST
NOT claim that the tenant barrier freezes, terminates, or controls provider
superusers, shared-object DDL, reserved-role operations, or provider background
workers.

Acceptance of this boundary does not weaken the hard stops:

- exact before/after structural hashes remain mandatory;
- every managed session included in the reviewed idle-session inventory must
  remain idle and transaction-free at the corresponding gate;
- tenant/client DDL, row writes, TRUNCATE, cron, and pg_net remain guarded;
- any observed catalog, session, relation, guard, cron, or pg_net drift aborts;
- live activation still requires the hosted, zero-residue rollback probes.

## 2. Readiness before recovery

Add a fixed `prepare-recovery` database-barrier command. It is valid only after
the final migration verification for the same run and expected catalog. It is
verification and session-recycle work, not an activation step.

On success it atomically publishes the durable receipt state
`recovery_ready_guarded`. The command MUST:

1. prove the immutable run identity, terminal migration state, expected
   catalog, structural digest, and rollback-probe binding;
2. prove every required row, TRUNCATE, and tenant/client DDL guard is present;
3. prove the database default remains read-only, all reviewed cron jobs remain
   inactive, and `net.http_request_queue` remains empty;
4. terminate stale opt-out tenant/client sessions using the existing exact
   allowlist and provider-plane exclusions;
5. reconnect without the startup opt-out and prove the fresh session inherited
   read-only; and
6. change no data, relation guard, DDL guard, database default, cron state,
   pg_net state, role, grant, extension, or migration row.

The command rejects any earlier/later phase, activated run, run/catalog/probe
mismatch, guard drift, default drift, active cron, nonempty pg_net, unexpected
session, or structural drift. Crash before durable receipt replacement leaves
the prior guarded receipt authoritative; a retry is idempotent and re-verifies
all truth.

Source recovery and reindex accept only the exact run-, catalog-, and
probe-bound `recovery_ready_guarded` receipt. The retained read-only default is
a default rather than the authorization boundary: the approved exact
capability-bound PostgREST transaction may explicitly use `READ WRITE`, while
the row guards reject missing or incorrect capability. The version-aligned
local fixture and the hosted zero-residue rollback probe are both mandatory.

Only final `activate` may restore the baseline database default and cron state
and remove application row/TRUNCATE guards. Cleanup remains a later,
independently verified terminal action that publishes
`guard_cleanup_complete`, proves zero guard residue, and removes the database
capability.

## 3. Recovery completion with writers still quiesced

Standalone source recovery no longer restores writers in its exit trap. On
success it MUST:

- publish `recovery_complete_writers_quiesced` in controller-owned durable
  state bound to the same run, original immutable writer-quiesce manifest,
  catalog, and recovery journal;
- prove all ten exact writer containers remain stopped with restart policy
  `no`;
- leave the immutable prior-state inventory sufficient for a later exact
  restore; and
- exit successfully without starting any writer.

Failure, signal, or crash at any stop or recovery boundary has the same
fail-closed outcome: all exact writers stopped, restart policy `no`, no later
writer class started, and no success receipt fabricated by a child process.
The original manifest remains immutable evidence of the pre-cutover state; it
is not by itself authority to resume the old production color after a new
blue/green target has been prepared.

## 4. Separate writer-only resume

Add an explicit `resume-writers-only` operation to the writer controller. It is
called only by the same sole supervisor after that supervisor has proved the
exact `guard_cleanup_complete` receipt and zero guard residue.

Before database activation, the quiesce-aware handoff MUST create target Web,
API, and worker containers without starting any of them. It MUST NOT run the
base design's direct-port target health start: running target Web/API under the
guard can still mutate non-database systems. Static image/config/identity and
non-writer read-only probes are the only pre-activation smoke.

The handoff's pre-activation commit atomically fsync-publishes one controller-
owned immutable `megacampus.q12.final-writer-manifest/v1`, bound to the run,
release, journal checkpoint, expected catalog, and SHA-256 of the original
writer-quiesce manifest. The forward manifest contains exactly:

- a final set of ten identities: the five new production target containers
  (Web, API, and three workers) plus the five captured development identities;
- intended-running and intended restart-policy truth for each final identity,
  using the new release's reviewed policy for production and the captured prior
  truth for development; and
- a held set containing the five old production identities, all stopped with
  restart policy `no` and permanently ineligible for this resume.

A pre-activation rollback publishes the symmetric immutable manifest: the
original five production plus captured development identities form the final
set. Its held set contains exactly every target identity already created and
durably captured before the failure, from zero through five. A target create
must be durably captured before any later target create, so an unrecorded target
identity is an incident. Rollback keeps every captured partial target stopped
with restart policy `no`; it neither invents missing target identities nor
requires all five to have been created. Neither path may infer an ID, policy,
or intended state from a later live lookup.

After activation, `finalize-quiesced` only revalidates and promotes the already
fsynced manifest hash to `handoff_ready_writers_quiesced`; it starts no
container, restores no policy, and performs no discovery. Database cleanup is
forbidden until that exact promotion is durable.

The sole supervisor promotes exactly one mode-specific resume authority:

- forward requires durable `recovery_complete_writers_quiesced`, the complete
  five-target forward manifest, `handoff_ready_writers_quiesced`, and a barrier
  receipt whose terminal command is cleanup; or
- pre-activation rollback requires `rollback_ready_writers_quiesced`, the
  rollback manifest, and a barrier receipt whose terminal command is rollback.
  The rollback-ready receipt is published only after the supervisor proves the
  exact phase-required source/Qdrant/handoff rollback receipts (when those
  phases started), zero database-guard residue, the original final ten
  stopped/no, every captured partial target held stopped/no, and no unrecorded
  target identity. It does not require recovery or handoff to have succeeded.

An activated run is finish-forward only and can never publish rollback-ready.

The `resume-writers-only` operation consumes:

- the fixed Q12 run identity and controller-owned run root;
- the immutable original writer-quiesce manifest, the promoted immutable final
  writer manifest, and exactly one of the forward or rollback resume-authority
  sets above;
- the exact `guard_cleanup_complete` database-barrier receipt; and
- the supervisor journal/checkpoint binding the two manifests and cleanup
  receipt; and
- an inherited, already-held supervisor lease descriptor bound to the canonical
  cutover lock. In an explicit post-reboot recovery, the sole supervisor may
  reacquire that same canonical lock only after validating the durable journal
  chain and recording a new recovery lease epoch; the child still receives only
  the inherited held descriptor.

It MUST NOT accept or require a database URL, CA, database capability, recovery
plan input, source upload roots, or any permission to run recovery/reindex. The
database capability is expected to have been deleted by cleanup.

The operation revalidates file identity, owner/mode, hashes, run/catalog/
journal bindings, the inherited lock lease, and the exact manifest inventory:
ten final IDs plus five held IDs for forward, or ten final IDs plus zero through
five held IDs for rollback. The final ten must be stopped with restart policy
`no`; every held identity must also be stopped with restart policy `no` and
remain so throughout. Exact label/project/service inventory must prove no
unrecorded target exists. Before the first start, the supervisor durably
journals `resume_committing` with mode, both manifest hashes, barrier-receipt
hash, exact inventory state, and lease epoch.

The operation starts only final-manifest identities whose intended-running
value is true, in this exact class order: workers, API, Web. Each class is fully
running and healthy before the next class starts. Only after all starts verify
may the exact intended restart policies be restored. It then proves every final
identity equals its intended state, every held identity remains stopped/no,
and atomically publishes `writers_resumed` with exact mode `forward` or
`rollback`. Forward permits the sole supervisor to journal `handoff_complete`
and begin full live observation. Rollback permits only `rollback_complete`; it
does not activate the new release or begin the Q12 acceptance observation.

Any ordinary error or signal compensates every final identity back to stopped
with restart policy `no` and proves all held identities remain stopped/no.
Failure to prove compensation is a hard terminal incident and never a partial
success. After SIGKILL, controller loss, or host reboot with
`resume_committing` but no `writers_resumed`, explicit recovery first inspects
the exact immutable final-plus-held inventory. If the exact complete terminal
state already holds, it may publish the missing mode-bound terminal receipt.
Otherwise it compensates the final ten to stopped/no and fails closed; any
missing, recreated, extra, unrecorded, or ambiguous identity is an incident
with no automated start. A later retry requires a new explicit supervisor
recovery command and lease epoch.

## 5. Frozen lifecycle

The corrected order is:

1. install the atomic database/writer barrier;
2. create and verify the server-local backup and isolated restore drill;
3. run migrations under the same barrier and verify the final catalog;
4. run `prepare-recovery` and obtain `recovery_ready_guarded`;
5. run source recovery and reindex while all writers remain stopped;
6. create/commit the quiesced handoff, publish the immutable final-writer
   manifest, and run only static/non-writer read-only guarded smoke;
7. run final `activate`;
8. run no-start `finalize-quiesced`, then cleanup and prove
   `guard_cleanup_complete` with zero residue;
9. run `resume-writers-only` under the same inherited supervisor lease; and
10. after `writers_resumed`/`handoff_complete`, run the full live smoke and at
    least 60 continuous minutes plus one complete Stage 2/4/5/6 course cycle.

No source/reindex capability may be issued before step 4 or after step 7. No
writer may start before step 9. The supervisor journal must recover every
COMMIT-to-receipt and receipt-to-next-command crash window without inferring
success from process exit alone.

This order supersedes the base design's target Web/API pre-activation health
start, `finalize-quiesced` writer start, and requirement to retain the inert
database activation schema through the 60-minute observation. The durable file
receipts and journal preserve audit truth after zero-residue cleanup. A breach
during the final live observation is a post-cleanup incident/finish-forward
boundary, never permission to resurrect the held old production color.

## 6. Frozen command, receipt, and phase amendments

This section normatively extends the base design's otherwise closed command-ID,
literal-argv, receipt, and phase sets. No implementation may invent an
equivalent command, path argument, environment key, receipt state, or phase.

### Command IDs and literal argv

Add exactly these three command IDs:

| Command ID                 | Literal argv                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barrier.prepare-recovery` | `/opt/megacampus/deploy/qdrant/q12-database-barrier.sh prepare-recovery --run-id <run-id> --db-url-file /opt/megacampus/secrets/supabase_db_url --ca-file /opt/megacampus/secrets/prod-ca-2021.crt --q12-db-capability-file /opt/megacampus/backups/q12/<run-id>/secrets/db-capability --expected-post-migration-catalog /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json --expected-post-migration-catalog-sha256 <expected-post-migration-catalog-sha256>` |
| `writers.resume.forward`   | `/opt/megacampus/deploy/qdrant/source-recovery-run.sh --operation resume-writers-only --resume-mode forward --run-id <run-id>`                                                                                                                                                                                                                                                                                                                                                        |
| `writers.resume.rollback`  | `/opt/megacampus/deploy/qdrant/source-recovery-run.sh --operation resume-writers-only --resume-mode rollback --run-id <run-id>`                                                                                                                                                                                                                                                                                                                                                       |

`barrier.prepare-recovery` accepts no `--after-migration`; its prerequisite is
the exact `barrier.verify-after-observability` receipt with state
`20260711151000_guard_verified` and last command `verify-extended`.

Resume accepts no path argument. Every file is derived from the fixed
`/opt/megacampus/backups/q12/<run-id>` root. It accepts no project/env/source
root, DB URL, CA, DB capability, recovery plan, Qdrant option, extra argv, or
separator. The command ID may be reissued after a crash only under a new
single-use host capability, explicit confirmed recovery, new recovery lease
epoch, and a read-only inspection bound to the current checkpoint. There is no
separate child recovery command.

The resume launcher rebuilds exactly this environment:

```text
PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
LANG=C
HOME=/root
Q12_EXTERNAL_QUIESCE_LEASE_FD=9
```

No Docker, database, Qdrant, source-recovery, or inherited environment key is
allowed. Allowed descriptors are `0=/dev/null`, `1` and `2` as the supervisor
audit streams, and `9` as the already-held
`/opt/megacampus/backups/q12/cutover.lock`. The child receives no host-command
capability path/descriptor. It proves descriptor 9's canonical path,
device/inode, `1000:1000:0600` identity, and lock contention before Docker
inspection or mutation.

The existing `SOURCE_RESUME`, `SOURCE_ROLLBACK`, and `source.forward` arrays
gain the literal pair `--database-barrier-receipt
/opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json`; they accept
only `recovery_ready_guarded/prepare-recovery`. Every existing `reindex.*`
operator command that plans, executes, workers, or verifies gains these literal
Compose-run elements before the image command:

```text
-v /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro
-e Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt
-v /opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro
-e Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt
```

The operator validates both receipts as run/catalog/probe-bound readiness
before any reindex operation. These amendments are in addition to, not a
replacement for, the base command's fixed DB-capability mount.

### Fixed files and authoritative schemas

All paths below are canonical non-symlink files below the fixed run root. JSON
manifests/receipts are controller-owned `1000:1000` mode `0400`; journal and
checkpoint files are mode `0600`.

| Fixed path below the run root           | Schema / authority                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `database-barrier-receipt.json`         | existing `megacampus.q12.database-barrier-receipt/v1`, exact eight-key projection                                |
| `database-barrier-probe-receipt.json`   | existing `megacampus.q12.database-barrier-probes/v1`, exact probe/residue projection below                       |
| `writer-quiesce-<run-id>.json`          | existing `megacampus.q12.writer-quiesce/v1`, exact original-ten evidence                                         |
| `writer-recovery-state-<run-id>.json`   | existing `megacampus.q12.writer-recovery-state/v1`, exact seven-key forward-only completion                      |
| `final-writer-manifest-<run-id>.json`   | `megacampus.q12.final-writer-manifest/v1`                                                                        |
| `writer-handoff-state-<run-id>.json`    | `megacampus.q12.writer-handoff-state/v1`, forward-only no-start promotion                                        |
| `writer-rollback-state-<run-id>.json`   | `megacampus.q12.writer-rollback-state/v1`, pre-activation rollback aggregate                                     |
| `writer-resume-authority-<run-id>.json` | `megacampus.q12.writer-resume-authority/v1`                                                                      |
| `writer-resume-state-<run-id>.json`     | `megacampus.q12.writer-resume-state/v1`; absent before first attempt and immutable at terminal `writers_resumed` |
| `phase.jsonl`                           | existing `megacampus.q12.cutover-journal/v1`, with the exact two-key and lease-epoch extensions below            |
| `phase-checkpoint.json`                 | `megacampus.q12.cutover-checkpoint/v1`; exact discriminated projection below                                     |

The database-barrier receipt keeps its exact base keys. Its three relevant
terminal projections are:

- readiness: `state=recovery_ready_guarded`, `zero_guard_residue=false`,
  `last_command=prepare-recovery`, rollback probes verified, non-null probe
  receipt hash;
- forward cleanup: `state=guard_cleanup_complete`,
  `zero_guard_residue=true`, `last_command=cleanup`, rollback probes verified,
  non-null probe receipt hash; and
- rollback cleanup: `state=guard_cleanup_complete`,
  `zero_guard_residue=true`, `last_command=rollback`, rollback probes false,
  null probe receipt hash.

The database-barrier probe receipt has exactly these top-level keys:

```text
schema_version, run_id, expected_catalog_sha256, completed_at, probes, residue
```

Its schema is `megacampus.q12.database-barrier-probes/v1`; `completed_at` is
UTC RFC 3339 with millisecond precision. `probes` is exactly:

```text
postgrest_anon=rejected
postgrest_authenticated=rejected
postgrest_service_role_without_capability=rejected
postgrest_service_role_with_capability=rolled_back
postgrest_preference_applied=tx=rollback
auth_profile=rejected_zero_residue
storage_object=rejected_zero_metadata_zero_bytes
cron_rpc=rejected_exact_jobs_unchanged
pg_net_rpc=rejected_zero_queue_zero_external_request
direct_supervisor=rolled_back
```

`residue` is exactly
`{guard_probe_rows:0,auth_rows:0,storage_metadata_rows:0,storage_object_bytes:0,cron_job_set_unchanged:true,pg_net_queue_rows:0,external_requests:0}`.
The operator opens this fixed file with `O_NOFOLLOW`, validates the exact
projection and run/catalog, hashes its bytes, and requires that SHA-256 to equal
the non-null `probe_receipt_sha256` in the readiness/cleanup barrier receipt.

The final-writer manifest has exactly these top-level keys:

```text
schema_version, run_id, mode, release_sha, expected_catalog_sha256,
writer_quiesce_manifest_sha256, publication_intent_journal_entry_hash,
input_checkpoint_sha256, lease_epoch, final_writers, held_writers
```

Each writer has exactly:

```text
class, id, name, project, service, config_files, working_dir, image_id,
image_ref, healthcheck_present, intended_running, intended_restart_policy,
temporary_restart_policy
```

Both policy objects are exactly `{name,maximum_retry_count}` and the temporary
policy is always `{name:"no",maximum_retry_count:0}`. IDs are globally unique.
Forward has final ten/new-production-plus-development and held old-production
five. Rollback has final original-production-plus-development ten and held
captured target zero through five.

The handoff-state receipt has exactly:

```text
schema_version, run_id, state, mode, release_sha, expected_catalog_sha256,
writer_quiesce_manifest_sha256, final_writer_manifest_sha256,
database_activation_receipt_sha256, publication_intent_journal_entry_hash,
input_checkpoint_sha256, lease_epoch
```

Its state/mode are `handoff_ready_writers_quiesced/forward`; it binds the exact
activated database receipt and performs no start or live discovery.

The rollback-state receipt has exactly:

```text
schema_version, run_id, state, mode, release_sha, expected_catalog_sha256,
writer_quiesce_manifest_sha256, final_writer_manifest_sha256,
database_barrier_receipt_sha256, required_phase_receipts,
required_phase_receipts_sha256, publication_intent_journal_entry_hash,
input_checkpoint_sha256, lease_epoch
```

Its state/mode are `rollback_ready_writers_quiesced/rollback`.
`required_phase_receipts` is the rollback-intent-frozen, bytewise phase-sorted
array of exact `{phase,receipt_sha256}` objects, with unique phase names and
64-hex hashes. Its companion hash is SHA-256 over the UTF-8 bytes of the single
`jq -S -c 'sort_by(.phase)'` result without a trailing newline.

The resume-authority receipt has exactly:

```text
schema_version, run_id, state, mode, release_sha, expected_catalog_sha256,
writer_quiesce_manifest_sha256, final_writer_manifest_sha256,
database_barrier_receipt_sha256, recovery_state_sha256, handoff_state_sha256,
rollback_state_sha256, authority_intent_journal_entry_hash,
input_checkpoint_sha256, lease_epoch
```

Forward uses state `handoff_ready_writers_quiesced`, non-null recovery and
handoff hashes, null rollback hash, and a cleanup barrier receipt. Rollback uses
state `rollback_ready_writers_quiesced`, null recovery/handoff hashes, non-null
aggregate phase-rollback hash, and a rollback barrier receipt. Every non-null
authority input is opened with `O_NOFOLLOW` and identity/hash revalidated before
Docker mutation.

The terminal resume-state receipt has exactly:

```text
schema_version, run_id, state, mode, expected_catalog_sha256,
writer_quiesce_manifest_sha256, final_writer_manifest_sha256,
resume_authority_sha256, database_barrier_receipt_sha256,
resume_intent_journal_entry_hash, input_checkpoint_sha256, lease_epoch,
final_inventory_sha256, held_inventory_sha256
```

Its state is `writers_resumed`; mode is literal `forward` or `rollback`.

This addendum extends the journal's exact `lease_epoch` domain to the shared
set `cutover`, `cutover-recovery-<positive-decimal>`, `postcutover_schedule`,
and `credential_rotation`. The journal and its accepted checkpoint always
carry the same epoch. `cutover` applies from preflight until an uninterrupted
`cutover_terminal`; after explicit lock reacquisition, the next journal record
starts the monotonically incremented recovery epoch and every remaining
cutover or rollback record retains it. `schedule_verified` uses only
`postcutover_schedule`; `credential_rotation_verified` and the resulting
`q12_terminal` use only `credential_rotation`. No epoch may revert or cross
those phase boundaries. This domain narrowly supersedes the base journal's
three-value enumeration; every other journal key and constraint remains
unchanged.

Every `megacampus.q12.cutover-journal/v1` line narrowly gains exactly two
top-level keys in addition to the unchanged base projection:
`accepted_object_kind` and `accepted_object_sha256`. Their domain and nullability
are identical to the checkpoint fields below. An object-acceptance entry names
the exact accepted kind and lower-case 64-hex object hash; every intent,
ordinary phase, command-capability, and genesis entry uses `none` and null.
These values participate in the existing canonical `entry_hash` computation.
The checkpoint accepted-object fields MUST equal its accepted journal head's
two values; a mismatch fails before publication or recovery.

The canonical journal hash rule is exact. Its preimage is the complete exact
journal object with only `entry_hash` omitted; `previous_hash`, both accepted-
object fields, and every unchanged base field remain present. Serialize that
preimage as compact RFC 8259 JSON with object keys recursively sorted by Unicode
code point, array order preserved, no insignificant whitespace, and no trailing
newline. JSON numbers are permitted only for integers from `0` through
`9007199254740991` and are encoded as the shortest ASCII decimal matching
`0|[1-9][0-9]*`; fractions, exponents, leading zeroes, `-0`, and negative or
larger integers are forbidden.

Every string and key is a valid sequence of Unicode scalar values; lone
surrogates are forbidden and no Unicode normalization is performed. Encode
quotation mark and reverse solidus as `\"` and `\\`; encode U+0008, U+0009,
U+000A, U+000C, and U+000D as `\b`, `\t`, `\n`, `\f`, and `\r`; encode every
other U+0000 through U+001F control as `\u00xx` with lower-case hexadecimal.
Solidus is unescaped. Every other scalar is its literal UTF-8 byte sequence,
never a `\u` escape.

`entry_hash` is the lower-case hexadecimal SHA-256 of those preimage bytes. The
durable JSONL record is the same exact object with `entry_hash` inserted,
serialized by the same rule, followed by exactly one LF byte. Readers reject
duplicate object keys, an invalid scalar, any forbidden number or escape, a
missing or extra field, or a hash that does not recompute. They also reserialize
the parsed complete record and require byte-for-byte equality with the original
line including its sole LF before accepting the entry.

Every checkpoint has exactly these keys:

```text
schema_version, run_id, seq, phase, journal_entry_hash,
previous_journal_entry_hash, journal_device, journal_inode,
accepted_object_kind, accepted_object_sha256, resume_authority_sha256,
lease_epoch
```

`seq` is a positive integer and both journal hashes are lower-case 64-hex.
At `seq=1`, both the journal head's `previous_hash` and
`previous_journal_entry_hash` are exactly 64 zeroes; at every later sequence
they equal the preceding entry's `entry_hash`. The checkpoint value always
equals the accepted journal head's `previous_hash`.
`journal_device` and `journal_inode` are canonical unsigned-decimal JSON strings
matching `^(0|[1-9][0-9]*)$`, obtained from `fstat(2)` on the same
`O_NOFOLLOW|O_APPEND|O_DSYNC` journal file descriptor; the inode is nonzero.
These three fields preserve the base
checkpoint's device/inode/previous-hash CAS requirement.
`accepted_object_kind` is exactly one of `none`,
`database_barrier_receipt`, `database_barrier_probe_receipt`,
`writer_quiesce_manifest`, `writer_recovery_state`, `final_writer_manifest`,
`writer_handoff_state`, `writer_rollback_state`, `writer_resume_authority`, or
`writer_resume_state`. `accepted_object_sha256` is null exactly when the kind is
`none`, and otherwise is the lower-case 64-hex hash of that accepted object.
Before resume authority is accepted, `resume_authority_sha256` is null. At
`resume_authority_forward` or `resume_authority_rollback`, the accepted kind is
`writer_resume_authority` and both object hashes are the same; every later
checkpoint retains that exact authority hash.

At `resume_committing_forward` or `resume_committing_rollback`, the accepted
kind is `none`, the accepted-object hash is null, and the authority hash is
non-null. At `writers_resumed_forward` or `writers_resumed_rollback`, the
accepted kind is `writer_resume_state`, the accepted-object hash is the
terminal receipt hash, and the authority hash is non-null. Every other object
acceptance names its exact kind and hash; an ordinary phase transition with no
accepted object uses `none` and null. `phase` MUST belong to the exact forward
or rollback graph below; there are no other projections under this schema.
`lease_epoch` uses the full shared four-value journal/checkpoint domain and
phase mapping above. An explicitly reacquired cutover lease uses the recovery
form, monotonically one greater than the highest durable recovery epoch.

The genesis checkpoint is the sole predecessor-free exception. It has
`seq=1`, `phase=preflight`, `previous_journal_entry_hash` equal to 64 zeroes,
`accepted_object_kind=none`, both accepted-object and resume-authority hashes
null, and `lease_epoch=cutover`. After the durable sequence-one journal record
is fsynced and its device/inode/hash tuple is revalidated, the controller
publishes the fixed checkpoint path with no-replace semantics and parent fsync.
Recovery may accept an already present genesis checkpoint only when its exact
bytes and tuple match that sole durable sequence-one journal head. A missing
file may be recreated from only that verified head; any existing mismatch,
extra journal entry, non-preflight phase, or non-genesis projection is an
incident. There is no sequence-zero checkpoint or predecessor hash.

Every later checkpoint publication first validates the predecessor checkpoint
hash, then opens and verifies the complete journal chain and predecessor head
on one descriptor. After appending/fsyncing the new entry, the controller
rechecks that descriptor's device/inode, new `seq`, `entry_hash`, and
`previous_hash`. It atomically publishes the checkpoint only when those values
exactly equal `journal_device`, `journal_inode`, `journal_entry_hash`, and
`previous_journal_entry_hash`, and the on-disk predecessor checkpoint is still
the expected byte hash. A crash after the journal append may publish the one
missing checkpoint only after revalidating the immutable accepted object, the
full journal chain, this same tuple, and the expected predecessor checkpoint;
it never appends a duplicate entry or infers acceptance from process exit.

`final_inventory_sha256` and `held_inventory_sha256` use the exact live terminal
projection per writer:

```text
class, id, name, project, service, image_id, image_ref, running, status,
restarting, health_status, restart_policy
```

`restart_policy` is exactly `{name,maximum_retry_count}`. Each array is sorted
by `project`, then `service`, then `id`; its hash is SHA-256 over the UTF-8 bytes
of the single `jq -S -c 'sort_by(.project,.service,.id)'` result without a
trailing newline. The final array has ten entries. The held array has five in
forward and zero through five in rollback.

### Acyclic publication order

Exactly the five new controller-owned objects `final-writer-manifest`,
`writer-handoff-state`, `writer-rollback-state`, `writer-resume-authority`, and
`writer-resume-state` use this order; no object or checkpoint may contain a hash
that depends on itself:

1. validate the accepted predecessor checkpoint and journal head;
2. append/fsync an intent journal entry that binds only predecessor hashes,
   fixed output path/schema/mode, and the planned operation, but not the output
   hash;
3. create/fsync/rename/parent-fsync the object with the predecessor intent hash
   and predecessor checkpoint SHA-256 in its explicitly named fields;
4. append/fsync an acceptance journal entry containing the new object hash; and
5. publish a new checkpoint containing that acceptance-entry hash and object
   hash.

All other accepted kinds in the checkpoint enum, including the exact existing
barrier, probe, writer-quiesce, and writer-recovery projections, retain their
frozen schemas and gain no publication-intent or predecessor-checkpoint fields.
The supervisor accepts their hash only after their own controller-specific
atomic publication, exact schema/identity validation, and an acceptance journal
entry carrying that kind and hash. They are immutable predecessor evidence for
the five new objects, not outputs of the five-step back-reference protocol.

For the first four new object schemas, the publication-intent and object-
acceptance journal entries use the same exact target `phase`; their `outcome`
values are respectively the literals `intent` and `accepted`. The mapping is:

| New object                | Mode     | Exact target phase                |
| ------------------------- | -------- | --------------------------------- |
| `final-writer-manifest`   | forward  | `prepared_quiesced`               |
| `final-writer-manifest`   | rollback | `rollback_preparing`              |
| `writer-handoff-state`    | forward  | `handoff_ready_writers_quiesced`  |
| `writer-rollback-state`   | rollback | `rollback_ready_writers_quiesced` |
| `writer-resume-authority` | forward  | `resume_authority_forward`        |
| `writer-resume-authority` | rollback | `resume_authority_rollback`       |

Each object references only its own `intent` entry and the accepted checkpoint
that immediately preceded that entry. These hashes are not equal across
sequential objects. The terminal `writer-resume-state` is the sole special
projection: its own intent uses `resume_committing_forward` or
`resume_committing_rollback` with `outcome=intent`; root publishes the matching
no-object checkpoint, the child references that checkpoint, and the terminal
acceptance entry uses `writers_resumed_forward` or `writers_resumed_rollback`
with `outcome=accepted`. An intent has
`accepted_object_kind=none` and a null object hash; its paired acceptance names
the exact object kind/hash. Any cross-object intent reference, wrong mode/phase,
non-increasing journal sequence, or skipped paired acceptance is an incident.
For the first four schemas, the required adjacent `intent`/`accepted` journal
pair is one phase transition; only its acceptance publishes the phase
checkpoint. The repeated-phase prohibition rejects a second pair or checkpoint
for that phase, not these two required records. Terminal resume instead has the
two explicitly named transitions and checkpoints above.

For resume, root first publishes the mode-bound `resume_committing_*` journal
entry and its exact checkpoint; that checkpoint contains the authority hash but
not the future terminal receipt. The child terminal receipt references this
predecessor resume intent/checkpoint. Root then appends the terminal acceptance
entry and publishes the next checkpoint. Thus the graph is always predecessor
checkpoint/journal → object → acceptance journal → new checkpoint.

### Exact forward and rollback phase graph

The forward phase chain is exactly:

```text
preflight -> maintenance_guarded -> quiesced -> snapshot_exported ->
backup_committed -> restore_verified -> base_migration_guarded ->
observability_migration_guarded -> migrations_applied ->
recovery_ready_guarded -> source_recovered -> reindex_started ->
qdrant_verified -> prepared_quiesced -> activation_ready ->
activation_committing -> activated -> handoff_ready_writers_quiesced ->
guard_cleanup_complete(cleanup) -> resume_authority_forward ->
resume_committing_forward ->
writers_resumed_forward -> handoff_complete -> observed ->
old_generation_retired -> cutover_terminal -> schedule_verified ->
credential_rotation_verified -> q12_terminal
```

A pre-activation failure from `maintenance_guarded` through
`activation_ready` enters exactly one rollback chain:

```text
rollback_preparing ->
[handoff_rollback_verified if handoff preparation started] ->
[qdrant_rollback_verified if reindex/snapshot mutation started] ->
[source_rollback_verified if source recovery mutation started] ->
[observability_migration_rollback_guarded if that migration committed] ->
[base_migration_rollback_guarded if that migration committed] ->
guard_cleanup_complete(rollback) -> rollback_ready_writers_quiesced ->
resume_authority_rollback -> resume_committing_rollback ->
writers_resumed_rollback -> rollback_complete
```

The only permitted continuation from that failed-cutover terminal is the
separately authorized credential-rotation chain:

```text
rollback_complete -> credential_rotation_verified -> q12_terminal
```

Both continuation checkpoints use `credential_rotation`; the rollback path has
no `postcutover_schedule` phase.

Bracketed phases are required exactly when their corresponding forward phase
started and forbidden otherwise; the supervisor freezes that required reverse
set in the rollback intent before its first mutation. `rollback_complete` is a
failed-cutover terminal with `rotation_required=true`; it has no live
observation or schedule phase and can reach `q12_terminal` only through the
separately authorized credential-rotation workflow.

After `activation_committing` commits, rollback phases are forbidden. Recovery
is finish-forward along the remaining forward chain. A failure or threshold
breach after zero-residue cleanup records a post-cleanup incident and keeps Q12
open; it cannot resurrect the held production set or synthesize an observed
phase. A missing, repeated, skipped, cross-mode, or out-of-order phase fails
closed.

## 7. Verification contract

- TDD removes the fixture in which a recovery child rewrites a
  controller-owned barrier receipt.
- PostgreSQL 17 integration proves `prepare-recovery`, a fresh inherited
  read-only session, explicit primary `READ WRITE`, exact guard coverage,
  cron-off, pg_net-empty, session recycle, idempotence, and every rejection.
- Version-aligned PostgREST integration proves GET/HEAD remain read-only,
  uncapped/wrong-capability writes commit zero rows, and the exact capability
  plus rollback preference succeeds with zero residue.
- Source-recovery/reindex tests reject every receipt except exact
  `recovery_ready_guarded` and prove the retained read-only-default path.
- Writer tests cover success, retry, signal, crash, identity drift, lease
  mismatch, receipt mismatch, exact forward/rollback final manifests, all
  forward fifteen and rollback ten-through-fifteen identities, early and
  partial target creation, unrecorded target rejection, mode-specific authority,
  start/health/policy failures, class order, no early start, compensation,
  SIGKILL/reboot recovery, and no DB capability in resume-only mode.
- Handoff tests prove target containers are never started before resume, final
  manifest publication is pre-activation and immutable, post-activation
  finalize performs no discovery/start, and old production remains held/no.
- Root supervisor tests cover the corrected frozen order and every
  COMMIT-to-receipt recovery edge, including lease reacquisition,
  mode-specific rollback promotion, `resume_committing`, `writers_resumed`, and
  forward-only observation after handoff complete.
- No local test may contact or mutate the server, hosted Supabase, GHCR,
  Qdrant Cloud, staging, or production.

## Consulted primary sources

- PostgreSQL 17 event triggers, event-trigger firing matrix, transaction
  defaults, explicit transaction modes, signaling functions, and background
  workers: `https://www.postgresql.org/docs/17/`
- Supabase hosted event triggers and Supautils `v3.2.2` privileged-role
  behavior (tag commit `64792e14681bba81c9adccdcfd598715cd052eb5`):
  `https://supabase.com/docs/guides/database/postgres/event-triggers` and
  `https://github.com/supabase/supautils/tree/v3.2.2`
- PostgREST 14 transaction modes and transaction-end preference, matching the
  approved base-design documentation:
  `https://docs.postgrest.org/en/v14/references/transactions.html` and
  `https://docs.postgrest.org/en/v14/references/api/preferences.html#transaction-end-preference`.
  The earlier decision research also checked the equivalent 12.2 transaction
  access-mode behavior. The actual hosted build remains unknown and MUST be
  identified during the non-mutating remote preflight; the exact observed
  version then selects the disposable compatibility fixture, and any semantic
  mismatch blocks mutation.
