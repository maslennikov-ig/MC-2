---
status: frozen
normativity: normative
contract_id: q12-d6-activation-truth
title: Q12 D6 activation-truth read-only inspection contract
epic: mc2-jz6y0
decision_issue: mc2-jz6y0.13.19
downstream_root_join: mc2-jz6y0.13.13
owner_decision: "Option A (approved)"
owner_decision_date: 2026-07-15
approved_candidate_path: .superpowers/sdd/q12-d6-activation-truth-candidate.md
approved_candidate_sha256: 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5
final_independent_review_verdict: PASS
final_independent_review_scores_p0_p1_p2_p3: "0/0/0/0"
final_independent_review_sha256: 948982d99895489c6fefa1fb831791f7e02bb524bb268713e712629a6bdab5a7
transcription: verbatim
transcription_note: "Everything below the FROZEN NORMATIVE CONTENT marker is a byte-for-byte transcription of the approved candidate (SHA-256 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5). Only this provenance block was added; no normative byte was edited. Re-verify with: tail -c 47092 on this file must hash to the approved candidate SHA-256."
---

<!-- FROZEN NORMATIVE CONTENT — byte-identical to approved candidate 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5. Do not edit the normative content below. The final independent review (SHA-256 948982d99895489c6fefa1fb831791f7e02bb524bb268713e712629a6bdab5a7, PASS, P0/P1/P2/P3 = 0/0/0/0) and owner Option A approval on 2026-07-15 froze these bytes under decision mc2-jz6y0.13.19. -->

# Q12 D6 activation-truth classifier — revised owner-decision candidate

Status: read-only design candidate. It is neither implementation authority nor Q12 live/remote authority.

## Authority and review record

- integration baseline: `ce77a416c90e16e6d51ef7edb0140e8114577e9b`
- accepted D3 design: `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`, SHA-256 `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`
- accepted D5 design SHA-256: `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`
- accepted D5 plan SHA-256: `8278bce9f335bbef1204e60ff7c22383d15abc13237b80abfc53a6d2d285a0ed`
- D6 decision: `mc2-jz6y0.13.19`; downstream Root join: `mc2-jz6y0.13.13`
- prior candidate SHA-256: `e69e96483cd0a48fddc14c5db1c85883652282e5008a8520f796fefc1abc960b`
- independent review: `.superpowers/sdd/q12-d6-activation-truth-candidate-review.md`, SHA-256 `008e8992e225b82987b164199a1040b72d684a61956fc4e5f89c0c173a2b4a4b`, verdict FAIL, P0/P1/P2/P3 `0/5/3/0`
- independent rereview: `.superpowers/sdd/q12-d6-activation-truth-candidate-rereview.md`, SHA-256 `33dbe5bad81acc2273b68a70009f24ff79f835bc0c69f5f57b07b96d3c0c03f1`, verdict FAIL, P0/P1/P2/P3 `0/3/2/0`

No Supabase, service, container, database, Beads, tracked file, branch, or remote state is changed by this candidate.

## Findings closed

| Review finding | Revised contract |
|---|---|
| P1-1 endpoint, TLS, privileges | Exact host/user/database/TLS/CA/PG17 are frozen; a fail-closed read-only capability projection proves full-set lock privilege, activity visibility, and snapshot clearing; no grants are added. |
| P1-2 provider sessions | The invented singleton is removed. D6 consumes a hash-bound exact D3/W reviewed managed-session/background inventory and preserves the trusted provider plane; unknown identities stop and are never learned. |
| P1-3 incomplete race binding | D6 is blocked on accepted W bytes, SQL and lock catalog/order. Normal and recovery paths must prove a common conflicting lock precedes every tenant-controlled mutation and receipt. |
| P1-4 predecision authority | Predecision and terminal seal are separate. Only a terminal seal after `closed` is authority. The graph is acyclic; durable `R` without seal is incident-only. |
| P1-5 FD proof | Closure/mapping belongs to Root `posix_spawn` file actions plus close-from capability gate. Probe checks required FDs and a pinned runtime-created baseline only. pidfd/ptrace/proc/OFD capabilities are mandatory RED gates. |
| P2-1 session projection | Exact safe fields, sorting, redaction, null rules and predicates are frozen. Statistics are cleared before every authority-bearing read. |
| P2-2 writers/queue | Forward inventory is exactly ten final plus five held; all are stopped/restart `no`. The predicate is global `net.http_request_queue=0`. Pre-`R` authority binds prepared-quiesced predecessor ancestry, not a rollback final-writer manifest. |
| P2-3 ownership | DB, Root and integration write zones are disjoint. `.13.13` starts/rebases only after accepted D6 integration. |

## Owner recommendation and the only genuine choices

Approve Option A:

1. retain the already accepted Supavisor session endpoint on port `5432`;
2. retain the accepted D3 managed-provider trust boundary and require its exact reviewed inventory to be hash-bound by accepted W evidence;
3. implement a separate Root-owned, long-lived, read-only activation-truth classifier after W and D5W are accepted;
4. preserve the exact five retained commands and their hashes.
5. approve the sole, narrow D5 supersession below for the already-running D6 read-only probe and its terminal transcript/seal retirement after `R`.

The only alternatives are:

- endpoint B: expand scope to a direct IPv6 endpoint;
- provider B: pause and approve a new exact provider allowlist after a separately authorized read-only inventory.

All other corrections in this candidate are engineering safety requirements, not owner choices. A pre-exec broker/new executable would be a new owner-visible scope choice and is not selected.

### Sole normative narrowing of accepted D5 after `R`

