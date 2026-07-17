# Plan: Q12 Live Controller (Task-9 `plan|live|recover`)

Status: **PLAN DRAFT — awaiting orchestrator ratification. No implementation started.**
Design: `docs/superpowers/specs/2026-07-17-q12-live-controller-design.md`.
Stream: `mc2-jz6y0.13` (this worktree `codex/q12-plan-builder`).

## Scope and standing contract (every round)

- **Design/local only.** No server / live / db / ssh / docker-against-prod action. Real-PG17
  tests run against disposable local `postgres:17.10-bookworm` containers (the accepted
  round-8..19 harness).
- **Frozen bytes untouched:** `q12-command-manifest.json` `aaec6fc2…`,
  `q12-database-barrier.sh` `134255ce…`, `q12-structural-catalog.sql` `0b8a943f…`. **A
  required change to any of them is a hard STOP — report, do not touch.**
- **One authority.** The controller drives the existing `Engine` (`production:true`),
  `load_manifest()`/`resolved_command()`, and the serializer/capability/object/checkpoint
  primitives. No new resolver/manifest/command table/journaling authority (amendment §2,
  §10).
- **No W-owned file change** (`q12-writer-resume.py`, `source-recovery-run.sh`) — amendment
  §7 `:428`. OQ1's W-gate relaxation is a **separate W-contract amendment**, not this
  stream.
- **TDD RED→GREEN→docs**, separate commits, per round. **Composer parity is the oracle**:
  every journaling round asserts byte/order parity of the live journal vs
  `run_joined_composer` on shared fields. No push; artifact + `validate_artifact.py`; full
  evidence rerun (real-PG17 + no-docker + tsc); report to main.

## Dependency / sequencing

- **Round 0 (OQ1 escalation) blocks only the LIVE EXECUTION of C2 quiesce and the window
  opening — not the journaling/producer rounds.** The controller's journaling and producer
  rounds (R1–R8) use a fixture W-owned quiesce-manifest file (as the composer does,
  `:2895-2899`) and disposable sources, so they proceed in parallel with the OQ1 ruling.
- The window may not **open** until: OQ1 ratified + delivered by the W stream, **and** R1–R8
  green, **and** an owner go/no-go.

---

## Round 0 — OQ1 escalation gate (no code)

- **Goal:** get an owner ruling on the quiesce receipt-state contradiction (design §4 OQ1,
  §6.1). Deliver the two-sided evidence memo (already in the design), recommend Side A
  (early-quiesce truth + scoped W-contract amendment relaxing `run_quiesce()`'s gate to
  `maintenance_guarded`/`install`, preserving the D4 recovery-only flow), and **stop**.
- **Exit:** owner ruling recorded; if Side A ratified, a W-stream task is filed to amend the
  gate + its pinned test (`qdrant-source-recovery-runtime.test.ts:808-821,:5098`). This
  stream does not touch `q12-writer-resume.py`.

## Round 1 — `live`/`recover` skeleton + production-seam driver + genesis parity

- **Goal:** add `live`/`recover` subcommands to `q12-lifecycle-core.py` and route them in
  `q12-live-cutover.sh`; the controller constructs the `Engine` with `production:true` and
  journals the genesis `operator.self-check` lifecycle (group 1) via
  `append_ordinary_lifecycle`, executing the real self-check via an injectable child seam.
- **RED:** a test asserts the controller's genesis row(s) byte-match `run_joined_composer`'s
  group-1 rows (same `command_id`, `command_sha256`, phase `preflight`, outcomes, chain);
  and that `live` fails closed without `production:true`/production run root.
- **GREEN:** minimal driver + routing. **Verify:** no-docker parity + tsc; frozen bytes
  identical.

## Round 2 — snapshot coordinator + `baseline.json` producer (OQ5, OQ6)

- **Goal:** reuse `_open_snapshot_coordinator`/`_close_snapshot_coordinator` to export+hold a
  REPEATABLE READ snapshot and capture `<exported-id>`; capture the **full** structural
  source baseline (via the frozen `q12-structural-catalog.sql` projection) into
  `<run-root>/baseline.json` (0400, uid 1000) in the same session.
- **RED (real-PG17):** against a disposable source, the produced `baseline.json` passes
  `q12-source-manifest.ts` `validateTransition` (`:1258+`) — full `cron_jobs`/`database`/
  `guarded_relations`; and `<exported-id>` matches the frozen backup grammar
  (`backup-supabase.sh:502-506`). Negative: the lossy `database-barrier-baseline.json`
  digests do **not** satisfy `validateTransition` (proves the full capture is required).
- **GREEN:** the producer. **Verify:** real-PG17 + no-docker + tsc; frozen bytes identical.

## Round 3 — checkpoint-bound resource manifest + 2-step binding (OQ4)

- **Goal:** the controller writes a genesis resource manifest (recomputable empty-accepted
  shape) and steps `current_resource_manifest_sha256` exactly at `pg.backup/intent`
  (`<exported-id>`) and `deploy.prepare/completed` (five targets), via
  `resource_step_before_completion` (`:1683-1686`) and the pre-intent set.
