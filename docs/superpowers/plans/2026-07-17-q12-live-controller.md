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
- **NON-NEGOTIABLE R4 ACCEPTANCE CRITERION (deferred from R2, orchestrator-pinned
  2026-07-18):** R4 builds the full-Supabase real-source harness (a disposable source seeded
  to satisfy `barrier.install`'s strict expected shape — `inventory_counts`
  public:47/auth:22/storage:5, 8 active cron, the exact `guarded_relations`,
  `q12-database-barrier.sh:363-408`) because in-process barriers run the real
  `barrier.install` here. On that harness, R4 MUST prove the **full validateTransition
  POSITIVE that R2 could not**: R2's `produce_run_root_baseline` captures `baseline.json`
  from the pre-maintenance source; then the real `barrier.install` transitions the source to
  the maintenance/cutover state (cron off, read-only on, the complete `q12_guard` machinery +
  guarded-relations delta); then `q12-source-manifest.ts capture --snapshot <id> --baseline
baseline.json` (or `verify-transition`) MUST PASS (`validateTransition`,
  `q12-source-manifest.ts:1258-1352`). **R4 cannot close without this end-to-end
  baseline→real-install-cutover positive** — it is the acceptance R2 explicitly deferred, not
  optional.

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

## Pre-window gate — server-side full-path `run_live` rehearsal (NON-NEGOTIABLE, orchestrator-pinned 2026-07-18)

The R4 acceptance (Sub-round C) proves the **real `barrier.install` transition passes the real
`validateTransition`** by invoking the barrier directly against a disposable seeded container
(ruling 1 option (b)) — it deliberately isolates the DB-transition claim from the uid-1000 /
`/opt/megacampus` / canonical-lease **custody** machinery. Sub-round B proves the in-process
barrier chain runs through the **real** `q12-capability-run.sh` wrapper no-docker
(`SandboxedDeployedWrapperExecutor`/bwrap). Neither exercises the full uid-1000/`/opt`/lease
custody path end-to-end — and that exact class of never-executed path burned this program four
times (the plan-mode rehearsals #1–#13 exist for the same reason).

**Therefore, before the cutover window opens, a server-side full-path `run_live` rehearsal is a
hard gate (peer of R8, non-negotiable):**

- Runs **on megacampus-prod as `claude-deploy` (uid/gid 1000 there)**, against a **real**
  production-shaped run root `/opt/megacampus/backups/q12/<fresh-run-id>` and the canonical
  `cutover.lock` (FD-9 lease), i.e. the exact identity/lease custody the disposable-container
  CI test structurally cannot reproduce.
- Drives the **real in-process `barrier.install`** (and as much of the retained_chain +
  ordinary-execution + C7 planned-exit + `recover`-resume path as is safe) through `run_live`.
- Executes only against a **DISPOSABLE seeded container source** (the full-Supabase seed shape),
  **never the production database**; no prod mutation.
- Closes the uid-1000/`/opt`/lease custody path for real — exactly as rehearsals #1–#13 closed
  the plan path — and its evidence is a window-open precondition recorded in the C0 window
  packet. Until it passes, the window MUST NOT open.

This gate is server action and requires explicit current-task owner authorization at execution
time (per the repo contract); it is authored here as a pinned plan requirement, not run by the
local TDD rounds.

---

## Verification contract (per round)

- Real-PG17 suite green (disposable PG17), no-docker suite green (only the pre-existing
  `qdrant-observability-contract` `QDRANT_METRICS_GID` failure, outside this surface), tsc 0.
- Frozen bytes `aaec6fc2…` / `134255ce…` / `0b8a943f…` byte-identical each round.
- Composer parity assertion green for every journaling round.
- No W-owned file (`q12-writer-resume.py`, `source-recovery-run.sh`) modified.
- Artifact updated + `validate_artifact.py` OK; no push; report to main.

## Implementation log

- **R1 done** (RED `264fefe0` → GREEN `2b3a1459`). Added `run_live` (the Task-9 controller)
  driving the same `Engine` + `append_ordinary_lifecycle` primitive as the composer; journals
  the group-1 `operator.self-check` genesis; production run-root coupling enforced by
  `Engine.__post_init__`. Parity vs the composer proven for the genesis lifecycle; existing
  composer/quiesce-seam suites (52 tests) green; tsc 0; frozen bytes unchanged.
  - **Parity-wording correction (carries into every round):** the plan said "byte/order-
    identical." `checkpoint_bytes` (`q12-lifecycle-core.py:845`) binds the physical journal
    file's `journal_device`/`journal_inode` (anti-tamper), so `capability_manifest_sha256`,
    `entry_hash`, and `previous_hash` are inherently **per-run-root**. Cross-root parity is
    therefore asserted over the **root-independent** row grammar + command bindings (phase,
    outcome, `command_id`, `command_sha256`, run/release/operator/resource/quiesce bindings,
    accepted-object, `lease_epoch`, `seq`, `timestamp`) — the meaningful "does not fork a
    second authority" proof, since `run_live` calls the same serializer functions. The three
    physical-binding hashes match only within a single run root.
  - **Barrier-orchestration open question (shapes R4, flagged for the review):** the composer
    runs the 5 barriers in-process via `retained_chain` (`d5()`); the deployed window ran them
    as 5 separate `q12-live-cutover.sh <op>` supervisor invocations (the Task-9-absent
    interim). The controller can either (a) drive barriers in-process via `retained_chain`
    (one process, trivial parity, but changes the operator procedure and holds `cutover.lock`
    across the whole window), or (b) shell out to the 5 supervisor invocations (preserves the
    current procedure, splits lock custody). This shapes R4 and the lease/FD-9 model; resolve
    with the design review before R4. **RESOLVED (2026-07-18): option (a) in-process** — see
    design §6a. C7 is a planned controller exit + `recover`-resume; no lock held across it.

- **R2 done** (RED `4dd31e5f` → GREEN `a2799ec6`, revised to Option B `da5b172a`). Added
  `LivePlanExecutor.produce_run_root_baseline`: held-snapshot coordinator +
  `q12-source-manifest.ts capture` (no `--baseline`, so `baseline == cutover == the capture`,
  `:1449`) → `.baseline` → run-root `baseline.json` 0400, intermediate written under the run
  root then removed. **Connection (Option B, orchestrator-ruled):** `q12-source-manifest.ts` is
  BYTE-UNTOUCHED — once host `postgresql-client-17` was installed, the producer + test drive
  the tool through its own hardcoded `/usr/lib/postgresql/17/bin/psql` over libpq
  (`PGSERVICE`/`PGSERVICEFILE` + `SET TRANSACTION SNAPSHOT`); the real-PG17 test uses a loopback
  service file to the container's published port (coordinator on the same libpq route; snapshot
  cross-session; seeding on docker-exec). The `MC2_Q12_MANIFEST_PSQL` fixture-only lockdown seam
  explored first was REVERTED — zero change to the reviewed tool beats a blessed seam. Verified:
  the real-PG17 producer proof (0400 baseline, 8 active cron, intermediate removed) + the three
  distinct named `validateTransition` negatives — no-`q12_guard` "q12_guard schema", 7-cron
  "cron cardinality", lossy barrier-digest "baseline.cron_jobs must be an array". Frozen bytes
  untouched; `q12-source-manifest.ts` byte-identical to pre-R2; tsc 0; zero leftover containers.
  Full baseline→real-install-cutover POSITIVE is the pinned R4 acceptance (above).