Owner approval of this D6 candidate explicitly and only narrows the accepted D5 sentences at `docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md:732-735,745-746,755-762,800-815` as follows:

- the retained-command launcher and retained-command child remain stopped before `R`; they have no post-`R` role, cannot commit, execute a child, append a row, or publish an object;
- every mutation-capable database transaction/session, every other child or descendant, every rollback/resource mutation, every final-writer object or intent, every capability, and every lifecycle journal row other than the already-precomputed `R` remain absolutely forbidden between `R` and complete frontier retirement;
- the sole exception is the D6 probe that Root spawned and proved continuous before `R`. It has no spawn/exec API or child process, cannot open a mutation-capable connection, cannot issue SQL outside FD 11, cannot write the database because PostgreSQL enforces its existing `READ COMMITTED READ ONLY` transaction, and cannot write the journal, checkpoints, rollback objects, capabilities, receipts, or final-writer state;
- after `R`, that exact probe may only finish the already-started protocol: emit `sealed`, receive `release`, issue `COMMIT` solely to end the read-only transaction and release its `SHARE` locks, close the database connection, emit `closed`, and exit. This read-only `COMMIT` cannot make a database write and is the sole transaction-end operation allowed after classification;
- Root may only append/fsync the already-open D6 transcript and atomically publish/fsync the matching D6 terminal seal. Those two D6 audit objects are the sole post-`R` host publications before retirement; they are not lifecycle journal rows, rollback resource mutations, capabilities, receipts, or final-writer objects;
- Root then proves the probe has exited through the same pidfd, closes the frame/control/audit/error pipes and every spawn-only Root duplicate of FDs 3-7 and 10-11, proves the probe owns no surviving process or socket, and only then permits Task 9 to retire the frontier. Child exit closes its FD 9 mapping; Root retains the original canonical cutover-lock descriptor continuously for Task 9. No new post-`R` database child/session is opened merely to observe closure. The probe cannot survive `closed`, clean exit is mandatory, and no descendant can exist;
- timeout, signal, disconnect, failed read-only commit, failed close, malformed/absent `closed`, nonzero exit, surviving process/session/FD, transcript failure, or seal-publication failure makes the durable `R` incident-only. It never relaxes the D5 stop for another child, session, row, object, capability, mutation, rollback, activation, or finish-forward action.

This clause is the complete supersession. All unmentioned D5 requirements remain literal and controlling. It is owner-visible because without it D5 and D6 would be simultaneously contradictory.

## Immutable database and TLS identity

The production URL parser accepts exactly:

```text
scheme: postgresql
host and TLS server name: aws-1-us-east-2.pooler.supabase.com
port: 5432
URL user: postgres.diqooqbuchsliypgwksu
database/path: /postgres
query: absent
fragment: absent
```

The accepted source files remain exactly `/opt/megacampus/secrets/supabase_db_url`, owner `claude-deploy:claude-deploy`, mode `0400` or `0600`, and `/opt/megacampus/secrets/prod-ca-2021.crt`, owner `claude-deploy:claude-deploy`, mode `0644`. Both are canonical non-symlink regular files; every ancestor is non-symlink and not group/world-writable. D6 neither chmods, chowns, copies, replaces, deletes, nor creates either file.