- **RED:** `validate_stable_binding_walk` (`:342-356`) accepts the stepped journal and
  rejects any off-witness step; the two step digests parity-match the composer's
  `snapshot_step`/`targets_step` (`:2957-2958`).
- **GREEN + verify** as above.

## Round 4 — forward ordinary-lifecycle journaling with real child seams (OQ2)

- **Goal:** journal groups 4–8, 11–13, 15 ordinary lifecycles (`pg.backup` split,
  `pg.restore`, `migration.base.apply`, `migration.observability.apply`, `source.forward`,
  `reindex.*`, `deploy.prepare`, `deploy.commit`) via `append_ordinary_lifecycle`, executing
  each real child through an injectable, identity-correct seam (uid 1000 journals; root
  children via `sudo`+`env -i`), and the `migrations_applied` milestone (group 9) via
  `append_controller_milestone`.
- **RED:** the full forward ordinary journal byte/order-matches `run_joined_composer`
  (forward profile) on shared fields; removing/ reordering any lifecycle fails; the
  supervisor barrier rows (invoked as real `q12-live-cutover.sh <op>`) interleave into the
  same `phase.jsonl` and the combined journal matches the composer's `d5()`+`ordinary()`
  interleave.
- **GREEN + verify** (real-PG17 for child execution; no-docker for parity).

## Round 5 — real forward FWM producer (OQ3 forward)

- **Goal:** `publish_final_writer_manifest("forward", real_inventory, …)` with the real
  `derive_root_writer_inventory` fed the W quiesce-manifest bytes + `deploy.prepare` targets
  (group 14).
- **RED:** the forward FWM at `final-writer-manifest-forward-<run-id>.json` byte-matches the
  composer's forward manifest for identical inventory inputs; wrong-mode path / zero hash
  fail (§8 `:448-451`).
- **GREEN + verify.**

## Round 6 — barrier-cleanup orchestration + resume-forward wiring (OQ3)

- **Goal:** post-`activate`, the controller orchestrates `q12-database-barrier.sh cleanup`
  (a Task-9 barrier **subcommand**, not a manifest command → no manifest change) to produce
  the v2 `guard_cleanup_complete` receipt (`:2114`), then drives `writers.resume.forward`
  (FD-9 lease held; child via `sudo`), whose v2 gate (`q12-writer-resume.py:1060-1076`) is
  now satisfied.
- **RED:** against a disposable barrier/receipt state, the resume forward gate passes only
  after the controller's cleanup step; without it, it fails closed. **STOP CHECK:** if the
  receipt genuinely cannot be produced without adding `barrier.cleanup` to the frozen
  manifest, hard-stop and report (it should not — the subcommand exists).
- **GREEN + verify.**

## Round 7 — `recover` / rollback path

- **Goal:** idempotent restart from the durable journal (ordinary + barrier resume); the
  rollback profile — rollback FWM at the distinct path bound to `writers.resume.rollback`,
  the barrier `rollback` → v2 receipt → `writers.resume.rollback`.
- **RED:** rollback journal + both FWM objects (activation-frontier) byte-match the
  composer's rollback branch (`:3013-3053`); a mid-run restart produces no duplicate rows
  or child replay (mirrors `q12-live-cutover.test.ts:769-806`).
- **GREEN + verify.**

## Round 8 — end-to-end parity + execution smoke

- **Goal:** the whole forward and rollback windows, driven by `live`/`recover` with
  deterministic inputs, produce `phase.jsonl` / checkpoints / capability tree / FWM objects
  byte/order-identical to `run_joined_composer`; plus a real-PG17 execution smoke on a
  disposable source proving the ordinary children actually run and the journal closes clean
  with zero residue.
- **RED/GREEN/verify** as above; then closeout + artifact update.

---

## Verification contract (per round)

- Real-PG17 suite green (disposable PG17), no-docker suite green (only the pre-existing
  `qdrant-observability-contract` `QDRANT_METRICS_GID` failure, outside this surface), tsc 0.
- Frozen bytes `aaec6fc2…` / `134255ce…` / `0b8a943f…` byte-identical each round.
- Composer parity assertion green for every journaling round.
- No W-owned file (`q12-writer-resume.py`, `source-recovery-run.sh`) modified.
- Artifact updated + `validate_artifact.py` OK; no push; report to main.

## Open risks carried forward

- **OQ1 is the gating unknown.** If the owner rules Side B (quiesce moves late) instead, R2
  onward re-sequences (quiesce after `prepare-recovery`) and the D5J §5 chronology must be
  re-frozen first — a larger design-amendment stop. R1 and the parity harness are ruling
  -independent.
- Cross-identity execution (uid 1000 journaler + `sudo` root children + FD-9 custody) is the
  highest-friction implementation surface; R1 establishes the seam abstraction before any
  child round depends on it.
