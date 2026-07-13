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
the readiness state before recovery, and same-invocation writer restoration.
Every other base-design invariant remains in force.

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
  state bound to the same run, immutable writer manifest, catalog, and recovery
  journal;
- prove all ten exact writer containers remain stopped with restart policy
  `no`;
- leave the immutable prior-state inventory sufficient for a later exact
  restore; and
- exit successfully without starting any writer.

Failure, signal, or crash at any stop or recovery boundary has the same
fail-closed outcome: all exact writers stopped, restart policy `no`, no later
writer class started, and no success receipt fabricated by a child process.

## 4. Separate writer-only resume

Add an explicit `resume-writers-only` operation to the writer controller. It is
called only by the same sole supervisor after that supervisor has proved the
exact `guard_cleanup_complete` receipt and zero guard residue.

The operation consumes:

- the fixed Q12 run identity and controller-owned run root;
- the immutable writer-quiesce manifest and durable
  `recovery_complete_writers_quiesced` state;
- the exact `guard_cleanup_complete` database-barrier receipt; and
- the inherited, already-held supervisor lease descriptor bound to the
  canonical cutover lock.

It MUST NOT accept or require a database URL, CA, database capability, recovery
plan input, source upload roots, or any permission to run recovery/reindex. The
database capability is expected to have been deleted by cleanup.

The operation revalidates file identity, owner/mode, hashes, run/catalog
bindings, the inherited lock lease, and the current all-stopped/restart-`no`
state. It starts only containers recorded as previously running, in this exact
class order: workers, API, Web. Each class is fully running and healthy before
the next class starts. Only after all starts verify may exact prior restart
policies be restored and the final exact state be verified.

Any error or signal compensates back to all ten stopped with restart policy
`no`. Failure to prove that compensation is a hard terminal error and never a
partial success. A completed resume publishes a durable terminal receipt; a
retry must verify terminal truth and be idempotent.

## 5. Frozen lifecycle

The corrected order is:

1. install the atomic database/writer barrier;
2. create and verify the server-local backup and isolated restore drill;
3. run migrations under the same barrier and verify the final catalog;
4. run `prepare-recovery` and obtain `recovery_ready_guarded`;
5. run source recovery and reindex while all writers remain stopped;
6. complete handoff, smoke, and required guarded observation;
7. run final `activate`;
8. run cleanup and prove `guard_cleanup_complete` with zero residue;
9. run `resume-writers-only` under the same inherited supervisor lease; and
10. observe the restored exact writer state.

No source/reindex capability may be issued before step 4 or after step 7. No
writer may start before step 9. The supervisor journal must recover every
COMMIT-to-receipt and receipt-to-next-command crash window without inferring
success from process exit alone.

## 6. Verification contract

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
  mismatch, receipt mismatch, start/health/policy failures, class order, no
  early start, compensation, and no DB capability in resume-only mode.
- Root supervisor tests cover the corrected frozen order and every
  COMMIT-to-receipt recovery edge.
- No local test may contact or mutate the server, hosted Supabase, GHCR,
  Qdrant Cloud, staging, or production.

## Consulted primary sources

- PostgreSQL 17 event triggers, event-trigger firing matrix, transaction
  defaults, explicit transaction modes, signaling functions, and background
  workers: `https://www.postgresql.org/docs/17/`
- Supabase hosted event triggers and Supautils privileged-role behavior:
  `https://supabase.com/docs/guides/database/postgres/event-triggers` and
  `https://github.com/supabase/supautils`
- PostgREST 12 transaction access mode and rollback preference:
  `https://docs.postgrest.org/en/v12/references/transactions.html`