Root opens each accepted source with `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, checks owner/mode/type/canonical path and device/inode identity before and after open/read, then maps the already-validated descriptor to FD 3 or FD 4. The password is decoded only from FD 3. TLS uses `verify-full`, `rejectUnauthorized=true`, the exact server name above, and the CA on FD 4 whose SHA-256 is exactly:

```text
700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7
```

After connect, all must hold:

- `session_user = 'postgres'`;
- `current_database() = 'postgres'`;
- `current_setting('transaction_read_only') = 'on'` after transaction start;
- `current_setting('transaction_isolation') = 'read committed'`;
- integer `server_version_num >= 170000 AND server_version_num < 180000`.

The observed patch version is recorded in evidence but any PostgreSQL 18 or pre-17 server is rejected. A disconnect or pooler backend change invalidates the epoch; transparent reconnect is forbidden.

## Required read-only capability projection; no new grants

Before classification, the same transaction publishes and hashes `megacampus.q12.activation-truth-capability/v1` with exact keys:

```text
schema_version, session_user, current_database, server_version_num,
lock_relation_count, lock_privilege_sha256, activity_visibility_mode,
activity_visibility_sha256, clear_snapshot_executed
```

For every OID in the complete accepted lock catalog, a byte-sorted row is projected as:

```text
qualified_name, oid, maintain, update, delete, truncate, lock_authorized
```

`lock_authorized` is true only when at least one of `has_table_privilege(session_user, oid, 'MAINTAIN')`, `UPDATE`, `DELETE`, or `TRUNCATE` is true. Every row must be true; null, missing, duplicate, unexpected, or changed OIDs fail before classification.

Complete `pg_stat_activity` visibility must be proven by either:

- exact membership `pg_has_role(session_user, 'pg_read_all_stats', 'MEMBER') = true`; or
- an exact W-accepted, digest-bound equivalent projection that exposes all required safe fields for every inventory identity without mutation.

The selected mode and its immutable definition hash are recorded. D6 cannot invent an equivalent. For every observed inventory row, a security-restricted null in a required field fails. The probe executes `SELECT pg_stat_clear_snapshot()` successfully before the initial capability/activity read and before every later authority-bearing activity read. No `GRANT`, role membership, credential, SECURITY DEFINER function, or visibility view is created or changed by D6; a missing capability is a hard stop.

## Accepted W dependency and common-lock proof

W `.13.10` and its fixture seam `.13.20` are not accepted on this baseline. Therefore D6 implementation, RED tests, plan execution and integration are forbidden until both are accepted and their integration commit is the D6 base.

The accepted W artifact must freeze a tuple copied exactly into the D6 plan and request:

```text
w_integration_commit,
command_manifest_sha256,
activation_barrier_path,
activation_barrier_sha256,
activation_sql_projection_sha256,
activation_normal_slice_sha256,
activation_recovery_slice_sha256,
activation_lock_catalog_sha256,
activation_lock_order_sha256,
managed_inventory_schema_sha256,
managed_inventory_sha256
```

No current dirty or unaccepted W bytes are authority. D6 refuses implementation if this accepted tuple does not yet exist.

The accepted W normal and committed-recovery activation slices must each have a mechanically tested control-flow property: before any tenant-controlled `ALTER DATABASE`, cron mutation, `net.http_request_queue` mutation, guard/catalog DDL or DML, application relation DDL/DML, activation state mutation, or host receipt/result publication, the path acquires an incompatible lock on at least one common stable relation from the accepted catalog. The full activation lock list and order are digest-bound, and no branch, exception, resume, recovery, or receipt-only path may bypass the common-lock predecessor.

The probe acquires `SHARE` on the same complete deterministic catalog in the accepted byte order. Activation's accepted incompatible lock must conflict with `SHARE`. The proof is bound to exact W executable and SQL bytes, not merely command argv. Any W byte, slice, catalog, order, or control-flow digest change invalidates D6 and requires review.

This serializes tenant-controlled activation paths, including `ALTER DATABASE` ordering because W must acquire the common relation lock first. It does not claim to lock or control provider shared-object actions. The Supabase superuser/reserved/background plane remains the explicitly trusted D3 provider boundary.

## Fixed retained commands and production process

The command manifest remains byte-for-byte unchanged and contains exactly:

1. `barrier.install`
2. `barrier.verify-after-base`
3. `barrier.verify-after-observability`
4. `barrier.prepare-recovery`
5. `barrier.activate`

Its exact accepted SHA-256 is `af9b21cb9bebfd0d48a213ceba76c6bf92eb3f6f758fafa3b2c8fef8c353c92b`; the accepted W/D6 tuple binds this hash or the exact independently accepted integration successor. Shorthand IDs are invalid and cannot form a second namespace.

D6 is a private child of the Root lifecycle supervisor, never a sixth command, systemd unit, cron job, Compose service, shell command, or operator-selectable argv.

Production argv is exactly:

```text
/usr/bin/node /opt/megacampus/packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs inspect
```

No extra argv is accepted. Root supplies only fixed `PATH`, `LC_ALL=C.UTF-8`, `LANG=C.UTF-8`, and a fixed non-writable `HOME`; `NODE_OPTIONS` and inherited environment are absent.

## Root spawn boundary, FDs and capability gates

Root owns descriptor closure and mapping. The selected mechanism is `posix_spawn` with ordered file actions that:

1. open/map fixed 0, 1 and 2;
2. `dup2` each already validated source descriptor to 3–7 and 9–11;
3. close the source duplicate after each map;
4. explicitly close FD 8 and apply close-from immediately above 11 before exec;
5. exec the exact fixed Node argv and environment.

This mechanism is accepted only if the pinned server Python/libc exposes an atomic close-from `posix_spawn` file action and a RED capability test proves the mapping/closure under descriptor pressure. If unavailable or semantically different, implementation stops before code acceptance. It must not silently fall back to `preexec_fn`, a threaded fork child, shell, inherited broad `pass_fds`, or a broker. Unavailability is an engineering capability blocker, not another owner choice.

Descriptor contract:

| FD | Exact meaning |
|---:|---|
| 0 | `/dev/null`, read-only |
| 1 | Root-captured audit pipe, write-only |
| 2 | Root-captured error pipe, write-only |
| 3 | Root-opened `/opt/megacampus/secrets/supabase_db_url`, source owner `claude-deploy:claude-deploy`, source mode `0400` or `0600`, read-only |
| 4 | Root-opened `/opt/megacampus/secrets/prod-ca-2021.crt`, source owner `claude-deploy:claude-deploy`, source mode `0644`, read-only |
| 5 | immutable D6 request, read-only |
| 6 | Root-to-probe control pipe, read-only |
| 7 | probe-to-Root frame pipe, write-only |
| 8 | closed/reserved, never journal |
| 9 | canonical cutover lock and inherited exclusive OFD/flock |
| 10 | immutable accepted catalog bundle, read-only |
| 11 | exact accepted D6 SQL projection, read-only |

Root opens a pidfd immediately. Before accepting frames it proves on the pinned server:

- `pidfd_open` and `pidfd_getfd` succeed under the actual `PTRACE_MODE_ATTACH_REALCREDS`/Yama policy;
- child FD 9 refers to the same open-file description and preserves contention;
- required FD targets, modes and inode identities match;
- `/proc/<pid>/stat` start-time, `/proc/<pid>/exe`, boot-id and pidfd identity remain continuous;
- the close-from spawn test leaves no inherited parent descriptor above 11.

The probe validates required FD 3–7 and 9–11 identities/access modes and FD 9 lock identity. It does not claim every Node/libuv FD is inherited. It separately validates an approved runtime-created FD baseline, keyed by exact `/usr/bin/node` SHA-256, Node major/minor, libuv version and kernel generation, allowing only the pinned anonymous epoll/eventfd/pipe descriptor classes and access modes. Unknown runtime-created descriptors fail. The baseline and spawn-capability result are immutable request inputs. Any failed capability blocks classification; no test override exists.

## Database transaction, lock and SQL allowlist

On the same session:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
SET LOCAL lock_timeout = '120s';
SET LOCAL statement_timeout = '180s';
SET LOCAL idle_in_transaction_session_timeout = '300s';
```

