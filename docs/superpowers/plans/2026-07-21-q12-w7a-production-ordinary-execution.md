# Q12 W7a — Production Ordinary-Execution Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the deployed Q12 cutover controller so a production `live`/`recover` run **really executes** the data-movement + app-deploy ordinary commands (`writers.quiesce`, `pg.backup`, `pg.restore`, `migration.*`, `source.forward`, `reindex.*`, `deploy.prepare/commit`) against real infra — closing the "IN-WINDOW-only residual" (`mc2-v68w6` W5 close reason) that today makes `run_live` a real-barrier + real-snapshot + **fixture-projected ordinary** twin.

**Architecture:** The R4 seam already exists: `Engine.append_ordinary_lifecycle` (`deploy/qdrant/q12-lifecycle-core.py:2494`) delegates to `executor.execute_ordinary(command, capability)` when present, else falls back to the hardcoded fixture projection. `command = resolved_command(manifest, id, request, values)` (`:2461`) already carries the **real** argv/env on the production path because W2/W3 (`mc2-j58wi`/`mc2-58tnx`, CLOSED) resolve real staged values. The **only** missing piece for real execution is that the production executor `OwnerCustodyExecutor` (`:1303`, extends `ProductionExecutor`) has **no** `execute_ordinary`. `ProductionExecutor.execute` (`:1151`) already shells `command["argv"]` with `command["env"]`, checks exit 0, and returns the exact `RESULT_KEYS` dict (`capability_sha256 = sha256(complete_object(capability))`, matching the `!= digest` gate at `:2497`). So the core wiring is a per-command real-execution `execute_ordinary` that reuses that shelling, plus per-command prerequisite/ordering/idempotency handling.

**Tech Stack:** Python 3.13 controller; bash command scripts (`backup-supabase.sh`, `restore-supabase-drill.sh`, `source-recovery-run.sh`, `deploy_blue_green.sh --q12-mode`, `operator-compose.sh`); pnpm migration CLIs; disposable `postgres:17.10` containers; self-hosted Qdrant 1.18.2; vitest (`MC2_Q12_REAL_PG17=1` gate).

## Global Constraints

- **Frozen manifest sha `aaec6fc25a6996fa…` MUST NOT change** (`deploy/qdrant/q12-command-manifest.json`). No new command, no argv edit. HARD STOP if it changes.
- **Parity neutrality:** the `execute_ordinary` result is side-file only — it MUST NOT feed the journal, a capability digest, a checkpoint, or `accepted_object_sha256` (`:2488-2493`). The fixture parity path (`run_joined_composer` / `NoIoExecutor` with no `execute_ordinary`) MUST stay byte-identical. Never mutate `derive_joined_fixture_values` or the composer oracle.
- **Fail-closed:** any real child non-zero exit → `LifecycleError` (as `ProductionExecutor.execute` already does). No silent success.
- **Secrets path-only:** DSN/CA/capability by absolute path (`/opt/megacampus/secrets/*`), never printed; owner-only modes preserved.
- **No prod mutation during development.** TDD runs against disposable `postgres:17.10` + a disposable/dev Qdrant only. The owner-gated prod window (W7b) is out of this plan's scope.
- **TDD:** every behavior change starts with a failing `MC2_Q12_REAL_PG17`-gated test. Watch it fail first.

## File Structure

- `deploy/qdrant/q12-lifecycle-core.py` — add `OwnerCustodyExecutor.execute_ordinary` (+ any per-command helper). This is the ONLY production file changed.
- `packages/course-gen-platform/tests/unit/ops/q12-production-ordinary-execution.test.ts` (NEW) — `MC2_Q12_REAL_PG17`-gated tests driving the production executor against disposable infra.
- `packages/course-gen-platform/tests/unit/ops/fixtures/q12-production-ordinary-runner.py` (NEW) — harness that instantiates the real `OwnerCustodyExecutor` (or a thin disposable-infra subclass that only redirects target endpoints, not execution logic) and asserts each command really ran.
- Reference (do not modify): `tests/unit/ops/fixtures/q12-live-real-full-window-runner.py` (its `execute_ordinary` really runs only the 2 migrations — the pattern to generalize).

## Command → real script map (from frozen manifest, verified)

| command_id                                  | argv[0]                                                         | real effect                    | isolation for rehearsal         |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ------------------------------- |
| `writers.quiesce`                           | `source-recovery-run.sh --operation quiesce-writers-only`       | pause writer fleet (FD9 lease) | dev writer set                  |
| `pg.backup`                                 | `backup-supabase.sh --q12-run-id --snapshot <exported-id>`      | snapshot-bound source dump     | source **read-only**            |
| `pg.restore`                                | `restore-supabase-drill.sh --generation <immutable-generation>` | isolated labeled restore       | disposable container            |
| `migration.base.apply`                      | `pnpm … migration:document-evidence-approved:apply`             | apply migration                | disposable/dev target           |
| `migration.observability.apply`             | `pnpm … migration:document-evidence-observability:apply`        | apply migration                | disposable/dev target           |
| `source.forward`                            | `source-recovery-run.sh --operation forward`                    | 42-copy recovery → Qdrant      | **dev Qdrant** (isolated write) |
| `reindex.plan/worker.create/execute/verify` | `operator-compose.sh …`                                         | reindex behind alias           | dev Qdrant (isolated)           |
| `deploy.prepare`                            | `deploy_blue_green.sh --q12-mode prepare-quiesced`              | prepare app color              | dev app color                   |
| `deploy.commit`                             | `deploy_blue_green.sh --q12-mode commit-quiesced`               | commit app color               | dev app color                   |

