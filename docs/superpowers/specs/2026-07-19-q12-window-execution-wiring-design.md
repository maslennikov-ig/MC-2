# Q12 Live-Window Execution Wiring — Design / Handoff Spec

- Date: 2026-07-19
- Stage: `mc2-jz6y0` (self-hosted Qdrant); tracking bead `mc2-uha77`
- Branch: `codex/self-hosted-qdrant-platform`; worktree
  `/home/me/code/mc2/.worktrees/self-hosted-qdrant-platform`
- Verified base commit: `8af76cfd4`
- Source-of-truth verification artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md`
- Predecessor design: `docs/superpowers/specs/2026-07-17-q12-live-controller-design.md`
  (R8 live controller) and its plan `docs/superpowers/plans/2026-07-17-q12-live-controller.md`
- Normative command/placeholder contract:
  `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md`
- Stale (superseded-in-part) operator procedure:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md`

## 1. Purpose

Make the Q12 live cutover window **executable end-to-end against production**,
then open it (owner-gated) and run Phase D closeout. The R8 program delivered
and proved the live/recover **journal-convergence controller** against a
**fixture** executor; it deliberately left the **real-execution wiring**
un-done. This spec scopes that remaining wiring precisely, from verified repo
truth, so a fresh orchestrator can pick it up cold.

## 2. Verified current state (the gap)

All claims carry `file:line` evidence in
`deploy/qdrant/q12-lifecycle-core.py` unless noted.

1. **The deployed `live`/`recover` entrypoints cannot run in production.**
   `main()` wires a bare `ProductionExecutor()` for both modes (`:7237`).
   `run_live`/`run_recover` call `require_post_activate_executor` as their FIRST
   statement (`:3806`, `:3914`); for `production is True` it raises
   `"writers.resume.forward requires the server-side owner-custody executor
(not wired here)"` because `ProductionExecutor` has `prepare_barrier_cleanup`
   (`:826`) and `execute_barrier_cleanup` (`:849`) but **no**
   `execute_forward_resume` (`:822-824`, `:3760-3763`). The only
   `execute_forward_resume` in the repo is a **test fixture**
   (`packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py:760`).

2. **`run_live` substitutes fixture-derived placeholder values, not real
   production values.** `values = derive_joined_fixture_values(run_id,
quiesce_path)` (`:3816`), `<exported-id> = values["<exported-id>"]`
   (`:3854`), `target_identities` seeded from `sha256("q12:resource-target:…")`
   (`:3858-3860`). The 10-placeholder domain is `SUBSTITUTION_PLACEHOLDERS`
   (`:692-705`); of these only `<run-id>`, `<expected-post-migration-catalog-sha256>`,
   `<release-sha>` are real request inputs. The other 7 (`<quiesce-manifest>`,
   `<exported-id>`, `<immutable-generation>`, `<recovery-run-id>`,
   `<accepted-recovery-manifest-sha256>`, `<accepted-coverage-fingerprint>`,
   `<accepted-coverage-run>`) are FIXTURE derivations, chosen so every
   `command_sha256` matches the closed-composer parity oracle (`:3783-3784`).
   Consequence: even with `execute_forward_resume` wired, `ProductionExecutor.execute`
   (`:763-774`, shells `command["argv"]`) would run e.g.
   `pg.backup --snapshot <fixture-derived-id>` against a snapshot id that does
   not exist. `run_live` is a **journal/parity twin**, not a real driver.

3. **No operator STOP point before the point of no return on the deployed CLI.**
   The `stop_after` seam exists (`_STOP_AFTER_STEP` `:3597-3603`) but the `live`
   subparser exposes no `--stop-after` (`:7141-7149`) and `main()` sets none
   (`:7222-7235`), so a production `live` run (once wired) would drive groups
   1→16 including `barrier.activate` + nginx switch (the point of no return) in
   one process.