After capability proof, the probe issues the exact accepted byte-ordered full-catalog `LOCK TABLE ... IN SHARE MODE` and verifies every granted relation lock through `pg_locks`. Locking `q12_guard.active_run` alone is forbidden.

Allowed SQL is limited to fixed templates from FD 11:

- transaction/timeouts/commit/failure rollback;
- capability queries above;
- full-catalog `LOCK ... SHARE`;
- connection identity and lock projection;
- exact singleton `q12_guard.active_run` and catalog/capability equality;
- exact structural schemas, relations, columns, constraints, indexes, functions, types, triggers, event triggers, ownership, ACL/default ACL and migration guards;
- exact database default, eight cron rows and global pg_net count;
- `pg_prepared_xacts`, `pg_stat_activity`, `pg_locks`, and `pg_stat_clear_snapshot()`.

Arbitrary SQL, DDL, DML, `COPY`, `set_config` capability installation, repair, termination, advisory unlock, activation replay and untrusted identifiers are forbidden.

## Exact managed-provider and session projection

D6 consumes an immutable `megacampus.q12.managed-session-inventory/v1` from the accepted W tuple. Its top-level keys are exactly:

```text
schema_version, project_ref, database, source_decision_sha256,
provider_plane_trusted, identities
```

`project_ref` is `diqooqbuchsliypgwksu`, `database` is `postgres`, `source_decision_sha256` is the accepted D3 SHA above, and `provider_plane_trusted` is true. Each byte-sorted identity contains exactly:

```text
role, database, backend_type, application_identity,
client_class, allowed_states, transaction_free_required
```

PID, backend start, transaction start, xid and xmin are observations, never allowlist keys. The entire canonical inventory and schema hashes are fixed by accepted W. D6 detects drift but does not freeze, terminate, or control the accepted Supabase internal superuser, reserved-role, or background-worker plane; that plane is trusted not to perform structural DDL during Q12 exactly as D3 states.

Before every authority-bearing activity projection the probe clears the stats snapshot. Each observed row has exactly:

```text
role, database, backend_type, application_identity, client_class,
state, xact_start_is_null, backend_xid_is_null, backend_xmin_is_null,
pid, backend_start_utc
```

Canonicalization is UTF-8 NFC, bytewise ascending by the first five identity fields then PID, lowercase PostgreSQL state literals, UTC RFC3339 milliseconds, JSON integers for PID, and booleans for null predicates. Raw query text, client address/port and secrets are excluded. Every required field must be visible and non-null except fields represented solely by explicit `*_is_null` booleans. Security-restricted nulls, duplicate identity ambiguity, unknown roles/databases/backend types/application identities/client classes, disallowed state, or a required transaction-free predicate that is false stop as drift. Unknown identities are never learned or appended.

The current probe backend is exact application identity `megacampus-q12-activation-truth`, its recorded PID, `client backend`, role/database `postgres`, state `active` during projection, and its own transaction is the sole explicit non-transaction-free exception. All other accepted managed client identities must match their inventory state set and, where required, have null `xact_start`, `backend_xid`, and `backend_xmin`.

## Database and host projections

Before `db_locked`, `host_bound`, and `sealed`, the probe calls `pg_stat_clear_snapshot()` and performs a complete fresh read. Any required null, missing row, duplicate, cardinality change, or hash drift is failure, never canonical data.

Database projection exact keys:

```text
schema_version, run_id, server_version_num, session_user, current_database,
transaction_isolation, transaction_read_only, backend_pid,
connection_identity_sha256, capability_projection_sha256,
active_run_sha256, guard_projection_sha256, structural_catalog_sha256,
database_default_sha256, cron_jobs_sha256, active_cron_count,
global_pg_net_queue_count, prepared_xact_count,
session_inventory_sha256, session_observation_sha256, lock_projection_sha256
```

`global_pg_net_queue_count` is exactly zero in initial and final projections. There is no Q12 subset or nonzero baseline. Prepared transaction count is exactly zero. Cron is exact accepted eight-row baseline when committed and zero active Q12 jobs in precommit, as frozen by accepted W.

Root host projection exact keys:

```text
schema_version, run_id, lease_epoch, activation_evidence_state,
fd9_identity_sha256,
probe_pidfd_identity_sha256, spawn_capability_sha256,
runtime_fd_baseline_sha256, activation_process_projection_sha256,
prepared_quiesced_predecessor_sha256, writer_quiesce_manifest_sha256,
writer_inventory_sha256, docker_observation_sha256,
barrier_receipt_sha256, probe_receipt_sha256,
activation_result_sha256, process_manifest_sha256,
w_activation_tuple_sha256
```

Every host-projection field not named as nullable below is required and non-null. `H` means one lowercase 64-hex SHA-256 over the exact safely opened canonical object/projection bytes; `N` means JSON null and no file/path/hash substitute. The projection contains every key in every classification; omission is invalid.