- **R2 build spec (ready to execute; all rulings in).** Producer: on `LivePlanExecutor`,
  open the snapshot coordinator (`_open_snapshot_coordinator`, service-file/`psql` path — NOT
  the docker-exec path, because `q12-source-manifest.ts` connects via libpq
  `PGSERVICE`/`PGSERVICEFILE` + `SET TRANSACTION SNAPSHOT`, `q12-source-manifest.ts:154`),
  run `q12-source-manifest.ts capture --snapshot <exported-id> --output <tmp>` **without**
  `--baseline` (so `baseline == cutover == the capture`, `:1449`) using the same source
  service env, parse `.baseline`, and `immutable_publish` it to `<run-root>/baseline.json`
  0400 uid 1000; close the coordinator. Real-PG17 RED (reuse the round-8..19 harness: docker
  `postgres:17.10-bookworm` with `-p 127.0.0.1::5432`, `readyPostgres`, a TLS-less service
  file to the mapped port):
  - **Seed a Supabase-shaped source** (`capture()` requirements, `q12-source-manifest.ts`):
    `CREATE EXTENSION pgcrypto SCHEMA extensions` (for `extensions.digest`, `:310`); a faked
    `cron` schema + `cron.job` table (columns `jobid,schedule,command,nodename,nodeport,
database,username,active`, `:309-312`) with **8 rows all `active=true`**; a faked `net`
    schema + `net.http_request_queue` table (empty → count 0, `:313`); the guarded relations
    (public + the `auth`/`storage` trigger-privileged + `cron.job` + `net.http_request_queue`
    authoritative set, `:246`); `supabase_migrations.schema_migrations` optional (COALESCE'd,
    `:314`).
  - **Produce** `baseline.json` via the producer at this pre-maintenance state (cron active,
    writable).
  - **Simulate cutover** = baseline + ONLY the sanctioned deltas: `UPDATE cron.job SET
active=false`; `ALTER DATABASE postgres SET default_transaction_read_only=on`; create the
    `q12_guard` schema + its GUARD_TABLES relations (owner postgres, kind r, postgres-only
    ACL); apply the guard-delta on guarded relations. Then run `q12-source-manifest.ts capture
--snapshot <id2> --baseline baseline.json` (or `verify-transition`) and assert it
    PASSES — `validateTransition` requires baseline==cutover after normalizing exactly those
    deltas (`:1258-1352`), so any incidental diff fails (this is the correctness bar).
  - **Negative:** feed the lossy `database-barrier-baseline.json` digest projection as
    `--baseline` → `validateTransition` fails (proves the full capture is required, OQ6).
    Frozen bytes untouched; the producer reuses `q12-source-manifest.ts` verbatim (no new
    structural query). Note: `q12-source-manifest.ts` is NOT frozen-sha-pinned, but the producer
    must not modify it — it invokes it.