## Increments (each ends TDD-green against `MC2_Q12_REAL_PG17=1`)

### Increment 1 — production `execute_ordinary` skeleton + migrations real

Add `OwnerCustodyExecutor.execute_ordinary(command, capability)` that delegates to the inherited `ProductionExecutor.execute` (real shell of `command["argv"]`). First proof: the 2 `migration.*` commands really apply on a disposable restore and the result binds `capability_sha256 == digest`; journal byte-parity vs composer preserved. Fail-closed on non-zero exit.

- [ ] Failing test: production executor drives `migration.base.apply` against a disposable `postgres:17.10`; assert the migration row exists in the restored catalog and journal parity holds. Run — watch it fail (no `execute_ordinary` on prod executor).
- [ ] Implement minimal `execute_ordinary` = `return self.execute(command, capability)`.
- [ ] Green; then assert the fixture composer path is still byte-identical (parity neutrality).

### Increment 2 — `pg.backup` / `pg.restore` against the held snapshot

Verify the snapshot coordinator (W3) has opened the real `<exported-id>` before `pg.backup` runs (resolver `on_snapshot_open`), and `pg.backup` uses `--snapshot <exported-id>`; `pg.restore` consumes the printed `<immutable-generation>` (resolver `on_pg_backup_done`).

- [ ] Failing test: driving `pg.backup` then `pg.restore` on disposable PG17 produces a labeled restore container and a generation dir; assert values reach the resolver.
- [ ] Implement any per-command env/cwd needed (reuse `_source_service_env`); green.

### Increment 3 — `source.forward` + `reindex.*` against disposable Qdrant

`source.forward` runs the `.13.4.1` recovery (`--recovery-run-id`) writing into a disposable Qdrant behind the alias; `reindex.*` run `operator-compose.sh` (needs operator profile up + `SOURCE_RECOVERY_*` env). Resolver `on_source_forward_accepted` reads `manifest.json` sha + coverage.

- [ ] Failing test: `source.forward` populates `course_embeddings_v1` in a disposable Qdrant; coverage `org:course:run` present; then `reindex.verify` passes behind alias.
- [ ] Implement operator-profile prerequisite handling + green.

### Increment 4 — `deploy.prepare` / `deploy.commit`

Drive `deploy_blue_green.sh --q12-mode prepare-quiesced|commit-quiesced` against a dev app color; assert the `nginx_switch_intent` marker + activation receipt contract (H `.13.12`).

- [ ] Failing test: prepare then commit produce the expected markers/receipt on a dev-shaped compose; green.

### Increment 5 — crash / `recover` idempotency

For each real command define the recover re-drive semantics (skip-if-done vs safe-redo). `recover` resumes from `deploy.prepare/completed` or `writers.resume.forward/accepted`; a mid-ordinary crash must converge without double-applying non-idempotent effects.

- [ ] Failing test: inject a crash after `pg.restore` real exit but before journal fsync; `recover` must not re-restore destructively; green.

### Increment 6 — full real path on disposable + DEV rehearsal

Run the whole forward window `live --stop-after deploy.prepare` with the production executor against the disposable stack, then a **DEV** rehearsal (real shared source **read-only**, dev Qdrant isolated write, dev app color) — the rehearsal W5 deferred. Bound any true residual explicitly.

- [ ] `MC2_Q12_REAL_PG17=1` full-window green with production executor (not the fixture wrapper).
- [ ] DEV rehearsal evidence captured; residual (if any) recorded in `mc2-uha77`.

## Risks / open decisions (resolve in-increment, record on the bead)

1. **Inline `execute_ordinary` vs out-of-band `claim`.** 2026-07-20 codesign D3 mentions out-of-band claim re-resolution; the reference harness uses inline `execute_ordinary`. Default to inline (matches the wired seam); confirm D5J `command_sha256` bind holds since resolved argv is identical.
2. **Idempotency of real data-movement** — the reason this was deferred. Increment 5 is the crux; may need per-command guards.
3. **Shared source DB** (dev+staging+prod share one Supabase per `reference_shared_supabase_db`): rehearsal `pg.backup`/snapshot is read-only, but confirm `source.forward`/reindex write ONLY to the dev Qdrant target, never the shared source.
4. **operator-profile prerequisites**: `reindex.*` compose commands need the operator profile up + `SOURCE_RECOVERY_*` env; sequencing vs the window.

## Verification (repo gates)

- `MC2_Q12_REAL_PG17=1 pnpm --filter @megacampus/course-gen-platform test <suite>` per increment.
- Fixture parity suite unchanged (composer byte-identical).
- `pnpm type-check`; frozen manifest sha `aaec6fc2…` re-verified after every change.