| Classification | `activation_evidence_state` | `barrier_receipt_sha256` | `probe_receipt_sha256` | `activation_result_sha256` | `activation_process_projection_sha256` | `process_manifest_sha256` |
|---|---|---:|---:|---:|---:|---:|
| `precommit_rollback` | `prepared_guarded` | H: exact accepted `recovery_ready_guarded` barrier receipt | H: its exact bound probe receipt | N | H: exact complete projection with zero live activation processes/sessions | N |
| `committed_finish_forward` | `complete_receipt` | H: exact accepted activated barrier receipt | H: exact receipt-bound probe receipt | H: exact accepted activation result | H: exact complete projection with zero live activation processes/sessions | H: exact accepted activation process manifest |
| `committed_finish_forward` | `committed_receipt_pending` | H: exact accepted predecessor `recovery_ready_guarded` barrier receipt, not an activated receipt | H: that predecessor receipt's exact bound probe receipt | N | H: exact complete projection with zero live activation processes/sessions | H: exact accepted process manifest proving the activation child exited and cannot recur |
| `drift_incident` | `incident_observed` | H iff the exact safe canonical object exists, otherwise N | H iff the exact safe canonical object exists, otherwise N | H iff the exact safe canonical object exists, otherwise N | H: exact complete observed projection, including any live drift | H iff the exact safe canonical object exists, otherwise N |

For `incident_observed`, H is mandatory when the named canonical path exists and can be opened/revalidated safely, and N is mandatory only when that path is absent. A present symlink, unsafe ancestor, wrong owner/mode/type, identity swap, malformed object or unhashed bytes stops before terminal-seal publication; Root records the already-authoritative lifecycle incident without converting unsafe bytes to null. No validator may choose between H and N. `committed_receipt_pending` is legal only when the current barrier receipt is the exact accepted predecessor `recovery_ready_guarded` object, not an activated receipt, and with the exact process manifest and zero-live-process projection above; absence or mismatch of any is `drift_incident`, never a broader reconstruction permission. Root's deterministic host publication may replace that predecessor with the missing accepted activated receipt/result only after a valid committed terminal seal and under the later Task 9 authority; D6 itself publishes neither.

## Exact pre-R writer ancestry and Docker truth

Pre-`R` D6 does not require or invent a rollback `final-writer-manifest`. It binds the exact accepted `prepared_quiesced` predecessor journal entry/checkpoint and its immutable `writer_quiesce_manifest_sha256` ancestry. The predecessor must be the unique current journal/checkpoint head and the exact ancestor required by the accepted phase graph.

That prepared-quiesced inventory contains exactly:

- ten final identities: new production plus development;
- five held identities: old production;
- fifteen total unique container IDs, all stopped, `temporary_restart_policy={name:"no",maximum_retry_count:0}`.

Root verifies every exact ID with `docker inspect`, including image/config/labels, stopped state, restart `no`, and no replacement. `docker compose ps --all --format json` is only a completeness cross-check; any missing, duplicate or unrecorded target is drift. The post-`R` rollback final-writer manifest, retirement and rollback-state publication are Task 9/`.13.13` outputs and cannot be preconditions for D6 classification.

## Canonical objects and frame envelope

JSON is UTF-8 NFC, compact, recursively key-sorted, duplicate-key rejecting, with integers/booleans/null only where schema permits and exactly one LF. SHA-256 is lowercase 64-hex over exact bytes. No floats, unknown keys, implicit defaults, paths, timestamps outside named fields, or security-restricted nulls are accepted.

Every frame has exactly:

```text
schema_version, sequence, kind, run_id, payload,
previous_frame_sha256, frame_sha256
```

`frame_sha256` hashes the canonical object without that field. Sequence starts at 1, increments by one, and chains the prior frame hash.

Request exact keys:

```text
schema_version, run_id, release_sha, lease_epoch,
predecessor_journal_entry_hash, predecessor_checkpoint_sha256,
previous_terminal_seal_sha256, abandoned_predecision_sha256,
expected_catalog_sha256, expected_post_migration_catalog_sha256,
database_capability_sha256, activation_capability_sha256,
prepared_quiesced_predecessor_sha256, writer_quiesce_manifest_sha256,
activation_evidence_state, barrier_receipt_sha256, probe_receipt_sha256,
activation_result_sha256, activation_process_projection_sha256,
process_manifest_sha256,
w_activation_tuple_sha256, projection_sql_sha256,
spawn_capability_sha256, runtime_fd_baseline_sha256
```

`previous_terminal_seal_sha256` and `abandoned_predecision_sha256` are lowercase hash or null under the restart rules below. The request's activation-evidence state and five evidence fields obey the exact H/N table above, and the later host projection must equal them byte-for-byte; disagreement is `drift_incident`. The request is only a bound input and does not itself authorize its proposed evidence state or classification.

## Exact frame payloads

1. Probe `db_locked` payload:

```text
request_sha256, initial_database_projection_sha256,
capability_projection_sha256, lock_projection_sha256,
fd9_identity_sha256
```

2. Root `host_projection` payload:

```text
request_sha256, initial_database_projection_sha256,
host_projection_sha256, proposed_classification,
prepared_quiesced_predecessor_sha256
```

3. Probe `host_bound` payload after snapshot clear and fresh read:

```text
request_sha256, initial_database_projection_sha256,
bound_database_projection_sha256, host_projection_sha256,
session_observation_sha256, fd9_identity_sha256
```

4. Root publishes immutable predecision, then sends exactly one of `predecision_precommit`, `predecision_finish_forward`, or `abort_incident`. Payload:

```text
request_sha256, predecision_sha256, classification, action,
planned_r_journal_entry_hash, planned_r_checkpoint_sha256,
predecessor_journal_entry_hash, predecessor_checkpoint_sha256
```

For precommit both planned hashes are non-null. For finish-forward and incident both are null. Classification/action pairs are exact.

```text
precommit_rollback / append_r_then_seal
committed_finish_forward / seal_finish_forward
drift_incident / abort_incident
```

