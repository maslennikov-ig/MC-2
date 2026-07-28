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

- [x] Failing test: production executor drives `migration.base.apply` against a disposable `postgres:17.10`; assert the migration row exists in the restored catalog and journal parity holds. Run — watch it fail (no `execute_ordinary` on prod executor).
- [x] Implement minimal `execute_ordinary` = `return self.execute(command, capability)`.
- [x] Green; then assert the fixture composer path is still byte-identical (parity neutrality).

> **Scope correction (2026-07-21, after deep investigation).** Increment 1 wired the command-agnostic
> `execute_ordinary` seam (proven). The remaining verifiable-here gap is NOT re-running the real
> data-movement scripts on disposable infra (that re-tests the scripts' own hardened suites and needs a
> full synthetic Supabase catalog — `verify_restored_pgtle_packages` demands exact pgTLE
> `0.0.6`/`0.0.5`, pg_cron 8 jobs, etc.). The real gap is that `drive_forward_sequence`
> (`q12-lifecycle-core.py:4241`) **never invokes** the staged resolver callbacks `on_pg_backup_done`
> (`:777`) / `on_source_forward_accepted` (`:781`) — grep confirms only their definitions exist. So a
> production `values=StagedValueResolver` run fails closed at `pg.restore` (`<immutable-generation>`
> unresolved). Codesign §D2/§D3/§4 (`2026-07-20-q12-w2-w3-staged-execution-codesign.md`) is the
> authority: the callbacks read an **on-disk authority** (the generation pointer / recovery
> `manifest.json`), the resolved value is persisted to the run-root authority for compose↔claim
> consistency, and **all of this is unit-testable HERE with FAKE authorities** (the W1 capture-subclass
> pattern). The real leg (real `pg_export_snapshot`, real generation dir, real recovery sha) is
> `MC2_Q12_REAL_PG17`-gated and validated only at W5 (rehearsal) / W7 (owner-gated) — an honest
> verifiability boundary, not a shortcut. Increments 2-4 below are re-scoped to that gap; the real
> end-to-end leg is Increment 5 (gated) and stays owner-gated for prod.

### Increment 2 — production drive-loop threads `on_pg_backup_done` (verifiable here, fake authority)

Wire `drive_forward_sequence` so that on the **production** path, after `ordinary("pg.backup")` and
before `pg.restore`, the generation is read from the on-disk authority and fed to
`resolver.on_pg_backup_done(...)`, then the resolver is re-persisted (`persist_staged_values`). Fixture
mode stays a no-op (plain-dict `values` has all placeholders upfront — byte-parity untouched). Inject a
production-aware staged hook from `run_live`/`run_recover` (alongside `ordinary`/`d5`) so
`drive_forward_sequence` never reaches into the resolver directly and fixture runs are unaffected.

- [x] Failing test (`q12-production-staged-threading.test.ts` + runner): drive the production forward
      sequence with a **fake** `OwnerCustodyExecutor` subclass whose `execute_ordinary` writes a fake
      generation pointer; assert (a) before the hook `resolved_command(pg.restore)` raises
      "unresolved command placeholder", (b) after the hook the resolver holds the fake
      `<immutable-generation>` and `pg.restore` argv resolves, (c) the run-root staged-values authority
      now contains it. Run — watch it fail (drive loop never calls the callback).
- [x] Implement: a `on_pg_backup_done`-invoking step in `drive_forward_sequence` (production-gated via
      the injected hook), reading the generation authority; re-persist. Green; assert fixture parity
      byte-identical.

### Increment 3 — production drive-loop threads `on_source_forward_accepted` (verifiable here, fake authority)

Same pattern after `ordinary("source.forward")`: read the recovery `manifest.json` sha + coverage
`org:course:run` from the on-disk recovery authority, feed `resolver.on_source_forward_accepted(...)`,
re-persist. The downstream commands that consume `<accepted-recovery-manifest-sha256>` /
`<accepted-coverage-fingerprint>` / `<accepted-coverage-run>` then resolve.

- [x] Failing test: production drive with a fake recovery authority; assert the three placeholders are
      unresolved before the hook and resolved after, the first downstream consumer's argv resolves, and
      the authority round-trips. Watch it fail.
- [x] Implement the source.forward staged step (production-gated); green; fixture parity byte-identical.

### Increment 4 — recover determinism through the staged threading (verifiable here)

A production `recover` reconstructs the resolver from the persisted authority (`load_staged_values`,
`:867`) and re-drives the remaining tail byte-identically. Prove the staged callbacks are re-drive-safe:
resolve-once means a recover that re-runs a staged step must byte-match the persisted value or fail
closed as drift.

- [x] Failing test: persist a staged-values authority from a stopped production forward run
      (`--stop-after deploy.prepare` shape), then `recover`; assert the reconstructed resolver yields the
      SAME `command_sha256` for `pg.restore` (compose↔claim equality) and a drifted authority value
      fails closed. Watch it fail (if any re-drive path re-invokes a callback without resolve-once).
