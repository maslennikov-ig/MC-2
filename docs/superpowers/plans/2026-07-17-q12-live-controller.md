# Plan: Q12 Live Controller (Task-9 `plan|live|recover`)

Status: **PLAN DRAFT — awaiting orchestrator ratification. No implementation started.**
Design: `docs/superpowers/specs/2026-07-17-q12-live-controller-design.md`.
Stream: `mc2-jz6y0.13` (this worktree `codex/q12-plan-builder`).

## Scope and standing contract (every round)

- **Design/local only.** No server / live / db / ssh / docker-against-prod action. Real-PG17
  tests run against disposable local `postgres:17.10-bookworm` containers (the accepted
  round-8..19 harness).
- **Frozen bytes untouched:** `q12-command-manifest.json` `aaec6fc2…`,
  `q12-database-barrier.sh` `3673ee49…` (amended 2026-07-18 from the historical
  `134255ce…` per the ratified frozen-barrier-fix round; see the implementation log and
  the W-tuple field-4 amendment), `q12-structural-catalog.sql` `0b8a943f…`. **A
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
- Frozen bytes `aaec6fc2…` / `3673ee49…` (amended 2026-07-18; historical `134255ce…`) /
  `0b8a943f…` byte-identical each round.
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

- **R4 Sub-round C done (validateTransition positive) — SANCTIONED HARD STOP, not a pass.**
  RED-only (`test(q12): RED R4 Sub-round C real barrier install vs validateTransition`); no
  GREEN commit exists because GREEN is unreachable without editing the frozen
  `q12-database-barrier.sh` (out of scope). Built the full real-PG17 harness the round demanded:
  a disposable, full-Supabase-shaped `postgres:17.10-bookworm` source (47 public / 22 auth / 5
  named storage / 8 active `cron.job` / empty `net.http_request_queue`, real oids/owners queried
  live for the 76-relation `guarded_relations` set, a programmatically derived
  `--expected-catalog` that the UNMODIFIED barrier's frozen jq schema gate
  (`q12-database-barrier.sh:362-413`) accepts), plus an unprivileged `unshare --user --mount
--net` namespace scoped to just the `barrier.sh install` invocation (private loopback + a
  namespace-local `/etc/hosts` override for the frozen production hostname — never the host's
  real `/etc/hosts`), and a new `q12-pooler-identity-proxy.py` TLS front end that terminates the
  barrier's mandatory SSLRequest/TLS handshake for that hostname and rewrites only the wire
  StartupMessage's `user` field (pooler tenant name → the disposable source's real `postgres`
  role, mirroring Supabase's own pooler), relaying every other byte unmodified into the
  container via `docker exec` (control channel only, no host network route needed). Driving the
  REAL, byte-verified barrier for real against real PostgreSQL 17.10 surfaced a genuine,
  reproducible defect in the barrier's own frozen fresh-install ACL lockdown: its
  `REVOKE ALL ON TYPE q12_guard.<name> FROM PUBLIC` loop iterates every `pg_type` row in the
  `q12_guard` namespace with no `typtype`/`typelem` filter, including the four implicit array
  types Postgres auto-creates alongside every base/composite type
  (`_active_run`/`_baseline`/`_migration_guards`/`_probe`). PostgreSQL 17.10 categorically
  refuses `GRANT`/`REVOKE` on array types (`cannot set privileges of array types` / "Set the
  privileges of the element type instead", `aclchk.c ExecGrant_Type_check`), confirmed
  independently and deterministically outside the harness too (`CREATE TABLE zzz_test(id int);
REVOKE ALL ON TYPE _zzz_test FROM PUBLIC;` → the same error on a bare PG17.10 container). The
  very first real fresh `install` therefore aborts mid-tx1 and rolls back cleanly (`q12_guard`
  absent afterward; cron/read-only unchanged — no partial/corrupt state), so
  `q12-source-manifest.ts capture` correctly reports `unexpected baseline-to-cutover delta:
cron activity` (nothing transitioned). This is unavoidable without a frozen-byte edit to
  `q12-database-barrier.sh`, which is out of scope for this stream (Option B: byte-untouched) —
  a sanctioned hard stop per this round's own instructions, reported rather than hidden or
  worked around by stubbing/weakening anything. New files:
  `tests/unit/ops/q12-live-real-barrier-cutover.test.ts` (the RED positive test, gated
  `MC2_Q12_REAL_PG17=1`), `tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py` (the
  harness), `tests/unit/ops/fixtures/q12-pooler-identity-proxy.py` (the TLS+identity front end).
  No production file changed. The 4-suite no-docker regression (`q12-live-controller` +
  `q12-live-cutover` + `q12-retained-barrier-quiesce-seam` +
  `q12-retained-barrier-w-composition-seam`) stays 303/303; `tsc --noEmit` = 0; frozen bytes
  unchanged (`q12-command-manifest.json` `aaec6fc2…`, `q12-database-barrier.sh` `134255ce…`,
  `q12-structural-catalog.sql` prefix `0b8a943f…`); zero leftover docker containers/networks/
  volumes verified after every run. Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md` (Sub-round C section added). **R4 does
  NOT close**: the plan's own text is explicit that "R4 cannot close without this end-to-end
  baseline→real-install-cutover positive" — that positive is now proven blocked by a real
  barrier defect, not by any harness gap, and fixing it requires an explicitly authorized,
  separate round that touches the frozen barrier script.

- **Frozen-barrier-fix round done (real barrier.install reaches `maintenance_guarded`
  end-to-end).** The explicitly authorized round that edits `q12-database-barrier.sh` (the
  frozen-byte constraint lifted for this stream only; cascade to the frozen-trio contract and
  W-tuple field 4 is a separate, tracked follow-up, not executed here). Two rounds landed on
  this branch: the ACL array-type fix (`c4c05d762`, `typcategory <> 'A'` at the four owner-only
  scan/loop sites) and this round's catalog-fd-consumption + PG-dialect fixes. RED
  (`test(q12): RED frozen-barrier-fix round`) extended the R4 Sub-round C harness (jobname
  gap in the synthetic `cron.job` fixture — real Supabase `pg_cron` has a nullable `jobname`
  column the barrier's install Node runner requires; the fixture's table lacked it) and
  rewrote the acceptance to this round's actual mandate (barrier reaches `maintenance_guarded`
  with an exact receipt + q12_guard install-surface proof, not the full R4
  validateTransition chain, since `q12-source-manifest.ts` stays frozen/out of scope and has
  its own known, separate, pre-existing 5-vs-10 q12_guard-function-set drift against the
  barrier). GREEN (`fix(q12): barrier catalog-fd double-consumption + PG-dialect
precedence/scalar fixes`) fixed: (1) the catalog-fd double consumption at
  `q12-database-barrier.sh:361` — `expected_json="$(cat <&"$catalog_fd")"` consumed the shared
  fd-13 open-file-description to EOF, so the install Node runner's later by-number
  `fs.readFileSync(Number(catalogFd))` read landed at EOF and returned an empty string,
  breaking the very first `current_setting('megacampus.q12_expected_catalog')::jsonb` cast in
  tx1 with "invalid input syntax for type json" — fixed by reading via `/proc/self/fd/13`
  (a fresh, independent file description) instead, matching the pattern already used at the
  barrier's six other catalog reads; (2) an operator-precedence bug in
  `verify_install_resume_state()`/the prepare-recovery readiness check (two sites): Postgres's
  additive `-` binds tighter than `->`, so `saved->'database_settings' - 'setconfig'` parsed
  as `saved -> ('database_settings' - 'setconfig')`, an ambiguous "unknown - unknown" operator
  error between two untyped literals — fixed with explicit parens; (3) a missing scalar guard
  in the same two expressions — `saved->'database_settings'` is the jsonb scalar `null` on a
  database's very first install (no `pg_db_role_setting` row yet), and jsonb `-` refuses
  scalars ("cannot delete from scalar") — fixed with a `jsonb_typeof(...)='object'` guard
  mirroring the pattern already used three times in the same function. All three were latent
  (never exercised until the ACL bug, then the fd bug, stopped masking them in turn) and are
  execution-enabling, behavior-preserving PG-dialect/plumbing corrections — no validation
  semantics, guard/type/count set, receipt shape, identity pin, or ACL policy changed. Verified
  end-to-end on the real-PG17 harness: barrier rc==0; receipt
  `{state:"maintenance_guarded", last_command:"install", rollback_probes_verified:false,
probe_receipt_sha256:null}`; q12_guard schema present with its 4 tables + 10 functions +
  1 event trigger; cron 0/8 active; `default_transaction_read_only`==on. The three original RED
  modes (ACL loop abort, ACL residual `_active_run|0|USAGE`, fd-consumption empty-catalog JSON
  error) were independently re-verified against isolated SQL/fd repros before the fixes landed.
  No-docker suite 303/303; `tsc --noEmit` 0; `q12-command-manifest.json` `aaec6fc2…` and
  `q12-structural-catalog.sql` `0b8a943f…` unchanged; zero leftover docker. Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-pg17-acl-fix.md`. **Cascade
  (not executed here, orchestrator's next step):** the final barrier sha256 replaces
  `134255ce…` in the frozen-trio contract; the W-tuple field-4 `activation_barrier_sha256`
  needs a Layer-1 amendment and fields 5-9 need a repro-tool re-run; a byte-verified server
  reinstall is the team-lead's pre-window step. R4's full validateTransition chain (the
  `q12-source-manifest.ts` function-set drift) remains open and untouched by this round.

- **Guard-surface allowlist reconciliation round (base `3596aa72`).** Reconciled
  `q12-source-manifest.ts`'s `q12_guard` allowlist to the barrier's real install, exact-set,
  fail-closed, one-way (source-manifest expectations moved to match the barrier): `GUARD_FUNCTIONS`
  5→10 (added `assert_controller_binding()`, `enforce_ddl_barrier()`, `quiesce_client_backends()`,
  `verify_install_resume_state()`, `verify_activated_state()`); new `GUARD_TRIGGERS` exact-set
  (2→8, adding the 6 `q12_guard_immutable`/`q12_guard_immutable_truncate` pairs on
  `active_run`/`baseline`/`migration_guards`); event trigger confirmed NOT surfaced by the
  capture SQL (no allowlist entry possible/needed); ACL exact-set corrected (`MAINTAIN` privilege
  added for PG17, `grantable` `true`→`false`, the 4 array types' un-revocable `PUBLIC USAGE`
  mirrored as an explicit exemption matching the barrier's own `typcategory='A'` exclusion).
  Beyond the enumerated allowlist, driving this to GREEN against the real barrier surfaced and
  required fixing a genuine PostgreSQL UNION-type-resolution truncation defect in `catalogSql()`'s
  `object_owners`/`object_acls`/`comments`/`security_labels` blocks (bare `name`-typed columns
  mixed with `text`-computed columns in the same UNION column resolve to `name`, silently
  truncating to 63 bytes; fixed with explicit `::text` casts, root-caused via `pg_typeof` before
  guessing). A third, unrelated `cron.job` row-hash normalization gap was found and explicitly
  NOT fixed (STOP-and-report; not a guard-surface question — see Open risks). RED confirmed on
  real PG17 (`unexpected baseline-to-cutover delta: q12_guard function set`); allowlist GREEN
  proven three ways (no-docker fixture positive/negative against a real barrier-derived capture,
  the real end-to-end harness advancing past every q12_guard check, and direct psql
  introspection). No-docker 305/305 (303 existing + 2 new); `pnpm type-check` 0; frozen bytes
  (`q12-command-manifest.json` `aaec6fc2…`, `q12-database-barrier.sh` `3673ee49…`,
  `q12-structural-catalog.sql` `0b8a943f…`) unchanged; zero leftover docker. Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-source-manifest-guard-surface.md`.

- **RATIFIED cascade round done (field-4 succession + CI guard + frozen-sha sweep).**
  Propagated the ratified frozen-barrier-fix round's new barrier sha256 (`3673ee49…`,
  reviewed PASS/PASS, merged) into the W-tuple: field 4 `activation_barrier_sha256`
  amended `134255ce…` → `3673ee49…` in
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md` (Layer-1
  amendment only). The repro tool
  (`mc2-jz6y0.13.10-activation-tuple-repro.cjs`) was re-run against the fixed barrier and
  reproduces fields 5-10 byte-identically (zero change to the three tracked JSON assets;
  field 7 confirmed barrier-independent as well as catalog-independent) — no re-freeze
  triggered; the C7 production re-freeze of fields 5/6/8/9 stays open and unchanged. New
  CI guard `packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts`
  makes W-tuple fields 2/4 load-bearing: it reads both values FROM the tuple artifact and
  asserts them against the real `sha256` of `q12-command-manifest.json` /
  `q12-database-barrier.sh`, proven RED (a live barrier-byte mutation without a matching
  amendment fails the field-4 assertion) then GREEN (restored). Frozen-sha reference sweep
  (`134255ce…`/`53647f0a…`, full + truncated forms) across docs/artifacts/tests
  classified every occurrence current-truth vs historical; updated the 2 current-truth
  sites found beyond the tuple itself — this plan's own standing-contract/verification-
  contract lines (above) and the one stale hardcoded `W_TUPLE.activation_barrier_sha256`
  constant in `q12-activation-truth.test.ts` (flagged as a stale, unused-by-assertions pin
  in `mc2-jz6y0.13-barrier-fix-review.md`). All other occurrences are historical round/
  review records and are unchanged. Full classification table:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-cascade.md`. Frozen manifest
  (`aaec6fc2…`) + structural-catalog (`0b8a943f…`) untouched; barrier
  (`3673ee49…`) not re-edited; `q12-source-manifest.ts` (`902cd6a1…`) not re-edited.

- **R5 Sub-round A done** (RED `5bc73c08` → GREEN `36f43593`). `run_live` now journals
  amendment §5 group 14 — the forward final-writer manifest (FWM) — immediately after
  `deploy.prepare`/completed, mirroring the composer's
  `publish_final_writer_manifest("forward", inventory, ...)` call verbatim (`inventory =
engine.derive_root_writer_inventory(quiesce_bytes, include_targets=True)` stays the FIXTURE
  derivation, deterministic from run_id + quiesce bytes, exactly like the composer). `run_live`
  now journals 68 rows total (1-66 unchanged + FWM rows 67-68: `prepared_quiesced`/intent and
  `prepared_quiesced`/accepted with `accepted_object_kind=final_writer_manifest`); its output
  surfaces `forwardFinalWriterManifestPath`, mirroring the composer's own output augmentation.
  **Resolves the R3 C7-boundary flag** with the ratified 3-part FWM parity split: (1) FWM row
  structure (rows 67-68 as above, `command_sha256` byte-equal to the composer's); (2) the full
  68-row journal twin under the closed 4-field blessed exclusion set PLUS a new row-scoped
  exclusion (`withParityExclusions`) that ALSO drops `accepted_object_sha256` on the FWM
  accepted row ONLY (`command_id==='writers.resume.forward' && outcome==='accepted'`) — every
  other row (1-67, 69+) keeps exactly the 4-field blessed set unchanged; (3) a SEPARATE
  FWM-content byte parity, read directly off both `final-writer-manifest-forward-<run-id>.json`
  files, stripping the two per-run-root physical fields
  (`publication_intent_journal_entry_hash`, `input_checkpoint_sha256` — both carry the
  journal's device+inode) and comparing the canonicalized remainders byte-for-byte; all 9
  root-independent FWM fields (`schema_version`, `run_id`, `mode`, `release_sha`,
  `expected_catalog_sha256`, `writer_quiesce_manifest_sha256`, `lease_epoch`, `final_writers`,
  `held_writers`) byte-matched on the first attempt — no field misclassification found. A
  self-consistency check (mirroring R3's resource-manifest proof) confirms the live FWM file is
  a real 0400 artifact whose `sha256` IS the live row-68 `accepted_object_sha256`. Two fail-closed
  negatives via a new `--fwm-negative` seam driving the real
  `Engine.publish_final_writer_manifest`/`derive_root_writer_inventory` directly: an invalid
  mode raises "final writer manifest mode mismatch"; a forward publish against an inventory
  with no target identities raises "forward manifest requires target identities". The
  pre-existing R3/R4 groups-1-13 twin assertions were updated from a full-length check to a
  PREFIX check (`live.journalEntries.slice(0, c7End)`), since `run_live` now journals past
  group 13. All 4 no-docker suites green (305/305: `q12-live-controller` + `q12-live-cutover` +
  `q12-retained-barrier-quiesce-seam` + `q12-retained-barrier-w-composition-seam`); `pnpm
type-check` 0 across every workspace. Frozen bytes unchanged (`q12-command-manifest.json`
  `aaec6fc2…`, `q12-database-barrier.sh` `3673ee49…`, `q12-structural-catalog.sql`
  `0b8a943f…`); `q12-writer-resume.py`/`source-recovery-run.sh`/`q12-source-manifest.ts`
  untouched; `run_joined_composer`'s own body byte-unchanged (only `run_live`'s docstring/body
  were touched). Artifact: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5.md`. `deploy.commit`
  and `activate` (groups 15-16) remain later rounds (R5 Sub-round B / R6+).
- **R5 Sub-round B done** (RED `c48f2ca93` → GREEN `1cda05ad7`). `run_live` now closes the
  forward window: after the group-14 FWM it appends `ordinary("deploy.commit")` (group 15,
  rows 69-72 at `activation_ready`) then `d5("activate")` (group 16, rows 73-76: selector/intent
  at `activation_committing`, then capability_issued/claimed/completed at `activated`), before
  `reload_durable()` — a verbatim mirror of `run_joined_composer`'s
  `forward_tail_through_activation_ready()` + `d5("activate")` tail. `run_live` now journals the
  **full 76 forward rows**, and the R5-A parity test is widened to a full-76-row twin
  (`live.journalEntries.map(withParityExclusions)` deep-equals the whole composer forward
  journal, not `slice(0,68)`), plus a Part 1b structural check pinning the deploy.commit/activate
  row grammar. The FWM stays rows 67-68 of 76; its 3-part parity split and self-consistency
  assertions are unchanged. Forced (non-weakening) count corrections in the R4 tests since
  `run_live` gained one ordinary lifecycle and one in-process barrier that both cross the real
  child boundary: R4-A `ordinaryKeys` 12→13 and `childExecutions` 16→18 (D5 delegations 4→5),
  R4-B `barrierKeys` gains `activate:cutover`. `q12-live-controller.test.ts` 7/7; `tsc --noEmit`
  0; frozen bytes unchanged (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file touched;
  `run_joined_composer` body byte-unchanged. Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5b.md`. Next unblocked: R5 Sub-round C
  (`quiesce-window-mode.json` cutover-marker write + lifetime assertion). R5-D/E (recover +
  real-PG17 post-activate legs) stay held for the two pending rulings.
- **R5 Sub-round C done** (RED `4070ed81e` → GREEN `c5bd9f698`). `run_live` now writes the
  caller-declared `quiesce-window-mode.json` cutover marker (design note §57) as its FIRST
  forward step, before the group-3 `writers.quiesce` command: a new
  `write_quiesce_window_marker(engine)` helper builds EXACTLY the three keys the W-side
  `q12-writer-resume.py` `window_is_cutover()` `exact()` check requires (`schema_version` =
  `megacampus.q12.quiesce-window-mode/v1`, `run_id`, `mode` = `cutover`), canonicalizes via the
  shared `complete_object()`, and publishes it to `<run-root>/quiesce-window-mode.json` through
  `immutable_publish(..., 0o400, engine.trace)` (same fsync/atomic discipline as every other
  run-root artifact). It is a side artifact — never a journal row — so the full 76-row forward
  twin is byte-unchanged (parity-neutral, proven by the R5-B twin test staying green). `run_live`
  surfaces `output["quiesceWindowMarkerPath"]`. Test asserts exact-key projection, schema/mode/
  run_id constants, 0400, parity-neutrality (length 76 + full twin), and post-activate
  persistence. `q12-live-controller.test.ts` 8/8; 4-suite regression 306/306; `tsc --noEmit` 0;
  frozen bytes unchanged (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file touched;
  `run_joined_composer` body byte-unchanged. Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5c.md`. **Deferred (flagged):** the
  marker-lifetime "present BEFORE the group-3 row" observation point needs a `run_live` mid-run
  stop/checkpoint seam (the C7-stop machinery held for ruling 2 / R5-D); this round delivers the
  write + post-activate observation point. Consumer-side missing/stray/wrong-run_id negatives are
  W-amendment-owned. R5-D/E remain held for the two pending rulings.

- **R5 Sub-round E done** (RED `1ca451f56` → GREEN `942da4f62` → docs). Orchestrator RULING 1
  (post-activate cleanup is RECEIPT-ONLY) implemented: the frozen §5/D5J chronology ends at
  `barrier.activate` (76 journal rows) and the grammar has no cleanup `command_id`, so `run_live`
  adds NO journal row for the post-activate cleanup or resume. After the 76th row (around
  `reload_durable`), a new `orchestrate_post_activate_cleanup(engine, request, run_id)` drives, via
  an executor seam mirroring the R4 `execute_ordinary` pattern, two children: `execute_barrier_
cleanup` emits a v2 `megacampus.q12.database-barrier-receipt/v2` `guard_cleanup_complete` receipt
  (+ its `megacampus.q12.database-barrier-probes/v1` probe receipt), both 0400 canonical artifacts
  written via `immutable_publish`; `execute_forward_resume` is a fail-closed byte twin of the
  W-owned `q12-writer-resume.py` forward branch (`:1088-1134`) that VALIDATES that exact receipt
  projection and reports `resumed`. `run_live` does NOT reimplement the receipt gate (it lives in
  the children); it INVOKES them, does a light orchestration binding only (hex64 receipt digest;
  the resume child must report validating that same receipt), and RECORDS the outcomes on
  `output["postActivate"] = {"cleanup": …, "resume": …}` (operator-visible truth, since the cleanup
  is deliberately not journaled). Absent hooks degrade safely to `None`. The seam never touches the
  journal, a capability digest, a checkpoint, `self.child_executions` (R4's count stays 18), or an
  `accepted_object_sha256`, so the 76-row forward journal stays a byte/order twin of the composer.
  Test asserts (a) recorded cleanup/resume ok+status, (b) the v2 receipt shape (exact 10-key set,
  schema/state/last_command=cleanup/rollback_probes_verified/probe binding) so the real forward
  gate would accept it — with the receipt file being a real 0400 canonical artifact whose digest is
  the recorded sha256 and the probe file digest matching `probe_receipt_sha256`, and (c)
  parity-neutrality (length 76 + full twin, no cleanup/resume command_id in any row).
  `q12-live-controller.test.ts` 9/9; 4-suite regression 307/307; `tsc --noEmit` 0; frozen bytes
  unchanged (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file touched; `run_joined_composer`
  body byte-unchanged. Design §5.2 "post" row wording corrected in §6a item 5 (ruling 1c). Artifact:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5e.md`. **Deferred (flagged):** the real
  docker/PG17 `q12-database-barrier.sh cleanup` child and the real `sudo source-recovery-run.sh
writers.resume.forward` are round R8 (this round seeds fixture children that emit/validate
  receipt-shaped artifacts); the full terminal-proof/baseline/archive file cross-checks beyond the
  receipt projection at `:1088-1134` also ride on R8's real gate.
- **R5 Sub-round D done** (refactor `f41a20577` → RED `78e8d797e` → GREEN `320257631` → docs).
  Orchestrator RULING 2 (RECOVER SCOPE) implemented as `run_recover(request, executor)`. First a
  behavior-preserving refactor extracted `run_live`'s forward tail (§5 groups 14 FWM → 15
  `deploy.commit` → 16 `activate` → `reload_durable` → output augmentation → RULING 1 post-activate)
  into a reusable `drive_forward_tail(...)` plus a `finalize_forward_output(...)` projector, and
  added an optional `request["stop_after"]` seam with three named checkpoints
  (`"writers.quiesce.pre"` = stop after group 2 `barrier.install`, before the `writers.quiesce`
  row; `"deploy.prepare"` = the C7 planned-exit head; `"final-writer-manifest"` = after the group-14
  FWM accepted row). Absent `stop_after` reproduces the full 76-row window + post-activate
  byte-for-byte; a stopped run returns its partial output and does NOT run post-activate.
  `run_recover` requires a NON-EMPTY durable journal (the opposite of `run_live`'s fresh-root
  guard), rehydrates it through the same `Engine`, restores the request-global resource pin from
  the durable tail (like `run_claim`) and the stepped resource/quiesce domains from the head, then
  DISPATCHES on the durable head: `deploy.prepare`/`completed` → `drive_forward_tail` from group 14;
  `writers.resume.forward`/`accepted` → `drive_forward_tail(include_fwm=False)` from group 15; ANY
  other head (incl. a mid-barrier partial — those route through the existing
  `run_supervisor`/`resume_retained_chain` machinery, not `run_recover`) or an empty journal →
  NAMED fail-closed `LifecycleError` naming phase/outcome/command, never a heuristic continuation.
  A resumed run reproduces the SAME 76-row composer twin + post-activate an uninterrupted run would
  have (proven by asserting `recovered.slice(0, prefix)` equals the stopped partial byte-for-byte
  AND the full `withParityExclusions` twin). Tests: R5-C before-group-3 marker close (via
  `stop_after="writers.quiesce.pre"`: the 0400 3-key `quiesce-window-mode.json` is present with NO
  `writers.quiesce` row yet); recover-from-C7 and recover-from-crash-after-FWM to the 76-row twin +
  `postActivate`; and NAMED fail-closed negatives (unsupported mid-forward head naming
  `command=barrier.install`/`outcome=completed`/`phase=maintenance_guarded` with the durable journal
  proven byte-unchanged, empty journal, and a head past activate naming `command=barrier.activate`).
  `q12-live-controller.test.ts` 13/13; 4-suite regression 311/311; `tsc --noEmit` 0; frozen bytes
  unchanged (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file touched; `run_joined_composer`
  body byte-unchanged. Artifact: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5d.md`.
  **Scope note (flagged):** per RULING 2 (`recover supports resuming from exactly (a) and (b)`) +
  the hard fail-closed requirement, `run_recover` supports ONLY the two clean checkpoints and fails
  closed on every other head including mid-barrier partials; deeper mid-barrier resume-and-proceed
  is deliberately NOT wired into `run_recover` this round (it remains the existing
  `resume_retained_chain` path). Crash-anywhere idempotence is probed further at R8.

## Open risks carried forward

- **`q12-source-manifest.ts` q12_guard function-set drift — RESOLVED** by the guard-surface
  reconciliation round above (`GUARD_FUNCTIONS`/`GUARD_TRIGGERS`/ACL exact-sets now match the
  barrier's real 10-function/8-trigger/full-ACL install). Superseded by the next two items.
- **`cron.job` row-hash normalization gap (found this round, NOT fixed — STOP-and-report).**
  With the guard-surface allowlist complete, the real end-to-end capture advances past every
  q12_guard-specific check and fails only on a generic `unexpected baseline-to-cutover delta`,
  isolated to `cron.job`'s `row_sha256` differing between baseline and cutover (acl/owner/kind/
  oid/name identical). This is expected content drift (the barrier deactivates every cron job
  during cutover), but `validateTransition` only normalizes the separate top-level `cron_jobs`
  summary array's `active` flag before comparing — it never normalizes the authoritative
  `relations` section's row-content hash for `cron.job` the same way. Not a q12_guard-surface
  question; needs its own semantics decision and TDD round before real-capture `capture_rc=0` is
  achievable end-to-end. Recommend a dedicated Beads issue.
- **Bare name/text UNION-truncation hazard outside q12_guard (found and partially fixed this
  round).** `catalogSql()`'s `object_owners`/`object_acls`/`comments`/`security_labels` UNION ALL
  blocks mixed bare `name`-typed columns with `text`-computed columns in the same output column;
  PostgreSQL 17.10 resolves that column to `name`, silently truncating every row to
  NAMEDATALEN-1 (63) bytes (confirmed via `pg_typeof`). Fixed with explicit `::text` casts for the
  q12_guard-affecting case (evidenced, in scope for GREEN). The same hazard likely still applies
  to the tool's coverage of the real production schemas (public/auth/storage/cron/net); a
  broader audit was out of scope for this round and is worth a follow-up sweep.
- **OQ1 is the gating unknown.** If the owner rules Side B (quiesce moves late) instead, R2
  onward re-sequences (quiesce after `prepare-recovery`) and the D5J §5 chronology must be
  re-frozen first — a larger design-amendment stop. R1 and the parity harness are ruling
  -independent.
- Cross-identity execution (uid 1000 journaler + `sudo` root children + FD-9 custody) is the
  highest-friction implementation surface; R1 establishes the seam abstraction before any
  child round depends on it.