- **R3 done** (RED `4fdef6e8` → GREEN `2cd88fc3`). `run_live` now journals amendment §5
  groups 1–13 (through `deploy.prepare`/completed = the design §6a ruling-1 **C7 planned-exit
  checkpoint**) as a byte/order twin of `run_joined_composer`'s forward prefix, and owns the
  OQ4 resource-manifest authority. New module-level `write_live_resource_manifest` fsyncs a
  real checkpoint-bound resource-manifest artifact (0400) at three stages — genesis
  (empty-accepted), snapshot (records `<exported-id>`), targets (five identities) — and
  `run_live` steps `current_resource_manifest_sha256` to each digest EXACTLY at the two
  witnesses (snapshot set before `pg.backup`/intent; targets via
  `resource_step_before_completion` at `deploy.prepare`/completed). `request["resource_manifest_sha256"]`
  is set to the genesis digest so the walk's first/last pin holds against a real
  controller-owned artifact. Parity uses ONLY the blessed exclusion set
  (`capability_manifest_sha256`/`entry_hash`/`previous_hash` + `resource_manifest_sha256`
  value-only); `seq` is not excluded, so the twin reproduces the composer's exact
  ordinary+in-process-barrier interleave. The test also asserts the step topology, the P3-2
  per-barrier segment values (install→genesis, verify-after-base/-observability→snapshot,
  prepare-recovery→snapshot), artifact recomputability, and an off-witness-step negative
  through the REAL `validate_stable_binding_walk` (new `--validate-walk` fixture seam). Both
  drivers are fed the SAME quiesce-manifest path so every `<quiesce-manifest>`-bearing
  `command_sha256` matches. Suites: 453 green (live-controller 3, shared-fixture composer/
  seam suites 301, source-recovery-runtime 149); tsc 0; frozen bytes unchanged; no W-file
  changed. Artifact: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-live-controller.md`.
  - **C7-boundary ruling (flagged to orchestrator):** R3 stops at group 13 rather than
    running to `activate` because the group-14 FWM `accepted_object_sha256` is inherently
    per-run-root (embeds `input_checkpoint_sha256` + the intent-row `entry_hash`), which would
    require a **5th, un-blessed** parity exclusion. Stopping at the sanctioned C7 exit keeps
    parity inside the blessed 4-field set; the FWM row + its exclusion decision move to R5.

- **R3 constraint (blessed 2026-07-18).** `resource_manifest_sha256` joins the pinned parity
  exclusion set VALUE-only, enumerated explicitly beside `capability_manifest_sha256` /
  `entry_hash` / `previous_hash`, only on rows carrying a real artifact digest (initial + the
  two stepped rows); substitution values are seeded to the fixture derivations so
  `command_sha256` parity holds. **Added constraint:** the parity test must still assert the
  step TOPOLOGY of the excluded field — it changes exactly at `pg.backup/intent` and
  `deploy.prepare/completed`, is carried unchanged elsewhere, and the first/last pins hold
  (`validate_stable_binding_walk:342-356`). Exclusion covers the byte value, never the
  stepping structure. Same principle for any future mode-divergent field.

- **R4 Sub-round A done** (RED `a478a210` → GREEN `292d5177`). Added an injectable,
  **parity-neutral** ordinary-execution seam: `append_ordinary_lifecycle` now delegates to an
  optional `executor.execute_ordinary(command, capability)` hook when present, falling back to
  the original hardcoded `"q12-joined-fixture"` result VERBATIM otherwise. Either branch's
  result is written ONLY to the per-command side file
  (`ordinary-command-result-<id>-cutover.json`) — the journal append, phase, capability digest,
  checkpoint, and `accepted_object_sha256` are all untouched, so the journal stays byte/order
  twin of the composer oracle regardless of which branch runs. A `LifecycleError` guards the
  hook's `capability_sha256` against the row digest before the existing `RESULT_KEYS` shape
  check. The seam is **run_live-scoped only**: a new `LiveOrdinaryExecutor(NoIoExecutor)`
  fixture subclass adds `execute_ordinary` (real-shaped result, deterministic
  `result_sha256 = sha256("q12-live-real-child:<command_id>:<run_id>")`,
  `child_executions += 1`) and is wired ONLY into `run_live_fixture`; `run_joined_fixture` (the
  composer) keeps the plain `NoIoExecutor`, so the closed composer's ordinary results stay
  byte-identical to before this round. `materializeLiveController` additively exposes
  `resultPaths` (`Engine.results`) and `childExecutions` (the run_live executor audit's
  `child_executions`) for the new assertions. Verified: groups-1-13 journal twin still holds
  under the blessed exclusion set; each ordinary side result file now carries the real-child
  `result_sha256` (distinct from the composer's same-key side file); `childExecutions` == 16
  (12 ordinary lifecycles via the new seam + 4 pre-existing D5 barrier-chain sandboxed claim
  delegations through the C7 window — install/verify-after-base/verify-after-observability/
  prepare-recovery — unrelated to this seam). All 301 composer/seam tests + the 3 R3
  live-controller tests stay green; the new R4 assertion passes. tsc 0; frozen bytes
  unchanged. Artifact: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md`.
  - **Sub-round C (the NON-NEGOTIABLE real-PG17 `barrier.install`→`validateTransition`
    positive, above) is PENDING two orchestrator rulings:** the CI identity strategy for the
    real `barrier.install` run, and the OQ1 scope boundary. Not attempted in Sub-round A.
  - **Two later-round pins carried from the W-amendment review**, recorded here for the future
    live-quiesce/resume controller round: (1) `run_live` must write
    `quiesce-window-mode.json` BEFORE `writers.quiesce` and keep it alive through
    post-`activate` resume (marker-lifetime assertion); (2) a deferred P3 to consider deriving
    resume-time mode from the immutable quiesce-manifest `barrier.state` instead of the mutable
    marker, plus extra malformed-marker/reverse-flip negatives.

