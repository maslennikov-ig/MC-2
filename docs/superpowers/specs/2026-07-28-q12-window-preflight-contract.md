# Q12 window pre-flight — contract

**Status:** proposed, 2026-07-28
**Owner bead:** `mc2-ot8se`
**Blocks:** `mc2-i9h3y` (owner-gated live window C1..C10)

## Problem

Nine window attempts produced nine defects, every one of the same class: **the environment the code
was verified in is more permissive than the one it runs in.** Local fixtures give the test role
superuser rights and ownership of every object, and connect straight to a container; production is a
_managed_ PostgreSQL where the role owns almost nothing, the connection crosses the Supavisor pooler,
managed admin backends are live, and dev deploys mutate the same host and database every 15-25
minutes.

The defects are not the expensive part. **Discovery is.** The window fails closed at the first
violation — correct behaviour — so each attempt yields exactly one finding, and an attempt costs an
asset reinstall, a fresh run root, and (after attempt #9) a manual production restore. Nine
expensive attempts, nine findings.

This contract moves discovery off the attempt path: one read-only probe that asserts **every**
environmental precondition the window depends on, before anything is opened, and that can be re-run
as often as wanted at no risk.

## Non-goals

- It does not replace any in-window gate. Every existing fail-closed check stays exactly as it is.
- It is **not** one of the 20 frozen manifest commands, so `aaec6fc2…` does not move (same standing
  as the D6 activation-truth probe).
- It does not open, hold, or advance a window, and never touches a capability.

## Hard invariants

1. **Read-only, structurally.** Every database statement runs inside `BEGIN READ ONLY`, and each
   transaction asserts `current_setting('transaction_read_only') = 'on'` before doing anything else.
   The probe never issues DDL, never writes a row, never calls a function that could.
2. **Through the pooler, never around it.** The probe connects with the same pooled DSN the barrier
   uses. Connecting directly to the database host is forbidden: bypassing the pooler is exactly what
   hid the `options` defect.
3. **No silent skips.** Every probe in the frozen probe list appears in the report with a verdict.
   A probe that cannot run reports `unprovable` with a reason — it is never omitted.
4. **Fail-closed exit.** Exit `0` only when every probe is `pass`, or `unprovable` **with** a named
   evidence pointer. Any `fail`, or any `unprovable` without evidence, exits non-zero and names the
   first offender.
5. **Re-runnable and cheap.** No state, no locks, no run-id consumption. Safe to run during normal
   operation.
6. **Freshness.** The report carries the UTC timestamp of the run and the git sha of the tree it ran
   from. A report older than the current window attempt is not evidence for it — the probe is run
   _immediately_ before the window, every time, not once.

## Verdict vocabulary

| Verdict      | Meaning                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass`       | asserted true against the live environment, by measurement                                                                                  |
| `fail`       | asserted false — the window must not open                                                                                                   |
| `unprovable` | cannot be established read-only; MUST carry `evidence` naming what proves it instead (e.g. a prior run's receipt), else it counts as `fail` |

`unprovable` exists so the report never shows a green that was not measured. Attempt #9 already
proved the whole install path against production; those facts are legitimate `unprovable` +
`evidence` entries, not assumed passes.

## Entry point

`deploy/qdrant/q12-window-preflight.py`

```
q12-window-preflight.py --scope {host,database,all}
                        [--run-root <abs path>]     # required for scope database/all
                        [--report-dir <abs path>]   # default: <run-root>, else /tmp
                        [--expected-tree-sha <git sha>]  # for host probe H2
```

Output: one canonical JSON report `q12-window-preflight-<utc>.json`, mode `0400`, plus a human
summary on stdout (one line per probe: `id  verdict  detail`).

Report shape (`megacampus.q12.window-preflight/v1`):

```json
{
  "schema_version": "megacampus.q12.window-preflight/v1",
  "captured_at": "2026-07-28T12:00:00Z",
  "tree_sha": "<git rev-parse HEAD>",
  "scope": "all",
  "run_root": "/opt/megacampus/backups/q12/<uuid>",
  "probes": [{ "id": "A2", "verdict": "pass", "detail": "...", "evidence": null }],
  "summary": { "pass": 0, "fail": 0, "unprovable": 0 }
}
```

## Probe list (frozen)

### Group A — privilege reachability on the guarded set

The C1 wall. `cron.job` (attempt #6/#7) and the auth/storage ownership split (`mc2-ipwyc`) both live
here. Relations come from the run root's own `expected-post-migration-catalog.json`.

| id  | Assertion                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Every guarded relation still exists with the identity the plan captured: schema, name, `relkind`, owner, parent. Any drift is a `fail` naming the relation.                                                             |
| A2  | For each: `has_table_privilege(current_user, oid, 'UPDATE'/'DELETE'/'TRUNCATE'/'MAINTAIN')` holds for at least one — the requirement for `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`.                                     |
| A3  | For each: `has_table_privilege(current_user, oid, 'TRIGGER')` — the requirement for `CREATE TRIGGER`.                                                                                                                   |
| A4  | No relation in the set is in schema `cron` (the `mc2-34eua` contract).                                                                                                                                                  |
| A5  | Teardown reachability: `has_database_privilege(current_user, 'CREATE')` (we will own `q12_guard`, and disarm is `DROP FUNCTION … CASCADE` on a function we own), and no pre-existing `q12_guard` owned by another role. |
| A6  | `net.http_request_queue` carries `TRIGGER` for `current_user` — the retained cron guard depends on it.                                                                                                                  |
| A7  | The count is exactly the number the plan captured (75 today) and matches the barrier's frozen expectation.                                                                                                              |

### Group B — the pooled session

The `mc2-ipwyc` wall. These are the only probes that must open more than one connection.

| id  | Assertion                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | Startup `options` delivery, measured: connect with `-c default_transaction_read_only=on` and record whether it arrived. The contract is that the code does **not** depend on it; the probe records the observed truth and `fail`s only if a runner is found that still relies on it. |
| B2  | A session-level `SET` persists across statements on the same connection — i.e. the DSN is session-mode, not transaction-mode pooling. If this ever flips, every explicit `SET` in the barrier stops working.                                                                         |
| B3  | `application_name` reaches `pg_stat_activity` unmodified. The barrier's quiesce allowlist and the terminal proof's `barrier_era_session_count` both match on `megacampus-q12-%`.                                                                                                     |
| B4  | `pg_database.datdba` for `postgres` is `current_user` — the read-only proxy for "`ALTER DATABASE … SET/RESET default_transaction_read_only` will be permitted".                                                                                                                      |

### Group C — the path that has never run

Everything past C9 has never executed against anything production-like. This group is deliberately
explicit about what it can and cannot prove.

| id  | Assertion                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `has_function_privilege(current_user, 'cron.alter_job(bigint, …)', 'EXECUTE')` — the retained cron pause.                                                          |
| C2  | The cron job set matches the plan's baseline: count, ids, active flags, and a hash of the commands.                                                                |
| C3  | `net.http_request_queue` is empty.                                                                                                                                 |
| C4  | No `q12_guard` residue: zero schemas, triggers, event triggers, functions.                                                                                         |
| C5  | Event-trigger creation cannot be probed read-only → `unprovable`, `evidence: "attempt #9 installed q12_guard_ddl_command_start against production on 2026-07-28"`. |
| C6  | `pg_get_functiondef` / `pg_get_triggerdef` round-trip fidelity → `unprovable` on production, `evidence:` the gated real-PG17 suite `q12-guard-trigger-ownership`.  |

### Group D — catalog agreement

The `mc2-2rzf6` wall.

| id  | Assertion                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The structural catalog hash, computed **in the barrier's own session context** (`SET LOCAL search_path=pg_catalog`), equals the run root's `baseline_structural_sha256`. A mismatch is deterministic, not drift. |

### Group E — quiesce feasibility

| id  | Assertion                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Enumerate current client backends and flag anything `quiesce_client_backends()` would refuse: a `supabase_admin` backend that is not exactly idle (no `xact_start`, no `backend_xid`, no `backend_xmin`), or a backend owned by a reserved role. A snapshot cannot exclude a race, so the verdict names the observed set and the probe is re-run immediately before the window. |
| E2  | No `megacampus-q12-%` session exists other than the probe's own — a regression assertion for `mc2-6fnrt`: nothing of ours may be alive across `barrier.install`.                                                                                                                                                                                                                |

### Group F — host

No database access. Runnable at any time, including from CI.

| id  | Assertion                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | All five digest-pinned images are present locally (`mc2-y5tgw`), and the local hold tags `q12-window-hold/*:pinned` exist so a dev deploy's `docker image prune -f` cannot remove them.                                                                                                                            |
| H2  | The deployed Q12 tree is byte-equal to `--expected-tree-sha` for every file in the tracked asset manifest. **The manifest becomes a tracked artifact** (`deploy/qdrant/q12-deployed-asset-manifest.json`, path + mode + owner + sha256) — today this comparison is done by hand, which is itself a defect surface. |
| H3  | No controller process is already running (matched on argv, not on a pattern that can match the probe's own command line).                                                                                                                                                                                          |
| H4  | No deploy workflow is in flight (`gh run list`), and the dev-deploy cadence is paused for the window.                                                                                                                                                                                                              |
| H5  | Free disk space exceeds the backup generation's measured high-water mark.                                                                                                                                                                                                                                          |

## Success criterion

`q12-window-preflight.py --scope all --run-root <fresh root>` exits `0`, and its report is attached
to the window attempt as evidence. Any `fail` becomes a tracked bead and is fixed before the window
opens.
