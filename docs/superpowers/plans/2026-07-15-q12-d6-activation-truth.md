# Q12 D6 activation-truth — implementation plan

REQUIRED SUB-SKILL: before executing this plan you MUST use
`superpowers:executing-plans`, and for every task use
`superpowers:test-driven-development` (RED → GREEN → commit) and
`superpowers:verification-before-completion` (evidence before any completion
claim). Use `superpowers:using-git-worktrees` for the two disjoint code streams
and `superpowers:requesting-code-review` + independent `docs_reviewer` before
integration.

Provenance and authority:

- Frozen normative contract: `docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md`
  (normative bytes are byte-identical to approved candidate SHA-256
  `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5`).
- Owner decision: Option A, 2026-07-15, issue `mc2-jz6y0.13.19`; downstream Root
  join `mc2-jz6y0.13.13` (Task 9).
- Final independent review: prefix `948982d99895489c`, PASS, P0/P1/P2/P3 = 0/0/0/0.

This plan is derived strictly from that frozen contract. Every plan constant,
field order, SQL template, FD number, classification literal, and authority rule
is taken verbatim from the contract; where this plan quotes an exact key list,
SQL fragment, argv, or literal it is the contract's exact bytes. This plan does
not authorize any remote/live action.

---

## Goal

Deliver the Q12 D6 activation-truth classifier exactly as frozen by the
contract: a private, Root-spawned, long-lived, read-only PostgreSQL 17 probe
(`inspect`) that, after accepted W/D5W, proves activation truth via a
predecision → optional durable `R` → final transcript → terminal-seal authority
graph, under hard spawn/FD/pidfd/capability gates, without ever mutating the
database, journal, receipts, capabilities, final-writer state, or the five
retained lifecycle commands.

Done means: all RED capability/behavior gates enumerated by the contract pass on
disposable local PG17 and synthetic fixtures; `pnpm type-check`, `pnpm build`,
the focused suites, and `scripts/orchestration/run_process_verification.sh`
pass; the five retained commands and their manifest hash are proven unchanged;
and independent correctness + docs review accept the work before integration.

## Architecture

Two disjoint code streams plus one integration stream (exactly the contract's
"Disjoint implementation ownership" table; see Global Constraints):

1. DB probe stream — the read-only probe executable, the exact SQL projection
   bundle, a disposable-PG17 fixture runner, and the probe/PG17 test suite.
2. Root coordinator stream — the Root lifecycle supervisor spawn/protocol/
   authority logic in `deploy/qdrant/q12-lifecycle-core.py`, plus edits to two
   existing tests **only** to prove the five retained-command bytes/hashes are
   unchanged.
3. D6 integration stream — the tracked artifact, conflict resolution, docs/
   handoff/Beads updates, final gates, commit/push. Integration is a separate
   later task; this plan produces the code for streams 1 and 2 and the artifact
   scaffold for stream 3.

Authority graph (contract "Predecision, optional R and terminal seal"):

```text
request -> predecision -> optional durable R/checkpoint -> final transcript -> terminal seal
```

Only a validated terminal seal authorizes finish-forward or post-`R` Task 9
retirement. A durable `R` without a valid terminal seal is incident-only.

Protocol (contract "Exact frame payloads"), all frames chained by
`previous_frame_sha256`/`frame_sha256`, sequence starting at 1:

```text
probe:db_locked -> Root:host_projection -> probe:host_bound
-> Root:predecision + (predecision_precommit | predecision_finish_forward | abort_incident)
-> probe:sealed -> Root:release -> probe:closed -> Root: clean-exit + terminal seal
```

## Tech stack

- Runtime probe: Node `/usr/bin/node` (CommonJS `.cjs`), `pg` client already in
  the platform package, TLS `verify-full`. No new dependency.
- Root coordinator: Python 3.14 (`os.posix_spawn` with
  `POSIX_SPAWN_{OPEN,CLOSE,DUP2,CLOSEFROM}`; `POSIX_SPAWN_CLOSEFROM` is
  platform-conditional and stays a pinned-server capability gate, per contract
  reference and local observation Python 3.14.4 / glibc 2.43).
- Tests: Vitest, disposable `postgres:17.10-bookworm` container gated by
  `MC2_Q12_REAL_PG17=1`, modeled on the existing
  `packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts`
  container harness (`docker run -d --rm ... -e POSTGRES_PASSWORD=... postgres:17.10-bookworm`,
  poll `server_version_num`, `psql`/`spawnPsql`/`waitForOutput`/`waitForExit`
  helpers, `docker rm -f` teardown).
- First-party references (contract "First-party references"): PostgreSQL 17.10
  SET TRANSACTION / LOCK / explicit-locking / ALTER DATABASE / monitoring-stats /
  pg_locks / pg_prepared_xacts; Python 3.14 `os.posix_spawn`; Supabase session
  pooler + event triggers; Supautils v3.2.2; Docker inspect / compose ps; Linux
  pidfd_open / pidfd_getfd man-pages 6.18.

## Global constraints (RULES — apply to every task)

1. No live / no remote. Every test uses only a disposable local PG17 container
   and synthetic files/secrets. No connection to Supabase, the pinned server, or
   any production host occurs in this plan. Pinned-server capability checks
   (`POSIX_SPAWN_CLOSEFROM`, pidfd/ptrace/OFD on the real server) are RED gates
   that stay behind a later, separately authorized remote observation gate; this
   plan cannot mark them satisfied and cannot accept the probe for live use.
2. Synthetic secrets only. Fixture URL/CA/password never carry real credentials.
   FD 3 (password-bearing URL) is never hashed or logged (contract: an offline
   oracle); only the capability hash is persisted. Secrets never enter argv,
   env, JSON, journal, Docker metadata, logs, or snapshots.
3. Implementation is BLOCKED until accepted W `.13.10` and D5W `.13.20` provide
   their final integration commit and the eleven-field activation tuple
   (contract "Accepted W dependency…" and "Explicit defers"). Task 0 is a hard
   precondition gate; no later step may run before it passes. The W tuple values
   are named bound inputs copied verbatim into the request fixture and plan
   constants at execution time — they are contract-mandated inputs, not
   free-form placeholders, and no step invents them.