5. Probe `sealed` after another snapshot clear/fresh read. Payload:

```text
request_sha256, predecision_sha256,
initial_database_projection_sha256, final_database_projection_sha256,
host_projection_sha256, actual_r_journal_entry_hash,
actual_r_checkpoint_sha256, fd9_identity_sha256
```

Actual `R` hashes equal planned hashes for precommit and are null otherwise.

6. Root `release` payload:

```text
request_sha256, predecision_sha256, sealed_frame_sha256,
actual_r_journal_entry_hash, actual_r_checkpoint_sha256,
expected_transaction_end, expected_connection_close
```

The final two literals are `read_only_commit` and `true`.

7. Probe first commits the read-only transaction, closes the DB connection, then sends `closed`:

```text
request_sha256, predecision_sha256, sealed_frame_sha256,
release_frame_sha256, actual_r_journal_entry_hash,
actual_r_checkpoint_sha256, transaction_end,
connection_closed, fd9_identity_sha256
```

`transaction_end=read_only_commit` and `connection_closed=true`. Root then requires clean child exit through the same pidfd. Any direction, sequence, schema, hash, EOF, timeout, pidfd, FD9 or projection mismatch is incident.

## Predecision, optional R and terminal seal

Predecision exact keys:

```text
schema_version, run_id, lease_epoch, request_sha256,
classification, action, initial_database_projection_sha256,
bound_database_projection_sha256, host_projection_sha256,
transcript_head_before_predecision_sha256,
predecessor_journal_entry_hash, predecessor_checkpoint_sha256,
planned_r_journal_entry_hash, planned_r_checkpoint_sha256,
previous_terminal_seal_sha256, abandoned_predecision_sha256
```

It is atomically published/fsynced before optional `R`. It is never finish-forward, rollback, retirement, recovery or operator authority by itself.

Terminal seal exact keys:

```text
schema_version, run_id, lease_epoch, outcome, request_sha256,
predecision_sha256, final_transcript_head_sha256,
initial_database_projection_sha256, final_database_projection_sha256,
host_projection_sha256, activation_evidence_state,
actual_r_journal_entry_hash,
actual_r_checkpoint_sha256, probe_pidfd_identity_sha256,
fd9_identity_sha256, spawn_capability_sha256,
prepared_quiesced_predecessor_sha256,
writer_quiesce_manifest_sha256, barrier_receipt_sha256,
probe_receipt_sha256, activation_result_sha256,
activation_process_projection_sha256, process_manifest_sha256,
probe_exit_status,
transaction_end, connection_closed
```

It is published only after exact `closed`, clean probe exit, final transcript fsync, and continuity verification. It binds `probe_exit_status=0`, `transaction_end=read_only_commit`, and `connection_closed=true`. Every evidence state and nullable/hash value must equal the exact host projection and the predecision classification.

| `outcome` exact literal | Required predecision equality | Required `activation_evidence_state` | Actual `R` hashes | Sole authority |
|---|---|---|---|---|
| `precommit_rollback_sealed` | `classification=precommit_rollback`, `action=append_r_then_seal` | `prepared_guarded` | both H and byte-equal the predecision planned hashes | Task 9 post-`R` frontier retirement/rollback preparation only |
| `committed_finish_forward_sealed` | `classification=committed_finish_forward`, `action=seal_finish_forward` | `complete_receipt` or `committed_receipt_pending` | both N | finish-forward only; pending evidence may be deterministically published as described above, never activation replay |
| `drift_incident_sealed` | `classification=drift_incident`, `action=abort_incident` | `incident_observed` | both N | no mutation, finish-forward, rollback, retirement or activation authority |

No other outcome literal, classification/action pairing, evidence state, null/hash pattern or authority exists. For precommit the actual `R` hashes exactly equal planned. For committed and incident the planned and actual `R` hashes are null. A durable `R` followed by any failure before a valid `precommit_rollback_sealed` object remains incident-only and has no substitute outcome.

Root stores the immutable objects under the existing run-owned `0700` directory as:

```text
activation-truth-request-<lease_epoch>.json
activation-truth-transcript-<lease_epoch>.jsonl
activation-truth-predecision-<lease_epoch>.json
activation-truth-terminal-seal-<lease_epoch>.json
```

Request, predecision and terminal seal are mode `0400` after atomic rename plus file and directory fsync; the append-only transcript is mode `0600` and is fsynced before the terminal seal.

The authority graph is acyclic:

```text
request -> predecision -> optional durable R/checkpoint -> final transcript -> terminal seal
```

Only a validated terminal seal authorizes finish-forward or post-`R` Task 9 retirement. A durable `R` without a terminal seal is incident-only and never authorizes automatic retirement, rollback, activation or finish-forward.

## Classifications

`precommit_rollback` requires `activation_evidence_state=prepared_guarded`, exact `activated=false`, all guards/ACL/catalog/default/cron/net/prepared/session/lock projections, the exact readiness barrier/probe receipts, null activation result/process manifest, a non-null exact zero-live-activation process/session projection, the exact prepared-quiesced ancestry, all 10 final + 5 held stopped/restart `no`, and no drift. It plans and appends exact `R` while the same DB locks, pidfd and FD9 remain continuous.

`committed_finish_forward` requires exact `activated=true`, restored default, exact eight active cron rows, global net queue zero, retained internal guard and removed external guards, exact structural/managed-session/writer/process truth, and exactly one of the two tabled evidence states. `complete_receipt` binds all five evidence hashes. `committed_receipt_pending` binds the exact predecessor `recovery_ready_guarded` barrier/probe receipt pair plus the exact clean-exit process manifest and zero-live projection while the activation result is null and no activated receipt exists. The pending case invokes only accepted W's `BEGIN READ ONLY` recovery verifier and deterministic Root host receipt publication after the terminal seal; it never replays activation or mutates the database.