- **R4 Sub-round B done** (RED `605d359b2` → GREEN `70ee913a4`), no-docker ORCHESTRATOR-REQUIRED
  proof that `run_live`'s in-process barrier chain (`d5()` → `engine.retained_chain` →
  `delegate_claim` → `executor.launch_claim`) drives the REAL deployed claim wrapper
  `deploy/qdrant/q12-capability-run.sh` end to end — unmodified, run verbatim under `bwrap`,
  with only its DB-barrier child (`q12-database-barrier.sh`) sandbox-faked (the real-PG17/DB
  transition stays a separate later round). No production file changed: Sub-round A's finding
  that the barrier claim path is already executor-injected meant only the fixture needed
  wiring. `fixtures/q12-retained-barrier-runner.py` adds
  `LiveSandboxedDeployedWrapperExecutor(SandboxedDeployedWrapperExecutor, LiveOrdinaryExecutor)`
  (multiple inheritance composing the real-wrapper `launch_claim` with Sub-round A's
  `execute_ordinary`, no duplicated method bodies) selected via a new
  `executeActualWrapper?: boolean` on `LiveControllerFixtureSpec`
  (`fixtures/q12-retained-barrier-contract.ts`, additive). `bwrap` (bubblewrap 0.11.1) was
  already present and ran cleanly — no harness fix needed. Verified: groups-1-13 journal twin
  still holds under the blessed exclusion set; `executor-audit.json` reports
  `actualDeployedWrapper === true`; each of the 4 in-process barrier claims
  (install/verify-after-base/verify-after-observability/prepare-recovery) produced a retained
  barrier result through the real wrapper. Suites 303/303 (302 prior + 1 new); tsc 0; frozen
  bytes unchanged. Artifact: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md` (Sub-round B
  section added). Sub-round C (real-PG17 positive) remains PENDING the same two orchestrator
  rulings — not attempted here.

## Open risks carried forward

- **OQ1 is the gating unknown.** If the owner rules Side B (quiesce moves late) instead, R2
  onward re-sequences (quiesce after `prepare-recovery`) and the D5J §5 chronology must be
  re-frozen first — a larger design-amendment stop. R1 and the parity harness are ruling
  -independent.
- Cross-identity execution (uid 1000 journaler + `sudo` root children + FD-9 custody) is the
  highest-friction implementation surface; R1 establishes the seam abstraction before any
  child round depends on it.