4. **OQ1 is resolved** (was flagged in the 2026-07-17 procedure): the writer
   quiesce child accepts EITHER `last_command=="install"` OR
   `state=="recovery_ready_guarded" && last_command=="prepare-recovery"`
   (`deploy/qdrant/q12-writer-resume.py:346-362`) — no ordering contradiction.

5. **OQ4** resource-manifest authority is already controller-owned in `run_live`
   (`write_live_resource_manifest`, `:3850`, `:3779-3784`) — good; keep it.
   **OQ5** (deployed `pg_export_snapshot()` coordinator for `pg.backup` q12
   mode) and **OQ6** (`<run-root>/baseline.json` producer) remain OPEN and must
   be resolved for the real path.

## 3. Scope (workstreams)

### W1 — Owner-custody executor + wiring

Implement a deployed executor that provides `execute_forward_resume` (and reuses
`ProductionExecutor`'s real `prepare_barrier_cleanup`/`execute_barrier_cleanup`).
`execute_forward_resume(context, cleanup)` must:

- Validate the v2 `guard_cleanup_complete` barrier receipt exactly as the
  fixture twin does (`q12-retained-barrier-runner.py:760-830`, itself a byte
  twin of `q12-writer-resume.py:1088-1134`).
- Drive the REAL writer-fleet resume:
  `source-recovery-run.sh --operation resume-writers-only --resume-mode forward
--run-id <recovery-run-id>` under the held FD9 lease (`Q12_EXTERNAL_QUIESCE_LEASE_FD=9`,
  interface `deploy/qdrant/source-recovery-run.sh:69, :233-241, :295, :341`).
- Return `{"status":"resumed","ok":true,"validated_receipt_sha256": <sha256 of
the v2 receipt>}` so the controller's
  `resume.get("validated_receipt_sha256") == receipt_sha256` check passes
  (`q12-lifecycle-core.py:3523-3525`).

Wire it into `main()` for `live`/`recover` (replace the bare `ProductionExecutor()`
at `:7237`). Keep `require_post_activate_executor` as defense-in-depth.

### W2 — Real production value plumbing (Task 9 core; the largest stream)

Replace the fixture-derived substitution in the production `run_live`/`run_recover`
path with the D5J single-authority real values for the 7 non-request placeholders
(§2.2). Authorities (from the 2026-07-17 procedure §D, re-verify each):

| Placeholder                                                   | Real production authority                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `<quiesce-manifest>`                                          | `<run-root>/writer-quiesce-<run-id>.json` published by `writers.quiesce` (`source-recovery-run.sh:519-522`) |
| `<exported-id>`                                               | live `SELECT pg_export_snapshot()` id held through `pg.backup` (OQ5; `backup-supabase.sh:502-506`)          |
| `<immutable-generation>`                                      | generation dir printed by the fresh `pg.backup` (`restore-supabase-drill.sh:302-303`)                       |
| `<recovery-run-id>`                                           | accepted `.13.4.1` source-recovery run id                                                                   |
| `<accepted-recovery-manifest-sha256>`                         | sha256 of `/var/lib/megacampus-source-recovery/state/manifest.json` after `source.forward` acceptance       |
| `<accepted-coverage-fingerprint>` / `<accepted-coverage-run>` | accepted coverage evidence (`org:course:run`) from the recovery journal                                     |

**Design decision required (call it out explicitly in the plan):** with real
values, `command_sha256` no longer matches the closed-composer fixture oracle,
so the composer byte-parity acceptance oracle does NOT apply to a real run. The
new orchestrator MUST define the real-run acceptance oracle (e.g. real child
exit-0 + real receipt state-machine + real coverage evidence), and keep the
fixture parity path intact for the unit suite. Do not silently keep fixture
substitution on the production path.

### W3 — Snapshot coordinator (OQ5) + baseline.json (OQ6)

- A deployed q12-mode snapshot coordinator that opens a REPEATABLE READ session,
  `SELECT pg_export_snapshot()`, and holds it open across `pg.backup`, without
  violating the "operators must not run subcommands manually" rule (corrections
  design §9). The plan/coordinator already has a plan-internal coordinator
  (`q12-lifecycle-core.py:5718-5774`); decide whether to reuse/extend it for the
  window.
- A producer for `<run-root>/baseline.json` that `pg.backup` q12 mode opens
  (`backup-supabase.sh:924-931`).

### W4 — Safe STOP-point operator model

Decide and implement a reversible operator STOP before the point of no return
(`barrier.activate`/`deploy.commit`). Options: expose `--stop-after` on `live`
(checkpoints already exist: `deploy.prepare`, `final-writer-manifest`), then a
deliberate `recover` (or a second `live`-continue) to drive through activate; OR
a documented staged sequence. The reversible/finish-forward boundary (#18
rollback-abort before `barrier.activate`) MUST be preserved and operator-visible.

### W5 — Rehearsal (respect found-defect #21)

The stock `q12-live-cutover.sh live` / `ProductionExecutor` path is un-rehearsable
against a disposable container via the bounded probes (#21 note,
2026-07-17 design `:927-942`). For the newly-wired real path, define rehearsal
coverage: either port the fusion argv-rewrite into a rehearsal executor to
exercise `execute_forward_resume` + real-value substitution against a disposable
stack, or extend the bounded server-mechanics probes
(`deploy/qdrant/rehearsal/rehearsal-probe.sh`) to cover the resume + real-value
legs. State explicitly what stays IN-WINDOW-only (under #18 rollback-abort).

### W6 — Current operator runbook

Author the current window operator runbook (supersede the stale
2026-07-17 procedure) with exact commands, the real inputs (§W2), STOP points
(§W4), verification per step, and the rollback-abort path. Fold in the OQ1
resolution (dual-state quiesce).

### W7 — Open the window (OWNER-GATED)

Only after W1–W6 are delivered, reviewed, and rehearsed: pre-window `plan`
(compute `release-sha`/`operator-digest`/`CAT_SHA`) → present to owner → C1..C10
with STOP points and the reversible-before-C9 boundary → Phase D closeout
(D1 smoke, D2 rotation OWNER-GATED/deferred, D3 off-host S3, D4 Prometheus
retention, D5 final closeout via `scripts/orchestration/run_stage_closeout.py`).

## 4. Hard invariants (do not weaken to force green)

- Never mutate or recover Qdrant Cloud (data was test-only and is lost).
- Owner secrets stay owner-only (`0400`/`0600`) on the server, path-only in code
  and docs; never print secret values into logs/artifacts/history.
- Frozen trio unchanged unless ratified: manifest `q12-command-manifest.json`
  sha `aaec6fc2…` (any manifest change is a HARD STOP), structural catalog, and
  the barrier `q12-database-barrier.sh` (final sha `bdb9d935…`); a barrier
  defrost requires explicit ratification + independent frozen-byte review +
  W-tuple field succession + CI guard update.
- Keep the fixture parity suite and the strict/recovery/rollback tests intact;
  add real-path tests alongside, do not replace parity coverage.
- No production mutation without a fresh pre-window `plan` and an explicit owner
  go on C1; workers/agents never touch prod (the orchestrator executes server
  actions).

## 5. Verification gates

- `pnpm --filter @megacampus/course-gen-platform test:unit` focused Q12 suites
  (fixture parity + new real-path units); PG17-gated legs via `MC2_Q12_REAL_PG17=1`.
- `pnpm type-check`; `pnpm build`.
- `python3 scripts/orchestration/validate_artifact.py <artifact>` for every
  tracked artifact; `scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0`
  at stage close.
- Independent correctness review at each file-changing stream; frozen-byte
  review if (and only if) a defrost is genuinely required.

## 6. Non-goals

- No new orchestration via `template-bridge`.
- No manifest/barrier byte changes unless a defect genuinely requires a ratified
  defrost.
- Do not port the whole fixture harness to production; wire only the real
  owner-custody execution path and the real-value authorities.