Everything else is `drift_incident`, including null visibility, missing privilege, unknown provider identity, prepared transaction, live activation process/session, W digest mismatch, writer drift, queue nonzero, projection drift, or activated truth after `R`.

## Race closure and restart authority

For precommit, the probe keeps full `SHARE` locks and FD9 while Root publishes predecision, appends exactly the precomputed `R` plus checkpoint, fsyncs them, obtains fresh `sealed`, releases, receives `closed`, observes clean exit, fsyncs transcript, and publishes terminal seal. No activation path bound by accepted W can pass its common incompatible lock during this interval.

Authority selection after restart:

1. validate the unique journal/checkpoint head and scan immutable D6 epochs in numeric lease order;
2. validate every request/predecision/transcript/seal hash chain and `previous_terminal_seal_sha256` lineage;
3. select only the unique terminal-seal chain tip whose predecessor or actual `R` matches the current canonical journal/checkpoint head;
4. multiple tips, forks, reused epochs, stale-head authority, or unbound files are incident.

Exact crash rules:

- predecision with no `R`, no terminal seal and no continuously live original transaction has no authority. A new epoch may bind its hash once in `abandoned_predecision_sha256`; it never reuses its classification or projections.
- predecision with no `R` may continue only while the original transaction, probe pidfd, FD9, transcript and Root process are demonstrably continuous.
- durable `R` with no valid terminal seal is incident-only. No new normal epoch and no automatic action may cross it.
- terminal seal with no `R` is finish-forward authority only when its classification is committed and it is the unique chain tip.
- terminal seal with exact `R` authorizes only Task 9 post-`R` retirement/rollback preparation; Task 9 creates the rollback final-writer manifest afterward.
- an incident terminal seal authorizes no mutation.

## Disjoint implementation ownership

Implementation remains blocked on accepted W/D5W. After an approved plan, streams may use separate worktrees with these exclusive zones:

| Stream | Exclusive tracked write zone | Verification |
|---|---|---|
| DB probe | create `packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs`; create `deploy/qdrant/q12-activation-truth-projection.sql`; create `packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs`; create `packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts` | production CLI negatives; disposable PG17 lock/capability/session/race tests |
| Root coordinator | modify `deploy/qdrant/q12-lifecycle-core.py`; modify `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`; modify `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts` only to prove unchanged five-command bytes/hashes | spawn/pidfd/FD/OFD, protocol, crash and authority tests |
| D6 integration | create `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md`; integration-only conflict resolution and accepted docs/handoff/Beads updates | independent correctness/docs review, full gates, commit/push |

The five-command JSON manifest is never a write zone. The D6 artifact belongs only to integration. `.13.13` Task 9 may begin/rebase only after D6 is independently accepted, integrated, pushed and `.13.19` is closed; it must not run concurrently against shared lifecycle/tests.

## Required RED/capability and verification gates

- accepted W/D5W tuple exists and exact hashes are copied into the plan/request;
- production endpoint/TLS/post-connect identity negatives;
- missing per-relation strong privilege, missing activity visibility, restricted null, or failed snapshot clear blocks;
- local disposable PostgreSQL 17 proves READ ONLY `SHARE`, complete locks, normal/recovery conflict ordering, wait-winner visibility and disconnect invalidation;
- exact managed inventory positives plus unknown/background/application/state/xact null negatives;
- exact 10+5 Docker inventory and global net queue zero;
- `posix_spawn` close-from/mapping under descriptor pressure on local and pinned server;
- `pidfd_open`, `pidfd_getfd`, ptrace/Yama, proc identity and FD9 OFD contention on local and pinned server;
- every frame/payload/hash, predecision/optional-R/transcript/seal frontier and authority fork/restart negative;
- durable `R` without seal is incident-only; predecision alone never authorizes finish-forward;
- exact five retained commands/hashes unchanged;
- focused suites, `pnpm type-check`, `pnpm build`, `scripts/orchestration/run_process_verification.sh`, independent correctness and docs review.

Tests use only disposable local PG17 and synthetic secrets/content. There is no production test flag or alternate deployed argv. Pinned-server capability checks are read-only and require the later explicit remote observation gate; until they pass, implementation cannot be accepted for live use.

## Secrets, observability and recovery limits

The database URL remains at `/opt/megacampus/secrets/supabase_db_url`, owned by `claude-deploy:claude-deploy`, mode `0400` or `0600`; the CA remains at `/opt/megacampus/secrets/prod-ca-2021.crt`, same owner, mode `0644`. Root opens and validates those accepted source files but does not own, copy, replace, chmod or chown them. Run directory is `0700`; transcript `0600`; request/predecision/seal `0400` after atomic publication. Secrets never enter argv, env, JSON, journal, Docker metadata, logs or snapshots. FD3 is not hashed because a password-bearing URL hash is an offline oracle; only the accepted capability hash is persisted.

Structured events contain run/lease/outcome and request/predecision/seal/transcript/projection/spawn/W/writer/journal hashes, lock duration and incident codes. They exclude connection URL, password, CA bytes, raw SQL/query text, raw process command lines and environment.

The classifier never grants, repairs, terminates, starts, stops, activates, recovers or rolls back. Post-`R` writer retirement and rollback manifests remain Task 9. External S3 and Qdrant Cloud remain out of scope.

## First-party references and graph/docs state