4. The five retained commands and their manifest SHA-256
   `af9b21cb9bebfd0d48a213ceba76c6bf92eb3f6f758fafa3b2c8fef8c353c92b` are
   immutable (`barrier.install`, `barrier.verify-after-base`,
   `barrier.verify-after-observability`, `barrier.prepare-recovery`,
   `barrier.activate`). D6 is a private child of the Root supervisor, never a
   sixth command / systemd unit / cron job / Compose service / operator argv.
5. Write zone is fixed by the ownership table (contract "Disjoint implementation
   ownership"); do not touch any file outside your stream's exclusive zone. The
   five-command JSON manifest is never a write zone.
6. Frozen W tuple is the sole source of the lock catalog, lock order, SQL
   projection, slices, managed inventory, and command manifest hash. Any W byte /
   slice / catalog / order / control-flow / inventory / manifest change
   invalidates D6 and requires review.
7. The classifier never grants, repairs, terminates, starts, stops, activates,
   recovers, or rolls back. Post-`R` writer retirement and rollback final-writer
   manifests are Task 9 (`.13.13`), never D6 preconditions. External S3 and
   Qdrant Cloud are out of scope.
8. Every fixed key list, SQL template, argv, FD number, classification/outcome
   literal, and file mode used below is transcribed exactly from the contract;
   do not reorder, rename, add, or drop keys.

---

## Task 0 — precondition gate: accepted W/D5W tuple (BLOCKING)

Owner: DB probe + Root coordinator streams jointly (read-only gate; no code).
Contract: "Accepted W dependency and common-lock proof", "Explicit defers".

This gate MUST pass before any RED test or implementation step in Tasks 1–20.

Steps:

1. Confirm W `.13.10` and its fixture seam `.13.20` are accepted and their
   integration commit exists; set that commit as the D6 base. If either is
   unaccepted, STOP — implementation, RED tests, plan execution, and integration
   are forbidden (contract line: "W `.13.10` and its fixture seam `.13.20` are
   not accepted on this baseline").
2. Copy the accepted W artifact tuple verbatim into a plan constant block and
   into the immutable D6 request fixture. The tuple is exactly these eleven
   fields (contract "Accepted W dependency…"):

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

3. Assert `command_manifest_sha256` equals
   `af9b21cb9bebfd0d48a213ceba76c6bf92eb3f6f758fafa3b2c8fef8c353c92b` or the
   exact independently accepted integration successor named by the accepted W
   tuple. Mismatch → STOP.
4. Record the tuple, the W integration commit, and the managed inventory bytes as
   immutable request inputs. No dirty or unaccepted W bytes are authority.

Verification: the eleven fields exist, are non-empty, and are wired as request
constants; `command_manifest_sha256` matches. Gate result recorded in the D6
artifact. Until this passes, all subsequent tasks are blocked.

---

# Stream 1 — DB probe

Exclusive write zone (create only):

- `packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs`
- `deploy/qdrant/q12-activation-truth-projection.sql`
- `packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs`
- `packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts`

Verification for the stream: production CLI negatives; disposable PG17
lock/capability/session/race tests.

## Task 1 — canonical JSON + frame envelope + hashing (RED → GREEN → commit)

Contract: "Canonical objects and frame envelope".

RED (in `q12-activation-truth.test.ts`): write failing unit tests, no container,
that assert the canonicalizer and framer:

- serialize UTF-8 NFC, compact, recursively key-sorted, duplicate-key rejecting,
  integers/booleans/null only where schema permits, exactly one trailing LF;
- reject floats, unknown keys, implicit defaults, paths, timestamps outside named
  fields, and security-restricted nulls;
- compute `frame_sha256` as lowercase 64-hex SHA-256 over the canonical object
  **without** the `frame_sha256` field;
- build a frame with exactly the keys, in order:

  ```text
  schema_version, sequence, kind, run_id, payload,
  previous_frame_sha256, frame_sha256
  ```

- enforce `sequence` starts at 1, increments by one, and chains the prior frame
  hash via `previous_frame_sha256`.

Assertions include: a known object hashes to a fixed expected digest computed in
the test from the canonical bytes; a duplicate key input throws; a float input
throws; an out-of-order sequence throws; a wrong `previous_frame_sha256` throws.

GREEN: implement `canonicalize(obj)`, `sha256Hex(bytes)`, and
`makeFrame({schema_version, sequence, kind, run_id, payload, previous_frame_sha256})`
in `q12-activation-truth-probe.cjs` (exported for tests via
`module.exports` while `require.main === module` drives the CLI). Use
`crypto.createHash('sha256')` and a deterministic key-sorted serializer that
rejects duplicate keys and non-permitted types.

Commit: `test(q12): RED canonical/frame envelope for D6 probe` then
`feat(q12): D6 canonical JSON + frame envelope + hashing`.

## Task 2 — exact SQL projection bundle (RED → GREEN → commit)

Contract: "Database transaction, lock and SQL allowlist", "Required read-only
capability projection", "Database and host projections".

RED: tests assert the SQL file `deploy/qdrant/q12-activation-truth-projection.sql`
exists, contains only the allowed templates, and its SHA-256 equals the request
`projection_sql_sha256` bound from the W tuple's `activation_sql_projection_sha256`.
Assert the file contains no forbidden constructs (arbitrary DDL/DML, `COPY`,
`set_config` capability installation, repair, termination, advisory unlock,
activation replay, untrusted identifiers).

GREEN: author `q12-activation-truth-projection.sql` with only these fixed
templates (contract "Allowed SQL is limited to fixed templates from FD 11"):

1. transaction / timeouts / commit / failure rollback:

   ```sql
   BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
   SET LOCAL lock_timeout = '120s';
   SET LOCAL statement_timeout = '180s';
   SET LOCAL idle_in_transaction_session_timeout = '300s';
   ```

2. capability queries (see Task 4): `megacampus.q12.activation-truth-capability/v1`
   projection with exact keys `schema_version, session_user, current_database,
   server_version_num, lock_relation_count, lock_privilege_sha256,
   activity_visibility_mode, activity_visibility_sha256, clear_snapshot_executed`,
   plus per-OID lock rows `qualified_name, oid, maintain, update, delete,
   truncate, lock_authorized`;
3. full-catalog `LOCK TABLE … IN SHARE MODE` over the complete accepted catalog
   in the accepted byte order (from W tuple `activation_lock_catalog_sha256` /
   `activation_lock_order_sha256`);
4. connection identity and lock projection (`pg_locks` verification of every
   granted relation lock);
5. exact singleton `q12_guard.active_run` and catalog/capability equality;
6. exact structural schemas/relations/columns/constraints/indexes/functions/
   types/triggers/event triggers/ownership/ACL/default ACL/migration guards;
7. exact database default, eight cron rows, and global pg_net count;
8. `pg_prepared_xacts`, `pg_stat_activity`, `pg_locks`, and
   `pg_stat_clear_snapshot()`.

Commit: `test(q12): RED D6 SQL projection allowlist + hash bind` then
`feat(q12): D6 read-only SQL projection bundle`.

## Task 3 — connection identity + TLS + post-connect asserts (RED → GREEN → commit)

Contract: "Immutable database and TLS identity".

RED (PG17 container + unit): assert the probe's URL parser accepts exactly:

```text
scheme: postgresql
host and TLS server name: aws-1-us-east-2.pooler.supabase.com
port: 5432
URL user: postgres.diqooqbuchsliypgwksu
database/path: /postgres
query: absent
fragment: absent
```

and rejects any deviation (other host/port/user/db, present query/fragment, wrong
scheme). Assert TLS config uses `verify-full`, `rejectUnauthorized=true`, the
exact server name, and the CA from FD 4 whose SHA-256 is exactly
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` (a synthetic
CA in tests fails this check by design → prove the reject path; the real CA hash
is asserted only via the pinned-server remote gate). Assert post-connect, all
hold or the run fails:

- `session_user = 'postgres'`;
- `current_database() = 'postgres'`;
- `current_setting('transaction_read_only') = 'on'` after transaction start;
- `current_setting('transaction_isolation') = 'read committed'`;
- integer `server_version_num >= 170000 AND server_version_num < 180000`
  (reject PG18 / pre-17; record observed patch in evidence).

Assert a disconnect or pooler backend change invalidates the epoch and forbids
transparent reconnect.

GREEN: implement the strict parser, TLS options, FD 3-only password decode, and
post-connect assertions in the probe. In the container test, drive identity/
read-only/isolation/version assertions against the disposable PG17 (which
reports `server_version_num` 170010) using a local synthetic URL/CA to exercise
parser and assertion logic; the exact production host/CA-hash acceptance stays a
pinned-server remote gate.

Commit: `test(q12): RED D6 connection identity + TLS asserts` then
`feat(q12): D6 immutable DB/TLS identity checks`.

## Task 4 — capability projection + lock privilege + activity visibility (RED → GREEN → commit)

Contract: "Required read-only capability projection; no new grants".

RED (PG17 container): build a fixture catalog of relations in the disposable PG17
and assert:

- the capability object `megacampus.q12.activation-truth-capability/v1` is
  projected with exactly the nine keys above and hashed;
- for every OID in the (fixture) lock catalog a byte-sorted row
  `qualified_name, oid, maintain, update, delete, truncate, lock_authorized` is
  produced; `lock_authorized` is true iff at least one of
  `has_table_privilege(session_user, oid, 'MAINTAIN'|'UPDATE'|'DELETE'|'TRUNCATE')`
  is true; every row must be true — a null/missing/duplicate/unexpected/changed
  OID fails **before** classification;
- complete `pg_stat_activity` visibility is proven by either
  `pg_has_role(session_user, 'pg_read_all_stats', 'MEMBER') = true` or an exact
  W-accepted digest-bound equivalent projection; the selected mode and its
  immutable definition hash are recorded; D6 cannot invent an equivalent;
- a security-restricted null in any required field of any observed inventory row
  fails;
- `SELECT pg_stat_clear_snapshot()` runs successfully before the initial
  capability/activity read and before every later authority-bearing activity
  read;
- no `GRANT` / role membership / credential / SECURITY DEFINER function /
  visibility view is created or changed; a missing capability is a hard stop.

Negatives: revoke a strong privilege on one fixture relation → capability fails;
drop `pg_read_all_stats` membership without an accepted equivalent → visibility
fails; force a restricted null → fail; make snapshot clear fail → block.

GREEN: implement capability projection, per-OID privilege proof, visibility mode
selection + hash, and mandatory snapshot clears in the probe using the SQL
templates from Task 2.

Commit: `test(q12): RED D6 capability/lock-privilege/visibility gates` then
`feat(q12): D6 read-only capability projection`.

## Task 5 — transaction, full-catalog SHARE lock, allowlist enforcement (RED → GREEN → commit)

Contract: "Database transaction, lock and SQL allowlist".

RED (PG17 container): assert the probe runs
`BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY` with the three `SET LOCAL`
timeouts (`lock_timeout='120s'`, `statement_timeout='180s'`,
`idle_in_transaction_session_timeout='300s'`); after capability proof issues the
exact accepted byte-ordered full-catalog `LOCK TABLE … IN SHARE MODE` and
verifies every granted relation lock through `pg_locks`; assert locking
`q12_guard.active_run` alone is forbidden (a fixture that locks only that
relation fails). Assert any SQL outside the FD-11 allowlist is rejected.

GREEN: implement the transaction/lock/verify sequence and an allowlist guard that
only executes templates whose text matches the FD-11 bundle.

Commit: `test(q12): RED D6 transaction + full-catalog SHARE + allowlist` then
`feat(q12): D6 read-only transaction and lock proof`.

## Task 6 — common-lock proof against W activation slices (RED → GREEN → commit)

Contract: "Accepted W dependency and common-lock proof".

RED (PG17 container, concurrent sessions via `spawnPsql`/`waitForOutput`/
`waitForExit`): using the accepted W normal and committed-recovery activation
slices (bytes bound by `activation_normal_slice_sha256` /
`activation_recovery_slice_sha256`), assert each slice has the mechanically
tested control-flow property: before any tenant-controlled `ALTER DATABASE`, cron
mutation, `net.http_request_queue` mutation, guard/catalog DDL or DML, application
relation DDL/DML, activation state mutation, or host receipt/result publication,
the path acquires an incompatible lock on at least one common stable relation
from the accepted catalog. Assert the probe's `SHARE` on the complete
deterministic catalog (accepted byte order) conflicts with activation's accepted
incompatible lock (wait-winner visibility): when the probe holds `SHARE`, the
activation slice blocks on the common relation and only proceeds after the probe
releases. Assert no branch/exception/resume/recovery/receipt-only path bypasses
the common-lock predecessor. Assert the proof binds exact W executable and SQL
bytes, not merely argv; any W byte/slice/catalog/order/control-flow digest change
invalidates D6.

GREEN: implement the container race harness (modeled on the exemplar) that runs a
probe session holding `SHARE` and an activation-slice session, and prove the
conflict + ordering. Bind the slice/catalog/order digests to the W tuple.

Commit: `test(q12): RED D6 common-lock conflict + ordering (normal/recovery)`
then `feat(q12): D6 common-lock proof harness`.

## Task 7 — managed-provider + observed session projection (RED → GREEN → commit)

Contract: "Exact managed-provider and session projection".

RED (PG17 container + unit): assert D6 consumes the immutable
`megacampus.q12.managed-session-inventory/v1` from the accepted W tuple with
top-level keys exactly:

```text
schema_version, project_ref, database, source_decision_sha256,
provider_plane_trusted, identities
```

with `project_ref='diqooqbuchsliypgwksu'`, `database='postgres'`,
`source_decision_sha256` the accepted D3 SHA
`7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`,
`provider_plane_trusted=true`; each byte-sorted identity has exactly:

```text
role, database, backend_type, application_identity,
client_class, allowed_states, transaction_free_required
```

(PID/backend start/transaction start/xid/xmin are observations, never allowlist
keys). Assert each observed `pg_stat_activity` row is projected with exactly:

```text
role, database, backend_type, application_identity, client_class,
state, xact_start_is_null, backend_xid_is_null, backend_xmin_is_null,
pid, backend_start_utc
```

canonicalized UTF-8 NFC, bytewise ascending by the first five identity fields then
PID, lowercase state literals, UTC RFC3339 milliseconds, JSON integers for PID,
booleans for null predicates; raw query text / client address:port / secrets
excluded. Assert a stats snapshot clear precedes every authority-bearing activity
projection. Assert the current probe backend is the sole non-transaction-free
exception with application identity `megacampus-q12-activation-truth`, `client
backend`, role/database `postgres`, state `active`; all other managed identities
must match their inventory state set and required null `xact_start`/`backend_xid`/
`backend_xmin`. Negatives: security-restricted null, duplicate identity ambiguity,
unknown role/database/backend type/application identity/client class, disallowed
state, or a false required transaction-free predicate → drift; unknown identities
are never learned or appended. Assert D6 detects drift but does not freeze /
terminate / control the trusted Supabase superuser / reserved-role / background
plane.

GREEN: implement inventory consumption, observed-row projection + canonicalization,
and drift detection.

Commit: `test(q12): RED D6 managed inventory + session projection + drift` then
`feat(q12): D6 managed-provider/session projection`.

## Task 8 — database + host projection key sets and initial invariants (RED → GREEN → commit)

Contract: "Database and host projections".

RED (unit + container): assert the database projection has exactly these keys:

```text
schema_version, run_id, server_version_num, session_user, current_database,
transaction_isolation, transaction_read_only, backend_pid,
connection_identity_sha256, capability_projection_sha256,
active_run_sha256, guard_projection_sha256, structural_catalog_sha256,
database_default_sha256, cron_jobs_sha256, active_cron_count,
global_pg_net_queue_count, prepared_xact_count,
session_inventory_sha256, session_observation_sha256, lock_projection_sha256
```

with `global_pg_net_queue_count` exactly zero in initial and final projections
(no Q12 subset / nonzero baseline), `prepared_xact_count` exactly zero, cron the
exact accepted eight-row baseline when committed and zero active Q12 jobs in
precommit. Assert the host projection has exactly these keys:

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

Assert `pg_stat_clear_snapshot()` + a complete fresh read precede `db_locked`,
`host_bound`, and `sealed`; any required null / missing row / duplicate /
cardinality change / hash drift is failure, never canonical data.

GREEN: implement both projection builders with strict key-set/order enforcement
and the pre-read snapshot-clear discipline.

Commit: `test(q12): RED D6 db/host projection key sets + invariants` then
`feat(q12): D6 database/host projection builders`.

## Task 9 — H/N classification evidence table (RED → GREEN → commit)

Contract: "Database and host projections" (evidence table) + "Classifications".

RED (unit): assert the host projection's five evidence fields obey the exact H/N
table for each classification, where `H` = one lowercase 64-hex SHA-256 over the
exact safely opened canonical bytes and `N` = JSON null with no file/path/hash
substitute:

- `precommit_rollback` / `prepared_guarded`: barrier_receipt=H(accepted
  `recovery_ready_guarded` barrier receipt), probe_receipt=H(bound probe
  receipt), activation_result=N, activation_process_projection=H(zero live
  activation processes/sessions), process_manifest=N;
- `committed_finish_forward` / `complete_receipt`: barrier_receipt=H(activated
  barrier receipt), probe_receipt=H(receipt-bound probe receipt),
  activation_result=H(accepted activation result),
  activation_process_projection=H(zero live), process_manifest=H(accepted
  activation process manifest);
- `committed_finish_forward` / `committed_receipt_pending`: barrier_receipt=H(
  predecessor `recovery_ready_guarded` barrier receipt, NOT an activated
  receipt), probe_receipt=H(that predecessor's bound probe receipt),
  activation_result=N, activation_process_projection=H(zero live),
  process_manifest=H(manifest proving the activation child exited and cannot
  recur);
- `drift_incident` / `incident_observed`: each of barrier_receipt / probe_receipt
  / activation_result / process_manifest = H iff the exact safe canonical object
  exists else N; activation_process_projection=H(complete observed projection
  incl. any live drift).

Assert for `incident_observed`, a present symlink / unsafe ancestor / wrong
owner-mode-type / identity swap / malformed object / unhashed bytes stops before
terminal-seal publication and records the already-authoritative lifecycle
incident without converting unsafe bytes to null; no validator chooses between H
and N. Assert `committed_receipt_pending` is legal only with the exact
predecessor `recovery_ready_guarded` receipt + exact process manifest + zero-live
projection; absence/mismatch → `drift_incident`, never broader reconstruction.

GREEN: implement an evidence-table validator that is a pure function of
(classification, safely-revalidated object presence) and refuses any H/N free
choice.

Commit: `test(q12): RED D6 H/N evidence table` then
`feat(q12): D6 evidence H/N validator`.

## Task 10 — pre-`R` writer ancestry + Docker 10+5 truth (RED → GREEN → commit)

Contract: "Exact pre-R writer ancestry and Docker truth".

RED (unit + fixture): assert pre-`R` D6 does NOT require or invent a rollback
`final-writer-manifest`; it binds the exact accepted `prepared_quiesced`
predecessor journal entry/checkpoint and its immutable
`writer_quiesce_manifest_sha256` ancestry, which must be the unique current
journal/checkpoint head and the exact ancestor required by the accepted phase
graph. Assert the prepared-quiesced inventory contains exactly: ten final
identities (new production + development), five held identities (old production),
fifteen total unique container IDs, all stopped,
`temporary_restart_policy={name:"no",maximum_retry_count:0}`. Assert `docker
inspect` verifies every exact ID (image/config/labels, stopped state, restart
`no`, no replacement); `docker compose ps --all --format json` is only a
completeness cross-check; any missing/duplicate/unrecorded target is drift.
Assert the post-`R` rollback final-writer manifest / retirement / rollback-state
publication are Task 9/`.13.13` outputs and cannot be D6 preconditions.

GREEN: implement predecessor binding + a Docker-observation projection using the
fixture runner (synthetic `docker inspect`/`compose ps` outputs) — no real Docker
mutation.

Commit: `test(q12): RED D6 writer ancestry + 10+5 Docker truth` then
`feat(q12): D6 writer-ancestry + Docker observation`.

## Task 11 — request schema + frame payloads + protocol sequence (RED → GREEN → commit)

Contract: "Canonical objects and frame envelope" (request), "Exact frame
payloads".

RED (unit): assert the request has exactly these keys:

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

with `previous_terminal_seal_sha256`/`abandoned_predecision_sha256` hash-or-null
per restart rules; the request's evidence state + five evidence fields obey the
H/N table and must equal the later host projection byte-for-byte (disagreement →
`drift_incident`); the request is only a bound input and does not itself
authorize its evidence state or classification. Assert each frame payload has
exactly the contract keys:

1. probe `db_locked`: `request_sha256, initial_database_projection_sha256,
   capability_projection_sha256, lock_projection_sha256, fd9_identity_sha256`;
2. Root `host_projection`: `request_sha256, initial_database_projection_sha256,
   host_projection_sha256, proposed_classification,
   prepared_quiesced_predecessor_sha256`;
3. probe `host_bound` (after snapshot clear + fresh read): `request_sha256,
   initial_database_projection_sha256, bound_database_projection_sha256,
   host_projection_sha256, session_observation_sha256, fd9_identity_sha256`;
4. Root predecision + exactly one of `predecision_precommit` /
   `predecision_finish_forward` / `abort_incident`, payload `request_sha256,
   predecision_sha256, classification, action, planned_r_journal_entry_hash,
   planned_r_checkpoint_sha256, predecessor_journal_entry_hash,
   predecessor_checkpoint_sha256` (both planned hashes non-null for precommit,
   null for finish-forward and incident); exact pairs
   `precommit_rollback/append_r_then_seal`,
   `committed_finish_forward/seal_finish_forward`,
   `drift_incident/abort_incident`;
5. probe `sealed` (after another snapshot clear + fresh read): `request_sha256,
   predecision_sha256, initial_database_projection_sha256,
   final_database_projection_sha256, host_projection_sha256,
   actual_r_journal_entry_hash, actual_r_checkpoint_sha256, fd9_identity_sha256`
   (actual `R` hashes equal planned for precommit, null otherwise);
6. Root `release`: `request_sha256, predecision_sha256, sealed_frame_sha256,
   actual_r_journal_entry_hash, actual_r_checkpoint_sha256,
   expected_transaction_end, expected_connection_close` (final two literals
   `read_only_commit` and `true`);
7. probe `closed` (after read-only commit + connection close): `request_sha256,
   predecision_sha256, sealed_frame_sha256, release_frame_sha256,
   actual_r_journal_entry_hash, actual_r_checkpoint_sha256, transaction_end,
   connection_closed, fd9_identity_sha256` with
   `transaction_end=read_only_commit`, `connection_closed=true`.

Assert any direction/sequence/schema/hash/EOF/timeout/pidfd/FD9/projection
mismatch is incident.

GREEN: implement request loading/validation and the frame payload builders +
protocol state machine (probe side) with strict schema/sequence/hash checks.

Commit: `test(q12): RED D6 request + frame payloads + protocol` then
`feat(q12): D6 request schema + protocol state machine`.

## Task 12 — production CLI negatives (RED → GREEN → commit)

Contract: "Fixed retained commands and production process", "Root spawn boundary"
(argv/env), "Secrets, observability and recovery limits".

RED (unit, no container): assert the probe's only accepted argv is exactly:

```text
/usr/bin/node /opt/megacampus/packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs inspect
```

— any extra/other argv is rejected; `NODE_OPTIONS` and inherited environment must
be absent; only fixed `PATH`, `LC_ALL=C.UTF-8`, `LANG=C.UTF-8`, and a fixed
non-writable `HOME` are accepted. Assert the probe validates required FD 3–7 and
9–11 identities/access modes and FD 9 lock identity before proceeding; it does
NOT claim every Node/libuv FD is inherited. Assert FD 3 is never hashed/logged.
Assert missing/extra argv, present `NODE_OPTIONS`, wrong env, or a missing/wrong
FD blocks with no partial DB work.

GREEN: implement argv/env/FD preflight in the probe CLI entrypoint before any
connection.

Commit: `test(q12): RED D6 production CLI/env/FD negatives` then
`feat(q12): D6 CLI argv/env/FD preflight`.

## Task 13 — probe runtime-created FD baseline (RED → GREEN → commit)

Contract: "Root spawn boundary, FDs and capability gates" (probe side).

RED (PG17 container + unit): assert the probe validates an approved
runtime-created FD baseline keyed by exact `/usr/bin/node` SHA-256, Node
major/minor, libuv version, and kernel generation, allowing only the pinned
anonymous epoll/eventfd/pipe descriptor classes and access modes; unknown
runtime-created descriptors fail; the baseline and spawn-capability result are
immutable request inputs; any failed capability blocks classification with no
test override.

GREEN: implement the runtime FD baseline check (read `/proc/self/fd` in the probe,
classify descriptor kinds, compare to the request baseline).

Commit: `test(q12): RED D6 runtime FD baseline` then
`feat(q12): D6 runtime FD baseline check`.

## Task 14 — fixture runner + full-run disposable PG17 scenarios (RED → GREEN → commit)

Contract: "Classifications", "Race closure and restart authority" (probe-visible
parts), "Required RED/capability and verification gates".

RED (PG17 container via `q12-activation-truth-runner.cjs`): drive end-to-end probe
runs against disposable PG17 + synthetic Root frames for each classification and
assert the probe emits the correct chained frames and evidence:

- `precommit_rollback`: `activation_evidence_state=prepared_guarded`,
  `activated=false`, all guard/ACL/catalog/default/cron/net/prepared/session/lock
  projections, exact readiness barrier/probe receipts, null activation
  result/process manifest, non-null exact zero-live-activation projection, exact
  prepared-quiesced ancestry, all 10 final + 5 held stopped/restart `no`, no
  drift; probe holds full `SHARE` + FD9 continuous while Root appends `R`;
- `committed_finish_forward`: `activated=true`, restored default, exact eight
  active cron rows, global net queue zero, retained internal guard + removed
  external guards, exact structural/managed-session/writer/process truth, and
  exactly one of `complete_receipt` (binds all five evidence hashes) or
  `committed_receipt_pending` (predecessor `recovery_ready_guarded`
  barrier/probe pair + clean-exit process manifest + zero-live projection, null
  activation result, no activated receipt);
- `drift_incident`: null visibility, missing privilege, unknown provider
  identity, prepared transaction, live activation process/session, W digest
  mismatch, writer drift, queue nonzero, projection drift, or activated truth
  after `R`.

Also assert: READ ONLY `SHARE`, complete locks, normal/recovery conflict
ordering, wait-winner visibility, and disconnect invalidation (from Tasks 5–6);
managed inventory positives + unknown/background/application/state/xact null
negatives (Task 7); 10+5 Docker inventory + global net queue zero (Task 10).

GREEN: complete the probe `inspect` main flow wiring Tasks 1–13 into the full
`db_locked → host_bound → sealed → closed` protocol against the disposable PG17,
and author `q12-activation-truth-runner.cjs` to stand in for Root frames.

Commit: `test(q12): RED D6 full-run classification scenarios (PG17)` then
`feat(q12): D6 probe inspect main flow`.

---

# Stream 2 — Root coordinator

Exclusive write zone:

- modify `deploy/qdrant/q12-lifecycle-core.py`
- modify `packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts`
  **only** to prove unchanged five-command bytes/hashes
- modify `packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts`
  **only** to prove unchanged five-command bytes/hashes

Verification for the stream: spawn/pidfd/FD/OFD, protocol, crash, and authority
tests.

## Task 15 — retained-command immutability proof (RED → GREEN → commit)

Contract: "Fixed retained commands and production process", Global Constraint 4.

RED: in `q12-command-manifest.test.ts` and `q12-live-cutover.test.ts`, add
assertions that the command manifest is byte-for-byte the five entries
(`barrier.install`, `barrier.verify-after-base`,
`barrier.verify-after-observability`, `barrier.prepare-recovery`,
`barrier.activate`), its SHA-256 equals
`af9b21cb9bebfd0d48a213ceba76c6bf92eb3f6f758fafa3b2c8fef8c353c92b` (or the exact
accepted integration successor from the W tuple), shorthand IDs are rejected, and
no sixth command / systemd unit / cron job / Compose service / operator argv is
introduced by the D6 changes. These edits ONLY prove immutability; they do not
add a command.

GREEN: no manifest change (the point is unchanged bytes). If the assertions fail,
the D6 Root changes are wrong — fix them, never the manifest.

Commit: `test(q12): prove five retained commands/hashes unchanged under D6`.

## Task 16 — `posix_spawn` boundary + FD map/close-from (RED → GREEN → commit)

Contract: "Root spawn boundary, FDs and capability gates".

RED (Python-driven test via the coordinator + a capability probe): assert Root
owns descriptor closure/mapping via `posix_spawn` with ordered file actions:

1. open/map fixed 0, 1, 2;
2. `dup2` each already-validated source descriptor to 3–7 and 9–11;
3. close the source duplicate after each map;
4. explicitly close FD 8 and apply close-from immediately above 11 before exec;
5. exec the exact fixed Node argv + environment.

Assert the FD contract table exactly:

```text
0  /dev/null, read-only
1  Root-captured audit pipe, write-only
2  Root-captured error pipe, write-only
3  Root-opened /opt/megacampus/secrets/supabase_db_url (owner claude-deploy:claude-deploy, mode 0400|0600), read-only
4  Root-opened /opt/megacampus/secrets/prod-ca-2021.crt (owner claude-deploy:claude-deploy, mode 0644), read-only
5  immutable D6 request, read-only
6  Root-to-probe control pipe, read-only
7  probe-to-Root frame pipe, write-only
8  closed/reserved, never journal
9  canonical cutover lock and inherited exclusive OFD/flock
10 immutable accepted catalog bundle, read-only
11 exact accepted D6 SQL projection, read-only
```

Assert Root opens each accepted source with `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`,
checks owner/mode/type/canonical path + device/inode identity before and after
open/read, then maps to FD 3/4; the password is decoded only from FD 3. Assert a
RED capability test proves the mapping/closure under descriptor pressure; the
mechanism is accepted only if the pinned server Python/libc exposes an atomic
`POSIX_SPAWN_CLOSEFROM` file action (a pinned-server capability gate — stays
behind the remote gate). Assert NO silent fallback to `preexec_fn` / threaded
fork child / shell / inherited broad `pass_fds` / broker; unavailability is an
engineering capability blocker, not an owner choice.

GREEN: implement the `posix_spawn` file-action sequence and secret-file
open/revalidation in `q12-lifecycle-core.py`. Use synthetic secret files with the
correct owner/mode in local tests; the real-server `POSIX_SPAWN_CLOSEFROM`
availability remains a remote gate this plan cannot satisfy.

Commit: `test(q12): RED D6 posix_spawn FD map/close-from under pressure` then
`feat(q12): D6 Root posix_spawn boundary + secret revalidation`.

## Task 17 — pidfd / ptrace / proc / OFD capability gates (RED → GREEN → commit)

Contract: "Root spawn boundary, FDs and capability gates" (pidfd block),
"Required RED/capability and verification gates".

RED: assert Root opens a pidfd immediately and, before accepting frames, proves on
the target:

- `pidfd_open` and `pidfd_getfd` succeed under the actual
  `PTRACE_MODE_ATTACH_REALCREDS` / Yama policy;
- child FD 9 refers to the same open-file description and preserves contention
  (OFD/flock);
- required FD targets, modes, and inode identities match;
- `/proc/<pid>/stat` start-time, `/proc/<pid>/exe`, boot-id, and pidfd identity
  remain continuous;
- the close-from spawn test leaves no inherited parent descriptor above 11.

Assert each gate is mandatory (contract: "pidfd/ptrace/proc/OFD capabilities are
mandatory RED gates"); any failed capability blocks classification with no test
override. Assert local capability tests run read-only; the pinned-server checks
stay behind the later remote observation gate.

GREEN: implement pidfd open + `pidfd_getfd`, FD-9 OFD contention verification,
`/proc` identity continuity, and the close-from no-leak check in the coordinator.

Commit: `test(q12): RED D6 pidfd/ptrace/proc/OFD gates` then
`feat(q12): D6 Root pidfd + proc identity gates`.

## Task 18 — Root protocol, predecision, optional `R`, terminal seal (RED → GREEN → commit)

Contract: "Predecision, optional R and terminal seal", "Exact frame payloads"
(Root side), "Classifications".

RED: assert Root drives `host_projection → predecision → release` correctly and:

- predecision has exactly the keys `schema_version, run_id, lease_epoch,
  request_sha256, classification, action, initial_database_projection_sha256,
  bound_database_projection_sha256, host_projection_sha256,
  transcript_head_before_predecision_sha256, predecessor_journal_entry_hash,
  predecessor_checkpoint_sha256, planned_r_journal_entry_hash,
  planned_r_checkpoint_sha256, previous_terminal_seal_sha256,
  abandoned_predecision_sha256`, is atomically published/fsynced before optional
  `R`, and is never finish-forward/rollback/retirement/recovery/operator
  authority by itself;
- terminal seal has exactly the contract keys (`schema_version, run_id,
  lease_epoch, outcome, request_sha256, predecision_sha256,
  final_transcript_head_sha256, initial_database_projection_sha256,
  final_database_projection_sha256, host_projection_sha256,
  activation_evidence_state, actual_r_journal_entry_hash,
  actual_r_checkpoint_sha256, probe_pidfd_identity_sha256, fd9_identity_sha256,
  spawn_capability_sha256, prepared_quiesced_predecessor_sha256,
  writer_quiesce_manifest_sha256, barrier_receipt_sha256, probe_receipt_sha256,
  activation_result_sha256, activation_process_projection_sha256,
  process_manifest_sha256, probe_exit_status, transaction_end,
  connection_closed`), is published only after exact `closed`, clean probe exit,
  final transcript fsync, and continuity verification, and binds
  `probe_exit_status=0`, `transaction_end=read_only_commit`,
  `connection_closed=true`;
- the three outcome literals map exactly (`precommit_rollback_sealed` /
  `committed_finish_forward_sealed` / `drift_incident_sealed`) with the required
  predecision equality, `activation_evidence_state`, actual-`R` nullability, and
  sole authority from the contract's outcome table; no other literal/pairing/
  evidence/authority exists;
- immutable objects are stored under the existing run-owned `0700` directory as
  `activation-truth-request-<lease_epoch>.json`,
  `activation-truth-transcript-<lease_epoch>.jsonl`,
  `activation-truth-predecision-<lease_epoch>.json`,
  `activation-truth-terminal-seal-<lease_epoch>.json`; request/predecision/seal
  are mode `0400` after atomic rename + file and directory fsync; the append-only
  transcript is mode `0600` and fsynced before the terminal seal;
- the authority graph is acyclic and only a validated terminal seal authorizes
  finish-forward or post-`R` Task 9 retirement; a durable `R` without a terminal
  seal is incident-only.

GREEN: implement predecision/seal object construction, atomic publish + fsync +
mode discipline, and the outcome-table authority in the coordinator.

Commit: `test(q12): RED D6 predecision/optional-R/terminal-seal authority` then
`feat(q12): D6 Root predecision + terminal seal`.

## Task 19 — D5 post-`R` narrowing + race closure + restart authority (RED → GREEN → commit)

Contract: "Sole normative narrowing of accepted D5 after `R`", "Race closure and
restart authority".

RED: assert the sole D5 narrowing after `R` exactly:

- retained-command launcher/child stay stopped before `R` and have no post-`R`
  role (cannot commit, execute a child, append a row, or publish an object);
- every mutation-capable DB transaction/session, other child/descendant,
  rollback/resource mutation, final-writer object/intent, capability, and
  lifecycle journal row other than the already-precomputed `R` are forbidden
  between `R` and complete frontier retirement;
- the sole exception is the D6 probe Root spawned and proved continuous before
  `R`: no spawn/exec API or child, cannot open a mutation-capable connection,
  cannot issue SQL outside FD 11, cannot write DB (PostgreSQL enforces
  `READ COMMITTED READ ONLY`), cannot write journal/checkpoints/rollback/
  capabilities/receipts/final-writer;
- after `R` the probe may only emit `sealed`, receive `release`, issue `COMMIT`
  solely to end the read-only transaction + release `SHARE` locks, close the
  connection, emit `closed`, and exit; this read-only `COMMIT` cannot write and
  is the sole post-`R` transaction-end;
- Root may only append/fsync the already-open D6 transcript and atomically
  publish/fsync the matching D6 terminal seal (the sole post-`R` host
  publications before retirement; not journal rows/rollback/capabilities/
  receipts/final-writer);
- Root then proves probe exit via the same pidfd, closes frame/control/audit/
  error pipes and every spawn-only Root duplicate of FDs 3–7 and 10–11, proves no
  surviving process/socket, and only then permits Task 9 to retire the frontier;
  child exit closes its FD 9 mapping while Root retains the original canonical
  cutover-lock descriptor continuously; no new post-`R` DB child/session is
  opened merely to observe closure;
- timeout / signal / disconnect / failed read-only commit / failed close /
  malformed-absent `closed` / nonzero exit / surviving process-session-FD /
  transcript failure / seal-publication failure makes the durable `R`
  incident-only and never relaxes the D5 stop.

Assert race closure: for precommit the probe keeps full `SHARE` + FD9 while Root
publishes predecision, appends exactly the precomputed `R` + checkpoint, fsyncs,
obtains fresh `sealed`, releases, receives `closed`, observes clean exit, fsyncs
transcript, publishes terminal seal — no W-bound activation path can pass its
common incompatible lock during this interval. Assert restart authority: validate
the unique journal/checkpoint head + scan immutable D6 epochs in numeric lease
order; validate every request/predecision/transcript/seal hash chain +
`previous_terminal_seal_sha256` lineage; select only the unique terminal-seal
chain tip whose predecessor or actual `R` matches the current canonical head;
multiple tips / forks / reused epochs / stale-head authority / unbound files are
incident. Assert the exact crash rules (predecision-without-`R` continuation only
while original transaction/pidfd/FD9/transcript/Root process are continuous;
durable `R` without valid seal is incident-only; terminal seal without `R` is
finish-forward authority only when committed + unique chain tip; terminal seal
with exact `R` authorizes only Task 9 retirement; incident seal authorizes no
mutation).

GREEN: implement the post-`R` narrowed sequence, precommit race hold, FD/process
retirement handoff to Task 9, and restart authority selection in the coordinator.

Commit: `test(q12): RED D6 D5 post-R narrowing + race + restart authority` then
`feat(q12): D6 Root post-R closure + restart authority`.

---

# Stream 3 — D6 integration (later task; scaffold only here)

Exclusive write zone (create):

- `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md`
- integration-only conflict resolution + accepted docs/handoff/Beads updates

The five-command JSON manifest is never a write zone. `.13.13` Task 9 may
begin/rebase only after D6 is independently accepted, integrated, pushed, and
`.13.19` closed; it must not run concurrently against shared lifecycle/tests.

## Task 20 — final verification gates + artifact + reviews

Contract: "Required RED/capability and verification gates".

Run, in order, and record evidence in the artifact:

1. Confirm every RED gate above passes on disposable local PG17 + synthetic
   fixtures: endpoint/TLS/post-connect negatives; missing strong privilege /
   missing visibility / restricted null / failed snapshot clear blocks; PG17
   READ ONLY `SHARE` + complete locks + normal/recovery conflict ordering +
   wait-winner visibility + disconnect invalidation; managed inventory positives
   + null/unknown negatives; 10+5 Docker inventory + global net queue zero;
   `posix_spawn` close-from/mapping under descriptor pressure (local; server side
   flagged as remote gate); `pidfd_open`/`pidfd_getfd`/ptrace-Yama/proc identity/
   FD9 OFD contention (local; server side flagged as remote gate); every
   frame/payload/hash + predecision/optional-R/transcript/seal frontier +
   authority fork/restart negative; durable-`R`-without-seal incident-only +
   predecision-alone never finish-forward; five retained commands/hashes
   unchanged.
2. Run the focused suites:

   ```bash
   cd /home/me/code/mc2
   MC2_Q12_REAL_PG17=1 pnpm --filter @megacampus/course-gen-platform test -- q12-activation-truth
   MC2_Q12_REAL_PG17=1 pnpm --filter @megacampus/course-gen-platform test -- q12-command-manifest q12-live-cutover
   ```

3. Run repo gates:

   ```bash
   cd /home/me/code/mc2
   pnpm type-check
   pnpm build
   scripts/orchestration/run_process_verification.sh
   ```

4. Author the tracked artifact
   `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md` and validate it
   with `scripts/orchestration/validate_artifact.py`.
5. Obtain independent correctness review
   (`superpowers:requesting-code-review` / correctness reviewer) and independent
   `docs_reviewer` acceptance. Record `docs-reviewed` and `graph-reviewed`
   outcomes.
6. Only after all gates + both reviews pass: integration commit/push per repo
   delivery contract. Note (contract "Secrets…" + Global Constraint 1): the
   pinned-server capability observations and any Supabase/service/container/
   Qdrant/live action remain behind a separate current-task remote gate; this
   plan does not accept the probe for live use.

Verification: all commands above exit 0; artifact validates; both reviews accept;
five-command immutability proven; no file outside the ownership table changed.

---

## Task-to-contract coverage map

| Contract normative section | Task(s) |
|---|---|
| Sole normative narrowing of D5 after `R` | 19 |
| Immutable database and TLS identity | 3 |
| Required read-only capability projection | 4 |
| Accepted W dependency + common-lock proof | 0, 6 |
| Fixed retained commands + production process | 12, 15 |
| Root spawn boundary, FDs, capability gates | 16, 17 (probe FDs: 12, 13) |
| Database transaction, lock and SQL allowlist | 2, 5 |
| Exact managed-provider and session projection | 7 |
| Database and host projections | 8, 9 |
| Exact pre-`R` writer ancestry and Docker truth | 10 |
| Canonical objects and frame envelope | 1, 11 |
| Exact frame payloads | 11 (probe), 18 (Root) |
| Predecision, optional R and terminal seal | 18 |
| Classifications | 9, 14 |
| Race closure and restart authority | 19 |
| Disjoint implementation ownership | streams 1/2/3 write zones |
| Required RED/capability and verification gates | every RED step + 20 |
| Secrets, observability and recovery limits | Global Constraints 1–2, 7; 12; 20 |
| First-party references | Tech stack |
| Owner question + authority separation | Global Constraints 1, 3; 20 |
| Explicit defers | Task 0; Global Constraint 3 |

## Self-review checklist (run before declaring the plan done)

- Every normative contract section maps to at least one task (table above).
- No `TBD`/`TODO`/"add validation" placeholders: the only deferred values are the
  contract-mandated W tuple inputs, gated by Task 0 and copied verbatim at
  execution time.
- Field/key names and orders are transcribed from the contract, not invented.
- RED precedes GREEN in every implementation task; commits are named.
- No task writes outside its stream's exclusive ownership zone.
- No live/remote action; pinned-server capability checks are explicitly flagged
  as remote gates this plan cannot satisfy.