- [x] Implement/confirm resolve-once on the re-drive path; green.

### Increment 4b — the recover DRIVE PATH threads the staged callbacks (2026-07-28, `1725a2df3`)

Increment 4 proved the threaders are re-drive-SAFE by calling them directly; it did not prove the
recover drive path CALLS them. It did not: increments 2-3 wired `on_staged` as a hook `run_live`
passed into `drive_forward_sequence`, and `run_recover` shares that driver but passed nothing. The
two recover heads that RE-DRIVE a staged step therefore failed closed at the next consumer with
"unresolved command placeholder" — head 1 (`barrier.install/completed` → `writers.quiesce`, which
re-drives pg.backup, and `pg.restore` consumes `<immutable-generation>`) and head 4
(`barrier.prepare-recovery/completed` → `source.forward`, and `reindex.plan` consumes the accepted
coverage binding). Both are heads a production window can only reach AFTER C2 has quiesced writers.

Same shape as the class the window kept hitting: the checked environment (a direct call to the
threader) was more permissive than the consuming one (the resumed driver, which never called it).

- [x] Failing test (`q12-production-recover-staged-threading.test.ts` + runner): drive the REAL
      `drive_forward_sequence` from each recover head exactly as `run_recover` drives it — no
      caller-supplied hook — with fake authority-read seams; assert the next consumer resolves.
      Watched both heads fail with "unresolved command placeholder".
- [x] Implement: the staged threading MOVED into `drive_forward_sequence` (it already holds
      `engine.executor`, `values`, `request`, `engine.run_root`), so no caller can forget it and
      there is one implementation instead of two call sites — the property `WindowSnapshotHold`
      already had for `<exported-id>`. Green; fixture parity byte-identical
      (`q12-live-controller` 26/26, W7a suites 23/23, manifest `aaec6fc2…` unmoved).

### Increment 5 — real leg on disposable PG17 / Qdrant (GATED — `MC2_Q12_REAL_PG17=1`) + W7 owner-gated prod

The honest verifiability boundary (codesign §4): the real `pg_export_snapshot()`, the real generation
dir from a real `pg.backup`, the real recovery-manifest sha/coverage, and the D4 end-to-end acceptance
oracle. This needs the disposable Supabase-shaped stack (or the shared source **read-only** for a DEV
rehearsal) and is `MC2_Q12_REAL_PG17`-gated; the prod window itself stays **owner-gated (W7, `mc2-i9h3y`)**
holding C9. NOT closed by local unit work.

**Boundary settled (2026-07-28).** The "rehearsal" below is NOT a lighter dress run that could
precede the window: the real values it would feed the callbacks are a real reviewed recovery
`manifest.json` plus the recovered Supabase `file_catalog` rows, and those exist only once the real
`source.forward` 42-copy recovery run has happened (traced on `mc2-1sns3`, 2026-07-23). So
increment 5 IS the W7 window's own forward leg — running it separately would either mutate
production outside the window or substitute a fixture for the very authority under test, which is
the exact class that produced the first ten window defects. `mc2-1sns3` therefore closes at
increment 4b, and increment 5 is EXECUTED BY `mc2-i9h3y` (the window), not before it.

- [x] `MC2_Q12_REAL_PG17=1` local gate over the whole ops suite at the delivered tree — every
      infra-free and disposable-stack leg of the staged threading, including the recover heads.
- [ ] REAL end-to-end leg — real generation + recovery authorities feed the staged callbacks —
      executed inside the owner-gated window `mc2-i9h3y` at C5/C6, not as a separate rehearsal.
- [ ] Residual (if any) recorded in `mc2-uha77`; prod C9 remains held for explicit owner "go".

## Risks / open decisions (resolve in-increment, record on the bead)

1. **Inline `execute_ordinary` vs out-of-band `claim`.** 2026-07-20 codesign D3 mentions out-of-band claim re-resolution; the reference harness uses inline `execute_ordinary`. Default to inline (matches the wired seam); confirm D5J `command_sha256` bind holds since resolved argv is identical.
2. **Idempotency of real data-movement** — the reason this was deferred. Increment 5 is the crux; may need per-command guards.
3. **Shared source DB** (dev+staging+prod share one Supabase per `reference_shared_supabase_db`): rehearsal `pg.backup`/snapshot is read-only, but confirm `source.forward`/reindex write ONLY to the dev Qdrant target, never the shared source.
4. **operator-profile prerequisites**: `reindex.*` compose commands need the operator profile up + `SOURCE_RECOVERY_*` env; sequencing vs the window.

## Verification (repo gates)

- `MC2_Q12_REAL_PG17=1 pnpm --filter @megacampus/course-gen-platform test <suite>` per increment.
- Fixture parity suite unchanged (composer byte-identical).
- `pnpm type-check`; frozen manifest sha `aaec6fc2…` re-verified after every change.