- PostgreSQL 17.10 release, 2026-05-14: https://www.postgresql.org/docs/17/release-17-10.html
- PostgreSQL 17.10 transaction: https://www.postgresql.org/docs/17/sql-set-transaction.html
- PostgreSQL 17.10 `LOCK` privileges: https://www.postgresql.org/docs/17/sql-lock.html
- PostgreSQL 17.10 explicit locks: https://www.postgresql.org/docs/17/explicit-locking.html
- PostgreSQL 17.10 `ALTER DATABASE`: https://www.postgresql.org/docs/17/sql-alterdatabase.html
- PostgreSQL 17.10 activity visibility/snapshots: https://www.postgresql.org/docs/17/monitoring-stats.html
- PostgreSQL 17.10 locks/prepared transactions: https://www.postgresql.org/docs/17/view-pg-locks.html and https://www.postgresql.org/docs/17/view-pg-prepared-xacts.html
- Python 3.14 current documentation (displayed patch 3.14.6) for `os.posix_spawn` and `POSIX_SPAWN_{OPEN,CLOSE,DUP2,CLOSEFROM}`: https://docs.python.org/3.14/library/os.html#os.posix_spawn. `POSIX_SPAWN_CLOSEFROM` is platform-conditional and therefore remains a pinned-server capability gate, not an assumption. Local read-only observation on 2026-07-15: Python `3.14.4`, glibc `2.43`, constant exposed; the pinned server must still pass its later separately authorized capability gate.
- Supabase session pooler: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase event triggers: https://supabase.com/docs/guides/database/postgres/event-triggers
- Supautils `v3.2.2`: https://github.com/supabase/supautils/tree/v3.2.2
- Docker inspect/Compose: https://docs.docker.com/reference/cli/docker/inspect/ and https://docs.docker.com/reference/cli/docker/compose/ps/
- Linux pidfds, man-pages 6.18: https://man7.org/linux/man-pages/man2/pidfd_open.2.html and https://man7.org/linux/man-pages/man2/pidfd_getfd.2.html

Graph evidence remains the prior focused read-only query against `graphify-out/graph.json`; no refresh is appropriate for an ignored design candidate. Implementation closeout must refresh locally without external model/API modes when ownership is safe. D2–D5 and W evidence were reviewed; implementation acceptance requires fresh `docs_reviewer` and independent correctness review.

## Exact owner question and authority separation

> Подтверждаете исправленный D6 Option A: использовать строго `aws-1-us-east-2.pooler.supabase.com:5432/postgres` через Supavisor session mode с уже принятой TLS/CA и PostgreSQL 17 identity; сохранить точную D3 trusted-provider boundary; после принятия W/D5W реализовать отдельный Root-owned read-only classifier с полным common-lock proof, hash-bound managed inventory, predecision → optional R → final transcript → terminal seal authority и описанными spawn/FD/pidfd capability gates; а также одобрить единственное узкое сужение D5, при котором уже запущенный до `R` D6 probe после `R` может только завершить защищённую PostgreSQL `READ ONLY` транзакцию без записи, закрыть соединение, выдать `closed` и выйти, пока Root дописывает только D6 transcript/terminal seal и полностью закрывает процесс/FD/session перед Task 9? Все retained-command launcher/child, mutation-capable sessions, descendants, lifecycle rows, capabilities, rollback/final-writer objects и любые мутации остаются запрещены между `R` и retirement. Это подтверждает только письменный D6-контракт. Локальная реализация требует отдельного утверждённого плана/разрешения, а любые server/Supabase/service/container/Qdrant/live действия — отдельного актуального remote gate.

## Rereview finding closure map

These candidate line references are exact for this revision; this table is appended after the referenced material so it does not shift them.

| Rereview finding | Exact closure in this candidate |
|---|---|
| P1-1 canonical command IDs | Lines 147-159 enumerate all five exact `barrier.*` IDs, bind manifest SHA-256, and reject shorthand; lines 123-139 add that manifest hash to the accepted W/D6 tuple. |
| P1-2 D5/D6 post-`R` contradiction | Lines 48-60 are the sole explicit normative narrowing, including the no-descendant/no-mutation/read-only-commit and process/FD/session retirement rules; lines 413-466 freeze the close/seal sequence and authority; lines 572 contains the owner-visible approval text. |
| P1-3 URI/CA ownership and modes | Lines 62-92 retain the exact absolute source paths, `claude-deploy:claude-deploy`, URI `0400|0600`, CA `0644`, safe ancestors and Root open/revalidation; lines 181-196 map those accepted sources to FD3/FD4; line 546 repeats the no-copy/no-chmod/no-chown boundary. |
| P2-1 null/hash and terminal outcomes | Lines 282-305 freeze every host evidence field and H/N class; lines 332-348 apply the same exact pattern to the request; lines 440-466 freeze terminal keys, the three outcome literals, predecision equality, actual-`R` nullability and sole authority. |
| P2-2 current version-sensitive sources | Lines 552-566 record PostgreSQL 17.10 release/manual sources and Python 3.14 `posix_spawn`/FD actions, plus the local 3.14.4/glibc 2.43 observation and retained pinned-server gate. |

## Explicit defers and authority boundary

- No D6 implementation, RED test, plan execution, tracked-file change or integration may start until the owner approves this exact candidate and accepted W `.13.10` plus D5W `.13.20` provide their final integration commit and hash tuple.
- Candidate approval is not remote observation or activation authority. Pinned-server capability observation, Supabase/database/service/container/Qdrant access, deployment, live reindex, activation, rollback and every other remote/live mutation remain behind a separate exact current-task gate.
